# Stage on Vercel + n8n-driven demo loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the `stage/` dashboard to a public Vercel URL (different account, no CLI) and make its call button reset the demo DB then fire the existing n8n batch — so the demo visibly "runs on n8n," calling only Tomer (+972585121998) once, with a clean-slate reset on every run.

**Architecture:** Button → Vercel `/api/run` → (1) `POST /rest/v1/rpc/demo_reset` reset-on-start, (2) `POST N8N_WEBHOOK_URL`. The existing n8n batch reads today's pending (only Tomer) and places the call; the dashboard lights from Supabase Realtime, source-agnostic. The clean slate lives in one Postgres function so every reset path is identical.

**Tech Stack:** Next.js 16 (App Router, React 19), Supabase Postgres + PostgREST RPC, n8n cloud (asher13.app.n8n.cloud), Vitest, Vercel (dashboard Git import).

**Spec:** [docs/superpowers/specs/2026-06-13-stage-vercel-n8n-demo-design.md](../specs/2026-06-13-stage-vercel-n8n-demo-design.md)

---

## File map

- **Create** `supabase/migrations/0005_demo_reset.sql` — the `public.demo_reset()` RPC (authoritative demo slate) + grants.
- **Rewrite** `supabase/demo_reset.py` — call the RPC over REST + verify; drop the SUPABASE_DB_URL / make_reservation / REST-date-shift paths.
- **Rewrite** `supabase/seed.sql` — one line: `select public.demo_reset();` (single source of truth).
- **Create** `stage/lib/run.ts` — testable `triggerRun()` (reset, then fire webhook).
- **Create** `stage/lib/run.test.ts` — unit tests for ordering + reset-failure guard.
- **Create** `stage/app/api/run/route.ts` — POST endpoint calling `triggerRun()`.
- **Delete** `stage/app/api/call/route.ts` — the old direct-to-ElevenLabs path (n8n owns calling now).
- **Modify** `stage/lib/env.ts` — add `N8N_WEBHOOK_URL`.
- **Modify** `stage/app/page.tsx` — button → `/api/run`; dialing→live promotion + safety timer; `disabled` no longer keyed to pending rows.
- **Manual (guided)** n8n workflow `G7RYSw2BQgqnabJt` — add a Webhook trigger, activate, capture the production URL.
- **Manual (guided)** Vercel — import repo (Root Directory `stage`), set env vars, pick subdomain.

> **Note:** `stage/lib/env.ts` and `stage/next.config.ts` already wrap `process.loadEnvFile("../.env")` in try/catch, so they degrade cleanly on Vercel — values come from Vercel env vars. **No code change needed there**; just set the env vars (Task 7).

---

### Task 1: `demo_reset()` RPC migration

**Files:**
- Create: `supabase/migrations/0005_demo_reset.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_demo_reset.sql`:

