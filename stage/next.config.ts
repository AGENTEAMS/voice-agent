import type { NextConfig } from "next";
import { join } from "node:path";

// Bridge the repo-root .env into the stage app. Only the two public Supabase
// values (+ restaurant id) are inlined for the browser; secrets stay server-side.
try {
  process.loadEnvFile(join(process.cwd(), "..", ".env"));
} catch {}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_RESTAURANT_ID:
      process.env.RESTAURANT_ID ?? "11111111-1111-1111-1111-111111111111",
  },
};

export default nextConfig;
