import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON on a successful response", async () => {
    const payload = { ok: true, data: [1, 2, 3] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch<typeof payload>("/api/thing");

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/thing");
    expect(init?.credentials).toBe("include");
  });

  it("sends a JSON Content-Type and stringifies object bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch("/api/thing", {
      method: "POST",
      body: JSON.stringify({ name: "x" }),
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("throws with the extracted error message on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiFetch("/api/thing")).rejects.toThrow("Not authorized");
  });

  it("falls back to a generic message when the error body is malformed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not json", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(apiFetch("/api/thing")).rejects.toThrow();
  });

  it("handles an empty successful body without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("", {
        status: 204,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await apiFetch("/api/thing");
    expect(result).toBeUndefined();
  });
});
