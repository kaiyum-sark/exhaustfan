import { beforeEach, describe, expect, it, vi } from "vitest";

// "Unauthorized Admin" test case (PROJECT_REQUIREMENTS.md §8, Phase 4 spec):
// an unauthenticated OR under-permissioned request must be rejected
// server-side, even if it hits a Server Action directly (requirePermission),
// not just the layout (requireAdmin). Supabase/session state is mocked —
// this exercises the guard's own decision logic in isolation, not a live
// Supabase project (none is available in this environment; see report).

const getUserMock = vi.fn();
const getAdminWithPermissionsMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  // next/navigation's real redirect() aborts rendering via a thrown signal —
  // mimic that so callers' control flow (no code after requireAdmin() runs)
  // is exercised the same way it would be in the app.
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/lib/data/admin-users", () => ({
  getAdminWithPermissions: getAdminWithPermissionsMock,
}));

async function loadGuard() {
  vi.resetModules();
  return import("./require-role");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAdmin", () => {
  it("returns null when there is no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { getCurrentAdmin } = await loadGuard();

    await expect(getCurrentAdmin()).resolves.toBeNull();
    expect(getAdminWithPermissionsMock).not.toHaveBeenCalled();
  });

  it("returns null when the session has no admin_users row", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "nobody@example.com" } },
    });
    getAdminWithPermissionsMock.mockResolvedValue(null);
    const { getCurrentAdmin } = await loadGuard();

    await expect(getCurrentAdmin()).resolves.toBeNull();
  });

  it("returns null when the admin is SUSPENDED", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "suspended@example.com" } },
    });
    getAdminWithPermissionsMock.mockResolvedValue({
      status: "SUSPENDED",
      roleName: "ADMIN",
      permissions: new Set(["orders.view"]),
    });
    const { getCurrentAdmin } = await loadGuard();

    await expect(getCurrentAdmin()).resolves.toBeNull();
  });

  it("returns the resolved admin when active", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
    });
    getAdminWithPermissionsMock.mockResolvedValue({
      status: "ACTIVE",
      roleName: "SUPER_ADMIN",
      permissions: new Set(["roles.manage"]),
    });
    const { getCurrentAdmin } = await loadGuard();

    await expect(getCurrentAdmin()).resolves.toEqual({
      id: "user-1",
      email: "admin@example.com",
      roleName: "SUPER_ADMIN",
      permissions: new Set(["roles.manage"]),
    });
  });
});

describe("requireAdmin", () => {
  it("redirects to /admin/login when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { requireAdmin } = await loadGuard();

    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    expect(redirectMock).toHaveBeenCalledWith("/admin/login");
  });

  it("returns the admin without redirecting when authenticated", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "admin@example.com" } },
    });
    getAdminWithPermissionsMock.mockResolvedValue({
      status: "ACTIVE",
      roleName: "ADMIN",
      permissions: new Set(),
    });
    const { requireAdmin } = await loadGuard();

    await expect(requireAdmin()).resolves.toMatchObject({
      email: "admin@example.com",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("requirePermission", () => {
  it("redirects when the request is unauthenticated (hitting a Server Action directly)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { requirePermission } = await loadGuard();

    await expect(requirePermission("orders.update_status")).rejects.toThrow(
      "REDIRECT:/admin/login",
    );
  });

  it("throws ForbiddenError when authenticated but under-permissioned", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "content@example.com" } },
    });
    getAdminWithPermissionsMock.mockResolvedValue({
      status: "ACTIVE",
      roleName: "CONTENT_MANAGER",
      permissions: new Set(["content.manage"]),
    });
    const { requirePermission, ForbiddenError } = await loadGuard();

    await expect(
      requirePermission("orders.update_status"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the admin when the permission is present", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1", email: "order-mgr@example.com" } },
    });
    getAdminWithPermissionsMock.mockResolvedValue({
      status: "ACTIVE",
      roleName: "ORDER_MANAGER",
      permissions: new Set(["orders.update_status"]),
    });
    const { requirePermission } = await loadGuard();

    await expect(
      requirePermission("orders.update_status"),
    ).resolves.toMatchObject({ roleName: "ORDER_MANAGER" });
  });
});
