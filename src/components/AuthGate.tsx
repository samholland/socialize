"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthMode = "sign_in" | "sign_up" | "reset";
type GateState = "auth" | "loading" | "missing_config";

type AuthGateProps = {
  supabase?: SupabaseClient | null;
  state?: GateState;
};

export function AuthGate({ supabase, state = "auth" }: AuthGateProps) {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const authEnabled = state === "auth" && Boolean(supabase);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign_in") {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authErr) throw authErr;
      } else if (mode === "sign_up") {
        const { error: authErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (authErr) throw authErr;
        setNotice("Account created. You can now sign in.");
        setMode("sign_in");
      } else {
        const { error: authErr } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (authErr) throw authErr;
        setNotice("Password reset email sent.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  let statusTitle = "";
  let statusBody = "";
  if (state === "loading") {
    statusTitle = "Loading account";
    statusBody = "Checking your saved session and preparing your workspace.";
  } else if (state === "missing_config") {
    statusTitle = "Supabase not configured";
    statusBody =
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign in.";
  } else if (!supabase) {
    statusTitle = "Authentication unavailable";
    statusBody = "Supabase client is not available.";
  }

  return (
    <div className="splash-root">
      <div className="splash-shell">
        <section className="splash-hero">
          <div className="splash-brand">Socialize</div>
          <h1 className="splash-title">Design, preview, and export social ads in one workspace.</h1>
          <p className="splash-subtitle">
            Build campaign variants across Feed, Stories, Reels, and Facebook with export-first rendering.
          </p>
          <div className="splash-points">
            <div className="splash-point">
              <span className="splash-point-dot" />
              Canvas-based previews aligned with exports
            </div>
            <div className="splash-point">
              <span className="splash-point-dot" />
              Local workspace + optional shared cloud workspaces
            </div>
            <div className="splash-point">
              <span className="splash-point-dot" />
              Private media uploads with signed URL access
            </div>
          </div>
        </section>

        <section className="splash-auth-card">
          {authEnabled ? (
            <form onSubmit={onSubmit} className="splash-auth-form">
              <div>
                <h2 className="splash-auth-title">Sign in to your workspace</h2>
                <p className="splash-auth-subtitle">
                  Use email and password to continue.
                </p>
              </div>

              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              {mode !== "reset" && (
                <>
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </>
              )}

              {error && <p className="splash-auth-error">{error}</p>}
              {notice && <p className="splash-auth-notice">{notice}</p>}

              <button className="btn btn-primary" disabled={pending} type="submit">
                {pending
                  ? "Please wait..."
                  : mode === "sign_in"
                    ? "Sign In"
                    : mode === "sign_up"
                      ? "Create Account"
                      : "Send Reset Link"}
              </button>

              <div className="splash-auth-actions">
                <button
                  type="button"
                  className={`btn btn-sm ${mode === "sign_in" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => {
                    setMode("sign_in");
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === "sign_up" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => {
                    setMode("sign_up");
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${mode === "reset" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => {
                    setMode("reset");
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Reset Password
                </button>
              </div>
            </form>
          ) : (
            <div className="splash-status">
              <h2 className="splash-auth-title">{statusTitle}</h2>
              <p className="splash-auth-subtitle">{statusBody}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
