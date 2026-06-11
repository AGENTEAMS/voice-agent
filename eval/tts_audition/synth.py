#!/usr/bin/env python3
"""
Phase-0 TTS audition — synthesize Hebrew test utterances through each candidate engine,
downsample every clip to the SAME telephony band (8 kHz mono mu-law), and emit a BLIND
MOS scoring sheet for native-speaker raters.

Why: the make-or-break constraint is natural Israeli Hebrew over the phone. Vendor "supports
Hebrew" claims are unreliable (research refuted Deepgram, flagged Chirp). We trust ears, not
marketing — so we listen blind, over the actual phone band, and pick on measured MOS >= 3.5.

Engines (each skipped unless its key is set):
  elevenlabs   — outbound voice (you have the Creator sub). ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID
  azure_hila   — inbound candidate, he-IL-HilaNeural.  AZURE_SPEECH_KEY + AZURE_SPEECH_REGION
  azure_avri   — inbound candidate, he-IL-AvriNeural.   (same Azure keys)
  gemini       — inbound candidate, gemini TTS.          GEMINI_API_KEY (+ `pip install google-genai`)

Usage:
  python synth.py                 # all engines with keys present
  python synth.py --only elevenlabs
  python synth.py --limit 3       # first 3 utterances (cheap smoke test)

Outputs (under ./out/):
  clips/<blind>.wav     phone-band clips, provider hidden in the filename
  clips_clean/...       full-quality reference clips (not blind)
  key.csv               blind_id -> provider, utterance_id  (DO NOT show raters)
  mos_sheet.csv         blind_id, expected_text_he, [mos_1_to_5], [homograph_ok], [notes]
"""
import argparse, base64, csv, json, os, random, subprocess, sys, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent          # .../projects/final/eval/tts_audition
PROJECT_ROOT = HERE.parents[1]                   # .../projects/final
REPO_ROOT = HERE.parents[3]                      # .../genai-course
OUT = HERE / "out"


def load_env() -> dict:
    """Minimal .env loader: project .env first, then repo-root .env, then os.environ."""
    env = {}
    for p in (PROJECT_ROOT / ".env", REPO_ROOT / ".env"):  # projects/final/.env, then repo root .env
        if p.exists():
            for line in p.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.split("#")[0].strip())
    for k, v in os.environ.items():
        if v:
            env[k] = v
    return env


def http_post(url, data, headers, timeout=60) -> bytes:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ── Engines: each returns (clean_bytes, source_format) where format in {mp3, pcm_s16le_24k} ──
def tts_elevenlabs(text, env):
    vid = env.get("ELEVENLABS_VOICE_ID")
    if not vid:
        raise RuntimeError("ELEVENLABS_VOICE_ID not set")
    model = env.get("ELEVENLABS_MODEL", "eleven_v3")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128"
    body = json.dumps({"text": text, "model_id": model, "language_code": "he"}).encode()
    headers = {"xi-api-key": env["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    return http_post(url, body, headers), "mp3"


def _azure(text, env, voice):
    region = env.get("AZURE_SPEECH_REGION")
    if not region:
        raise RuntimeError("AZURE_SPEECH_REGION not set")
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    ssml = (
        f"<speak version='1.0' xml:lang='he-IL'>"
        f"<voice name='{voice}'>{text}</voice></speak>"
    ).encode("utf-8")
    headers = {
        "Ocp-Apim-Subscription-Key": env["AZURE_SPEECH_KEY"],
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "maitre-tts-audition",
    }
    return http_post(url, ssml, headers), "mp3"


def tts_azure_hila(text, env): return _azure(text, env, "he-IL-HilaNeural")
def tts_azure_avri(text, env): return _azure(text, env, "he-IL-AvriNeural")


def tts_gemini(text, env):
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise RuntimeError("install google-genai to audition Gemini TTS") from e
    client = genai.Client(api_key=env["GEMINI_API_KEY"])
    resp = client.models.generate_content(
        model=env.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts"),
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=env.get("GEMINI_TTS_VOICE", "Kore")))),
        ),
    )
    pcm = resp.candidates[0].content.parts[0].inline_data.data  # 24kHz s16le mono
    return pcm, "pcm_s16le_24k"


