import { describe, expect, it } from "vitest";
import { computeKpis } from "./kpis";
import type { CallAttempt, Reservation } from "./types";

const NOW = new Date("2026-06-09T15:00:00.000Z");

function call(partial: Partial<CallAttempt>): CallAttempt {
  return {
    id: Math.random().toString(36).slice(2),
    reservation_id: null,
    customer_id: null,
    direction: "outbound",
    outcome: null,
    intent: null,
    confidence: null,
    transcript: [],
    started_at: NOW.toISOString(),
    ended_at: NOW.toISOString(),
    duration_seconds: null,
    cost_usd: null,
    provider: "seed",
    customer_name: null,
    ...partial,
  };
}

function reservation(status: Reservation["status"]): Reservation {
  return {
    id: Math.random().toString(36).slice(2),
    reserved_for: NOW.toISOString(),
    party_size: 2,
    status,
    source: "seed",
    customer: null,
  };
}

describe("computeKpis", () => {
  it("counts reservation statuses", () => {
    const reservations = [
      reservation("pending"),
      reservation("pending"),
      reservation("confirmed"),
      reservation("cancelled"),
      reservation("needs_human"),
    ];
    const k = computeKpis([], reservations, NOW);
    expect(k.pending).toBe(2);
    expect(k.confirmed).toBe(1);
    expect(k.cancelled).toBe(1);
    expect(k.needsHuman).toBe(1);
  });

  it("computes confirmation rate over decided outbound calls only", () => {
    const calls = [
      call({ direction: "outbound", outcome: "confirmed", duration_seconds: 40, cost_usd: 0.01 }),
      call({ direction: "outbound", outcome: "cancelled", duration_seconds: 30, cost_usd: 0.01 }),
      call({ direction: "outbound", outcome: "needs_human", duration_seconds: 50, cost_usd: 0.01 }),
      call({ direction: "outbound", outcome: "no_answer", duration_seconds: 20, cost_usd: 0.004 }),
      call({ direction: "inbound", outcome: "answered_inbound", duration_seconds: 25, cost_usd: 0.008 }),
    ];
    const k = computeKpis(calls, [], NOW);
    // 3 decided outbound (confirmed/cancelled/needs_human), 1 confirmed => 1/3
    expect(k.confirmationRate).toBeCloseTo(1 / 3, 5);
    // no_answer 1 of 4 outbound
    expect(k.noAnswerRate).toBeCloseTo(1 / 4, 5);
  });

  it("averages duration and sums spend across today's completed calls", () => {
    const calls = [
      call({ duration_seconds: 40, cost_usd: 0.01 }),
      call({ duration_seconds: 20, cost_usd: 0.02 }),
    ];
    const k = computeKpis(calls, [], NOW);
    expect(k.avgDurationSeconds).toBe(30);
    expect(k.totalSpendUsd).toBeCloseTo(0.03, 5);
    expect(k.callsToday).toBe(2);
  });

  it("ignores calls from other days", () => {
    const yesterday = call({ started_at: "2026-06-08T15:00:00.000Z", duration_seconds: 99, cost_usd: 1 });
    const k = computeKpis([yesterday], [], NOW);
    expect(k.callsToday).toBe(0);
    expect(k.totalSpendUsd).toBe(0);
  });

  it("counts in-progress calls (no ended_at) regardless of day", () => {
    const live = call({ ended_at: null, duration_seconds: null });
    const k = computeKpis([live], [], NOW);
    expect(k.inProgress).toBe(1);
  });

  it("returns zero rates for empty input without dividing by zero", () => {
    const k = computeKpis([], [], NOW);
    expect(k.confirmationRate).toBe(0);
    expect(k.noAnswerRate).toBe(0);
    expect(k.avgDurationSeconds).toBe(0);
  });
});
