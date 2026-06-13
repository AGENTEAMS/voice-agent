import { describe, it, expect } from "vitest";
import { resolveTarget, ALLOWLIST } from "./callPolicy";

describe("resolveTarget", () => {
  it("allows an allowlisted reservation phone", () => {
    expect(resolveTarget("+972525898552", "")).toEqual({ ok: true, to: "+972525898552" });
  });
  it("redirects to STAGE_CALL_TARGET when set and allowlisted", () => {
    expect(resolveTarget("+972500000001", "+972585121998")).toEqual({
      ok: true,
      to: "+972585121998",
    });
  });
  it("rejects when neither phone nor override is allowlisted", () => {
    expect(resolveTarget("+972500000001", "").ok).toBe(false);
    expect(resolveTarget("+972500000001", "+972500000002").ok).toBe(false);
  });
  it("allowlist is exactly the two project test numbers", () => {
    expect(ALLOWLIST).toEqual(["+972525898552", "+972585121998"]);
  });
});
