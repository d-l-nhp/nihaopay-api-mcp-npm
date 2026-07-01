import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DEFAULT_DOCS_TAG } from "../config/docs.ts";

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_UPSTREAM_OWNER = "d-l-nhp";
const DEFAULT_UPSTREAM_REPO = "nihaopay-api-docs";

export type FetchDocsOptions = {
  tag: string;
  upstreamOwner?: string;
  upstreamRepo?: string;
  assetsContentDir?: string;
};

export type FetchDocsResult = {
  tag: string;
  sha256: string;
  fileCount: number;
};

function releaseAssetUrl(owner: string, repo: string, tag: string, filename: string): string {
  return `https://github.com/${owner}/${repo}/releases/download/${tag}/${filename}`;
}

// also doubles as a path-safety check — no "/" or ".." can sneak into a filename/URL segment.
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

// GitHub 302s release downloads to a presigned release-assets.githubusercontent.com URL.
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function getFollowingRedirects(
  url: string,
  redirectsLeft = MAX_REDIRECTS,
): Promise<IncomingMessage> {
  return new Promise((resolveRes, rejectRes) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (REDIRECT_STATUSES.has(status) && location) {
        res.resume();
        if (redirectsLeft <= 0) {
          rejectRes(new Error(`too many redirects for ${url}`));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        resolveRes(getFollowingRedirects(nextUrl, redirectsLeft - 1));
        return;
      }
      resolveRes(res);
    });
    req.on("error", rejectRes);
  });
}

function assertOkResponse(res: IncomingMessage, label: string, url: string): void {
  const status = res.statusCode ?? 0;
  if (status !== 200) {
    res.resume();
    throw new Error(`${label} failed (HTTP ${status}) for ${url}`);
  }
}

async function downloadToFile(url: string, destPath: string): Promise<string> {
  const res = await getFollowingRedirects(url);
  assertOkResponse(res, "upstream tag download", url);
  const hash = createHash("sha256");
  res.on("data", (chunk: Buffer) => hash.update(chunk));
  await pipeline(res as Readable, createWriteStream(destPath));
  return hash.digest("hex");
}

async function downloadText(url: string): Promise<string> {
  const res = await getFollowingRedirects(url);
  assertOkResponse(res, "upstream checksum download", url);
  const chunks: Buffer[] = [];
  for await (const chunk of res) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseChecksumSidecar(text: string, filename: string): string {
  const [hex, sidecarFilename] = text.trim().split(/\s+/);
  if (!hex || !/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`malformed checksum sidecar for ${filename}: ${JSON.stringify(text)}`);
  }
  const normalizedSidecarFilename = sidecarFilename?.replace(/^\*/, "");
  if (normalizedSidecarFilename !== undefined && normalizedSidecarFilename !== filename) {
    throw new Error(
      `checksum sidecar names a different file: expected ${filename}, got ${sidecarFilename}`,
    );
  }
  return hex;
}

async function listTopLevelTarEntries(tarPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("tar", ["-tzf", tarPath]);
  const top = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    if (line.startsWith("/") || line.includes("..")) {
      throw new Error(`tar entry escapes extraction root: ${line}`);
    }
    const first = line.replace(/^\.\//, "").split("/")[0];
    if (first) top.add(first);
  }
  return [...top];
}

