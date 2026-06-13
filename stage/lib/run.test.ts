import { describe, it, expect, vi } from "vitest";
import { triggerRun } from "./run";

const DEPS = {
  supabaseUrl: "https://db.example.co",
  serviceKey: "svc-key",
  webhookUrl: "https://n8n.example/webhook/maitre-run",
};

function okResponse() {
  return { ok: true, status: 204, text: async () => "" } as unknown as Response;
}
function errResponse(status: number) {
  return { ok: false, status, text: async () => "boom" } as unknown as Response;
}

describe("triggerRun", () => {
  it("resets first, then fires the webhook, in that order", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return okResponse();
    }) as unknown as typeof fetch;

    const res = await triggerRun({ ...DEPS, fetchImpl });

    expect(res).toEqual({ ok: true });
    expect(calls[0]).toBe("https://db.example.co/rest/v1/rpc/demo_reset");
    expect(calls[1]).toBe("https://n8n.example/webhook/maitre-run");
  });

  it("does NOT fire the webhook if the reset fails", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return errResponse(500); // reset fails
    }) as unknown as typeof fetch;

    const res = await triggerRun({ ...DEPS, fetchImpl });

    expect(res.ok).toBe(false);
    expect(calls).toEqual(["https://db.example.co/rest/v1/rpc/demo_reset"]); // only the reset
  });

  it("returns an error when N8N_WEBHOOK_URL is missing", async () => {
    const fetchImpl = vi.fn(async () => okResponse()) as unknown as typeof fetch;
    const res = await triggerRun({ ...DEPS, webhookUrl: "", fetchImpl });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
