// Non-global base forms — boosts.ts derives global variants from `.source`
// for matchAll; confidence.ts uses these directly.

// Nihaopay error code shape, e.g. 400-23. Group 1 is the code.
export const ERROR_CODE_RE = /\b([1-5]\d{2}-\d{2,3})\b/;

// Nihaopay endpoint path shape, matches inside a bare path or a full URL.
export const ENDPOINT_RE = /(\/v\d+(?:\.\d+)?\/[\w\-/]+)/;
