import { z } from "zod";
import type { Accessors, Endpoint } from "../data/types.js";

export const listEndpointsSchema = z.object({
  product: z.string().optional(),
  method: z.enum(["GET", "POST"]).optional(),
});

export type ListEndpointsArgs = z.infer<typeof listEndpointsSchema>;

export type ListEndpointsResult = {
  endpoints: ReadonlyArray<Endpoint>;
  total: number;
};

export async function handleListEndpoints(
  args: ListEndpointsArgs,
  accessors: Accessors,
): Promise<ListEndpointsResult> {
  let list = [...accessors.endpoints];
  if (args.product) {
    const product = args.product.toLowerCase();
    list = list.filter((e) => e.product.toLowerCase() === product);
  }
  if (args.method) list = list.filter((e) => e.method === args.method);
  list.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
  return { endpoints: list, total: list.length };
}