```sql
-- Maître — public.demo_reset(): ONE authoritative, deterministic demo slate.
-- Single source of truth for the reset used by the stage button (reset-on-START of every run),
-- the local supabase/demo_reset.py, supabase/seed.sql, and any REST caller:
--   POST /rest/v1/rpc/demo_reset
-- Produces a populated "tonight" board where every guest is already handled (confirmed /
-- cancelled / needs_human) EXCEPT one Tomer row (+972585121998) left PENDING — so the n8n
-- batch (todays_pending_reservations) calls only Tomer, once. Negotiation props baked in:
-- 20:00 has room (change-to-eight), 21:00 FULL, 21:30 is the alternative she offers.
create or replace function public.demo_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid   uuid := '11111111-1111-1111-1111-111111111111';
  v_tomer uuid := '22222222-0000-0000-0000-0000000000aa';
begin
  -- ── clean slate (children first; call_attempts has no restaurant_id) ──
  delete from call_attempts
   where reservation_id in (select id from reservations where restaurant_id = v_rid)
      or customer_id   in (select id from customers    where restaurant_id = v_rid);
  delete from tool_events     where restaurant_id = v_rid;
  delete from scheduled_calls where restaurant_id = v_rid;
  delete from reservations    where restaurant_id = v_rid;
  delete from availability    where restaurant_id = v_rid;
  delete from policies        where restaurant_id = v_rid;
  delete from customers       where restaurant_id = v_rid;

  -- ── restaurant (idempotent) ──
  insert into restaurants (id, name, phone, timezone, opening_hours) values
    (v_rid, 'מסעדת קיסו', '+97233334444', 'Asia/Jerusalem',
     '{"sun":["12:00","23:00"],"mon":["12:00","23:00"],"tue":["12:00","23:00"],"wed":["12:00","23:00"],"thu":["12:00","00:00"],"fri":["12:00","16:00"],"sat":["19:00","00:00"]}'::jsonb)
  on conflict (id) do update
     set name = excluded.name, phone = excluded.phone,
         timezone = excluded.timezone, opening_hours = excluded.opening_hours;

  -- ── customers: 15 mock guests + Tomer (the only number we actually dial) ──
  insert into customers (id, restaurant_id, name, phone, notes) values
    ('22222222-0000-0000-0000-000000000001', v_rid, 'נועה פרידמן','+972505550001','קבועה'),
    ('22222222-0000-0000-0000-000000000002', v_rid, 'איתי כהן','+972505550002',null),
    ('22222222-0000-0000-0000-000000000003', v_rid, 'שירה לוי','+972505550003','אלרגיה לאגוזים'),
    ('22222222-0000-0000-0000-000000000004', v_rid, 'דניאל בן דוד','+972505550004',null),
    ('22222222-0000-0000-0000-000000000005', v_rid, 'מאיה אזולאי','+972505550005',null),
    ('22222222-0000-0000-0000-000000000006', v_rid, 'יונתן מזרחי','+972505550006','יום הולדת'),
    ('22222222-0000-0000-0000-000000000007', v_rid, 'תמר שפירא','+972505550007',null),
    ('22222222-0000-0000-0000-000000000008', v_rid, 'עומר ביטון','+972505550008',null),
    ('22222222-0000-0000-0000-000000000009', v_rid, 'רוני גולן','+972505550009',null),
    ('22222222-0000-0000-0000-000000000010', v_rid, 'אורי חדד','+972505550010',null),
    ('22222222-0000-0000-0000-000000000011', v_rid, 'ליאל ששון','+972505550011',null),
    ('22222222-0000-0000-0000-000000000012', v_rid, 'גיא רוזנברג','+972505550012','שולחן ליד החלון'),
    ('22222222-0000-0000-0000-000000000013', v_rid, 'הדר נחום','+972505550013',null),
    ('22222222-0000-0000-0000-000000000014', v_rid, 'אסף קפלן','+972505550014',null),
    ('22222222-0000-0000-0000-000000000015', v_rid, 'יעל אברהם','+972505550015',null),
    (v_tomer,                                v_rid, 'תומר אלזם','+972585121998',null);

  -- ── reservations for TODAY: everyone non-pending EXCEPT Tomer (the only call) ──
  insert into reservations (restaurant_id, customer_id, reserved_for, party_size, status, source)
  select v_rid, c.customer_id,
         ((now() at time zone 'Asia/Jerusalem')::date + c.t) at time zone 'Asia/Jerusalem',
         c.party, c.status::reservation_status, 'seed'
  from (values
    ('22222222-0000-0000-0000-000000000001'::uuid, time '19:00', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000002'::uuid, time '19:30', 4, 'confirmed'),
    ('22222222-0000-0000-0000-000000000003'::uuid, time '20:00', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000004'::uuid, time '20:00', 6, 'confirmed'),
    ('22222222-0000-0000-0000-000000000005'::uuid, time '20:30', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000006'::uuid, time '20:30', 8, 'confirmed'),
    ('22222222-0000-0000-0000-000000000007'::uuid, time '21:00', 3, 'cancelled'),
    ('22222222-0000-0000-0000-000000000008'::uuid, time '21:00', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000009'::uuid, time '21:30', 4, 'confirmed'),
    ('22222222-0000-0000-0000-000000000010'::uuid, time '21:30', 2, 'needs_human'),
    ('22222222-0000-0000-0000-000000000011'::uuid, time '22:00', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000012'::uuid, time '22:00', 5, 'confirmed'),
    ('22222222-0000-0000-0000-000000000013'::uuid, time '22:30', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000014'::uuid, time '18:30', 2, 'confirmed'),
    ('22222222-0000-0000-0000-000000000015'::uuid, time '18:30', 4, 'confirmed'),
    (v_tomer,                                      time '20:30', 4, 'pending')
  ) as c(customer_id, t, party, status);

  -- ── inbound FAQ policies ──
  insert into policies (restaurant_id, kind, question_he, answer_he) values
    (v_rid,'hours','מה שעות הפתיחה?','אנחנו פתוחים ראשון עד חמישי מ-12:00 בצהריים, שישי 12:00 עד 16:00, ושבת מ-19:00 בערב.'),
    (v_rid,'cancellation','מה מדיניות הביטולים?','אפשר לבטל ללא עלות עד שעתיים לפני מועד ההזמנה. ביטול מאוחר יותר עשוי לחייב דמי ביטול.'),
    (v_rid,'availability','יש מקום הערב?','תלוי בשעה ובגודל הקבוצה — אבדוק עבורך את הזמינות לפי המועד שתבקש.'),
    (v_rid,'general','יש אפשרויות צמחוניות או טבעוניות?','כן, יש לנו מגוון מנות צמחוניות וטבעוניות בתפריט. נשמח להתאים גם לאלרגיות.'),
    (v_rid,'general','יש חניה?','יש חניון ציבורי בתשלום במרחק דקת הליכה מהמסעדה.');

  -- ── availability for today: DETERMINISTIC props so every reset reproduces the flow ──
  insert into availability (restaurant_id, date, time_slot, capacity, booked)
  select v_rid, (now() at time zone 'Asia/Jerusalem')::date, slot, 40,
         case slot
           when time '20:00' then 4    -- 36 free: explicit change-to-eight demo
           when time '21:00' then 40   -- FULL: negotiation prop (ask to move here → 21:30 offered)
           when time '21:30' then 28   -- 12 free: the slot she offers as the alternative
           else 10
         end
  from (values (time '18:00'),(time '18:30'),(time '19:00'),(time '19:30'),(time '20:00'),
               (time '20:30'),(time '21:00'),(time '21:30'),(time '22:00'),(time '22:30')) as s(slot);
end;
$$;

-- Only service_role (server-side: Vercel /api/run, demo_reset.py) may reset.
-- Block anon/public REST callers so a random browser hitting the URL can't wipe the slate.
revoke all on function public.demo_reset() from public;
revoke all on function public.demo_reset() from anon;
grant execute on function public.demo_reset() to service_role;
```

