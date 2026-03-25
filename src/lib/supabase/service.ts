import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  isSupabaseServiceConfigured,
} from "./env";

export function getServiceSupabaseClient() {
  if (!isSupabaseServiceConfigured()) {
    throw new Error("Supabase service role is not configured.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
