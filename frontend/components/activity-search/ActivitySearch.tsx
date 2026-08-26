"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Clock3,
  IndianRupee,
  MapPin,
  Plus,
  Search,
  Star,
  Target,
} from "lucide-react";
import { activityApi, ActivityItem, TripActivityItem, getUser } from "@/lib/api";

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  { id: "Sightseeing", label: "Sightseeing" },
  { id: "Food & Dining", label: "Food & Dining" },
  { id: "Culture", label: "Culture & History" },
  { id: "Adventure", label: "Adventure & Nature" },
  { id: "Relaxation", label: "Relaxation & Spa" },
];

const COST_TYPES = [
  { id: "all", label: "All Prices" },
  { id: "Free", label: "Free" },
  { id: "₹", label: "₹ (Budget)" },
  { id: "₹₹", label: "₹₹ (Moderate)" },
  { id: "₹₹₹", label: "₹₹₹ (Luxury)" },
];

const DURATIONS = [
  { id: "all", label: "All Durations" },
  { id: "1-2 Hours", label: "1 - 2 Hours" },
  { id: "Half Day", label: "Half Day" },
  { id: "Full Day", label: "Full Day" },
];

const SORT_OPTIONS = [
  { id: "popularity", label: "Popularity" },
  { id: "rating", label: "Rating (High to Low)" },
  { id: "price_asc", label: "Price (Low to High)" },
  { id: "price_desc", label: "Price (High to Low)" },
];

