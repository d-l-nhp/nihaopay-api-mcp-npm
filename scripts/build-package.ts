import { execFile } from "node:child_process";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { buildIndex } from "./build-index.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = new URL("..", import.meta.url);

type PackageJson = {
  name: string;
  version: string;
  files?: string[];
  bin?: Record<string, string>;
};

async function readPkg(): Promise<PackageJson> {
  const raw = await readFile(new URL("package.json", REPO_ROOT), "utf8");
  return JSON.parse(raw) as PackageJson;
}

async function run(cmd: string, args: string[]): Promise<void> {
  process.stdout.write(`$ ${cmd} ${args.join(" ")}\n`);
  const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: REPO_ROOT });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function assertCleanTree(): Promise<void> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
    cwd: REPO_ROOT,
  });
  if (stdout.trim().length > 0) {
    throw new Error(
      `Refusing to pack: working tree is not clean.\n${stdout}\nCommit or stash changes before running build-package.`,
    );
  }
}

async function clean(): Promise<void> {
  await rm(new URL("dist", REPO_ROOT), { recursive: true, force: true });
}

// Strict artifact verification — last gate before the tarball is produced.
// Checks every `files` entry exists and is non-empty (files by size,
// directories by having at least one child), and that the bin import target
// (`dist/index.js`) is present. Collects all failures and throws once.
async function verifyArtifacts(pkg: PackageJson): Promise<void> {
  const failures: string[] = [];

  for (const entry of pkg.files ?? []) {
    const url = new URL(entry, REPO_ROOT);
    try {
      const st = await stat(url);
      if (st.isDirectory()) {
        const children = await readdir(url);
        if (children.length === 0) failures.push(`empty directory: ${entry}`);
      } else if (st.size === 0) {
        failures.push(`zero-byte file: ${entry}`);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "ERR";
      failures.push(`missing: ${entry} (${code})`);
    }
  }

  for (const [name, binPath] of Object.entries(pkg.bin ?? {})) {
    try {
      const st = await stat(new URL(binPath, REPO_ROOT));
      if (st.size === 0) failures.push(`bin "${name}" is zero-byte: ${binPath}`);
    } catch {
      failures.push(`bin "${name}" missing: ${binPath}`);
    }
  }

  // bin/nihaopay-mcp dynamically imports ../dist/index.js, so that file must exist.
  try {
    const st = await stat(new URL("dist/index.js", REPO_ROOT));
    if (st.size === 0) failures.push("dist/index.js is zero-byte (bin import target)");
  } catch {
    failures.push("dist/index.js missing (bin import target)");
  }

  if (failures.length > 0) {
    const noun = failures.length === 1 ? "issue" : "issues";
    throw new Error(
      `Artifact verification failed (${failures.length} ${noun}):\n  - ${failures.join("\n  - ")}`,
    );
  }
}

async function main(): Promise<void> {
  const pkg = await readPkg();
  process.stdout.write(`build-package: ${pkg.name}@${pkg.version}\n`);

  await assertCleanTree();
  await clean();
  await run("pnpm", ["run", "typecheck"]);
  await run("pnpm", ["run", "lint"]);
  await run("pnpm", ["run", "test"]);
  await run("pnpm", ["run", "build"]);
  await buildIndex({
    contentDir: "assets/content",
    outFile: "assets/bm25-index.json",
  });
  await verifyArtifacts(pkg);

  process.stdout.write("✓ build-package: ready to pack\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
