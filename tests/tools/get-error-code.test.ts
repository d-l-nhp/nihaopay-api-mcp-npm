import { describe, expect, it } from "vitest";
import { loadAccessors } from "../../src/data/accessors.ts";
import { getErrorCodeSchema, handleGetErrorCode } from "../../src/tools/get-error-code.ts";

describe("get_error_code tool", () => {
  it("schema rejects malformed codes", () => {
    expect(getErrorCodeSchema.safeParse({ code: "foo" }).success).toBe(false);
    expect(getErrorCodeSchema.safeParse({ code: "100-1" }).success).toBe(false);
    expect(getErrorCodeSchema.safeParse({ code: "400-23" }).success).toBe(true);
  });

  it("returns canonical entry for a known code", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const someCode = [...acc.errorCodes.keys()][0];
    if (!someCode) throw new Error("fixture had no error codes");
    const result = await handleGetErrorCode({ code: someCode }, acc);
    expect(result).toMatchObject({ code: someCode });
  });

  it("returns code_not_found for unknown code", async () => {
    const acc = await loadAccessors("assets/content/_data");
    const result = await handleGetErrorCode({ code: "599-99" }, acc);
    expect(result).toEqual({ error: "code_not_found", code: "599-99" });
  });
});