export default function ActivitySearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripIdParam = searchParams.get("tripId") || "";
  const cityParam = searchParams.get("city") || "";

  const [user, setUser] = useState<{ firstName?: string } | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [addedActivityMap, setAddedActivityMap] = useState<Record<string, string>>({}); // activityId -> tripActivityId
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState(cityParam);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCost, setSelectedCost] = useState("all");
  const [selectedDuration, setSelectedDuration] = useState("all");
  const [sortBy, setSortBy] = useState("popularity");

  useEffect(() => {
    setUser(getUser());
  }, []);

  // Fetch activities on filter change
  useEffect(() => {
    setLoading(true);
    activityApi
      .getActivities({
        search: searchQuery,
        city: selectedCity,
        category: selectedCategory,
        costType: selectedCost,
        duration: selectedDuration,
        sortBy,
      })
      .then((res) => {
        setActivities(res.activities || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [searchQuery, selectedCity, selectedCategory, selectedCost, selectedDuration, sortBy]);

  // Fetch user's existing trip activities to track added status
  useEffect(() => {
    if (!tripIdParam) return;
    activityApi
      .getTripActivities(tripIdParam)
      .then((res) => {
        const map: Record<string, string> = {};
        (res.tripActivities || []).forEach((ta) => {
          map[ta.activityId] = ta.id;
        });
        setAddedActivityMap(map);
      })
      .catch(() => {});
  }, [tripIdParam]);

  const handleToggleAddActivity = async (activity: ActivityItem) => {
    if (!tripIdParam) {
      alert("Please select a trip first from your dashboard or itinerary builder to add activities!");
      return;
    }

    const existingTripActivityId = addedActivityMap[activity.id];

    if (existingTripActivityId) {
      // Remove from trip
      try {
        await activityApi.removeActivityFromTrip(existingTripActivityId);
        setAddedActivityMap((prev) => {
          const updated = { ...prev };
          delete updated[activity.id];
          return updated;
        });
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Failed to remove activity.");
      }
    } else {
      // Add to trip
      try {
        const res = await activityApi.addActivityToTrip({
          tripId: tripIdParam,
          activityId: activity.id,
          cityId: activity.cityId || undefined,
        });
        setAddedActivityMap((prev) => ({
          ...prev,
          [activity.id]: res.tripActivity.id,
        }));
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Failed to add activity to trip.");
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100 }}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,9,12,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 130, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.12)", height: 20, display: "flex", alignItems: "center", outline: "none" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2dd4bf"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Dashboard
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {tripIdParam && (
            <button
              onClick={() => router.push(`/itinerary/${tripIdParam}`)}
              style={{ background: "rgba(45,212,191,0.15)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 10, padding: "8px 16px", color: "#2dd4bf", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              Back to Itinerary
            </button>
          )}
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)", border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf" }}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1 }}>
        {/* Title Header (Matching Wireframe) */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
            Activity & Destination Search
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Explore, filter and add top-rated activities to your trip itinerary
          </p>
        </div>

        {/* Search & Filter Control Bar (Matching Wireframe) */}
        <div style={{ ...cardStyle, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Top Search Input */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)" }}><Search size={14} strokeWidth={2} /></span>
              <input
                type="text"
                placeholder="Search activities (e.g. Paragliding, Museum, Food Tour)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", padding: "12px 14px 12px 38px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" }}
              />
            </div>
            {selectedCity && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#2dd4bf" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={12} strokeWidth={2} /> {selectedCity}</span>
                <button onClick={() => setSelectedCity("")} style={{ background: "none", border: "none", color: "#2dd4bf", cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            )}
          </div>

          {/* Filter Dropdowns (Group by, Filter, Sort by) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            {/* Category / Group filter */}
            <div>
              <label style={labelStyle}>Category / Type</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={selectStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: "#0a0c10" }}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Cost Filter */}
            <div>
              <label style={labelStyle}>Filter by Cost</label>
              <select value={selectedCost} onChange={(e) => setSelectedCost(e.target.value)} style={selectStyle}>
                {COST_TYPES.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: "#0a0c10" }}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Duration Filter */}
            <div>
              <label style={labelStyle}>Filter by Duration</label>
              <select value={selectedDuration} onChange={(e) => setSelectedDuration(e.target.value)} style={selectStyle}>
                {DURATIONS.map((d) => (
                  <option key={d.id} value={d.id} style={{ background: "#0a0c10" }}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Sort by */}
            <div>
              <label style={labelStyle}>Sort by...</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id} style={{ background: "#0a0c10" }}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
              Results ({activities.length})
            </h2>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {Object.keys(addedActivityMap).length} added to trip
            </span>
          </div>

          {loading ? (
            <div style={{ ...cardStyle, padding: "40px 24px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              Searching activities...
            </div>
          ) : activities.length === 0 ? (
            <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center", color: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ marginBottom: 10 }}><Search size={36} color="rgba(255,255,255,0.4)" /></div>
              No activities found matching your filters. Try clearing search or selecting different options!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {activities.map((act) => {
                const isAdded = !!addedActivityMap[act.id];
                return (
                  <div
                    key={act.id}
                    style={{
                      ...cardStyle,
                      display: "flex",
                      flexDirection: "row",
                      gap: 20,
                      alignItems: "center",
                      border: isAdded ? "1.5px solid rgba(45,212,191,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      background: isAdded ? "rgba(45,212,191,0.04)" : "rgba(255,255,255,0.03)",
                      transition: "all 0.2s",
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Activity Image */}
                    {act.image ? (
                      <div
                        style={{
                          width: 130,
                          height: 100,
                          borderRadius: 12,
                          backgroundImage: `url(${act.image})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 130,
                          height: 100,
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.06)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Target size={28} strokeWidth={1.8} color="rgba(255,255,255,0.7)" />
                      </div>
                    )}

                    {/* Activity Details */}
                    <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#2dd4bf", background: "rgba(45,212,191,0.12)", padding: "2px 8px", borderRadius: 6 }}>
                          {act.category}
                        </span>
                        {act.cityName && (
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={11} strokeWidth={2} /> {act.cityName}</span>
                        )}
                        <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={11} strokeWidth={2} fill="currentColor" /> {act.rating}</span>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>({act.popularity}% popular)</span>
                      </div>

                      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 }}>{act.title}</h3>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.4 }}>{act.description}</p>

                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}><Clock3 size={12} strokeWidth={2} /> {act.duration}</span>
                        <span style={{ fontSize: 12, color: "#2dd4bf", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>{act.costType} (₹{act.costAmount})</span>
                      </div>
                    </div>

                    {/* Action Button: Add to Trip / Remove */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => handleToggleAddActivity(act)}
                        style={{
                          padding: "10px 20px",
                          background: isAdded ? "rgba(239,68,68,0.15)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)",
                          border: isAdded ? "1px solid rgba(239,68,68,0.4)" : "none",
                          borderRadius: 10,
                          color: isAdded ? "#f87171" : "#fff",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          fontFamily: "inherit",
                        }}
                      >
                        {isAdded ? <><Check size={14} strokeWidth={2.5} /> Added (Click to Remove)</> : <><Plus size={14} strokeWidth={2.5} /> Add to Trip</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 20,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
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

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
};
