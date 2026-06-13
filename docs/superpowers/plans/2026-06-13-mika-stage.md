# Mika Stage (מיקה — במה) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presentation-grade single-screen demo dashboard: one click places a real ElevenLabs outbound call and the screen animates the agent's tool calls + DB writes live as a constellation (spec: `docs/superpowers/specs/2026-06-13-mika-stage-design.md`).

**Architecture:** New `stage/` Next.js App-Router app; tool activity streamed via a new `tool_events` table + Supabase Realtime; call placement/status via server routes holding the ElevenLabs key; all motion in CSS keyframes driven by a small TS state machine; `?sim=1` replays a scripted call through the same pipeline.

**Tech Stack:** Next.js (App Router, TS), @supabase/supabase-js v2, vitest (dev-only), plain CSS. Python (existing `agent/.venv`) + psycopg for applying SQL. No other deps.

**Execution notes:** Root `.env` values must never be printed — load at runtime only (`process.loadEnvFile`, dotenv-style). IDs resolve `.provisioned.json` → `.env` (stale-env rule). Working dir for npm: `stage/`.

---

### Task 1: `tool_events` migration + apply + RPC regression check

**Files:**
- Create: `supabase/migrations/0004_tool_events.sql`
- Create: `supabase/apply_sql.py`
- Create: `supabase/verify_rpc_shapes.py`

- [ ] **Step 1: Write the migration**

```sql
-- Maître — tool_events: per-tool-call telemetry for the live stage dashboard.
-- Each in-call RPC logs itself on entry; Supabase Realtime pushes INSERTs to the UI.
-- Demo-grade anon read policies are added for the localhost stage (no auth).

create table if not exists tool_events (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid references restaurants(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  tool_name      text not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_tool_events_created on tool_events (created_at desc);

alter table tool_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tool_events' and policyname='anon_read') then
    create policy "anon_read" on tool_events for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='reservations' and policyname='anon_read') then
    create policy "anon_read" on reservations for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='scheduled_calls' and policyname='anon_read') then
    create policy "anon_read" on scheduled_calls for select to anon using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and tablename='tool_events') then
    alter publication supabase_realtime add table tool_events;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and tablename='reservations') then
    alter publication supabase_realtime add table reservations;
  end if;
end $$;

-- helper: one-line logger
create or replace function log_tool_event(
  p_tool text, p_reservation_id uuid, p_restaurant_id uuid, p_payload jsonb
) returns void language sql security definer as $$
  insert into tool_events(tool_name, reservation_id, restaurant_id, payload)
  values (p_tool, p_reservation_id, p_restaurant_id, coalesce(p_payload,'{}'::jsonb));
$$;

-- check_availability: sql/stable → plpgsql/volatile so it can log; result shape unchanged.
drop function if exists check_availability(uuid, date, time, int);
create or replace function check_availability(
  p_restaurant_id uuid,
  p_date          date,
  p_time          time,
  p_party_size    int default 2
) returns table(slot time, available int, fits boolean)
language plpgsql
security definer
as $$
begin
  perform log_tool_event('check_availability', null, p_restaurant_id,
    jsonb_build_object('date', p_date, 'time', p_time, 'party_size', p_party_size));
  return query
  select time_slot, availability.available, (availability.available >= p_party_size) as fits
    from availability
   where restaurant_id = p_restaurant_id
     and date = p_date
     and time_slot between (p_time - interval '1 hour') and (p_time + interval '1 hour')
   order by abs(extract(epoch from (time_slot - p_time)));
end;
$$;
```

Then append logging as the FIRST statement inside the existing bodies by re-declaring the three writers exactly as they are in `0002_rpc.sql`/`0003_incall.sql` with one added line each (full bodies copied into 0004 so the migration is self-contained):
- `apply_call_result`: after `begin`, add
  `perform log_tool_event('apply_call_result', p_reservation_id, null, jsonb_build_object('decision', p_decision));`
- `change_reservation`: after `begin`, add
  `perform log_tool_event('change_reservation', p_reservation_id, p_restaurant_id, jsonb_build_object('date', p_date, 'time', p_time, 'party_size', p_party_size));`