- [ ] **Step 2: Apply the migration to the cloud DB**

Run: `agent/.venv/bin/python supabase/apply_sql.py migrations/0005_demo_reset.sql`
Expected: `applied migrations/0005_demo_reset.sql OK`

- [ ] **Step 3: Smoke-test the RPC over REST (service key)**

Run:
```bash
agent/.venv/bin/python -c "import os,httpx;from dotenv import load_dotenv;load_dotenv('.env');u=os.environ['SUPABASE_URL'].rstrip('/');k=os.environ['SUPABASE_SERVICE_ROLE_KEY'];h={'apikey':k,'Authorization':'Bearer '+k,'Content-Type':'application/json'};r=httpx.post(u+'/rest/v1/rpc/demo_reset',headers=h,json={});print('demo_reset status',r.status_code, r.text[:200])"
```
Expected: `demo_reset status 204` (or 200) with empty/no error body.

- [ ] **Step 4: Verify anon CANNOT call it (the guard)**

Run:
```bash
agent/.venv/bin/python -c "import os,httpx;from dotenv import load_dotenv;load_dotenv('.env');u=os.environ['SUPABASE_URL'].rstrip('/');k=os.environ['SUPABASE_ANON_KEY'];h={'apikey':k,'Authorization':'Bearer '+k,'Content-Type':'application/json'};r=httpx.post(u+'/rest/v1/rpc/demo_reset',headers=h,json={});print('anon status',r.status_code)"
```
Expected: `anon status 404` (PostgREST hides functions the role can't execute) or `401/403`. NOT 204.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_demo_reset.sql
git commit -m "feat(db): demo_reset() RPC — authoritative one-Tomer-pending demo slate"
```

---

### Task 2: Unify reset paths on the RPC

**Files:**
- Rewrite: `supabase/demo_reset.py`
- Rewrite: `supabase/seed.sql`

- [ ] **Step 1: Rewrite `supabase/demo_reset.py`**

Replace the entire file with:

```python
"""One-command demo slate — run right before a demo/test session.

Calls the authoritative public.demo_reset() RPC (single source of truth, defined in
supabase/migrations/0005_demo_reset.sql), then verifies the slate. Pure REST with the
service key — no SUPABASE_DB_URL needed.

    agent/.venv/bin/python supabase/demo_reset.py
"""
import os
import sys
from datetime import date
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
RID = os.environ.get("RESTAURANT_ID", "11111111-1111-1111-1111-111111111111")
TARGET = "+972585121998"   # the only number the demo dials


def main():
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    # ── reset ──
    r = httpx.post(f"{url}/rest/v1/rpc/demo_reset", headers=h, json={}, timeout=30)
    r.raise_for_status()
    print("demo_reset() applied.")

    # ── verify ──
    pend = httpx.post(f"{url}/rest/v1/rpc/todays_pending_reservations", headers=h,
                      json={"p_restaurant_id": RID}, timeout=20).json()
    avail = httpx.get(f"{url}/rest/v1/availability",
                      params={"select": "time_slot,available",
                              "date": f"eq.{date.today().isoformat()}",
                              "order": "time_slot"}, headers=h, timeout=20).json()
    av = {a["time_slot"][:5]: a["available"] for a in avail}

    print("\n── demo slate ──────────────────────────────────────")
    ok = True
    only_tomer = len(pend) == 1 and pend[0].get("phone") == TARGET
    ok &= only_tomer
    print(f"  pending rows: {len(pend)}  → "
          f"{'OK (only Tomer)' if only_tomer else '!! expected exactly 1 at ' + TARGET}")
    checks = [("20:00", av.get("20:00", 0) >= 8, "room for change-to-eight"),
              ("21:00", av.get("21:00", 1) == 0, "FULL (negotiation prop)"),
              ("21:30", av.get("21:30", 0) > 0, "room for the offer")]
    for slot, good, why in checks:
        ok &= good
        print(f"  {slot} avail={av.get(slot, '?'):<3} {'OK' if good else '!!'}  — {why}")
    print("────────────────────────────────────────────────────")
    print("READY ✅" if ok else "SLATE HAS ISSUES — check above ⚠️")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Rewrite `supabase/seed.sql`**

Replace the entire file with:

```sql
-- The demo slate now lives in ONE source of truth: public.demo_reset()
-- (supabase/migrations/0005_demo_reset.sql). This file just invokes it, so every reset path
-- — `supabase db reset`, reseed.py full mode, demo_reset.py, the stage button — produces the
-- identical deterministic slate: only Tomer (+972585121998) pending; negotiation props baked.
-- Requires migration 0005 to be applied first.
select public.demo_reset();
```

- [ ] **Step 3: Run the one-command slate + verify**

Run: `agent/.venv/bin/python supabase/demo_reset.py`
Expected: ends with `READY ✅`, showing `pending rows: 1 → OK (only Tomer)`, `21:00 avail=0`, `20:00 avail>=8`, `21:30 avail>0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/demo_reset.py supabase/seed.sql
git commit -m "refactor(db): demo_reset.py + seed.sql call demo_reset() RPC (single source of truth)"
```

---

### Task 3: Testable run helper (TDD)

**Files:**
- Create: `stage/lib/run.ts`
- Test: `stage/lib/run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `stage/lib/run.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd stage && npx vitest run lib/run.test.ts`
Expected: FAIL — `Failed to resolve import "./run"` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `stage/lib/run.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd stage && npx vitest run lib/run.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add stage/lib/run.ts stage/lib/run.test.ts
git commit -m "feat(stage): triggerRun helper — reset-then-fire with reset-failure guard"
```

---

### Task 4: `/api/run` route + remove the old direct-call route

**Files:**
- Create: `stage/app/api/run/route.ts`
- Modify: `stage/lib/env.ts` (add `N8N_WEBHOOK_URL`)
- Delete: `stage/app/api/call/route.ts`

- [ ] **Step 1: Add `N8N_WEBHOOK_URL` to env**

In `stage/lib/env.ts`, add one line to the `ENV` object (after `STAGE_CALL_TARGET`):

```typescript
  STAGE_CALL_TARGET: process.env.STAGE_CALL_TARGET ?? "",
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL ?? "",
};
```

- [ ] **Step 2: Create the route**

Create `stage/app/api/run/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { ENV } from "@/lib/env";
import { triggerRun } from "@/lib/run";

