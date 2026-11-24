import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRequireAuth } from "./useAuth";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("useRequireAuth", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    push.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("resolves with data on a successful check", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ admin: { id: 1 } }),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useRequireAuth({ meEndpoint: "/admin/auth/me", loginPath: "/admin/login" }),
    );

    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.data).toEqual({ admin: { id: 1 } });
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects to login on a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useRequireAuth({ meEndpoint: "/admin/auth/me", loginPath: "/admin/login" }),
    );

    const { result } = renderHook(() =>
      useRequireAuth({ meEndpoint: "/admin/auth/me", loginPath: "/admin/login" }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/login?reason=session_expired"));
    expect(result.current.resolved).toBe(false);
  });

  it("surfaces server_error (no redirect) when the body is malformed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    const { result } = renderHook(() =>
      useRequireAuth({ meEndpoint: "/admin/auth/me", loginPath: "/admin/login" }),
    );

    await waitFor(() => expect(result.current.error).toBe("server_error"));
    expect(push).not.toHaveBeenCalled();
  });

  it("re-checks auth on a bfcache pageshow restore", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ admin: { id: 1 } }),
    } as unknown as Response);

    renderHook(() =>
      useRequireAuth({ meEndpoint: "/admin/auth/me", loginPath: "/admin/login" }),
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const event = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(event, "persisted", { value: true });
    window.dispatchEvent(event);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
