import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileAsync = promisify(execFile);

// Generate a tarball that mirrors what GitHub's source-archive endpoint serves:
// top-level directory like `repo-tag/` containing `content/` and other dirs.
async function makeFakeUpstreamTarball(
  topLevelDir: string,
  files: Record<string, string>,
): Promise<Buffer> {
  const stageDir = await mkdtemp(join(tmpdir(), "fetch-docs-stage-"));
  try {
    const rootDir = join(stageDir, topLevelDir);
    for (const [relPath, body] of Object.entries(files)) {
      const full = join(rootDir, relPath);
      await mkdir(join(full, ".."), { recursive: true });
      await writeFile(full, body);
    }
    const tarPath = join(stageDir, "out.tar.gz");
    await execFileAsync("tar", ["-czf", tarPath, "-C", stageDir, topLevelDir]);
    return await readFile(tarPath);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
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
    const tarball = await makeFakeUpstreamTarball("nihaopay-api-docs-1.2.0", {
      "content/00-introduction/version.md": "# version\nbody\n",
      "content/_data/error-codes.yaml": "items: []\n",
      "schemas/anything.ts": "// unrelated\n",
    });

    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet({ status: 200, body: tarball });
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    const result = await fetchDocs({
      tag: "v1.2.0",
      upstreamOwner: "nihaopay",
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

  it("throws when upstream returns non-200", async () => {
    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet({ status: 404, body: Buffer.from("not found") });
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "v9.9.9",
        upstreamOwner: "nihaopay",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("rejects tarballs with path-traversal entries", async () => {
    const tarball = await makeFakeUpstreamTarball("nihaopay-api-docs-evil", {
      "content/ok.md": "ok",
    });
    const stage = await mkdtemp(join(tmpdir(), "fetch-docs-evil-"));
    try {
      await mkdir(join(stage, "evilroot"), { recursive: true });
      await writeFile(join(stage, "evilroot", "ok.md"), "ok");
      const { mockHttpsGet } = await import("./helpers/mock-https.ts");
      mockHttpsGet({ status: 200, body: tarball });
      vi.doMock("node:child_process", async () => {
        const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
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
          upstreamOwner: "nihaopay",
          upstreamRepo: "nihaopay-api-docs",
          assetsContentDir: assetsContent,
        }),
      ).rejects.toThrow(/escapes extraction root/);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  });

  it("throws when tarball is missing content/ dir", async () => {
    const tarball = await makeFakeUpstreamTarball("nihaopay-api-docs-1.2.0", {
      "schemas/anything.ts": "// no content/ at all\n",
      "README.md": "no content dir here\n",
    });
    const { mockHttpsGet } = await import("./helpers/mock-https.ts");
    mockHttpsGet({ status: 200, body: tarball });
    const { fetchDocs } = await import("../../scripts/fetch-docs.ts");

    await expect(
      fetchDocs({
        tag: "v1.2.0",
        upstreamOwner: "nihaopay",
        upstreamRepo: "nihaopay-api-docs",
        assetsContentDir: assetsContent,
      }),
    ).rejects.toThrow(/missing content\/ dir/);
  });
});

describe("resolveTagFromArgs", () => {
  it("defaults to v<package version> when no override given", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    expect(resolveTagFromArgs([], "1.2.0")).toBe("v1.2.0");
  });

  it("uses explicit override when provided", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    expect(resolveTagFromArgs(["v1.3.0"], "1.2.0")).toBe("v1.3.0");
  });

  it("rejects override without v prefix", async () => {
    const { resolveTagFromArgs } = await import("../../scripts/fetch-docs.ts");
    expect(() => resolveTagFromArgs(["1.3.0"], "1.2.0")).toThrow(/must start with "v"/);
  });
});
