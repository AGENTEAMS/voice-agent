#!/usr/bin/env python3
"""
Reveal blind TTS audition results. Run AFTER native speakers fill `out/mos_sheet.csv`.

Joins the filled MOS sheet to the hidden answer key and prints per-provider mean MOS +
homograph-OK rate. The Phase-0 gate: pick a provider with mean MOS >= 3.5 and no catastrophic
homograph/stress failures. The outbound leg can also just use ElevenLabs v3 pre-gen regardless.
"""
import csv, statistics
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"


def main():
    key = {r["blind_id"]: r for r in csv.DictReader((OUT / "key.csv").open())}
    rated = list(csv.DictReader((OUT / "mos_sheet.csv").open()))

    mos = defaultdict(list)
    homo_ok = defaultdict(list)
    n_rated = 0
    for r in rated:
        blind = r["blind_id"]
        if blind not in key:
            continue
        provider = key[blind]["provider"]
        val = (r.get("mos_1_to_5") or "").strip()
        if not val:
            continue
        try:
            mos[provider].append(float(val))
            n_rated += 1
        except ValueError:
            continue
        ho = (r.get("homograph_ok") or "").strip().lower()
        if ho in ("y", "yes", "1", "true", "n", "no", "0", "false"):
            homo_ok[provider].append(ho in ("y", "yes", "1", "true"))

    if not n_rated:
        print("No MOS ratings found yet. Fill the `mos_1_to_5` column in out/mos_sheet.csv first.")
        return

    print(f"{'provider':14s} {'n':>3s} {'mean MOS':>9s} {'min':>4s} {'homograph_ok':>13s}  gate")
    print("-" * 56)
    rows = []
    for provider, vals in mos.items():
        mean = statistics.mean(vals)
        ho = homo_ok.get(provider, [])
        ho_rate = (sum(ho) / len(ho)) if ho else None
        rows.append((mean, provider, vals, ho_rate))
    for mean, provider, vals, ho_rate in sorted(rows, reverse=True):
        gate = "PASS" if mean >= 3.5 else "fail"
        ho_str = f"{ho_rate*100:.0f}%" if ho_rate is not None else "—"
        print(f"{provider:14s} {len(vals):>3d} {mean:>9.2f} {min(vals):>4.0f} {ho_str:>13s}  {gate}")
    print("\nGate: choose a provider with mean MOS >= 3.5 AND no catastrophic homograph failures.")
    print("(Outbound can use pre-generated ElevenLabs v3 regardless; this mainly picks the INBOUND voice.)")


if __name__ == "__main__":
    main()
