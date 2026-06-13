"""Dial a reservation-confirmation call, wait for it to end, print transcript + tool calls + DB result.

The iteration loop for tuning מיקה: one command = call → transcript → what the tools did → what
actually changed in Supabase.

    python call_and_verify.py --reservation <uuid> --to +9725XXXXXXXX
"""
import argparse
import sys
import time

import httpx

from outbound_elevenlabs import ELEVEN_API_KEY, SUPABASE_URL, _SB, place_call

POLL_SECS = 4
MAX_WAIT_SECS = 360


def wait_for_conversation(conv_id: str) -> dict:
    h = {"xi-api-key": ELEVEN_API_KEY}
    last = None
    deadline = time.monotonic() + MAX_WAIT_SECS
    with httpx.Client(timeout=20) as c:
        while time.monotonic() < deadline:
            r = c.get(f"https://api.elevenlabs.io/v1/convai/conversations/{conv_id}", headers=h)
            if r.status_code == 404:           # not registered yet right after dialing
                time.sleep(POLL_SECS)
                continue
            r.raise_for_status()
            data = r.json()
            status = data.get("status")
            if status != last:
                print(f"  [{time.strftime('%H:%M:%S')}] status: {status}")
                last = status
            if status in ("done", "failed"):
                return data
            time.sleep(POLL_SECS)
    sys.exit(f"Timed out after {MAX_WAIT_SECS}s waiting for conversation to finish.")


def print_transcript(conv: dict):
    print("\n═══ TRANSCRIPT ═══")
    for turn in conv.get("transcript") or []:
        role = "מיקה " if turn.get("role") == "agent" else "אורח"
        msg = (turn.get("message") or "").strip()
        if msg:
            print(f"  {role}: {msg}")
        for tc in turn.get("tool_calls") or []:
            print(f"    ⚙ CALL {tc.get('tool_name')}  {tc.get('params_as_json')}")
        for tr in turn.get("tool_results") or []:
            res = str(tr.get("result_value"))[:220]
            flag = "ERROR" if tr.get("is_error") else "ok"
            print(f"    ⚙ RESULT {tr.get('tool_name')} [{flag}] {res}")
    a = conv.get("analysis") or {}
    meta = conv.get("metadata") or {}
    print(f"\n  duration: {meta.get('call_duration_secs')}s · call_successful: {a.get('call_successful')}")
    if a.get("transcript_summary"):
        print(f"  summary: {a['transcript_summary'][:400]}")


def print_llm_cost(conv: dict):
    """Per-call LLM token usage + dollar cost from ElevenLabs charging data.
    The model swap moves ONLY this number; EL credits (TTS/ASR/per-minute) are model-independent."""
    ch = (conv.get("metadata") or {}).get("charging") or {}
    llm = ch.get("llm_usage") or {}
    total = 0.0
    toks_in = toks_out = 0
    model_name = "?"
    for phase in llm.values():
        for model, kinds in (phase.get("model_usage") or {}).items():
            model_name = model
            for kind, v in kinds.items():
                if isinstance(v, dict):
                    total += v.get("price", 0) or 0
                    if "output" in kind:
                        toks_out += v.get("tokens", 0) or 0
                    else:
                        toks_in += v.get("tokens", 0) or 0
    print("\n═══ LLM COST (this call) ═══")
    print(f"  model: {model_name} · in≈{toks_in} tok · out≈{toks_out} tok · LLM cost ≈ ${total:.4f}")
    print(f"  EL credits (platform TTS/ASR/min — model-independent): "
          f"{(conv.get('metadata') or {}).get('cost')}")


def print_db_state(reservation_id: str):
    print("\n═══ SUPABASE ═══")
    with httpx.Client(timeout=15) as c:
        r = c.get(f"{SUPABASE_URL}/rest/v1/reservations"
                  f"?id=eq.{reservation_id}&select=status,reserved_for,party_size,updated_at", headers=_SB)
        print(f"  reservation: {r.json() if r.status_code < 300 else r.text}")
        r = c.get(f"{SUPABASE_URL}/rest/v1/call_attempts"
                  f"?reservation_id=eq.{reservation_id}&select=direction,outcome,intent,started_at"
                  f"&order=started_at.desc&limit=3", headers=_SB)
        print(f"  call_attempts: {r.json() if r.status_code < 300 else r.text}")
        r = c.get(f"{SUPABASE_URL}/rest/v1/scheduled_calls"
                  f"?reservation_id=eq.{reservation_id}&order=scheduled_for.desc&limit=3", headers=_SB)
        print(f"  scheduled_calls: {r.json() if r.status_code < 300 else r.text}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reservation", required=True)
    ap.add_argument("--to", required=True, help="your own / consenting number, E.164")
    args = ap.parse_args()

    body = place_call(args.reservation, args.to)
    conv_id = body.get("conversation_id")
    if not conv_id:
        sys.exit(f"No conversation_id in response: {body}")
    print(f"  answer your phone… (polling every {POLL_SECS}s)")
    conv = wait_for_conversation(conv_id)
    print_transcript(conv)
    print_llm_cost(conv)
    print_db_state(args.reservation)


if __name__ == "__main__":
    main()