export async function fetchDocs(opts: FetchDocsOptions): Promise<FetchDocsResult> {
  if (!TAG_RE.test(opts.tag)) {
    throw new Error(
      `tag must look like v<major>.<minor>.<patch> (got: ${JSON.stringify(opts.tag)})`,
    );
  }
  const owner = opts.upstreamOwner ?? DEFAULT_UPSTREAM_OWNER;
  const repo = opts.upstreamRepo ?? DEFAULT_UPSTREAM_REPO;
  const assetsContentDir = opts.assetsContentDir ?? resolve(REPO_ROOT, "assets/content");
  const filename = `content-${opts.tag}.tar.gz`;
  const url = releaseAssetUrl(owner, repo, opts.tag, filename);
  const checksumUrl = releaseAssetUrl(owner, repo, opts.tag, `${filename}.sha256`);

  const workDir = await mkdtemp(join(tmpdir(), "fetch-docs-"));
  try {
    const tarPath = join(workDir, filename);
    process.stdout.write(`fetch-docs: GET ${url}\n`);
    const sha256 = await downloadToFile(url, tarPath);

    process.stdout.write(`fetch-docs: GET ${checksumUrl}\n`);
    const checksumText = await downloadText(checksumUrl);
    const expectedSha256 = parseChecksumSidecar(checksumText, filename);
    if (expectedSha256 !== sha256) {
      throw new Error(
        `checksum mismatch for ${filename}: expected ${expectedSha256}, got ${sha256}`,
      );
    }

    const topDirs = await listTopLevelTarEntries(tarPath);
    if (topDirs.length !== 1 || topDirs[0] !== "content") {
      throw new Error(
        `upstream tarball must have exactly one top-level entry named "content"; got: [${topDirs.join(", ")}]`,
      );
    }

    const extractDir = join(workDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", tarPath, "-C", extractDir]);

    const extractedContent = join(extractDir, "content");
    const extractedStat = await stat(extractedContent).catch(() => null);
    if (!extractedStat?.isDirectory()) {
      throw new Error(`extracted "content" entry is not a directory: ${extractedContent}`);
    }

    const stagingNew = join(workDir, "new-content");
    await rename(extractedContent, stagingNew);

    const parent = dirname(assetsContentDir);
    await mkdir(parent, { recursive: true });
    const aside = join(parent, `.assets-content.old.${Date.now()}`);
    const oldExists = await stat(assetsContentDir).then(
      () => true,
      () => false,
    );
    if (oldExists) await rename(assetsContentDir, aside);
    await rename(stagingNew, assetsContentDir);
    if (oldExists) await rm(aside, { recursive: true, force: true });

    const fileCount = await countFiles(assetsContentDir);
    process.stdout.write(
      `fetch-docs: extracted ${fileCount} files for ${opts.tag} (sha256=${sha256}, checksum verified)\n`,
    );

    return { tag: opts.tag, sha256, fileCount };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) count += await countFiles(full);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

// derived from DEFAULT_DOCS_TAG, not a separate constant, so it can't drift out of sync.
function apiLineFromTag(tag: string): string {
  const match = TAG_RE.exec(tag);
  if (!match) {
    throw new Error(`tag must look like v<major>.<minor>.<patch> (got: ${JSON.stringify(tag)})`);
  }
  return `${match[1]}.${match[2]}`;
}

export function validateTag(tag: string, expectedLine: string): void {
  const match = TAG_RE.exec(tag);
  if (!match) {
    throw new Error(`tag must look like v<major>.<minor>.<patch> (got: ${JSON.stringify(tag)})`);
  }
  const line = `${match[1]}.${match[2]}`;
  if (line !== expectedLine) {
    throw new Error(
      `tag ${tag} is off the documented API line: expected v${expectedLine}.x, got v${line}.x`,
    );
  }
}

export function resolveTagFromArgs(argv: string[]): string {
  const override = argv.find((a) => !a.startsWith("-"));
  const tag = override ?? DEFAULT_DOCS_TAG;
  validateTag(tag, apiLineFromTag(DEFAULT_DOCS_TAG));
  return tag;
}

export type ParsedFetchArgs = {
  tag: string;
  upstreamOwner?: string;
  upstreamRepo?: string;
};

export function parseFetchArgs(argv: string[]): ParsedFetchArgs {
  const positionals: string[] = [];
  let upstreamOwner: string | undefined;
  let upstreamRepo: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    const eq = arg.indexOf("=");
    const name = arg.startsWith("--") && eq !== -1 ? arg.slice(0, eq) : arg;

    if (name === "--owner" || name === "--repo") {
      let value: string;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("-")) {
          throw new Error(`${name} requires a value`);
        }
        value = next;
        i += 1;
      }
      if (value.length === 0) throw new Error(`${name} requires a value`);
      if (name === "--owner") upstreamOwner = value;
      else upstreamRepo = value;
      continue;
    }

    positionals.push(arg);
  }

  const tag = resolveTagFromArgs(positionals);
  return {
    tag,
    ...(upstreamOwner !== undefined ? { upstreamOwner } : {}),
    ...(upstreamRepo !== undefined ? { upstreamRepo } : {}),
  };
}

async function main(): Promise<void> {
  const opts = parseFetchArgs(process.argv.slice(2));
  await fetchDocs(opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
