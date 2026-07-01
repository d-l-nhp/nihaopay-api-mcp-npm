import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsync = promisify(execFile);

// mirrors GitHub's release-asset layout: `files`' top-level entries are the literal tar
// root, no repo-name wrapper dir like source archives get.
async function makeFakeReleaseTarball(files: Record<string, string>): Promise<Buffer> {
  const stageDir = await mkdtemp(join(tmpdir(), "fetch-docs-stage-"));
  try {
    for (const [relPath, body] of Object.entries(files)) {
      const full = join(stageDir, relPath);
      await mkdir(join(full, ".."), { recursive: true });
      await writeFile(full, body);
    }
    const topEntries = [
      ...new Set(
        Object.keys(files)
          .map((p) => p.split("/")[0])
          .filter((e): e is string => e !== undefined),
      ),
    ];
    const tarPath = join(stageDir, "out.tar.gz");
    await execFileAsync("tar", ["-czf", tarPath, "-C", stageDir, ...topEntries]);
    return await readFile(tarPath);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function checksumSidecar(buf: Buffer, filename: string): Buffer {
  return Buffer.from(`${sha256Hex(buf)}  ${filename}\n`, "utf8");
}

// GNU coreutils `sha256sum -b` (binary mode) prefixes the filename with "*".
function checksumSidecarBinaryMode(buf: Buffer, filename: string): Buffer {
  return Buffer.from(`${sha256Hex(buf)}  *${filename}\n`, "utf8");
}

describe("fetchDocs", () => {
  let workDir: string;
  let assetsContent: string;

  beforeEach(async () => {
    vi.resetModules();
    workDir = await mkdtemp(join(tmpdir(), "fetch-docs-work-"));
    assetsContent = join(workDir, "assets", "content");
    await mkdir(assetsContent, { recursive: true });
    await writeFile(join(assetsContent, "stale.md"), "previous snapshot");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.doUnmock("node:https");
    vi.doUnmock("node:child_process");
    await rm(workDir, { recursive: true, force: true });
  });

  it("downloads, validates, and replaces assets/content/ on happy path", async () => {
    const tarball = await makeFakeReleaseTarball({
      "content/00-introduction/version.md": "# version\nbody\n",
      "content/_data/error-codes.yaml": "items: []\n",
    });
    const filename = "content-v1.2.0.tar.gz";
    const checksum = checksumSidecar(tarball, filename);

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) =>
      url.endsWith(".sha256") ? { status: 200, body: checksum } : { status: 200, body: tarball },
    );
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    const result = await fetchDocs({
      tag: "v1.2.0",
      upstreamOwner: "d-l-nhp",
      upstreamRepo: "nihaopay-api-docs",
      assetsContentDir: assetsContent,
    });

    expect(result.tag).toBe("v1.2.0");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

    const entries = await readdir(assetsContent);
    expect(entries.sort()).toEqual(["00-introduction", "_data"]);
    const v = await readFile(join(assetsContent, "00-introduction", "version.md"), "utf8");
    expect(v).toBe("# version\nbody\n");
    await expect(readFile(join(assetsContent, "stale.md"), "utf8")).rejects.toThrow();
  });

  it("accepts a GNU coreutils binary-mode checksum sidecar (sha256sum -b, leading '*' on filename)", async () => {
    const tarball = await makeFakeReleaseTarball({
      "content/00-introduction/version.md": "# version\nbody\n",
      "content/_data/error-codes.yaml": "items: []\n",
    });
    const filename = "content-v1.2.0.tar.gz";
    const checksum = checksumSidecarBinaryMode(tarball, filename);

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) =>
      url.endsWith(".sha256") ? { status: 200, body: checksum } : { status: 200, body: tarball },
    );
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    const result = await fetchDocs({
      tag: "v1.2.0",
      upstreamOwner: "d-l-nhp",
      upstreamRepo: "nihaopay-api-docs",
      assetsContentDir: assetsContent,
    });

    expect(result.tag).toBe("v1.2.0");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

    const entries = await readdir(assetsContent);
    expect(entries.sort()).toEqual(["00-introduction", "_data"]);
    const v = await readFile(join(assetsContent, "00-introduction", "version.md"), "utf8");
    expect(v).toBe("# version\nbody\n");
    await expect(readFile(join(assetsContent, "stale.md"), "utf8")).rejects.toThrow();
  });

  it("follows a 302 redirect (as GitHub release assets do) for both tarball and checksum", async () => {
    const tarball = await makeFakeReleaseTarball({
      "content/00-introduction/version.md": "# version\nbody\n",
      "content/_data/error-codes.yaml": "items: []\n",
    });
    const filename = "content-v1.2.0.tar.gz";
    const checksum = checksumSidecar(tarball, filename);

    const realTarballUrl =
      "https://release-assets.githubusercontent.com/fake-presigned/tarball?sig=abc";
    const realChecksumUrl =
      "https://release-assets.githubusercontent.com/fake-presigned/checksum?sig=def";

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) => {
      if (url === realTarballUrl) return { status: 200, body: tarball };
      if (url === realChecksumUrl) return { status: 200, body: checksum };
      if (url.endsWith(".sha256")) {
        return { status: 302, body: Buffer.alloc(0), headers: { location: realChecksumUrl } };
      }
      return { status: 302, body: Buffer.alloc(0), headers: { location: realTarballUrl } };
    });
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    const result = await fetchDocs({
      tag: "v1.2.0",
      upstreamOwner: "d-l-nhp",
      upstreamRepo: "nihaopay-api-docs",
      assetsContentDir: assetsContent,
    });

    expect(result.tag).toBe("v1.2.0");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

    const entries = await readdir(assetsContent);
    expect(entries.sort()).toEqual(["00-introduction", "_data"]);
    const v = await readFile(join(assetsContent, "00-introduction", "version.md"), "utf8");
    expect(v).toBe("# version\nbody\n");
  });

  it("throws when upstream returns non-200", async () => {
    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet({ status: 404, body: Buffer.from("not found") });
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "v9.9.9",
        upstreamOwner: "d-l-nhp",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("throws and leaves assets/content/ untouched when checksum does not match", async () => {
    const tarball = await makeFakeReleaseTarball({ "content/ok.md": "ok" });
    const filename = "content-v1.2.0.tar.gz";
    const badChecksum = Buffer.from(`${"0".repeat(64)}  ${filename}\n`, "utf8");

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) =>
      url.endsWith(".sha256") ? { status: 200, body: badChecksum } : { status: 200, body: tarball },
    );
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "v1.2.0",
        upstreamOwner: "d-l-nhp",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/checksum mismatch/);

    const stale = await readFile(join(assetsContent, "stale.md"), "utf8");
    expect(stale).toBe("previous snapshot");
  });

  it("rejects tarballs with path-traversal entries", async () => {
    const tarball = await makeFakeReleaseTarball({ "content/ok.md": "ok" });
    const filename = "content-v1.2.0.tar.gz";
    const checksum = checksumSidecar(tarball, filename);

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) =>
      url.endsWith(".sha256") ? { status: 200, body: checksum } : { status: 200, body: tarball },
    );
    vi.doMock("node:child_process", async () => {
      const actual =
        await vi.importActual<typeof import("node:child_process")>("node:child_process");
      return {
        ...actual,
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        execFile: (cmd: string, args: readonly string[], optsOrCb: unknown, cbArg?: any) => {
          // biome-ignore lint/suspicious/noExplicitAny: test mock
          const cb: any = typeof optsOrCb === "function" ? optsOrCb : cbArg;
          if (cmd === "tar" && args[0] === "-tzf") {
            cb(null, { stdout: "evilroot/\nevilroot/../escape.md\n", stderr: "" });
            return undefined;
          }
          cb(null, { stdout: "", stderr: "" });
          return undefined;
        },
      };
    });
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");
    await expect(
      fetchDocs({
        tag: "v1.2.0",
        upstreamOwner: "d-l-nhp",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/escapes extraction root/);
  });

  it("throws when the tarball's top-level entry is not content/", async () => {
    const tarball = await makeFakeReleaseTarball({
      "schemas/anything.ts": "// no content/ at all\n",
      "README.md": "no content dir here\n",
    });
    const filename = "content-v1.2.0.tar.gz";
    const checksum = checksumSidecar(tarball, filename);

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) =>
      url.endsWith(".sha256") ? { status: 200, body: checksum } : { status: 200, body: tarball },
    );
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "v1.2.0",
        upstreamOwner: "d-l-nhp",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/exactly one top-level entry named "content"/);
  });

  it("throws and leaves assets/content/ untouched when the 'content' entry is a file, not a directory", async () => {
    const tarball = await makeFakeReleaseTarball({ content: "not a directory" });
    const filename = "content-v1.2.0.tar.gz";
    const checksum = checksumSidecar(tarball, filename);

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet((url) =>
      url.endsWith(".sha256") ? { status: 200, body: checksum } : { status: 200, body: tarball },
    );
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "v1.2.0",
        upstreamOwner: "d-l-nhp",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/extracted "content" entry is not a directory/);

    const stale = await readFile(join(assetsContent, "stale.md"), "utf8");
    expect(stale).toBe("previous snapshot");
  });

  it("rejects a tag that isn't a valid vX.Y.Z before it can reach the filesystem or network", async () => {
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "../../../tmp/evil",
        upstreamOwner: "d-l-nhp",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/must look like v<major>\.<minor>\.<patch>/);
  });
});

