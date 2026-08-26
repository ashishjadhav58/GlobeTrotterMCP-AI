"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { authApi } from "@/lib/api";

export const dynamic = "force-dynamic";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Reset token is missing. Please check your reset link.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.resetPassword(token, newPassword);
      setSuccess(res.message);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(20,184,166,0.08)", border: "2px solid rgba(45,212,191,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <svg width="30" height="30" fill="none" stroke="rgba(45,212,191,0.6)" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-5 4v1m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Reset Password</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
          Enter your new secure password below.
        </p>
      </div>

      {error && (
        <div style={{ width: "100%", marginBottom: 14, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "rgba(255,255,255,0.75)", display: "flex", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}><AlertTriangle size={15} strokeWidth={2} /></span>{error}
        </div>
      )}

      {success ? (
        <div style={{ width: "100%", background: "rgba(20,184,166,0.1)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 12, padding: "20px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}><CheckCircle2 size={30} strokeWidth={2} color="rgba(45,212,191,0.8)" /></div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{success}</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>Redirecting you to login...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* New Password */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <input
              type={showPwd ? "text" : "password"}
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "13px 16px 13px 40px", paddingRight: 46, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} style={eyeButtonStyle}>
              {showPwd ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
            </button>
          </div>

          {/* Confirm Password */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "13px 16px 13px 40px", paddingRight: 46, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }}
            />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeButtonStyle}>
              {showConfirm ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
            </button>
          </div>

          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "14px", background: loading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s", boxShadow: "0 4px 20px rgba(20,184,166,0.3)" }}
          >
            {loading
              ? <><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ animation: "spin 0.8s linear infinite" }}><path strokeLinecap="round" d="M12 4a8 8 0 0 1 8 8" /></svg>Saving...</>
              : "Reset Password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={pageStyle}>
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.08) 0%,transparent 70%)", top: "-10%", right: "-10%", pointerEvents: "none" }} />
      <Suspense fallback={<div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
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
const eyeButtonStyle: React.CSSProperties = {
  position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)",
  display: "flex", alignItems: "center", padding: 0,
};
