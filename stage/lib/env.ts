import { readFileSync } from "node:fs";
import { join } from "node:path";

// Server-side env access. Repo-root .env is the single source; .provisioned.json
// beats .env for ElevenLabs resource ids (stale-env rule — see docs/knowledge).
const ROOT = join(process.cwd(), "..");

try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {}

let prov: Record<string, string> = {};
try {
  prov = JSON.parse(readFileSync(join(ROOT, "agent", ".provisioned.json"), "utf8"));
} catch {}

export const ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? "",
  AGENT_ID: prov.agent_id || process.env.ELEVENLABS_AGENT_ID || "",
  PHONE_NUMBER_ID: prov.phone_number_id || process.env.ELEVENLABS_PHONE_NUMBER_ID || "",
  RESTAURANT_ID: process.env.RESTAURANT_ID ?? "11111111-1111-1111-1111-111111111111",
  STAGE_CALL_TARGET: process.env.STAGE_CALL_TARGET ?? "",
  STAGE_CALL_NAME: process.env.STAGE_CALL_NAME ?? "",
};
