"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthMode = "sign_in" | "sign_up" | "reset";

type AuthGateProps = {
  supabase: SupabaseClient;
};

export function AuthGate({ supabase }: AuthGateProps) {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--pane)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 22, lineHeight: 1.2 }}>Sign in to Socialize</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
          Your workspace data is now cloud-backed and account-scoped.
        </p>

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

        {error && (
          <p style={{ color: "#b42318", fontSize: 12 }}>{error}</p>
        )}
        {notice && (
          <p style={{ color: "#16794d", fontSize: 12 }}>{notice}</p>
        )}

        <button className="btn btn-primary" disabled={pending} type="submit">
          {pending
            ? "Please wait..."
            : mode === "sign_in"
              ? "Sign In"
              : mode === "sign_up"
                ? "Create Account"
                : "Send Reset Link"}
        </button>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
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
            className="btn btn-secondary btn-sm"
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
            className="btn btn-secondary btn-sm"
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
    </div>
  );
}