// Reset-on-START, then fire the n8n batch. The board lights from Supabase Realtime.
export async function POST() {
  const result = await triggerRun({
    supabaseUrl: ENV.SUPABASE_URL,
    serviceKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    webhookUrl: ENV.N8N_WEBHOOK_URL,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Delete the old direct-to-ElevenLabs route**

Run: `git rm stage/app/api/call/route.ts`
(The dynamic `stage/app/api/call/[id]/route.ts` status-poll route stays — it's unused in the n8n flow but harmless and degrades when `ELEVENLABS_API_KEY` is absent.)

- [ ] **Step 4: Verify the build compiles**

Run: `cd stage && npx tsc --noEmit`
Expected: no errors. (If `tsc` is not configured standalone, run `npm run build` and expect a successful compile through the type-check phase.)

- [ ] **Step 5: Commit**

```bash
git add stage/app/api/run/route.ts stage/lib/env.ts
git rm stage/app/api/call/route.ts
git commit -m "feat(stage): /api/run (reset+fire n8n); drop direct-to-ElevenLabs route"
```

---

### Task 5: Wire the button to `/api/run`

**Files:**
- Modify: `stage/app/page.tsx`

- [ ] **Step 1: Add a dial-safety-timer ref**

In `stage/app/page.tsx`, add a ref alongside the existing refs (near line 24-27, after `const transferredSeen = useRef(false);`):

```typescript
  const dialTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: Promote dialing→live on the first tool event**

In the realtime `onToolEvent` handler, change the auto-wake condition so a tool event also promotes a `dialing` orb to `live` and clears the safety timer. Replace this block (around lines 112-121):

```typescript
          if (!convIdRef.current) {
            if (engine.state() === "idle") applyCall("live");
            if (autoLiveDecay.current) clearTimeout(autoLiveDecay.current);
            autoLiveDecay.current = setTimeout(() => {
              if (!convIdRef.current && engine.state() === "live") {
                applyCall("idle");
                setCaption("");
              }
            }, 25000);
          }
```

with:

```typescript
          if (!convIdRef.current) {
            if (dialTimeout.current) {
              clearTimeout(dialTimeout.current);
              dialTimeout.current = null;
            }
            if (engine.state() === "idle" || engine.state() === "dialing") applyCall("live");
            if (autoLiveDecay.current) clearTimeout(autoLiveDecay.current);
            autoLiveDecay.current = setTimeout(() => {
              if (!convIdRef.current && engine.state() === "live") {
                applyCall("idle");
                setCaption("");
              }
            }, 25000);
          }
```

- [ ] **Step 3: Replace `handleCall` to hit `/api/run`**

Replace the entire `handleCall` callback (lines ~223-248) with:

```typescript
  // ── click-to-run: reset to clean slate, then fire the n8n batch (calls only Tomer) ──
  const handleCall = useCallback(async () => {
    setCaption("מאפסת את הלוח ומחייגת…");
    applyCall("dialing");
    // Safety: if no tool event arrives (e.g. no answer) within 35s, settle back to idle.
    if (dialTimeout.current) clearTimeout(dialTimeout.current);
    dialTimeout.current = setTimeout(() => {
      if (engine.state() === "dialing") {
        applyCall("idle");
        setCaption("");
      }
    }, 35000);
    try {
      const r = await fetch("/api/run", { method: "POST" });
      if (!r.ok) {
        if (dialTimeout.current) clearTimeout(dialTimeout.current);
        applyCall("idle");
        setCaption("ההפעלה נכשלה");
      }
      // success: n8n places the call; the board lights from Supabase Realtime.
    } catch {
      if (dialTimeout.current) clearTimeout(dialTimeout.current);
      applyCall("idle");
      setCaption("ההפעלה נכשלה");
    }
  }, [applyCall, engine]);
```

- [ ] **Step 4: Make the button always clickable when idle**

The CTA self-disables whenever `state !== "idle"` (see `CallButton`), so the pending-row precondition is obsolete (reset-on-click creates the pending). Change the `CallButton` usage (around line 270-274) from:

```typescript
          <CallButton
            state={callState}
            disabled={!rows.some((r) => r.status === "pending")}
            onCall={handleCall}
          />
```

to:

```typescript
          <CallButton state={callState} disabled={false} onCall={handleCall} />
```

- [ ] **Step 5: Clean up the dial timer on unmount**

In the resolved→idle settle effect (around lines 168-178), also clear the dial timer. Replace:

```typescript
  // resolved → settle back to idle
  useEffect(() => {
    if (callState !== "resolved") return;
    const t = setTimeout(() => {
      applyCall("idle");
      setCaption("");
      convIdRef.current = null;
      transferredSeen.current = false;
      if (!sim) fetchRows();
    }, 2600);
    return () => clearTimeout(t);
  }, [callState, sim, fetchRows, applyCall]);
```

with:

```typescript
  // resolved → settle back to idle
  useEffect(() => {
    if (callState !== "resolved") return;
    if (dialTimeout.current) {
      clearTimeout(dialTimeout.current);
      dialTimeout.current = null;
    }
    const t = setTimeout(() => {
      applyCall("idle");
      setCaption("");
      convIdRef.current = null;
      transferredSeen.current = false;
      if (!sim) fetchRows();
    }, 2600);
    return () => clearTimeout(t);
  }, [callState, sim, fetchRows, applyCall]);
```

- [ ] **Step 6: Verify the build compiles + existing tests pass**

Run: `cd stage && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (`lib/run.test.ts` + existing `lib/callPolicy.test.ts`).

- [ ] **Step 7: Local smoke test (with a stub webhook)**

Set a throwaway webhook so the fire step returns ok without calling anyone:
```bash
cd stage && N8N_WEBHOOK_URL="https://httpbin.org/post" npm run dev
```
Open `http://localhost:3000`, click the button. Expected: caption shows "מאפסת את הלוח ומחייגת…", the strip refreshes to the clean slate (only Tomer pending), no error caption. (No real call — the stub webhook just 200s.) Stop the dev server when done.

- [ ] **Step 8: Commit**

```bash
git add stage/app/page.tsx
git commit -m "feat(stage): button triggers /api/run (reset+n8n); dialing→live + safety timer"
```

---

### Task 6: n8n — add the webhook trigger (guided manual)

n8n `update_workflow` via MCP **wipes all 6 HTTP-node credentials**, so we add the trigger **by hand in the n8n UI** — it touches only the new node and leaves the credentialed nodes intact. Tomer performs these; the agent guides and records the URL.

**Files:** none (n8n cloud UI).

- [ ] **Step 1: Open the workflow**

In a browser: asher13.app.n8n.cloud → open **"Maître — Call Today's Pending Reservations"** (`G7RYSw2BQgqnabJt`).

- [ ] **Step 2: Add a Webhook trigger node**

- Click the **+** canvas button → search **"Webhook"** → add it.
- Set **HTTP Method** = `POST`.
- Set **Path** = `maitre-run`.
- Set **Respond** = `Immediately` (the button is fire-and-forget; the dashboard watches Realtime — don't make it wait for the whole call).

- [ ] **Step 3: Wire it into the pipeline**

Drag a connection from the **Webhook** node's output to the **"Get Pending Reservations"** node's input. (It will share that downstream node with the existing "Run Batch" manual trigger — both triggers are valid entry points.)

- [ ] **Step 4: Save + Activate**

Click **Save**, then toggle the workflow **Active** (top-right). Activation is required for the **Production** webhook URL to accept requests.

- [ ] **Step 5: Capture the production webhook URL**

Open the Webhook node → copy the **Production URL** (looks like `https://asher13.app.n8n.cloud/webhook/maitre-run`). Record it — it becomes `N8N_WEBHOOK_URL` in Task 7. **Treat it as a secret** (anyone with it can fire a call to Tomer).

- [ ] **Step 6: Live end-to-end test of the webhook**

From a terminal (this resets the slate first so exactly one Tomer-pending row exists, then fires the batch — Tomer's phone will ring):
```bash
agent/.venv/bin/python supabase/demo_reset.py    # READY ✅, only Tomer pending
curl -X POST "https://asher13.app.n8n.cloud/webhook/maitre-run"   # use the real URL
```
Expected: the call arrives at **+972585121998** within a few seconds; after the call, the reservation flips in Supabase. Confirm in the n8n **Executions** tab that the run was triggered by the Webhook node and that "Build Call Payloads" logged `callable: 1 | skipped (not in allowlist): N`.

---

### Task 7: Deploy `stage/` to Vercel (guided manual)

Different Vercel account, **no CLI**. Tomer performs the browser steps; the agent provides exact values. **Do not paste secret values into any committed file** — copy them from the local `.env`.

**Files:** none (Vercel dashboard).

- [ ] **Step 1: Push the branch so Vercel can build it**

Ensure all prior commits are pushed to the repo's default branch (ask Tomer before pushing, per handoff policy):
```bash
git status            # confirm Tasks 1-5 committed
git push              # only with Tomer's OK
```

- [ ] **Step 2: Authorize the Vercel GitHub app on the new account**

On the target Vercel account: **Add New… → Project → Import Git Repository**. If `AGENTEAMS/voice-agent` isn't listed (it's private), click **Adjust GitHub App Permissions** / **Configure GitHub App** and grant access to that repo. (Making the repo public is deferred — not required.)

- [ ] **Step 3: Configure the import**

- **Root Directory** = `stage`  ← critical (the app is a subdirectory).
- **Framework Preset** = Next.js (auto-detected).
- Build/Output/Install commands = defaults.

- [ ] **Step 4: Set environment variables** (Production + Preview)

Add these in the Vercel project's **Settings → Environment Variables**. Copy values from the local repo-root `.env`:

| Name | Value source |
|------|--------------|
| `SUPABASE_URL` | from `.env` |
| `SUPABASE_ANON_KEY` | from `.env` (browser Realtime; inlined as `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env` (server-side only) |
| `RESTAURANT_ID` | `11111111-1111-1111-1111-111111111111` |
| `STAGE_CALL_TARGET` | `+972585121998` |
| `N8N_WEBHOOK_URL` | the Production URL from Task 6 Step 5 |
| `ELEVENLABS_API_KEY` | *(optional)* from `.env` — only for the non-demoed transfer poll |

- [ ] **Step 5: Deploy**

Click **Deploy**. Wait for the build to go green.

- [ ] **Step 6: Pick the subdomain**

**Settings → Domains** → use the auto `*.vercel.app` domain, or **Edit** to choose a name (e.g. `maitre-kisu.vercel.app` or `kisu-stage.vercel.app`). Record the final URL.

- [ ] **Step 7: Verify the deployed page loads with live data**

Open the Vercel URL. Expected: the «מיקה — במה» dashboard renders, the reservations strip shows tonight's board (read from Supabase), the clock ticks. If the strip is empty, re-check `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars and redeploy.

---

### Task 8: End-to-end demo-loop verification

**Files:** none.

- [ ] **Step 1: Prime a clean slate**

Run: `agent/.venv/bin/python supabase/demo_reset.py`
Expected: `READY ✅` (only Tomer pending).

- [ ] **Step 2: Run the full loop from the deployed URL**

On the Vercel URL, click **📞 התקשרי לאורח**. Expected, in order:
1. Caption: "מאפסת את הלוח ומחייגת…"; strip refreshes to the clean slate.
2. **+972585121998 rings**; answer it.
3. As מיקה uses tools, the constellation lights (green pulse on DB writes) via Realtime.
4. After hang-up, Tomer's row flips (confirmed/cancelled) and stays on screen; orb settles to idle.

- [ ] **Step 3: Re-run to prove the reset-on-start loop**

Click the button again. Expected: the board resets (Tomer pending again), the call fires again — proving repeatable live runs.

- [ ] **Step 4: Confirm only one number was ever dialed**

In n8n **Executions**, open the two runs → "Build Call Payloads" logs show `callable: 1` each time and **no** number other than `+972585121998`.

- [ ] **Step 5: Update project docs**

Append a short note to `CLAUDE.md` (Live demo dashboard section) that the stage button now hits `/api/run` (reset-on-start → n8n webhook) and the deployed URL. Commit:
```bash
git add CLAUDE.md
git commit -m "docs: stage button runs via n8n webhook; Vercel deploy URL"
```
(Ask Tomer before pushing.)

---

## Self-review

**Spec coverage:**
- Component 1 (`demo_reset()` RPC) → Task 1. ✓ Reset-on-start, one Tomer pending, props baked, no DB-URL secret.
- Component 2 (n8n webhook + allowlist) → Task 6. ✓ Allowlist already `+972585121998`-only (verified in workflow JSON), so only the webhook trigger is added — by hand, to avoid the cred wipe.
- Component 3 (Vercel-ready stage) → Tasks 3-5, 7. ✓ `/api/run` reset+fire; env via Vercel; EL secrets optional.
- Env inventory → Task 7 Step 4 table. ✓
- Manual steps → Tasks 6 & 7. ✓ (GitHub-public deferred; private import via GitHub app.)
- Error handling (reset fails → don't fire) → Task 3 test + `triggerRun`. ✓
- Testing → Task 3 (unit), Tasks 6/8 (integration). ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; all commands have expected output.

**Type consistency:** `triggerRun(RunDeps): RunResult` defined in Task 3 and consumed in Task 4 with matching fields (`supabaseUrl`, `serviceKey`, `webhookUrl`). `ENV.N8N_WEBHOOK_URL` added in Task 4 Step 1 and read in Task 4 Step 2. `dialTimeout` ref defined in Task 5 Step 1 before use in Steps 2/3/5. RPC name `demo_reset` consistent across SQL, Python, and `run.ts`.

**Known accepted risks (demo-grade):**
- `/api/run` has no auth guard; mitigated by webhook-URL obscurity + the n8n `+972585121998`-only allowlist. Blast radius = reset demo DB + one call to Tomer. A shared-secret guard is a possible follow-up.
- `stage/lib/callPolicy.ts` + its test become informational (n8n now enforces the allowlist); kept as documentation, not deleted.
