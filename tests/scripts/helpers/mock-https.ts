import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { vi } from "vitest";

type MockResponse = { status: number; body: Buffer };

export function mockHttpsGet(response: MockResponse): void {
  vi.doMock("node:https", () => {
    const getImpl = (_url: string, cb: (res: Readable & { statusCode: number }) => void) => {
      const stream = Readable.from([response.body]) as Readable & { statusCode: number };
      stream.statusCode = response.status;
      queueMicrotask(() => cb(stream));
      const req = new EventEmitter() as EventEmitter & { destroy: () => void };
      req.destroy = () => {};
      return req;
    };
    return { default: { get: getImpl }, get: getImpl };
  });
}
