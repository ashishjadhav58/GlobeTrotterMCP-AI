"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthenticated, clearAuth, getUser, setUser, authApi, dashboardApi, TripData, User, getGlobalCountriesAndCities, uploadProfileImage } from "@/lib/api";
import { AlertTriangle, Mail, Phone, MapPin, Pencil } from "lucide-react";

const REGION_IMAGES: Record<string, string> = {
  Europe: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400&auto=format&fit=crop",
  Asia: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400&auto=format&fit=crop",
  Americas: "https://images.unsplash.com/photo-1485738422979-f5c462d49f74?w=400&auto=format&fit=crop",
  Africa: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=400&auto=format&fit=crop",
  Oceania: "https://images.unsplash.com/photo-1524820197278-540916411e20?w=400&auto=format&fit=crop",
};


const DEFAULT_TRAVEL_IMG = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&auto=format&fit=crop";

export default function ProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // States
  const [user, setUserState] = useState<User | null>(null);
  const [trips, setTrips] = useState<TripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit states
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    firstName: "", lastName: "",
    email: "", phone: "",
    city: "", country: "",
    bio: "",
  });
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [countriesCities, setCountriesCities] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    getGlobalCountriesAndCities().then((data) => {
      setCountriesCities(data);
    });
    fetchProfileAndTrips();
  }, [router]);

  const fetchProfileAndTrips = async () => {
    setLoading(true);
    try {
      // 1. Fetch current profile from backend to ensure fresh data
      const meRes = await authApi.me();
      setUserState(meRes.user);
      setUser(meRes.user); // update localStorage cache

      // Sync form fields
      setForm({
        firstName: meRes.user.firstName,
        lastName: meRes.user.lastName,
        email: meRes.user.email,
        phone: meRes.user.phoneNumber || "",
        city: meRes.user.city || "",
        country: meRes.user.country || "",
        bio: meRes.user.additionalInfo || "",
      });
      setAvatar(meRes.user.photoUrl || null);

      // 2. Fetch trips to classify on the profile page
      const tripsRes = await dashboardApi.getPreviousTrips({ limit: 100 });
      setTrips(tripsRes.data);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load profile details.");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const photoUrl = avatarFile ? await uploadProfileImage(avatarFile) : avatar || undefined;
      const res = await authApi.updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phoneNumber: form.phone || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        additionalInfo: form.bio || undefined,
        photoUrl,
      });
      setUserState(res.user);
      setUser(res.user); // sync with cache
      setEditMode(false);
      alert("Profile updated successfully!");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  // Filter trips for Screen 7 logic
  // Preplanned trips: upcoming + draft (since they are upcoming or in progress)
  const preplannedTrips = trips.filter((t) => t.status === "upcoming" || t.status === "ongoing");
  // Previous trips: completed
  const previousTrips = trips.filter((t) => t.status === "completed");

  return (
    <div style={pageStyle}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-20%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(13,148,136,0.05) 0%,transparent 70%)", bottom: "-15%", left: "-10%", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={headerStyle}>
        <Link href="/" style={{ textDecoration: "none", color: "#fff", display: "flex", alignItems: "center", marginLeft: 130, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.12)", height: 20 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2dd4bf"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}
          >
            ← Dashboard
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={handleLogout} style={signOutButtonStyle}>
            Sign out
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "100px 0" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth={2} style={{ animation: "spin 0.9s linear infinite" }}>
            <path strokeLinecap="round" d="M12 4a8 8 0 0 1 8 8" />
          </svg>
        </div>
      ) : error ? (
        <main style={mainStyle}><div style={errorCardStyle}><AlertTriangle className="inline w-4 h-4 mr-1" /> {error}</div></main>
      ) : (
        <main style={mainStyle}>
          {/* ── User Details Card (Edit Option) ── */}
          <section style={glassCard}>
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={profileHeaderStyle}>
                
                {/* Avatar Display & Upload */}
                <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div
                    onClick={() => editMode && fileRef.current?.click()}
                    style={{
                      width: 100, height: 100, borderRadius: "50%",
                      cursor: editMode ? "pointer" : "default", position: "relative",
                      background: avatar ? "transparent" : "rgba(20,184,166,0.08)",
                      border: `2px solid ${editMode ? "#2dd4bf" : "rgba(255,255,255,0.1)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      overflow: "hidden", transition: "all 0.2s"
                    }}
                  >
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: "none" }} />
                    {avatar ? (
                      <img src={avatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 28, color: "#2dd4bf" }}>{user?.firstName?.[0]?.toUpperCase()}</span>
                    )}
                    {editMode && (
                      <div style={avatarOverlayStyle}>
                        <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>EDIT</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profile Data Box */}
                <div style={{ flex: 1, width: "100%" }}>
                  {editMode ? (
                    <div style={formGridStyle}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <InputField label="First Name" value={form.firstName} onChange={(v) => setForm(p => ({ ...p, firstName: v }))} required />
                        <InputField label="Last Name" value={form.lastName} onChange={(v) => setForm(p => ({ ...p, lastName: v }))} required />
                      </div>
                      <InputField label="Email Address" type="email" value={form.email} onChange={(v) => setForm(p => ({ ...p, email: v }))} required />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <InputField label="Phone Number" value={form.phone} onChange={(v) => setForm(p => ({ ...p, phone: v }))} />
                        <div>
                          <label style={labelStyle}>Country</label>
                          <select
                            value={form.country}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm(p => ({ ...p, country: val, city: "" }));
                            }}
                            style={{ ...inputStyle, background: "#0d1014", marginTop: 4 }}
                          >
                            <option value="" style={{ background: "#0d1014" }}>Select Country</option>
                            {Object.keys(countriesCities).map((c) => (
                              <option key={c} value={c} style={{ background: "#0d1014" }}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={labelStyle}>City</label>
                          <select
                            value={form.city}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm(p => ({ ...p, city: val }));
                            }}
                            disabled={!form.country}
                            style={{
                              ...inputStyle,
                              background: "#0d1014",
                              marginTop: 4,
                              opacity: form.country ? 1 : 0.6,
                              cursor: form.country ? "pointer" : "not-allowed"
                            }}
                          >
                            <option value="" style={{ background: "#0d1014" }}>Select City</option>
                            {form.country && countriesCities[form.country]?.map((city) => (
                              <option key={city} value={city} style={{ background: "#0d1014" }}>{city}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Bio / Additional Information</label>
                        <textarea value={form.bio} onChange={(e) => setForm(p => ({ ...p, bio: e.target.value }))} rows={2} style={textareaStyle} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{user?.firstName} {user?.lastName}</h2>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>@{user?.username}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, margin: "6px 0 10px" }}>{user?.additionalInfo || "No bio added yet."}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, fontSize: 13 }}>
                        <DetailRow label={<><Mail className="inline w-3 h-3 mr-1" /> Email</>} value={user?.email} />
                        <DetailRow label={<><Phone className="inline w-3 h-3 mr-1" /> Phone</>} value={user?.phoneNumber || "Not provided"} />
                        <DetailRow label={<><MapPin className="inline w-3 h-3 mr-1" /> Location</>} value={user?.city && user?.country ? `${user.city}, ${user.country}` : user?.city || user?.country || "Not provided"} />
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                {editMode ? (
                  <>
                    <button type="button" onClick={() => setEditMode(false)} style={cancelButtonStyle}>Cancel</button>
                    <button type="submit" disabled={saveLoading} style={saveButtonStyle}>
                      {saveLoading ? "Saving..." : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setEditMode(true)} style={editToggleStyle}>
                    <Pencil className="inline w-3 h-3 mr-1" /> Edit Profile
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* ── Preplanned Trips (Upcoming & Ongoing) ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={sectionTitleStyle}>Preplanned Trips</h3>
            {preplannedTrips.length === 0 ? (
              <EmptyTripsState />
            ) : (
              <div style={horizontalScrollStyle}>
                {preplannedTrips.map((trip) => (
                  <TripScrollCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </section>

          {/* ── Previous Trips (Completed) ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={sectionTitleStyle}>Previous Trips</h3>
            {previousTrips.length === 0 ? (
              <EmptyTripsState />
            ) : (
              <div style={horizontalScrollStyle}>
                {previousTrips.map((trip) => (
                  <TripScrollCard key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </section>

        </main>
      )}
    </div>
  );
}

/* ── UI Helpers ── */

function InputField({ label, type = "text", value, onChange, required }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} style={inputStyle} />
    </div>
  );
}

function DetailRow({ label, value }: { label: React.ReactNode; value?: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
    </div>
  );
}

function EmptyTripsState() {
  return (
    <div style={{ ...glassCard, padding: "30px 20px", display: "flex", justifyContent: "center" }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No trips found in this category.</span>
    </div>
  );
}

function TripScrollCard({ trip }: { trip: TripData }) {
  const start = new Date(trip.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  
  // Decide image
  const regionName = trip.description?.includes("Paris") || trip.name?.includes("Paris") ? "Europe" :
                     trip.description?.includes("Tokyo") || trip.name?.includes("Tokyo") ? "Asia" :
                     trip.description?.includes("NY") || trip.name?.includes("New York") ? "Americas" : "Europe";
  const bgImg = trip.coverImage || REGION_IMAGES[regionName] || DEFAULT_TRAVEL_IMG;

  return (
    <div style={scrollCardStyle}>
      <div style={{
        ...scrollCardImgStyle,
        backgroundImage: `url(${bgImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        border: "1px solid rgba(255,255,255,0.06)"
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.name}</h4>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.description}</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{start}</span>
      </div>
      <Link href="/trips" style={scrollCardLinkStyle}>
        View
      </Link>
    </div>
  );
}

/* ── Styles ── */
const pageStyle: React.CSSProperties = {
  minHeight: "100vh", background: "#07090c", color: "#fff",
  fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100,
};
const headerStyle: React.CSSProperties = {
  position: "sticky", top: 0, zIndex: 50, background: "rgba(7,9,12,0.85)",
  backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
  borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px",
  height: 60, display: "flex", alignItems: "center", justifyContent: "space-between",
};
const mainStyle: React.CSSProperties = {
  maxWidth: 800, margin: "0 auto", padding: "32px 20px",
  display: "flex", flexDirection: "column", gap: 36, position: "relative", zIndex: 1,
};
const glassCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20, padding: "30px", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
};
const profileHeaderStyle: React.CSSProperties = {
  display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap",
};
const avatarOverlayStyle: React.CSSProperties = {
  position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const formGridStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 12, width: "100%",
};
const labelStyle: React.CSSProperties = {
  fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.07em",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
const textareaStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none", resize: "none",
};
const editToggleStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, padding: "8px 16px", color: "#fff", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
};
const cancelButtonStyle: React.CSSProperties = {
  background: "none", border: "none", padding: "8px 16px", color: "rgba(255,255,255,0.4)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const saveButtonStyle: React.CSSProperties = {
  background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none",
  borderRadius: 8, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(20,184,166,0.25)",
};
const signOutButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, padding: "6px 12px", color: "rgba(255,255,255,0.5)", fontSize: 12,
  cursor: "pointer", fontFamily: "inherit",
};
const errorCardStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 12, padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.8)",
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.01em",
};

/* Horizontal Scroll styles */
const horizontalScrollStyle: React.CSSProperties = {
  display: "flex", gap: 14, overflowX: "auto", paddingBottom: 10,
  scrollbarWidth: "thin",
};
const scrollCardStyle: React.CSSProperties = {
  flex: "0 0 160px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: "12px", display: "flex", flexDirection: "column", gap: 8,
  position: "relative",
};
const scrollCardImgStyle: React.CSSProperties = {
  height: 80, background: "linear-gradient(135deg,rgba(20,184,166,0.08) 0%,rgba(13,148,136,0.12) 100%)",
  borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
};
const scrollCardLinkStyle: React.CSSProperties = {
  display: "block", textAlign: "center", padding: "6px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, color: "#2dd4bf", fontSize: 11,
  fontWeight: 600, textDecoration: "none", transition: "all 0.2s", marginTop: 4,
};
