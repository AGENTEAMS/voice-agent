// Hard server-side allowlist — the stage can only ever dial the two project test
// numbers, same discipline as the n8n batch (seed data contains fake numbers that
// must never be dialed).
export const ALLOWLIST = ["+972525898552", "+972585121998"] as const;

export function resolveTarget(
  reservationPhone: string,
  overrideTarget: string
): { ok: true; to: string } | { ok: false; reason: string } {
  const to = overrideTarget || reservationPhone;
  if ((ALLOWLIST as readonly string[]).includes(to)) return { ok: true, to };
  return { ok: false, reason: `target ${to} not in allowlist` };
}
