import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { vi } from "vitest";

type MockResponse = { status: number; body: Buffer; headers?: Record<string, string> };
type Responder = MockResponse | ((url: string) => MockResponse);

export function mockHttpsGet(responder: Responder): void {
  const resolveResponse = typeof responder === "function" ? responder : () => responder;
  vi.doMock("node:https", () => {
    const getImpl = (
      url: string,
      cb: (res: Readable & { statusCode: number; headers: Record<string, string> }) => void,
    ) => {
      const response = resolveResponse(url);
      const stream = Readable.from([response.body]) as Readable & {
        statusCode: number;
        headers: Record<string, string>;
      };
      stream.statusCode = response.status;
      stream.headers = response.headers ?? {};
      queueMicrotask(() => cb(stream));
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = () => {};
      return req;
    };
    return { default: { get: getImpl }, get: getImpl };
  });
}
