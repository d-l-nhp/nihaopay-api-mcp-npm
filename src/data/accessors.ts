import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Accessors, Endpoint, ErrorCode } from "./types.js";

async function readYaml<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return parseYaml(raw) as T;
}

export async function loadAccessors(dataDir: string): Promise<Accessors> {
  const [codesRaw, endpointsRaw, customsRaw, enumsRaw] = await Promise.all([
    readYaml<{ codes: ErrorCode[] }>(join(dataDir, "error-codes.yaml")),
    readYaml<{ endpoints: Endpoint[] }>(join(dataDir, "endpoints.yaml")),
    readYaml<unknown>(join(dataDir, "customs.yaml")),
    readYaml<unknown>(join(dataDir, "enums.yaml")),
  ]);

  const errorCodes = new Map<string, ErrorCode>();
  for (const c of codesRaw.codes) {
    if (errorCodes.has(c.code)) {
      console.error(`nihaopay-mcp: duplicate error code "${c.code}" in error-codes.yaml`);
    }
    errorCodes.set(c.code, c);
  }

  return {
    errorCodes,
    endpoints: endpointsRaw.endpoints,
    customs: customsRaw,
    enums: enumsRaw,
  };
}
