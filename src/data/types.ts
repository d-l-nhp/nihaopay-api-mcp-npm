export type ErrorCode = {
  code: string;
  http_status: number;
  label: string;
  message: string;
  category: string;
  notes?: string;
  related_docs?: string[];
};

export type Endpoint = {
  doc_id: string;
  method: "GET" | "POST";
  path: string;
  product: string;
  discriminator?: string;
  amount_unit?: string;
  summary?: string;
};

export type Accessors = {
  errorCodes: ReadonlyMap<string, ErrorCode>;
  endpoints: ReadonlyArray<Endpoint>;
  customs: unknown;
  enums: unknown;
};
