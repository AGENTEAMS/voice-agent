import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";

// Cancellation-insights aggregate for the /insights page. Reads the LLM-derived
// themes (gpt-4o, precomputed/seeded) from cancellation_insights. Service-role,
// like /api/tonight — the raw `cancellations` log (guest reasons) is never exposed.
export async function GET() {
  const sb = {
    apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const base = `${ENV.SUPABASE_URL}/rest/v1`;

  const rows = await fetch(
    `${base}/cancellation_insights?restaurant_id=eq.${ENV.RESTAURANT_ID}` +
      `&select=theme,mentions,share,implication,recommendation,sample_quote,rank,period_label,generated_by` +
      `&order=rank.asc`,
    { headers: sb, cache: "no-store" }
  ).then((r) => r.json());

  const insights = Array.isArray(rows) ? rows : [];
  const total = insights.reduce((s: number, r: { mentions?: number }) => s + (r.mentions ?? 0), 0);

  return NextResponse.json({
    insights,
    total,
    period: insights[0]?.period_label ?? "",
    generatedBy: insights[0]?.generated_by ?? "gpt-4o",
  });
}
