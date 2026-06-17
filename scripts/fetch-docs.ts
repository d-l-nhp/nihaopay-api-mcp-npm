import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_UPSTREAM_OWNER = "nihaopay";
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

function tarballUrl(owner: string, repo: string, tag: string): string {
  return `https://github.com/${owner}/${repo}/archive/refs/tags/${tag}.tar.gz`;
}

async function downloadToFile(url: string, destPath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveDl, rejectDl) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status !== 200) {
        res.resume();
        rejectDl(new Error(`upstream tag download failed (HTTP ${status}) for ${url}`));
        return;
      }
      const out = createWriteStream(destPath);
      res.on("data", (chunk: Buffer) => hash.update(chunk));
      pipeline(res as Readable, out).then(resolveDl).catch(rejectDl);
    });
    req.on("error", rejectDl);
  });
  return hash.digest("hex");
}

async function listTopLevelTarEntries(tarPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("tar", ["-tzf", tarPath]);
  const top = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    if (line.startsWith("/") || line.includes("..")) {
      throw new Error(`tar entry escapes extraction root: ${line}`);
    }
    const first = line.split("/")[0];
    if (first) top.add(first);
  }
  return [...top];
}

export async function fetchDocs(opts: FetchDocsOptions): Promise<FetchDocsResult> {
  const owner = opts.upstreamOwner ?? DEFAULT_UPSTREAM_OWNER;
  const repo = opts.upstreamRepo ?? DEFAULT_UPSTREAM_REPO;
  const assetsContentDir = opts.assetsContentDir ?? resolve(REPO_ROOT, "assets/content");
  const url = tarballUrl(owner, repo, opts.tag);

  const workDir = await mkdtemp(join(tmpdir(), "fetch-docs-"));
  try {
    const tarPath = join(workDir, "upstream.tar.gz");
    process.stdout.write(`fetch-docs: GET ${url}\n`);
    const sha256 = await downloadToFile(url, tarPath);

    const topDirs = await listTopLevelTarEntries(tarPath);
    if (topDirs.length !== 1) {
      throw new Error(
        `upstream tarball has unexpected top-level layout; expected one dir, got: [${topDirs.join(", ")}]`,
      );
    }
    const topDir = topDirs[0] as string;

    const extractDir = join(workDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", tarPath, "-C", extractDir]);

    const upstreamContent = join(extractDir, topDir, "content");
    const upstreamStat = await stat(upstreamContent).catch(() => null);
    if (!upstreamStat?.isDirectory()) {
      const inner = await readdir(join(extractDir, topDir)).catch(() => [] as string[]);
      throw new Error(
        `upstream tarball missing content/ dir; top-level entries inside ${topDir}/: [${inner.join(", ")}]`,
      );
    }

    const stagingNew = join(workDir, "new-content");
    await rename(upstreamContent, stagingNew);

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
      `fetch-docs: extracted ${fileCount} files for ${opts.tag} (sha256=${sha256})\n`,
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

export function resolveTagFromArgs(argv: string[], packageVersion: string): string {
  const override = argv.find((a) => !a.startsWith("-"));
  if (override) {
    if (!override.startsWith("v")) {
      throw new Error(`tag override must start with "v" (got: ${override})`);
    }
    return override;
  }
  return `v${packageVersion}`;
}

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(resolve(REPO_ROOT, "package.json"), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

async function main(): Promise<void> {
  const version = await readPackageVersion();
  const tag = resolveTagFromArgs(process.argv.slice(2), version);
  await fetchDocs({ tag });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