describe("resolveTagFromArgs", () => {
  it("defaults to DEFAULT_DOCS_TAG when no override given", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    const { DEFAULT_DOCS_TAG } = await import("../../config/docs.ts");
    expect(resolveTagFromArgs([])).toBe(DEFAULT_DOCS_TAG);
  });

  it("uses explicit override when provided", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    expect(resolveTagFromArgs(["v1.2.7"])).toBe("v1.2.7");
  });

  it("rejects override without v prefix", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    expect(() => resolveTagFromArgs(["1.3.0"])).toThrow(
      /must look like v<major>\.<minor>\.<patch>/,
    );
  });

  it("rejects an override tag off the documented API line", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    expect(() => resolveTagFromArgs(["v1.3.0"])).toThrow(/off the documented API line/);
  });
});

describe("parseFetchArgs", () => {
  it("defaults to DEFAULT_DOCS_TAG with no owner/repo override", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    const { DEFAULT_DOCS_TAG } = await import("../../config/docs.ts");
    expect(parseFetchArgs([])).toEqual({ tag: DEFAULT_DOCS_TAG });
  });

  it("reads --owner and --repo as space-separated values", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    const { DEFAULT_DOCS_TAG } = await import("../../config/docs.ts");
    expect(parseFetchArgs(["--owner", "d-l-nhp", "--repo", "nihaopay-api-docs"])).toEqual({
      tag: DEFAULT_DOCS_TAG,
      upstreamOwner: "d-l-nhp",
      upstreamRepo: "nihaopay-api-docs",
    });
  });

  it("reads --owner=value and --repo=value form", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    const { DEFAULT_DOCS_TAG } = await import("../../config/docs.ts");
    expect(parseFetchArgs(["--owner=d-l-nhp", "--repo=nihaopay-api-docs"])).toEqual({
      tag: DEFAULT_DOCS_TAG,
      upstreamOwner: "d-l-nhp",
      upstreamRepo: "nihaopay-api-docs",
    });
  });

  it("combines owner/repo flags with a positional tag override", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    expect(parseFetchArgs(["--owner", "d-l-nhp", "v1.2.1"])).toEqual({
      tag: "v1.2.1",
      upstreamOwner: "d-l-nhp",
    });
  });

  it("throws when --owner is given without a value", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    expect(() => parseFetchArgs(["--owner"])).toThrow(/--owner requires a value/);
  });

  it("still rejects a tag override without a v prefix", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    expect(() => parseFetchArgs(["1.3.0"])).toThrow(/must look like v<major>\.<minor>\.<patch>/);
  });

  it("still rejects a tag override off the documented API line", async () => {
    const { parseFetchArgs } = await import("../../scripts/fetch-docs.ts");
    expect(() => parseFetchArgs(["v1.3.0"])).toThrow(/off the documented API line/);
  });
});
