import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateSecureToken, generateUuidV4 } from "./crypto";

describe("crypto", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("generates secure tokens", () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("generates valid UUIDv4", () => {
    const id = generateUuidV4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