- `schedule_call`: after `begin`, add
  `perform log_tool_event('schedule_call', p_reservation_id, p_restaurant_id, jsonb_build_object('kind', p_kind, 'scheduled_for', p_scheduled_for));`

- [ ] **Step 2: Write `supabase/apply_sql.py`** (reads `SUPABASE_DB_URL` from root `.env` via python-dotenv; never prints it)

```python
#!/usr/bin/env python3
"""Apply a SQL file to the cloud DB: python supabase/apply_sql.py migrations/0004_tool_events.sql"""
import os, sys, pathlib
from dotenv import load_dotenv
import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
url = os.environ["SUPABASE_DB_URL"]
sql = (pathlib.Path(__file__).parent / sys.argv[1]).read_text()
with psycopg.connect(url) as conn:
    conn.execute(sql)
    conn.commit()
print(f"applied {sys.argv[1]} OK")
```

- [ ] **Step 3: Install psycopg into the existing venv**

Run: `agent/.venv/bin/pip install -q "psycopg[binary]"`
Expected: clean install (venv already has httpx + python-dotenv).

- [ ] **Step 4: Capture PRE-migration RPC response shapes** — write `supabase/verify_rpc_shapes.py` calling the 2 read-path RPCs via REST exactly as the EL webhooks do (`check_availability`, plus `todays_pending_reservations` as control) and printing JSON; run and save output to `/tmp/rpc_pre.json`.

```python
#!/usr/bin/env python3
"""Snapshot RPC response shapes via PostgREST (as the EL tools call them)."""
import os, json, pathlib, datetime
from dotenv import load_dotenv
import httpx

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
URL, KEY = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
today = datetime.date.today().isoformat()
out = {}
out["check_availability"] = httpx.post(f"{URL}/rest/v1/rpc/check_availability",
    json={"p_restaurant_id": RID, "p_date": today, "p_time": "21:00", "p_party_size": 4},
    headers=H, timeout=15).json()
out["todays_pending"] = httpx.post(f"{URL}/rest/v1/rpc/todays_pending_reservations",
    json={"p_restaurant_id": RID}, headers=H, timeout=15).json()
print(json.dumps(out, ensure_ascii=False, indent=1, default=str))
```

Run: `agent/.venv/bin/python supabase/verify_rpc_shapes.py > /tmp/rpc_pre.json`

- [ ] **Step 5: Apply migration**

Run: `agent/.venv/bin/python supabase/apply_sql.py migrations/0004_tool_events.sql`
Expected: `applied migrations/0004_tool_events.sql OK`

- [ ] **Step 6: POST-migration shape check + tool_events smoke**

