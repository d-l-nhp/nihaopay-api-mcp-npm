import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = new URL("../", import.meta.url);

type PackageJson = {
  name: string;
  version: string;
  bin?: Record<string, string>;
};

type JsonRpcResponse = {
  id?: number;
  result?: { tools?: Array<{ name: string }> };
  error?: { code: number; message: string };
};

const EXPECTED_TOOLS = [
  "search_docs",
  "fetch_doc",
  "get_error_code",
  "list_endpoints",
  "list_docs",
];

async function readPkg(): Promise<PackageJson> {
  const raw = await readFile(new URL("package.json", REPO_ROOT), "utf8");
  return JSON.parse(raw) as PackageJson;
}

// npm pack writes <name>-<version>.tgz into the repo root by default.
async function findTarball(pkg: PackageJson): Promise<string> {
  const override = process.argv[2];
  if (override) return override;

  const prefix = `${pkg.name}-`;
  const entries = await readdir(REPO_ROOT);
  const candidate = entries.find((e) => e.startsWith(prefix) && e.endsWith(".tgz"));
  if (!candidate) {
    throw new Error(`no ${prefix}*.tgz found in repo root — run "npm pack" first`);
  }
  return fileURLToPath(new URL(candidate, REPO_ROOT));
}

async function extract(tarballPath: string, destDir: string): Promise<string> {
  await execFileAsync("tar", ["xzf", tarballPath, "-C", destDir]);
  return join(destDir, "package");
}

async function installProdDeps(pkgDir: string): Promise<void> {
  await execFileAsync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: pkgDir,
  });
}

async function runBinary(
  pkgDir: string,
  binPath: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [binPath], { cwd: pkgDir, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);

    const requests = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "smoke-package", version: "0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ];
    for (const req of requests) child.stdin.write(`${JSON.stringify(req)}\n`);

    setTimeout(() => {
      child.kill();
      resolvePromise({ stdout, stderr });
    }, 5000);
  });
}

function assertToolsListResponse(stdout: string): void {
  const responses = stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRpcResponse);

  const toolsResponse = responses.find((r) => r.id === 2);
  if (!toolsResponse) {
    throw new Error(`no response to tools/list request; raw stdout:\n${stdout}`);
  }
  if (toolsResponse.error) {
    throw new Error(`tools/list returned an error: ${JSON.stringify(toolsResponse.error)}`);
  }

  const names = new Set((toolsResponse.result?.tools ?? []).map((t) => t.name));
  const missing = EXPECTED_TOOLS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`tools/list missing expected tools: ${missing.join(", ")}`);
  }
}

async function main(): Promise<void> {
  const pkg = await readPkg();
  const tarballPath = await findTarball(pkg);
  process.stdout.write(`smoke-package: verifying ${tarballPath}\n`);

  const workDir = await mkdtemp(join(tmpdir(), "nihaopay-pack-smoke-"));
  try {
    const pkgDir = await extract(tarballPath, workDir);
    await installProdDeps(pkgDir);

    const binEntry = pkg.bin?.["nihaopay-mcp"];
    if (!binEntry) throw new Error('package.json bin["nihaopay-mcp"] is missing');

    const { stdout, stderr } = await runBinary(pkgDir, join(pkgDir, binEntry));
    if (stderr.trim().length > 0) {
      process.stderr.write(`smoke-package: stderr from packaged binary:\n${stderr}`);
    }
    assertToolsListResponse(stdout);

    process.stdout.write("✓ smoke-package: packaged binary responds correctly over stdio\n");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("smoke-package failed:", err);
  process.exit(1);
});
