"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, setToken, setUser, uploadProfileImage } from "@/lib/api";
import { AlertTriangle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    username: "", firstName: "", lastName: "",
    email: "", phone: "",
    password: "", confirm: "",
    city: "", country: "",
    bio: "",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Avatar
  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Password strength
  const strength = (pwd: string) => {
    let s = 0;
    if (pwd.length >= 6) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  };
  const pwdScore = strength(form.password);
  const strengthColor = ["", "#ef4444", "#f59e0b", "#10b981", "#14b8a6"][pwdScore];
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][pwdScore];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      let photoUrl: string | undefined;
      const file = fileRef.current?.files?.[0];
      if (file) photoUrl = await uploadProfileImage(file);

      const res = await authApi.signup({
        username: form.username,
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        photoUrl,
        phoneNumber: form.phone || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        additionalInfo: form.bio || undefined,
      });
      setToken(res.token);
      setUser(res.user);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <Orb style={{ width: 500, height: 500, top: "-15%", right: "-10%", animation: "orbDrift 14s ease-in-out infinite" }} />
      <Orb style={{ width: 380, height: 380, bottom: "-10%", left: "-8%", animation: "orbDrift 18s ease-in-out infinite 5s" }} />

      <div style={cardStyle}>
        {/* Avatar upload */}
        <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            onClick={() => fileRef.current?.click()}
            style={{ width: 92, height: 92, borderRadius: "50%", cursor: "pointer", position: "relative", background: avatar ? "transparent" : "rgba(20,184,166,0.07)", border: "2.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "all 0.25s", animation: "avatarPulse 3s ease-in-out infinite" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(45,212,191,0.8)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(45,212,191,0.4)"; }}
          >
            <input ref={fileRef} id="reg-avatar" type="file" accept="image/*" onChange={handleAvatar} style={{ display: "none" }} />
            {avatar ? (
              <img src={avatar} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <svg width="28" height="28" fill="none" stroke="rgba(45,212,191,0.65)" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span style={{ fontSize: 9, color: "rgba(45,212,191,0.55)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Photo</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
            {avatar ? "Click to change" : "Upload profile photo"}
          </span>
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 24, width: "100%" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Create Account</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Join millions of travelers worldwide</p>
        </div>

        {/* Error */}
        {error && <ErrorBanner message={error} onClose={() => setError("")} />}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Username (full width) */}
          <Field id="reg-username" placeholder="Username" value={form.username} onChange={(v) => set("username", v)} required
            icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
          />

          {/* First + Last */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field id="reg-first-name" placeholder="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} required
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
            />
            <Field id="reg-last-name" placeholder="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} required
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
            />
          </div>

          {/* Email + Phone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field id="reg-email" type="email" placeholder="Email Address" value={form.email} onChange={(v) => set("email", v)} required
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            />
            <Field id="reg-phone" type="tel" placeholder="Phone Number" value={form.phone} onChange={(v) => set("phone", v)}
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
            />
          </div>

          {/* City + Country */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field id="reg-city" placeholder="City" value={form.city} onChange={(v) => set("city", v)}
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
            <Field id="reg-country" placeholder="Country" value={form.country} onChange={(v) => set("country", v)}
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ position: "relative" }}>
              <Field id="reg-password" type={showPwd ? "text" : "password"} placeholder="Create Password" value={form.password} onChange={(v) => set("password", v)} required paddingRight={46}
                icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
              />
              <EyeToggle show={showPwd} onToggle={() => setShowPwd(!showPwd)} />
            </div>
            {form.password && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} style={{ flex: 1, height: 3, borderRadius: 99, background: n <= pwdScore ? strengthColor : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />
                ))}
                <span style={{ fontSize: 10, color: strengthColor, fontWeight: 600, marginLeft: 6, minWidth: 36 }}>{strengthLabel}</span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div style={{ position: "relative" }}>
            <Field id="reg-confirm-password" type={showConfirm ? "text" : "password"} placeholder="Confirm Password" value={form.confirm} onChange={(v) => set("confirm", v)} required paddingRight={46}
              borderOverride={form.confirm ? (form.confirm === form.password ? "rgba(20,184,166,0.5)" : "rgba(239,68,68,0.5)") : undefined}
              icon={<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
            />
            <EyeToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
          </div>

          {/* Additional Info */}
          <TextArea id="reg-bio" placeholder="Additional Information ...." value={form.bio} onChange={(v) => set("bio", v)} />

          {/* Submit */}
          <button id="btn-register-submit" type="submit" disabled={loading}
            style={{ width: "100%", padding: "14px", background: loading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s", boxShadow: loading ? "none" : "0 4px 20px rgba(20,184,166,0.3)", marginTop: 4 }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.boxShadow = "0 6px 28px rgba(20,184,166,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = loading ? "none" : "0 4px 20px rgba(20,184,166,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {loading ? <><Spinner /> Creating account...</> : <>Register Users <ArrowIcon /></>}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/login" id="link-go-to-login" style={linkStyle}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

/* ── Shared components ─────────────────────── */
function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{ width: "100%", marginBottom: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 15 }}><AlertTriangle className="w-4 h-4" /></span>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
    </div>
  );
}

function Field({ id, type = "text", placeholder, value, onChange, icon, required, paddingRight, borderOverride }: {
  id: string; type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; icon: React.ReactNode;
  required?: boolean; paddingRight?: number; borderOverride?: string;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = borderOverride ?? (focused ? "rgba(45,212,191,0.45)" : "rgba(255,255,255,0.07)");
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: focused ? "#2dd4bf" : "rgba(255,255,255,0.25)", transition: "color 0.2s", display: "flex", alignItems: "center", pointerEvents: "none" }}>
        {icon}
      </span>
      <input id={id} type={type} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        required={required}
        style={{ width: "100%", padding: "12px 12px 12px 32px", paddingRight: paddingRight ?? 12, background: focused ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", border: `1px solid ${borderColor}`, borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "all 0.2s", boxShadow: focused ? "0 0 0 3px rgba(45,212,191,0.1)" : "none" }}
      />
    </div>
  );
}

function TextArea({ id, placeholder, value, onChange }: { id: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} rows={3}
      style={{ width: "100%", padding: "12px 14px", background: focused ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)", border: `1px solid ${focused ? "rgba(45,212,191,0.45)" : "rgba(255,255,255,0.07)"}`, borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", transition: "all 0.2s", boxShadow: focused ? "0 0 0 3px rgba(45,212,191,0.1)" : "none", minHeight: 88 }}
    />
  );
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", padding: 0 }}>
      {show
        ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
        : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
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

const pageStyle: React.CSSProperties = {
  minHeight: "100vh", width: "100%", display: "flex", alignItems: "center",
  justifyContent: "center", background: "#07090c", padding: "32px 16px",
  position: "relative", overflow: "hidden",
};
const cardStyle: React.CSSProperties = {
  width: "100%", maxWidth: 520,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  padding: "40px 36px 36px", display: "flex", flexDirection: "column", alignItems: "center",
  boxShadow: "0 24px 80px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.05)",
  animation: "fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards", position: "relative", zIndex: 1,
};
const linkStyle: React.CSSProperties = { color: "#2dd4bf", fontWeight: 600, textDecoration: "none" };
