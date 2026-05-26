import { z } from "zod";
import type { Accessors, ErrorCode } from "../data/types.js";

export const getErrorCodeSchema = z.object({
  code: z.string().regex(/^[1-5]\d{2}-\d{2,3}$/),
});

export type GetErrorCodeArgs = z.infer<typeof getErrorCodeSchema>;
export type GetErrorCodeResult = ErrorCode | { error: "code_not_found"; code: string };

export async function handleGetErrorCode(
  args: GetErrorCodeArgs,
  accessors: Accessors,
): Promise<GetErrorCodeResult> {
  const entry = accessors.errorCodes.get(args.code);
  return entry ?? { error: "code_not_found", code: args.code };
}
