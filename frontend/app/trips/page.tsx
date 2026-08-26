"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarDays, Plus, Search, Trash2, Share2 } from "lucide-react";
import { isAuthenticated, clearAuth, getUser, dashboardApi, tripApi, TripData, User } from "@/lib/api";

const REGION_IMAGES: Record<string, string> = {
  Europe: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400&auto=format&fit=crop",
  Asia: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400&auto=format&fit=crop",
  Americas: "https://images.unsplash.com/photo-1485738422979-f5c462d49f74?w=400&auto=format&fit=crop",
  Africa: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=400&auto=format&fit=crop",
  Oceania: "https://images.unsplash.com/photo-1524820197278-540916411e20?w=400&auto=format&fit=crop",
};

const DEFAULT_TRAVEL_IMG = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=500&auto=format&fit=crop";

const REGIONS = ["Europe", "Asia", "Americas", "Africa", "Oceania"];

export default function TripsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<TripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all"); // all, ongoing, upcoming, completed
  const [sortBy, setSortBy] = useState("recent"); // recent, title, region
  
  // Modal for planning a trip
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTrip, setNewTrip] = useState({ title: "", region: "Europe", location: "", startDate: "", endDate: "" });
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    setUser(getUser());
    fetchTrips();
  }, [router]);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      // Fetch user's previous and upcoming trips
      const res = await dashboardApi.getPreviousTrips({ limit: 100 });
      setTrips(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load trips.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrip.title || !newTrip.location) return;
    setModalLoading(true);
    try {
      await tripApi.create({
        name: newTrip.title,
        description: newTrip.location,
        startDate: newTrip.startDate || undefined,
        endDate: newTrip.endDate || undefined,
      });
      setNewTrip({ title: "", region: "Europe", location: "", startDate: "", endDate: "" });
      setIsModalOpen(false);
      fetchTrips(); // Refresh the listing
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to plan trip.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteTrip = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this trip?")) return;
    try {
      await tripApi.delete(id);
      fetchTrips(); // Refresh listing
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete trip.");
    }
  };

  // Filter & Sort logic
  const processedTrips = useMemo(() => {
    return trips
      .filter((t) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
        const matchesStatus = selectedFilter === "all" || t.status === selectedFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "title") return a.name.localeCompare(b.name);
        if (sortBy === "region") return (a.description || "").localeCompare(b.description || "");
        // Default recent: sort by startDate descending
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      });
  }, [trips, searchQuery, selectedFilter, sortBy]);

  // Grouped trips for Screen 6 structure
  const ongoingTrips = processedTrips.filter((t) => t.status === "ongoing");
  const upcomingTrips = processedTrips.filter((t) => t.status === "upcoming");
  const completedTrips = processedTrips.filter((t) => t.status === "completed");

  return (
    <div style={pageStyle}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-20%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(13,148,136,0.05) 0%,transparent 70%)", bottom: "-15%", left: "-10%", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={headerStyle}>
        <Link href="/" style={{ textDecoration: "none", color: "#fff", display: "flex", alignItems: "center", marginLeft: 130, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.12)", height: 20 }}>
          {/* Logo empty space — handles text in layout */}
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2dd4bf"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Dashboard
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={userAvatarStyle}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{user?.firstName ?? "Traveler"}</span>
          <button onClick={handleLogout} style={signOutButtonStyle}>
            Sign out
          </button>
        </div>
      </header>

      <main style={mainStyle}>
        {/* Title */}
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>User Trip Listing</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Overview of your ongoing, upcoming and completed journeys</p>
        </div>

        {/* ── Search & Controls Bar ── */}
        <section style={controlsStyle}>
          <div style={{ flex: "1 1 240px", position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
              <Search size={14} strokeWidth={2} />
            </span>
            <input
              type="text"
              placeholder="Search trips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Filter */}
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">Filter: All</option>
              <option value="ongoing">Ongoing</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={selectStyle}
            >
              <option value="recent">Sort: Recent</option>
              <option value="title">Sort: Title</option>
              <option value="region">Sort: Location</option>
            </select>
          </div>
        </section>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth={2} style={{ animation: "spin 0.9s linear infinite" }}>
              <path strokeLinecap="round" d="M12 4a8 8 0 0 1 8 8" />
            </svg>
          </div>
        ) : error ? (
          <div style={errorCardStyle}><span style={{ display: "inline-flex", alignItems: "center", marginRight: 8 }}><AlertTriangle size={14} strokeWidth={2} /></span>{error}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

            {/* ── Ongoing Section ── */}
            {(selectedFilter === "all" || selectedFilter === "ongoing") && (
              <section>
                <SectionHeader>Ongoing</SectionHeader>
                {ongoingTrips.length === 0 ? (
                  <EmptyState text="No current ongoing trips." />
                ) : (
                  <div style={tripsListStyle}>
                    {ongoingTrips.map((trip) => (
                      <TripRowCard key={trip.id} trip={trip} onDelete={(e) => handleDeleteTrip(trip.id, e)} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Up-coming Section ── */}
            {(selectedFilter === "all" || selectedFilter === "upcoming") && (
              <section>
                <SectionHeader>Up-coming</SectionHeader>
                {upcomingTrips.length === 0 ? (
                  <EmptyState text="No upcoming planned trips." />
                ) : (
                  <div style={tripsListStyle}>
                    {upcomingTrips.map((trip) => (
                      <TripRowCard key={trip.id} trip={trip} onDelete={(e) => handleDeleteTrip(trip.id, e)} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── Completed Section ── */}
            {(selectedFilter === "all" || selectedFilter === "completed") && (
              <section>
                <SectionHeader>Completed</SectionHeader>
                {completedTrips.length === 0 ? (
                  <EmptyState text="No completed trips recorded." />
                ) : (
                  <div style={tripsListStyle}>
                    {completedTrips.map((trip) => (
                      <TripRowCard key={trip.id} trip={trip} onDelete={(e) => handleDeleteTrip(trip.id, e)} />
                    ))}
                  </div>
                )}
              </section>
            )}

          </div>
        )}
      </main>

      {/* FAB */}
      <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 50 }}>
        <button onClick={() => setIsModalOpen(true)} style={fabStyle}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 36px rgba(20,184,166,0.6)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 6px 28px rgba(20,184,166,0.4)"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Plus size={18} strokeWidth={2.5} /></span>
          Plan a trip
        </button>
      </div>

      {/* Plan a Trip Modal */}
      {isModalOpen && (
        <div style={modalOverlayStyle} onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div style={modalCardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Plan a New Trip</h3>
              <button onClick={() => setIsModalOpen(false)} style={modalCloseButtonStyle}>×</button>
            </div>
            <form onSubmit={handleAddTrip} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>Trip Title</label>
                <input type="text" placeholder="e.g. Paris Summer Getaway" required value={newTrip.title} onChange={(e) => setNewTrip((p) => ({ ...p, title: e.target.value }))} style={modalInputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Location / Description</label>
                <input type="text" placeholder="e.g. France, Paris" required value={newTrip.location} onChange={(e) => setNewTrip((p) => ({ ...p, location: e.target.value }))} style={modalInputStyle} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input type="date" value={newTrip.startDate} onChange={(e) => setNewTrip((p) => ({ ...p, startDate: e.target.value }))} style={modalInputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input type="date" value={newTrip.endDate} onChange={(e) => setNewTrip((p) => ({ ...p, endDate: e.target.value }))} style={modalInputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Region</label>
                <select value={newTrip.region} onChange={(e) => setNewTrip((p) => ({ ...p, region: e.target.value }))} style={modalInputStyle}>
                  {REGIONS.map((r) => <option key={r} value={r} style={{ background: "#0d1014" }}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={modalCancelStyle}>Cancel</button>
                <button type="submit" disabled={modalLoading} style={modalSubmitStyle}>
                  {modalLoading ? "Saving..." : "Save Trip"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── UI Components ── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 17, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 14, textTransform: "capitalize" }}>
      {children}
    </h2>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={glassCard}>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>{text}</p>
    </div>
  );
}

function TripRowCard({ trip, onDelete }: { trip: TripData; onDelete: (e: React.MouseEvent) => void }) {
  const start = new Date(trip.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const end = new Date(trip.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  
  // Choose cover image: explicit coverImage -> matching region image -> default cover
  const regionName = trip.description?.includes("Paris") || trip.name?.includes("Paris") ? "Europe" :
                     trip.description?.includes("Tokyo") || trip.name?.includes("Tokyo") ? "Asia" :
                     trip.description?.includes("NY") || trip.name?.includes("New York") ? "Americas" : "Europe";
  const bgImg = trip.coverImage || REGION_IMAGES[regionName] || DEFAULT_TRAVEL_IMG;

  return (
    <div style={{ ...glassCard, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
      <div style={{
        width: 54, height: 54, borderRadius: 10,
        backgroundImage: `url(${bgImg})`, backgroundSize: "cover",
        backgroundPosition: "center", flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.06)"
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.name}</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trip.description || "No description provided"}</p>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={11} strokeWidth={2} /> {start} — {end}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(`${window.location.origin}/itinerary/${trip.id}`);
            alert("Public itinerary link copied!");
          }}
          style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "6px 10px", color: "#fff", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
        >
          <Share2 size={12} strokeWidth={2} /> Share
        </button>
        <span style={badgeStyle(trip.status || "upcoming")}>{trip.status || "upcoming"}</span>
        <button onClick={onDelete} style={deleteButtonStyle}>
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

const badgeStyle = (status: string = "upcoming") => {
  const colors: Record<string, { c: string; bg: string; b: string }> = {
    ongoing: { c: "#2dd4bf", bg: "rgba(45,212,191,0.1)", b: "rgba(45,212,191,0.25)" },
    upcoming: { c: "#f59e0b", bg: "rgba(245,158,11,0.1)", b: "rgba(245,158,11,0.25)" },
    completed: { c: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", b: "rgba(255,255,255,0.1)" },
  };
  const theme = colors[status] || colors.upcoming;
  return {
    fontSize: 10, fontWeight: 700, color: theme.c, background: theme.bg,
    border: `1px solid ${theme.b}`, borderRadius: 99, padding: "2px 8px",
    textTransform: "uppercase" as const, letterSpacing: "0.05em",
  };
};

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
  display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1,
};
const controlsStyle: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8,
};
const searchInputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px 10px 36px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
const selectStyle: React.CSSProperties = {
  padding: "10px 14px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
  color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "inherit",
  outline: "none", cursor: "pointer",
};
const glassCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16, padding: "20px", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
};
const tripsListStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 12,
};
const userAvatarStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)",
  border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center",
  justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf",
};
const signOutButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8, padding: "6px 12px", color: "rgba(255,255,255,0.5)", fontSize: 12,
  cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
};
const deleteButtonStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center",
};
const fabStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "13px 22px",
  background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none",
  borderRadius: 999, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
  cursor: "pointer", boxShadow: "0 6px 28px rgba(20,184,166,0.4)", transition: "all 0.2s",
};
const errorCardStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: 12, padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.8)",
};

/* Modal Styles */
const modalOverlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
};
const modalCardStyle: React.CSSProperties = {
  width: "100%", maxWidth: 420, background: "#0d1014", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 20, padding: "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
  animation: "fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards",
};
const modalCloseButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8,
  width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 16,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6,
};
const modalInputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
const modalCancelStyle: React.CSSProperties = {
  flex: 1, padding: "12px", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
  color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "inherit", cursor: "pointer",
};
const modalSubmitStyle: React.CSSProperties = {
  flex: 2, padding: "12px", background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)",
  border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer", boxShadow: "0 4px 16px rgba(20,184,166,0.3)",
};
