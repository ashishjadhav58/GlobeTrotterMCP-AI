"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { authApi, setToken, setUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(""); // username or email
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login({ username: identifier, email: identifier, password });
      setToken(res.token);
      setUser(res.user);

      // Unified single login page role check:
      if (res.user.role === "ADMIN") {
        router.push("/admin/dashboard");
      } else {
        router.push("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      {/* Ambient orbs */}
      <Orb style={{ width: 500, height: 500, top: "-10%", left: "-10%", animation: "orbDrift 12s ease-in-out infinite" }} />
      <Orb style={{ width: 400, height: 400, bottom: "-10%", right: "-5%", animation: "orbDrift 15s ease-in-out infinite 4s" }} />

      <div style={cardStyle}>
        {/* Static avatar */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
          <div style={avatarStyle}>
            <svg width="38" height="38" fill="none" stroke="rgba(45,212,191,0.55)" strokeWidth={1.3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Welcome back</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Sign in to continue your journey</p>
        </div>

        {/* Error banner */}
        {error && <ErrorBanner message={error} onClose={() => setError("")} />}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          <Field
            id="login-identifier"
            type="text"
            placeholder="Username or Email"
            value={identifier}
            onChange={setIdentifier}
            required
            icon={<UserIcon />}
          />

          <div style={{ position: "relative" }}>
            <Field
              id="login-password"
              type={showPwd ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={setPassword}
              required
              paddingRight={46}
              icon={<LockIcon />}
            />
            <EyeToggle show={showPwd} onToggle={() => setShowPwd(!showPwd)} />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link href="/forgot-password" id="link-forgot-password" style={linkStyle}>
              Forgot password?
            </Link>
          </div>

          <PrimaryButton id="btn-login-submit" loading={loading} label="Login" />
        </form>

        <p style={{ marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
          New here?{" "}
          <Link href="/register" id="link-go-to-register" style={linkStyle}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ── Shared UI atoms ─────────────────────────── */

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{
      width: "100%", marginBottom: 14,
      background: "rgba(239,68,68,0.12)",
      border: "1px solid rgba(239,68,68,0.3)",
      borderRadius: 10, padding: "11px 14px",
      display: "flex", alignItems: "flex-start", gap: 10,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}><AlertTriangle size={15} strokeWidth={2} /></span>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
    </div>
  );
}

function Field({ id, type = "text", placeholder, value, onChange, icon, required, paddingRight }: {
  id: string; type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; icon: React.ReactNode;
  required?: boolean; paddingRight?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: focused ? "#2dd4bf" : "rgba(255,255,255,0.25)", transition: "color 0.2s", display: "flex", alignItems: "center", pointerEvents: "none" }}>
        {icon}
      </span>
      <input
        id={id} type={type} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        required={required}
        style={{ width: "100%", padding: "13px 16px 13px 40px", paddingRight: paddingRight ?? 16, background: focused ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", border: `1px solid ${focused ? "rgba(45,212,191,0.45)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none", transition: "all 0.2s", boxShadow: focused ? "0 0 0 3px rgba(45,212,191,0.1)" : "none" }}
      />
    </div>
  );
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", padding: 0 }}>
      {show ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
    </button>
  );
}

function PrimaryButton({ id, loading, label }: { id: string; loading: boolean; label: string }) {
  return (
    <button id={id} type="submit" disabled={loading}
      style={{ width: "100%", padding: "14px", background: loading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s", boxShadow: loading ? "none" : "0 4px 20px rgba(20,184,166,0.3)", marginTop: 4 }}
      onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.boxShadow = "0 6px 28px rgba(20,184,166,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = loading ? "none" : "0 4px 20px rgba(20,184,166,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {loading
        ? <><Spinner /> Signing in...</>
        : <>{label} <ArrowIcon /></>}
    </button>
  );
}

function Orb({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: "absolute", borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.08) 0%,transparent 70%)", pointerEvents: "none", ...style }} />;
}

function Spinner() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ animation: "spin 0.8s linear infinite" }}><path strokeLinecap="round" d="M12 4a8 8 0 0 1 8 8" /></svg>;
}
function ArrowIcon() {
  return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>;
}
function UserIcon() {
  return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}
function LockIcon() {
  return <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
}

/* ── Styles ──────────────────────────────────── */
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
  boxShadow: "0 24px 80px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.05)",
  animation: "fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards", position: "relative", zIndex: 1,
};
const avatarStyle: React.CSSProperties = {
  width: 88, height: 88, borderRadius: "50%",
  background: "rgba(20,184,166,0.08)", border: "2px solid rgba(45,212,191,0.35)",
  display: "flex", alignItems: "center", justifyContent: "center",
  animation: "avatarPulse 3s ease-in-out infinite",
};
const linkStyle: React.CSSProperties = { color: "#2dd4bf", fontWeight: 600, textDecoration: "none", fontSize: 13 };
