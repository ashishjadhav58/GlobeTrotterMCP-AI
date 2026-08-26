"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { authApi, setToken, setUser } from "@/lib/api";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@globetrotter.com");
  const [password, setPassword] = useState("adminpassword123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await authApi.login({ email, password });
      setToken(res.token);
      setUser(res.user);

      // Verify Admin Role Access
      if (res.user.role !== "ADMIN") {
        setError("Access Denied: Your account does not have Admin privileges. Redirecting to User Dashboard...");
        setTimeout(() => router.push("/"), 2000);
        return;
      }

      router.push("/admin/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid admin credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {/* Background Glow Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(239,68,68,0.08) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />

      <div style={{ width: "100%", maxWidth: 420, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: "36px 32px", backdropFilter: "blur(16px)", boxShadow: "0 24px 80px rgba(0,0,0,0.8)", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 99, color: "#f87171", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            <ShieldCheck size={12} strokeWidth={2} /> GlobeTrotter Admin Portal
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "4px 0 6px" }}>Admin Sign In</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Enter admin credentials to access system analytics & user management
          </p>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} strokeWidth={2} /> {error}
          </div>
        )}

        <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Admin Email / ID</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@globetrotter.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: 8, padding: "13px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", border: "none", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 6px 20px rgba(239,68,68,0.35)" }}
          >
            {loading ? "Authenticating..." : "Sign In to Admin Dashboard"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={12} strokeWidth={2} /> Return to User App
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(255,255,255,0.5)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};
