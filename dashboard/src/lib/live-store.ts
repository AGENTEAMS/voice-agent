import "server-only";
import { EventEmitter } from "node:events";
import { computeKpis } from "./kpis";
import { getAdminClient, RESTAURANT_ID } from "./supabase-admin";
import type { CallAttempt, Reservation, Snapshot, TranscriptTurn } from "./types";

// Server-side live data store.
// One process-wide singleton holds the latest Snapshot, kept fresh by BOTH a Supabase
// Realtime subscription (instant) and a polling fallback (self-healing). On any change it
// bumps `version` and emits "change"; the SSE route relays snapshots to browsers.

const POLL_MS = 2500;
const DEBOUNCE_MS = 150;
const RESTAURANT_TZ = "Asia/Jerusalem";

// UTC instants bounding the restaurant's current local day, so the board + KPIs scope
// to "today" correctly regardless of the host server's timezone.
function localDayBoundsUtc(now: Date): { startIso: string; endIso: string } {
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: RESTAURANT_TZ }).format(now); // YYYY-MM-DD
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESTAURANT_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = Number(p.value);
      return acc;
    }, {});
  // How far the zone is ahead of UTC at this instant (ms).
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  const [y, m, d] = dateStr.split("-").map(Number);
  const startUtc = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs;
  return {
    startIso: new Date(startUtc).toISOString(),
    endIso: new Date(startUtc + 24 * 60 * 60 * 1000).toISOString(),
  };
}

interface Store {
  emitter: EventEmitter;
  snapshot: Snapshot;
  fingerprint: string;
  started: boolean;
  restaurantName: string;
}

// Survive Next dev HMR by stashing on globalThis.
const globalRef = globalThis as unknown as { __maitreStore?: Store };

function emptySnapshot(): Snapshot {
  return {
    version: 0,
    restaurantName: "מסעדת לבונטין",
    reservations: [],
    calls: [],
    kpis: computeKpis([], []),
    builtAt: new Date().toISOString(),
  };
}

function getStore(): Store {
  if (!globalRef.__maitreStore) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalRef.__maitreStore = {
      emitter,
      snapshot: emptySnapshot(),
      fingerprint: "",
      started: false,
      restaurantName: "מסעדת לבונטין",
    };
  }
  return globalRef.__maitreStore;
}

type ReservationRow = {
  id: string;
  reserved_for: string;
  party_size: number;
  status: Reservation["status"];
  source: string | null;
  customer: { id: string; name: string; phone: string; notes: string | null } | null;
};

type CallRow = {
  id: string;
  reservation_id: string | null;
  customer_id: string | null;
  direction: CallAttempt["direction"];
  outcome: CallAttempt["outcome"];
  intent: string | null;
  confidence: number | null;
  transcript: TranscriptTurn[] | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  provider: string | null;
  customer: { name: string } | null;
};

