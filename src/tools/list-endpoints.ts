import { z } from "zod";
import type { Accessors, Endpoint } from "../data/types.ts";

export const listEndpointsSchema = z.object({
  product: z.string().optional(),
  method: z.enum(["GET", "POST"]).optional(),
});

export type ListEndpointsArgs = z.infer<typeof listEndpointsSchema>;

export async function handleListEndpoints(
  args: ListEndpointsArgs,
  accessors: Accessors,
): Promise<Endpoint[]> {
  let list = [...accessors.endpoints];
  if (args.product) list = list.filter((e) => e.product === args.product);
  if (args.method) list = list.filter((e) => e.method === args.method);
  return list.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}
