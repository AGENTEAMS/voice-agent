import { NextResponse } from "next/server";

// View-only deployment (post-demo): the live call/reset path is intentionally disabled.
// The dashboard is kept up for viewing only — the CTA does nothing server-side, so no
// demo_reset() runs and no n8n batch is fired.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "view-only deployment — live calls are disabled" },
    { status: 403 }
  );
}
