import { describe, it, expect } from "vitest";
import { SIM_SCRIPT } from "./sim";

describe("sim script", () => {
  it("tells the negotiation story in order with monotonic delays", () => {
    const tools = SIM_SCRIPT.filter((s) => s.type === "tool").map((s) => s.tool);
    expect(tools).toEqual([
      "check_availability",
      "check_availability",
      "change_reservation",
      "apply_call_result",
    ]);
    const delays = SIM_SCRIPT.map((s) => s.delayMs);
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
    expect(SIM_SCRIPT[0].type).toBe("call");
    expect(SIM_SCRIPT.at(-1)).toEqual({ type: "call", state: "idle", delayMs: 38000 });
  });
});
