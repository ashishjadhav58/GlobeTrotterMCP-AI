"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, IndianRupee, Plus, Search, Sparkles, Wand2, Share2 } from "lucide-react";
import { tripApi, TripData, getUser, User, isAuthenticated, publicTripApi } from "@/lib/api";

interface ItinerarySection {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: string;
}

export default function ItineraryBuilder() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const [trip, setTrip] = useState<TripData | null>(null);
  const [sections, setSections] = useState<ItinerarySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  // Modal State for + Add another Section
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newBudget, setNewBudget] = useState("");

  const [user, setUser] = useState<User | null>(null);

  const saveItineraryToDB = async (updatedSections: ItinerarySection[]) => {
    try {
      await tripApi.update(tripId, {
        itinerary: JSON.stringify(updatedSections),
      });
    } catch (err) {
      console.error("Failed to auto-save itinerary:", err);
    }
  };

  useEffect(() => {
    setUser(getUser());
    if (!tripId) return;

    const fetchFn = isAuthenticated() ? tripApi.getTripById : publicTripApi.getTripById;

    fetchFn(tripId)
      .then((res) => {
        setTrip(res.trip);
        if (res.trip.itinerary) {
          try {
            setSections(JSON.parse(res.trip.itinerary));
          } catch (e) {
            console.error("Failed to parse itinerary:", e);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        setTrip({
          id: tripId,
          name: "My Planned Trip",
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 864000000).toISOString(),
          createdAt: new Date().toISOString(),
        });
        setLoading(false);
      });
  }, [tripId]);

  const handleAddSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const nextNumber = sections.length + 1;
    const formattedTitle = newTitle.toLowerCase().startsWith("section")
      ? newTitle.trim()
      : `Section ${nextNumber}: ${newTitle.trim()}`;

    const newSec: ItinerarySection = {
      id: `sec-${Date.now()}`,
      title: formattedTitle,
      description:
        newDesc.trim() ||
        "All the necessary information about this section. This can be anything like travel section, hotel or any other activity.",
      startDate: newStartDate || "Jul 16, 2025",
      endDate: newEndDate || "Jul 20, 2025",
      budget: newBudget.startsWith("₹") ? newBudget : `₹${newBudget || "3500"}`,
    };

    const updated = [...sections, newSec];
    setSections(updated);
    saveItineraryToDB(updated);
    setNewTitle("");
    setNewDesc("");
    setNewStartDate("");
    setNewEndDate("");
    setNewBudget("");
    setIsModalOpen(false);
  };

  const handleDeleteSection = (id: string) => {
    const updated = sections.filter((s) => s.id !== id);
    setSections(updated);
    saveItineraryToDB(updated);
  };

  const handleRegenerateItinerary = async () => {
    if (!tripId) return;
    setRegenerating(true);
    setError("");
    try {
      const res = await tripApi.regenerateItinerary(tripId);
      if (res.trip.itinerary) {
        try {
          const newSections = JSON.parse(res.trip.itinerary);
          setSections(newSections);
          saveItineraryToDB(newSections);
        } catch (e) {
          console.error("Failed to parse regenerated itinerary:", e);
          setError("Failed to parse the regenerated itinerary.");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to regenerate itinerary.");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.5)" }}>Loading itinerary...</div>
      </div>
    );
  }

  const startDateFormatted = trip?.startDate
    ? new Date(trip.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Jul 10, 2025";
  const endDateFormatted = trip?.endDate
    ? new Date(trip.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Jul 20, 2025";

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100 }}>
      {/* Ambient background orb */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />

      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,9,12,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 130, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.12)", height: 20, display: "flex", alignItems: "center", outline: "none" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2dd4bf"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Dashboard
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)", border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf" }}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1 }}>
        {/* Title Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>
              Build Itinerary
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              {trip?.name || "My Planned Trip"} • {startDateFormatted} – {endDateFormatted}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isAuthenticated() && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/itinerary/${tripId}`);
                  alert("Public itinerary link copied!");
                }}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Share2 size={14} strokeWidth={2} /> Share Itinerary
              </button>
            )}
            <button
              onClick={() => router.push(`/trip-budget/${tripId}`)}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 10, padding: "10px 16px", color: "#2dd4bf", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <IndianRupee size={14} strokeWidth={2} /> Trip Budget
            </button>
            <button
              onClick={() => router.push(`/activity-search?tripId=${tripId}`)}
              style={{ background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(20,184,166,0.3)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Search size={14} strokeWidth={2} /> Search Activities
            </button>
            {isAuthenticated() && (
              <>
                <button
                  onClick={handleRegenerateItinerary}
                  disabled={regenerating}
                  style={{
                    background: regenerating ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 18px",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: regenerating ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    boxShadow: "0 4px 16px rgba(139,92,246,0.3)",
                    opacity: regenerating ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {regenerating ? <><Sparkles size={14} strokeWidth={2} /> Regenerating...</> : <><Wand2 size={14} strokeWidth={2} /> AI Regenerate Itinerary</>}
                </button>
                <button onClick={() => router.push("/plan-trip")} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ArrowLeft size={14} strokeWidth={2} /> Trip Form
                </button>
              </>
            )}
          </div>
        </div>

        {/* Itinerary Sections List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {sections.map((sec) => (
            <div key={sec.id} style={{ ...cardStyle, position: "relative" }}>
              {/* Section Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{sec.title}</h2>
                {isAuthenticated() && (
                  <button
                    onClick={() => handleDeleteSection(sec.id)}
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 10px", color: "#f87171", fontSize: 12, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* Section Description */}
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 20 }}>
                {sec.description}
              </p>

              {/* Date Range & Budget Badges (Matching Wireframe) */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                {/* Date Range Pill */}
                <div style={pillStyle}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Date Range:</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{sec.startDate} to {sec.endDate}</span>
                </div>

                {/* Budget Pill */}
                <div style={pillStyle}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Budget of this section:</span>
                  <span style={{ color: "#2dd4bf", fontWeight: 700 }}>{sec.budget ? sec.budget.replace(/\$/g, "₹") : "₹0"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* + Add another Section Button (Matching Wireframe) */}
        {isAuthenticated() && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 32px",
                background: "rgba(255,255,255,0.04)",
                border: "1.5px dashed rgba(255,255,255,0.2)",
                borderRadius: 14,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#2dd4bf";
                e.currentTarget.style.background = "rgba(45,212,191,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#2dd4bf" }}><Plus size={18} strokeWidth={2.5} /></span>
              Add another Section
            </button>
          </div>
        )}
      </main>

      {/* Modal: + Add another Section */}
      {isModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div style={{ width: "100%", maxWidth: 460, background: "#0d1014", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Add New Itinerary Section</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 16 }}>×</button>
            </div>

            <form onSubmit={handleAddSection} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Section Title / Activity Type</label>
                <input
                  type="text"
                  placeholder="e.g. Dining & Food Experiences or Tour Reservations"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Description / Information</label>
                <textarea
                  rows={3}
                  placeholder="All the necessary information about this section..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Start Date</label>
                  <input
                    type="text"
                    placeholder="e.g. Jul 16, 2025"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>End Date</label>
                  <input
                    type="text"
                    placeholder="e.g. Jul 18, 2025"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Section Budget</label>
                <input
                  type="text"
                  placeholder="e.g. ₹3,500"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 4px 16px rgba(20,184,166,0.3)" }}
                >
                  Save Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 24,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