ENGINES = {
    "elevenlabs": (tts_elevenlabs, "ELEVENLABS_API_KEY"),
    "azure_hila": (tts_azure_hila, "AZURE_SPEECH_KEY"),
    "azure_avri": (tts_azure_avri, "AZURE_SPEECH_KEY"),
    "gemini":     (tts_gemini,     "GEMINI_API_KEY"),
}


def to_phone_wav(clean_path: Path, fmt: str, out_path: Path):
    """ffmpeg: any input -> 8kHz mono mu-law WAV (telephony band) for fair blind comparison."""
    if fmt == "pcm_s16le_24k":
        pre = ["-f", "s16le", "-ar", "24000", "-ac", "1"]
    else:
        pre = []
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *pre, "-i", str(clean_path),
         "-ar", "8000", "-ac", "1", "-c:a", "pcm_mulaw", str(out_path)],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="subset of engines", choices=list(ENGINES))
    ap.add_argument("--limit", type=int, default=0, help="first N utterances only")
    args = ap.parse_args()

    env = load_env()
    utterances = json.loads((HERE / "utterances_he.json").read_text())
    if args.limit:
        utterances = utterances[: args.limit]

    wanted = args.only or list(ENGINES)
    active = [n for n in wanted if env.get(ENGINES[n][1])]
    skipped = [n for n in wanted if n not in active]
    if not active:
        sys.exit("No engines have keys set. Fill projects/final/.env (at least ELEVENLABS_*).")
    print(f"Engines: active={active}  skipped(no key)={skipped}")

    (OUT / "clips").mkdir(parents=True, exist_ok=True)
    (OUT / "clips_clean").mkdir(parents=True, exist_ok=True)

    pairs, failures = [], []
    for u in utterances:
        for name in active:
            fn = ENGINES[name][0]
            try:
                clean, fmt = fn(u["text"], env)
                ext = "mp3" if fmt == "mp3" else "pcm"
                clean_path = OUT / "clips_clean" / f"{name}__{u['id']}.{ext}"
                clean_path.write_bytes(clean)
                pairs.append((name, u["id"], clean_path, fmt))
                print(f"  ✓ {name:11s} {u['id']}")
            except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, Exception) as e:
                msg = getattr(e, "read", lambda: b"")() or str(e)
                if isinstance(msg, bytes):
                    msg = msg.decode("utf-8", "ignore")[:200]
                failures.append((name, u["id"], str(msg)[:200]))
                print(f"  ✗ {name:11s} {u['id']}  -> {str(msg)[:120]}")

    # Blind assignment (seeded shuffle so provider is hidden but reproducible).
    rng = random.Random(42)
    rng.shuffle(pairs)
    utext = {u["id"]: u["text"] for u in utterances}
    key_rows, mos_rows = [], []
    for i, (name, uid, clean_path, fmt) in enumerate(pairs, 1):
        blind = f"{i:03d}"
        phone = OUT / "clips" / f"{blind}.wav"
        try:
            to_phone_wav(clean_path, fmt, phone)
        except subprocess.CalledProcessError as e:
            failures.append((name, uid, f"ffmpeg failed: {e}"))
            continue
        key_rows.append({"blind_id": blind, "provider": name, "utterance_id": uid})
        mos_rows.append({"blind_id": blind, "expected_text_he": utext[uid],
                         "mos_1_to_5": "", "homograph_ok": "", "notes": ""})

    with (OUT / "key.csv").open("w", newline="") as f:
        csv.DictWriter(f, ["blind_id", "provider", "utterance_id"]).writeheader()
        csv.DictWriter(f, ["blind_id", "provider", "utterance_id"]).writerows(key_rows)
    with (OUT / "mos_sheet.csv").open("w", newline="") as f:
        cols = ["blind_id", "expected_text_he", "mos_1_to_5", "homograph_ok", "notes"]
        w = csv.DictWriter(f, cols); w.writeheader(); w.writerows(mos_rows)

    print(f"\nDone. {len(key_rows)} phone-band clips in {OUT/'clips'}")
    print(f"  Blind sheet : {OUT/'mos_sheet.csv'}  (give THIS to raters)")
    print(f"  Answer key  : {OUT/'key.csv'}        (keep hidden until scoring)")
    if failures:
        print(f"\n{len(failures)} synth failures (often = engine lacks real Hebrew — that's a result):")
        for name, uid, msg in failures:
            print(f"  - {name} / {uid}: {msg}")
    print("\nNext: rate clips blind (mos_1_to_5), then `python score.py` to reveal provider means.")


if __name__ == "__main__":
    main()