Run: `agent/.venv/bin/python supabase/verify_rpc_shapes.py > /tmp/rpc_post.json && diff <(python3 -c "import json;d=json.load(open('/tmp/rpc_pre.json'));print(sorted(d['check_availability'][0].keys()) if d['check_availability'] else 'EMPTY')") <(python3 -c "import json;d=json.load(open('/tmp/rpc_post.json'));print(sorted(d['check_availability'][0].keys()) if d['check_availability'] else 'EMPTY')")`
Expected: no diff (keys `slot, available, fits` identical). Then confirm a `tool_events` row appeared (REST GET, service key, `order=created_at.desc&limit=1`) with `tool_name=check_availability`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0004_tool_events.sql supabase/apply_sql.py supabase/verify_rpc_shapes.py
git commit -m "feat(db): tool_events telemetry + RPC self-logging for live stage"
```

---

### Task 2: Scaffold `stage/`

**Files:** Create: `stage/` via create-next-app; Modify: `stage/app/layout.tsx`, `stage/app/globals.css`, `stage/next.config.ts`; Create: `stage/lib/env.ts`

- [ ] **Step 1: Scaffold**

Run (repo root): `npx --yes create-next-app@latest stage --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-npm --yes && cd stage && npm i @supabase/supabase-js && npm i -D vitest`
Expected: `stage/` created, deps installed.

- [ ] **Step 2: Root-env bridge — `stage/next.config.ts`** (inlines the two public Supabase values; server-only secrets stay server-side via `lib/env.ts`)

```ts
import type { NextConfig } from "next";
try { process.loadEnvFile(new URL("../.env", import.meta.url).pathname); } catch {}
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_RESTAURANT_ID: process.env.RESTAURANT_ID ?? "11111111-1111-1111-1111-111111111111",
  },
};
export default nextConfig;
```

- [ ] **Step 3: `stage/lib/env.ts`** (server routes import this; resolves `.provisioned.json` → `.env`)

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "..");
try { process.loadEnvFile(join(ROOT, ".env")); } catch {}

let prov: Record<string, string> = {};
try { prov = JSON.parse(readFileSync(join(ROOT, "agent", ".provisioned.json"), "utf8")); } catch {}

export const ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? "",
  AGENT_ID: prov.agent_id || process.env.ELEVENLABS_AGENT_ID || "",
  PHONE_NUMBER_ID: prov.phone_number_id || process.env.ELEVENLABS_PHONE_NUMBER_ID || "",
  RESTAURANT_ID: process.env.RESTAURANT_ID ?? "11111111-1111-1111-1111-111111111111",
  STAGE_CALL_TARGET: process.env.STAGE_CALL_TARGET ?? "",
};
```

- [ ] **Step 4: RTL layout + fonts — `stage/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Heebo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = { title: "מיקה — במה · קיסו" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Palette tokens — replace `stage/app/globals.css`** (tokens only here; component keyframes arrive in Task 6)

```css
:root {
  --bg: #0b0c0f; --surface: #111317; --border: #26292f;
  --text: #e8e6e1; --text-dim: #8d9197; --text-faint: #555a61;
  --amber: #e8a33d; --amber-soft: rgba(232, 163, 61, 0.35);
  --green: #5fbf77; --green-soft: rgba(95, 191, 119, 0.35);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font-family: var(--font-heebo), system-ui, sans-serif;
  overflow: hidden;
}
code, .mono { font-family: var(--font-mono), ui-monospace, monospace; direction: ltr; }
```

- [ ] **Step 6: Sanity build + commit**

Run: `cd stage && npm run build`
Expected: compiles clean.

```bash
git add stage && git commit -m "feat(stage): scaffold Next.js demo stage (RTL, fonts, palette)"
```

---

### Task 3: Constellation state machine (pure logic, TDD)

**Files:** Create: `stage/lib/constellation.ts`, `stage/lib/constellation.test.ts`, `stage/vitest.config.ts`

- [ ] **Step 1: Write failing tests** (`stage/lib/constellation.test.ts`)

```ts
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
  it("serializes overlapping events 250ms apart and emits write continuation", () => {
    const fired: Array<{ node: string; writes: boolean; t: number }> = [];
    const e = createEngine((p) => fired.push(p));
    e.push(ev("check_availability", 1000));
    e.push(ev("change_reservation", 1010)); // arrives 10ms later → scheduled ≥250ms after first
    e.tick(1000); e.tick(1300);
    expect(fired.length).toBe(2);
    expect(fired[1].t - fired[0].t).toBeGreaterThanOrEqual(250);
    expect(fired[0].writes).toBe(false);
    expect(fired[1].writes).toBe(true);
  });

  it("call lifecycle transitions", () => {
    const e = createEngine(() => {});
    expect(e.state()).toBe("idle");
    e.setCall("dialing"); expect(e.state()).toBe("dialing");
    e.setCall("live");    expect(e.state()).toBe("live");
    e.setCall("resolved"); expect(e.state()).toBe("resolved");
  });
});
```

`stage/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"] } });
```

- [ ] **Step 2: Run to verify failure** — `cd stage && npx vitest run` → FAIL (module not found).

- [ ] **Step 3: Implement `stage/lib/constellation.ts`**

```ts
export type NodeId =
  | "check_availability" | "change_reservation" | "set_reservation_status"
  | "schedule_callback" | "transfer_to_human";

