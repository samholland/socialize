"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  const router = useRouter();
  const cloudEnabled = isSupabaseConfigured();
  const supabase = useMemo(
    () => (cloudEnabled ? getBrowserSupabaseClient() : null),
    [cloudEnabled]
  );
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    if (!cloudEnabled) {
      router.replace("/app");
      return;
    }
    if (!supabase) return;

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthUser(nextSession?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [cloudEnabled, supabase, router]);

  useEffect(() => {
    if (!cloudEnabled) return;
    if (!authReady) return;
    if (!session?.user) return;
    router.replace("/app");
  }, [cloudEnabled, authReady, session, router]);

  if (!cloudEnabled || !supabase) {
    return <AuthGate state="missing_config" />;
  }

  if (!authReady) {
    return <AuthGate state="loading" />;
  }

  if (authUser) {
    return <AuthGate state="loading" />;
  }

  return <AuthGate supabase={supabase} state="auth" />;
}
