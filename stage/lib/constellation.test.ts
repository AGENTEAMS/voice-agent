import { describe, it, expect } from "vitest";
import { createEngine, NODE_FOR_TOOL, type StageEvent } from "./constellation";

const ev = (tool: string, at = 0): StageEvent => ({ kind: "tool", tool, at });

describe("NODE_FOR_TOOL", () => {
  it("maps RPC names to display nodes", () => {
    expect(NODE_FOR_TOOL["apply_call_result"].node).toBe("set_reservation_status");
    expect(NODE_FOR_TOOL["schedule_call"].node).toBe("schedule_callback");
    expect(NODE_FOR_TOOL["check_availability"].writes).toBe(false);
    expect(NODE_FOR_TOOL["change_reservation"].writes).toBe(true);
  });
});

describe("engine", () => {
  it("serializes overlapping events ≥250ms apart and flags writes", () => {
    const fired: Array<{ node: string; writes: boolean; t: number }> = [];
    const e = createEngine((p) => fired.push(p));
    e.push(ev("check_availability", 1000));
    e.push(ev("change_reservation", 1010));
    e.tick(1000);
    e.tick(1300);
    expect(fired.length).toBe(2);
    expect(fired[1].t - fired[0].t).toBeGreaterThanOrEqual(250);
    expect(fired[0].writes).toBe(false);
    expect(fired[1].writes).toBe(true);
  });

  it("ignores unknown tools", () => {
    const fired: unknown[] = [];
    const e = createEngine((p) => fired.push(p));
    e.push(ev("end_call", 0));
    e.tick(10);
    expect(fired.length).toBe(0);
  });

  it("call lifecycle transitions", () => {
    const e = createEngine(() => {});
    expect(e.state()).toBe("idle");
    e.setCall("dialing");
    expect(e.state()).toBe("dialing");
    e.setCall("live");
    expect(e.state()).toBe("live");
    e.setCall("resolved");
    expect(e.state()).toBe("resolved");
  });
});