export type CallState = "idle" | "dialing" | "live" | "resolved";
export type StageEvent = { kind: "tool"; tool: string; at: number };
export type FiredPulse = { node: NodeId; writes: boolean; t: number };

export const NODE_FOR_TOOL: Record<string, { node: NodeId; writes: boolean }> = {
  check_availability: { node: "check_availability", writes: false },
  change_reservation: { node: "change_reservation", writes: true },
  apply_call_result: { node: "set_reservation_status", writes: true },
  schedule_call: { node: "schedule_callback", writes: true },
  transfer_to_human: { node: "transfer_to_human", writes: false },
};

export const MIN_GAP_MS = 250;

export function createEngine(onFire: (p: FiredPulse) => void) {
  let call: CallState = "idle";
  const queue: FiredPulse[] = [];
  let lastFiredAt = -Infinity;

  return {
    state: () => call,
    setCall(s: CallState) { call = s; },
    push(e: StageEvent) {
      const m = NODE_FOR_TOOL[e.tool];
      if (!m) return;
      queue.push({ node: m.node, writes: m.writes, t: e.at });
    },
    /** advance to wall-clock `now`; fires due pulses respecting MIN_GAP_MS */
    tick(now: number) {
      while (queue.length && queue[0].t <= now) {
        const next = queue.shift()!;
        const fireAt = Math.max(next.t, lastFiredAt + MIN_GAP_MS);
        if (fireAt > now) { queue.unshift({ ...next, t: fireAt }); break; }
        lastFiredAt = fireAt;
        onFire({ ...next, t: fireAt });
      }
    },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run` → PASS (2 files? 3 tests).

- [ ] **Step 5: Commit** — `git add stage/lib stage/vitest.config.ts && git commit -m "feat(stage): constellation event engine (TDD)"`

---

### Task 4: Simulation script

**Files:** Create: `stage/lib/sim.ts`, `stage/lib/sim.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { SIM_SCRIPT } from "./sim";

describe("sim script", () => {
  it("tells the negotiation story in order with monotonic delays", () => {
    const tools = SIM_SCRIPT.filter(s => s.type === "tool").map(s => s.tool);
    expect(tools).toEqual([
      "check_availability", "check_availability", "change_reservation", "apply_call_result",
    ]);
    const delays = SIM_SCRIPT.map(s => s.delayMs);
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
    expect(SIM_SCRIPT[0].type).toBe("call");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run`

- [ ] **Step 3: Implement `stage/lib/sim.ts`** (timings mirror a real measured call: dial ~4s, 39s total)

```ts
export type SimStep =
  | { type: "call"; state: "dialing" | "live" | "resolved" | "idle"; delayMs: number }
  | { type: "tool"; tool: string; delayMs: number; label: string }
  | { type: "reservation"; status: "confirmed"; time: string; delayMs: number };

export const SIM_SCRIPT: SimStep[] = [
  { type: "call", state: "dialing", delayMs: 0 },
  { type: "call", state: "live", delayMs: 4200 },
  { type: "tool", tool: "check_availability", delayMs: 12000, label: "בודקת זמינות ל־21:00" },
  { type: "tool", tool: "check_availability", delayMs: 17500, label: "בודקת חלופה — 21:30" },
  { type: "tool", tool: "change_reservation", delayMs: 24000, label: "מעדכנת ל־21:30 · 4 סועדים" },
  { type: "tool", tool: "apply_call_result", delayMs: 31000, label: "מאשרת את ההזמנה" },
  { type: "reservation", status: "confirmed", time: "21:30", delayMs: 33000 },
  { type: "call", state: "resolved", delayMs: 34000 },
  { type: "call", state: "idle", delayMs: 38000 },
];
```

- [ ] **Step 4: Run → PASS.** Commit: `git add stage/lib/sim* && git commit -m "feat(stage): scripted demo simulation"`

---

### Task 5: API routes (allowlist TDD)

**Files:** Create: `stage/lib/callPolicy.ts`, `stage/lib/callPolicy.test.ts`, `stage/lib/spoken.ts`, `stage/app/api/call/route.ts`, `stage/app/api/call/[id]/route.ts`, `stage/app/api/reservations/route.ts`

- [ ] **Step 1: Failing tests — `stage/lib/callPolicy.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveTarget, ALLOWLIST } from "./callPolicy";

describe("resolveTarget", () => {
  it("allows an allowlisted reservation phone", () => {
    expect(resolveTarget("+972525898552", "")).toEqual({ ok: true, to: "+972525898552" });
  });
  it("redirects to STAGE_CALL_TARGET when set and allowlisted", () => {
    expect(resolveTarget("+972500000001", "+972585121998")).toEqual({ ok: true, to: "+972585121998" });
  });
  it("rejects when neither phone nor override is allowlisted", () => {
    expect(resolveTarget("+972500000001", "").ok).toBe(false);
    expect(resolveTarget("+972500000001", "+972500000002").ok).toBe(false);
  });
  it("allowlist is exactly the two project test numbers", () => {
    expect(ALLOWLIST).toEqual(["+972525898552", "+972585121998"]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `stage/lib/callPolicy.ts`**

```ts
export const ALLOWLIST = ["+972525898552", "+972585121998"] as const;

export function resolveTarget(reservationPhone: string, overrideTarget: string):
  { ok: true; to: string } | { ok: false; reason: string } {
  const to = overrideTarget || reservationPhone;
  if ((ALLOWLIST as readonly string[]).includes(to)) return { ok: true, to };
  return { ok: false, reason: `target ${to} not in allowlist` };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: `stage/lib/spoken.ts`** — port of `spoken_time_he` / `spoken_party_he` from `agent/outbound_elevenlabs.py:46-76` (same tables, same rules; used for dynamic variables parity).

```ts
const HOURS_HE: Record<number, string> = { 0: "שתים עשרה", 1: "אחת", 2: "שתיים", 3: "שלוש", 4: "ארבע", 5: "חמש", 6: "שש", 7: "שבע", 8: "שמונה", 9: "תשע", 10: "עשר", 11: "אחת עשרה" };
const PARTY_HE: Record<number, string> = { 1: "סועד אחד", 2: "שני סועדים", 3: "שלושה סועדים", 4: "ארבעה סועדים", 5: "חמישה סועדים", 6: "שישה סועדים", 7: "שבעה סועדים", 8: "שמונה סועדים", 9: "תשעה סועדים", 10: "עשרה סועדים" };

export function spokenTimeHe(h: number, m: number): string {
  const hour12 = HOURS_HE[h % 12];
  let base: string;
  if (m === 0) base = hour12;
  else if (m === 30) base = `${hour12} וחצי`;
  else if (m === 15) base = `${hour12} ורבע`;
  else if (m === 45) base = `רבע ל${HOURS_HE[(h + 1) % 12]}`;
  else base = `${hour12} ${String(m).padStart(2, "0")}`;
  if (m === 0) {
    if (h >= 12 && h < 17) return `${base} בצהריים`;
    if (h >= 17) return `${base} בערב`;
    return `${base} בבוקר`;
  }
  return base;
}
export const spokenPartyHe = (n: number) => PARTY_HE[n] ?? `${n} סועדים`;
```

- [ ] **Step 6: `stage/app/api/call/route.ts`**

```ts
import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";
import { resolveTarget } from "@/lib/callPolicy";
import { spokenTimeHe, spokenPartyHe } from "@/lib/spoken";

const TZ = "Asia/Jerusalem";

export async function POST(req: Request) {
  const { reservation_id } = await req.json();
  if (!reservation_id) return NextResponse.json({ error: "reservation_id required" }, { status: 400 });

  const sb = { apikey: ENV.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}` };
  const r = await fetch(
    `${ENV.SUPABASE_URL}/rest/v1/reservations?id=eq.${reservation_id}&select=reserved_for,party_size,customers(name,phone)`,
    { headers: sb, cache: "no-store" });
  const rows = await r.json();
  if (!rows?.length) return NextResponse.json({ error: "reservation not found" }, { status: 404 });
  const row = rows[0];

  const target = resolveTarget(row.customers?.phone ?? "", ENV.STAGE_CALL_TARGET);
  if (!target.ok) return NextResponse.json({ error: target.reason }, { status: 403 });

  const local = new Date(new Date(row.reserved_for).toLocaleString("en-US", { timeZone: TZ }));
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const pad = (n: number) => String(n).padStart(2, "0");
  const dyn = {
    customer_name: row.customers?.name ?? "אורח",
    reservation_time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
    reservation_time_spoken: spokenTimeHe(local.getHours(), local.getMinutes()),
    party_size: String(row.party_size),
    party_size_spoken: spokenPartyHe(Number(row.party_size)),
    reservation_id,
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    now_local: now.toISOString(),
  };

  const el = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: { "xi-api-key": ENV.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: ENV.AGENT_ID,
      agent_phone_number_id: ENV.PHONE_NUMBER_ID,
      to_number: target.to,
      conversation_initiation_client_data: { dynamic_variables: dyn },
    }),
  });
  if (!el.ok) return NextResponse.json({ error: `elevenlabs ${el.status}`, detail: await el.text() }, { status: 502 });
  const body = await el.json();
  return NextResponse.json({ conversation_id: body.conversation_id, call_sid: body.callSid });
}
```

- [ ] **Step 7: `stage/app/api/call/[id]/route.ts`** (status poll proxy + best-effort transfer detection)

```ts
import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
    headers: { "xi-api-key": ENV.ELEVENLABS_API_KEY }, cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: `elevenlabs ${r.status}` }, { status: 502 });
  const body = await r.json();
  const transferred = JSON.stringify(body.transcript ?? []).includes("transfer_to_number");
  return NextResponse.json({ status: body.status, transferred });
}
```

- [ ] **Step 8: `stage/app/api/reservations/route.ts`** (tonight's strip; service key server-side)

```ts
import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";

export async function GET() {
  const sb = { apikey: ENV.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}` };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const r = await fetch(
    `${ENV.SUPABASE_URL}/rest/v1/reservations?restaurant_id=eq.${ENV.RESTAURANT_ID}` +
    `&reserved_for=gte.${today}T00:00:00%2B03:00&reserved_for=lte.${today}T23:59:59%2B03:00` +
    `&select=id,reserved_for,party_size,status,customers(name,phone)&order=reserved_for.asc`,
    { headers: sb, cache: "no-store" });
  return NextResponse.json(await r.json());
}
```

- [ ] **Step 9: Build + commit** — `npm run build` clean; `git add stage && git commit -m "feat(stage): call/status/reservations API with hard allowlist"`

---

### Task 6: UI — Stage, strip, CTA, page, all motion

**Files:** Create: `stage/components/Stage.tsx`, `stage/components/ReservationsStrip.tsx`, `stage/components/CallButton.tsx`; Modify: `stage/app/page.tsx`, append keyframes to `stage/app/globals.css`

Layout: full-viewport grid `1fr 300px` (constellation | strip), header band 56px. **Caption line** (Tomer addition 2026-06-13): a single quiet text line under the constellation showing the current action in Hebrew («בודקת זמינות ל־21:30…»), fed by the same engine events (sim labels / tool_events payloads); fades between events, empty when idle. Constellation nodes positioned by angle (top, ±72°, ±144°) at radius `min(34vh, 300px)`; Supabase node bottom-center. Each node: icon + mono label + Hebrew sublabel that appears with the latest event label. Orb: 160px, breathing/equalizer per state. Pulses: a dot animated along each wire via CSS custom property `--len`; node flare + green DB flash classes toggled by the engine callback (700ms timeout cleanup). CTA under orb; resolved → strip row flips with green settle.

(Е full component + CSS code written at execution time following the v2 motion-study HTML already validated in `.superpowers/brainstorm/14303-1781309570/content/animation-concept-v2.html` — same keyframe vocabulary scaled up: `breathe`, `eq`, `travel`, `glow`, `dbglow`, `pulse`, `flip`. The motion study is the visual contract; the components must match it.)

- [ ] Step 1: `Stage.tsx` (client) — render orb/wires/nodes; subscribe to engine `onFire`; requestAnimationFrame loop calls `engine.tick(Date.now())`.
- [ ] Step 2: `ReservationsStrip.tsx` — fetch `/api/reservations` on mount + on `reservation` events; rows: name · time · party; `data-status` styling; called row highlighted; flip animation on status change.
- [ ] Step 3: `CallButton.tsx` — disabled unless `idle` + a pending reservation selected (default: first pending allowlisted-or-overridable row); POST `/api/call`; on 200 → `dialing` + start status polling every 2s; map `initiated→dialing`, `in-progress→live`, `done/failed→resolved-or-idle`.
- [ ] Step 4: `page.tsx` — compose; `?sim=1` runs `SIM_SCRIPT` through the same engine + strip events; Realtime wiring lands Task 7.
- [ ] Step 5: `npm run build` clean → commit `feat(stage): constellation stage UI + motion`.

---

### Task 7: Supabase Realtime wiring

**Files:** Create: `stage/lib/supabase.ts`; Modify: `stage/app/page.tsx`

- [ ] Step 1: `stage/lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { realtime: { params: { eventsPerSecond: 20 } } }
);

export function subscribeStage(handlers: {
  onToolEvent: (toolName: string, payload: unknown) => void;
  onReservationChange: (row: { id: string; status: string }) => void;
}) {
  const ch = supabase
    .channel("stage")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tool_events" },
      (p) => handlers.onToolEvent((p.new as any).tool_name, (p.new as any).payload))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reservations" },
      (p) => handlers.onReservationChange(p.new as any))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
```

- [ ] Step 2: wire in `page.tsx`: tool events → `engine.push({kind:"tool", tool, at: Date.now()})`; reservation UPDATE → strip refresh + if it's the called reservation and status ≠ pending → `engine.setCall("resolved")`.
- [ ] Step 3: build + commit `feat(stage): realtime tool/reservation wiring`.

---

### Task 8: Visual verification (playwright-cli per screenshot rule)

- [ ] Step 1: `cd stage && npm run dev` (background, port 3000).
- [ ] Step 2: `playwright-cli open http://localhost:3000/?sim=1` → screenshots at idle (t=0), live mid-pulse (~t=14s), resolved (~t=34s). Read each screenshot; check against spec: palette exact, RTL, fonts, spacing, node labels, one-accent rule, green-only-on-write.
- [ ] Step 3: fix anything off; re-screenshot until clean; commit `fix(stage): visual polish from screenshot review`.

---

### Task 9: Live end-to-end (GATED — phone rings)

- [ ] Step 1: `python supabase/reseed.py --clean`.
- [ ] Step 2: recreate the test reservation (`agent/make_reservation.py` … phone `+972585121998`).
- [ ] Step 3: **STOP — ask Tomer for go** (his phone rings). On go: CTA from the stage → watch constellation against real call → after end, `agent/call_and_verify.py --reservation <uuid>` to print transcript/tools/DB triplet; confirm `tool_events` rows match the constellation pulses seen.

---

## Self-review

- Spec coverage: shape/animation/CTA/no-transcript/palette ✓ (Tasks 2–7), tool_events + RPC logging + RLS/publication ✓ (Task 1), allowlist ✓ (Task 5, TDD), sim ✓ (Task 4), EL polling ✓ (Task 5 Step 7), screenshot verification ✓ (Task 8), live gate ✓ (Task 9).
- Placeholders: Task 6 deliberately references the validated motion-study file as the visual contract instead of duplicating ~200 lines of CSS — the keyframe vocabulary and class behaviors are named and the source file is committed in-repo. All other tasks carry full code.
- Type consistency: `StageEvent`/`FiredPulse`/`CallState` defined Task 3, consumed Tasks 4/6/7 with matching names; `resolveTarget` signature consistent; route param `Promise<{id}>` matches Next 15 App Router convention.
