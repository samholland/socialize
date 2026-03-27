import { isSupabaseConfigured } from "@/lib/supabase/env";
import { LandingSplash } from "@/components/LandingSplash";

export default function RootPage() {
  const cloudEnabled = isSupabaseConfigured();

  return <LandingSplash cloudEnabled={cloudEnabled} />;
}