async function fetchSnapshot(): Promise<Omit<Snapshot, "version">> {
  const db = getAdminClient();
  const store = getStore();
  const { startIso, endIso } = localDayBoundsUtc(new Date());

  const [resQ, callQ, restQ] = await Promise.all([
    db
      .from("reservations")
      .select(
        "id, reserved_for, party_size, status, source, customer:customers(id,name,phone,notes)",
      )
      .eq("restaurant_id", RESTAURANT_ID)
      .gte("reserved_for", startIso)
      .lt("reserved_for", endIso)
      .order("reserved_for", { ascending: true }),
    db
      .from("call_attempts")
      .select(
        "id, reservation_id, customer_id, direction, outcome, intent, confidence, transcript, started_at, ended_at, duration_seconds, cost_usd, provider, customer:customers(name)",
      )
      .order("started_at", { ascending: false })
      .limit(200),
    store.restaurantName === "מסעדת לבונטין"
      ? db.from("restaurants").select("name").eq("id", RESTAURANT_ID).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (resQ.error) throw resQ.error;
  if (callQ.error) throw callQ.error;
  if (restQ && "data" in restQ && restQ.data?.name) {
    store.restaurantName = restQ.data.name;
  }

  const reservations: Reservation[] = ((resQ.data as unknown as ReservationRow[] | null) ?? []).map((r) => ({
    id: r.id,
    reserved_for: r.reserved_for,
    party_size: r.party_size,
    status: r.status,
    source: r.source,
    customer: r.customer
      ? { id: r.customer.id, name: r.customer.name, phone: r.customer.phone, notes: r.customer.notes }
      : null,
  }));

  const calls: CallAttempt[] = ((callQ.data as unknown as CallRow[] | null) ?? []).map((c) => ({
    id: c.id,
    reservation_id: c.reservation_id,
    customer_id: c.customer_id,
    direction: c.direction,
    outcome: c.outcome,
    intent: c.intent,
    confidence: c.confidence == null ? null : Number(c.confidence),
    transcript: Array.isArray(c.transcript) ? c.transcript : [],
    started_at: c.started_at,
    ended_at: c.ended_at,
    duration_seconds: c.duration_seconds,
    cost_usd: c.cost_usd == null ? null : Number(c.cost_usd),
    provider: c.provider,
    customer_name: c.customer?.name ?? null,
  }));

  return {
    restaurantName: store.restaurantName,
    reservations,
    calls,
    kpis: computeKpis(calls, reservations),
    builtAt: new Date().toISOString(),
  };
}

function fingerprintOf(s: Omit<Snapshot, "version">): string {
  const res = s.reservations
    .map((r) => `${r.id}:${r.status}:${r.reserved_for}:${r.party_size}`)
    .join(",");
  const calls = s.calls
    .map((c) => `${c.id}:${c.outcome ?? "-"}:${c.ended_at ?? "-"}:${c.transcript.length}`)
    .join(",");
  return `${res}|${calls}`;
}

let refreshing = false;
let pending = false;

async function refresh(): Promise<void> {
  if (refreshing) {
    pending = true;
    return;
  }
  refreshing = true;
  const store = getStore();
  try {
    const next = await fetchSnapshot();
    const fp = fingerprintOf(next);
    if (fp !== store.fingerprint) {
      store.fingerprint = fp;
      store.snapshot = { ...next, version: store.snapshot.version + 1 };
      store.emitter.emit("change", store.snapshot);
    }
  } catch (err) {
    console.error("[live-store] refresh failed:", (err as Error).message);
  } finally {
    refreshing = false;
    if (pending) {
      pending = false;
      void refresh();
    }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void refresh();
  }, DEBOUNCE_MS);
}

/** Start polling + Realtime once. Safe to call repeatedly. Returns the store. */
export async function ensureStarted(): Promise<Store> {
  const store = getStore();
  if (store.started) return store;
  store.started = true;

  await refresh(); // initial load before first client connects

  // Realtime: instant updates when the websocket is healthy.
  try {
    const db = getAdminClient();
    db.channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_attempts" }, scheduleRefresh)
      .subscribe();
  } catch (err) {
    console.error("[live-store] realtime subscribe failed:", (err as Error).message);
  }

  // Polling fallback: self-heals if Realtime drops.
  setInterval(() => void refresh(), POLL_MS);

  return store;
}

export function getSnapshot(): Snapshot {
  return getStore().snapshot;
}

export function onChange(listener: (s: Snapshot) => void): () => void {
  const store = getStore();
  store.emitter.on("change", listener);
  return () => store.emitter.off("change", listener);
}

/** Force an immediate refresh (used right after a write so SSE updates without waiting). */
export function nudge(): void {
  scheduleRefresh();
}

/**
 * Await a fresh fetch and return the current snapshot. Driven by the active SSE
 * connection so liveness never depends on a background singleton timer (which Next's
 * dev runtime may suspend). Emits via onChange only when the data actually changed.
 */
export async function refreshNow(): Promise<Snapshot> {
  await refresh();
  return getStore().snapshot;
}
