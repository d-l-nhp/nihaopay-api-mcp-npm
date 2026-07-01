import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfidenceThreshold } from "../src/index.ts";

describe("readConfidenceThreshold", () => {
  const ORIGINAL = process.env["NIHAOPAY_CONFIDENCE"];

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: `= undefined` stringifies to "undefined" for process.env, it doesn't unset the key
    if (ORIGINAL === undefined) delete process.env["NIHAOPAY_CONFIDENCE"];
    else process.env["NIHAOPAY_CONFIDENCE"] = ORIGINAL;
    vi.restoreAllMocks();
  });

  it("defaults to 4.0 when unset", () => {
    // biome-ignore lint/performance/noDelete: `= undefined` stringifies to "undefined" for process.env, it doesn't unset the key
    delete process.env["NIHAOPAY_CONFIDENCE"];
    expect(readConfidenceThreshold()).toBe(4.0);
  });

  it("parses a valid override", () => {
    process.env["NIHAOPAY_CONFIDENCE"] = "2.5";
    expect(readConfidenceThreshold()).toBe(2.5);
  });

  it("falls back to the default and logs a warning for a non-numeric value", () => {
    process.env["NIHAOPAY_CONFIDENCE"] = "off";
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(readConfidenceThreshold()).toBe(4.0);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("NIHAOPAY_CONFIDENCE"));
  });
});
