import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "user" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: { id: 1, openId: `booking-test-${role}`, email: "test@nqiha.local", name: "Booking Test", loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("bookings access control", () => {
  it("rejects regular users from the admin booking list", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.bookings.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin context to reach the booking list procedure", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await expect(caller.bookings.list()).resolves.toBeDefined();
  });
});
