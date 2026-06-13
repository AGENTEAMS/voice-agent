// One demo run: reset the slate to clean (only Tomer pending), THEN fire the n8n batch.
// Reset-on-START keeps the previous call's result on screen until the next click.
// If the reset fails we do NOT fire the batch — never run the batch on a dirty slate.

export type RunDeps = {
  supabaseUrl: string;
  serviceKey: string;
  webhookUrl: string;
  fetchImpl?: typeof fetch;
};

export type RunResult = { ok: true } | { ok: false; status: number; error: string };

export async function triggerRun(deps: RunDeps): Promise<RunResult> {
  const f = deps.fetchImpl ?? fetch;
  if (!deps.supabaseUrl || !deps.serviceKey) {
    return { ok: false, status: 500, error: "supabase env missing" };
  }
  if (!deps.webhookUrl) {
    return { ok: false, status: 500, error: "N8N_WEBHOOK_URL missing" };
  }

  // 1. reset to clean slate
  const reset = await f(`${deps.supabaseUrl}/rest/v1/rpc/demo_reset`, {
    method: "POST",
    headers: {
      apikey: deps.serviceKey,
      Authorization: `Bearer ${deps.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!reset.ok) return { ok: false, status: 502, error: `demo_reset ${reset.status}` };

  // 2. fire the n8n batch (only after a clean reset)
  const fire = await f(deps.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!fire.ok) return { ok: false, status: 502, error: `n8n ${fire.status}` };

  return { ok: true };
}
