import { describe, expect, it } from "vitest";
import { buildConfirmScript, confirmCallSummary, formatTimeHM } from "./demo-script";
import type { Reservation } from "./types";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    reserved_for: "2026-06-09T17:30:00.000Z", // 20:30 Asia/Jerusalem (UTC+3, summer)
    party_size: 4,
    status: "pending",
    source: "seed",
    customer: { id: "c1", name: "נועה פרידמן", phone: "+972505550001", notes: null },
    ...overrides,
  };
}

describe("formatTimeHM", () => {
  it("formats to HH:MM in Asia/Jerusalem", () => {
    expect(formatTimeHM("2026-06-09T17:30:00.000Z")).toBe("20:30");
  });
});

describe("buildConfirmScript", () => {
  it("produces an alternating agent/customer dialog with increasing timestamps", () => {
    const turns = buildConfirmScript(reservation());
    expect(turns.length).toBeGreaterThanOrEqual(3);
    expect(turns[0].role).toBe("agent");
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].role).not.toBe(turns[i - 1].role);
      expect(turns[i].ts_ms).toBeGreaterThan(turns[i - 1].ts_ms);
    }
  });

  it("embeds the customer name, party size, and reservation time", () => {
    const turns = buildConfirmScript(reservation());
    const agentOpener = turns[0].text;
    expect(agentOpener).toContain("נועה פרידמן");
    expect(agentOpener).toContain("20:30");
    expect(agentOpener).toContain("4");
  });

  it("falls back to a generic guest label when no customer is attached", () => {
    const turns = buildConfirmScript(reservation({ customer: null }));
    expect(turns[0].text).toContain("אורח");
  });
});

describe("confirmCallSummary", () => {
  it("summarizes as a confirmed decision with a derived duration", () => {
    const turns = buildConfirmScript(reservation());
    const summary = confirmCallSummary(turns);
    expect(summary.outcome).toBe("confirmed");
    expect(summary.decision).toBe("confirmed");
    expect(summary.durationSeconds).toBeGreaterThan(0);
    expect(summary.costUsd).toBeGreaterThan(0);
  });
});
