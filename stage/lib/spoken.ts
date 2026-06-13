// Port of agent/outbound_elevenlabs.py:46-76 — keep in lockstep with the Python.
const HOURS_HE: Record<number, string> = {
  0: "שתים עשרה", 1: "אחת", 2: "שתיים", 3: "שלוש", 4: "ארבע", 5: "חמש",
  6: "שש", 7: "שבע", 8: "שמונה", 9: "תשע", 10: "עשר", 11: "אחת עשרה",
};
const PARTY_HE: Record<number, string> = {
  1: "סועד אחד", 2: "שני סועדים", 3: "שלושה סועדים", 4: "ארבעה סועדים",
  5: "חמישה סועדים", 6: "שישה סועדים", 7: "שבעה סועדים", 8: "שמונה סועדים",
  9: "תשעה סועדים", 10: "עשרה סועדים",
};

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
