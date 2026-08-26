"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      setSuccess(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.08) 0%,transparent 70%)", top: "-10%", right: "-10%", pointerEvents: "none" }} />

      <div style={cardStyle}>
        {/* Icon */}
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(20,184,166,0.08)", border: "2px solid rgba(45,212,191,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="30" height="30" fill="none" stroke="rgba(45,212,191,0.6)" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Forgot Password?</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, maxWidth: 300 }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {error && (
          <div style={{ width: "100%", marginBottom: 14, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "rgba(255,255,255,0.75)", display: "flex", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg></span>{error}
          </div>
        )}

        {success ? (
          <div style={{ width: "100%", background: "rgba(20,184,166,0.1)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 12, padding: "20px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(45,212,191,0.8)" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Zm0 0 8 6 8-6" /></svg></div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{success}</p>
            <Link href="/login" style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "#2dd4bf", fontWeight: 600, textDecoration: "none" }}>
              ← Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: focused ? "#2dd4bf" : "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <input
                id="forgot-email" type="email" placeholder="Email address"
                value={email} onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                required
                style={{ width: "100%", padding: "13px 16px 13px 40px", background: focused ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", border: `1px solid ${focused ? "rgba(45,212,191,0.45)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none", transition: "all 0.2s", boxShadow: focused ? "0 0 0 3px rgba(45,212,191,0.1)" : "none" }}
              />
            </div>

            <button id="btn-forgot-submit" type="submit" disabled={loading}
              style={{ width: "100%", padding: "14px", background: loading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s", boxShadow: "0 4px 20px rgba(20,184,166,0.3)" }}
            >
              {loading
                ? <><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ animation: "spin 0.8s linear infinite" }}><path strokeLinecap="round" d="M12 4a8 8 0 0 1 8 8" /></svg>Sending...</>
                : "Send Reset Link"}
            </button>

            <Link href="/login" style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
              ← Back to Login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh", width: "100%", display: "flex", alignItems: "center",
  justifyContent: "center", background: "#07090c", padding: "24px 16px",
  position: "relative", overflow: "hidden",
};
const cardStyle: React.CSSProperties = {
  width: "100%", maxWidth: 420,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  padding: "40px 36px 36px", display: "flex", flexDirection: "column", alignItems: "center",
  boxShadow: "0 24px 80px rgba(0,0,0,0.5)", animation: "fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
  position: "relative", zIndex: 1,
};
