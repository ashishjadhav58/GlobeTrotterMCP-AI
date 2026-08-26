"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Plus, Search } from "lucide-react";
import { tripApi, dashboardApi, getUser, TripData } from "@/lib/api";

interface CalendarEvent {
  id: string;
  tripId: string;
  tripName: string;
  title: string;
  category: "Flight" | "Hotel" | "Activity" | "Dining" | "Completed Trip" | "Planned Trip" | string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  color: string;
}

const SAMPLE_EVENTS: CalendarEvent[] = [
  {
    id: "ev-1",
    tripId: "t-paris",
    tripName: "PARIS TRIP",
    title: "PARIS TRIP",
    category: "Activity",
    startDate: "2025-07-04",
    endDate: "2025-07-08",
    color: "rgba(20,184,166,0.85)",
  },
  {
    id: "ev-2",
    tripId: "t-nyc",
    tripName: "NYC GETAWAY",
    title: "NYC GETAWAY",
    category: "Flight",
    startDate: "2025-07-14",
    endDate: "2025-07-18",
    color: "rgba(168,85,247,0.85)",
  },
  {
    id: "ev-3",
    tripId: "t-japan",
    tripName: "JAPAN ADVENTURE",
    title: "JAPAN ADVENTURE",
    category: "Activity",
    startDate: "2025-07-16",
    endDate: "2025-07-25",
    color: "rgba(245,158,11,0.85)",
  },
  {
    id: "ev-4",
    tripId: "t-goa",
    tripName: "GOA BEACH RETREAT",
    title: "GOA BEACH RETREAT",
    category: "Activity",
    startDate: "2025-07-26",
    endDate: "2025-07-30",
    color: "rgba(59,130,246,0.85)",
  },
];

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export default function CalendarView() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<{ firstName?: string } | null>(null);

  // Month & Year state (Defaults dynamically to current month and year)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Controls (Search, Group by, Filter, Sort by) matching Wireframe
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState("trip");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("date");

  // Selected Day Details Modal / Drawer
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [dayActivities, setDayActivities] = useState<Array<{ id: string; time: string; title: string; category: string }>>([]);
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityTime, setNewActivityTime] = useState("10:00 AM");

  useEffect(() => {
    const loggedUser = getUser();
    setUser(loggedUser);

    setLoading(true);
    dashboardApi
      .getPreviousTrips({ scope: "mine", limit: 100 })
      .then((res) => {
        const userTrips: TripData[] = res.data || [];
        const mappedEvents: CalendarEvent[] = userTrips.map((trip, idx) => {
          const startStr = trip.startDate ? trip.startDate.split("T")[0] : new Date().toISOString().split("T")[0];
          const endStr = trip.endDate ? trip.endDate.split("T")[0] : startStr;
          
          const isCompleted = trip.status === "completed" || new Date(endStr) < new Date();
          const statusTag = isCompleted ? " (COMPLETED)" : " (PLANNED)";
          
          // Color coding: Teal for Planned/Upcoming, Blue/Purple for Completed
          const color = isCompleted
            ? (idx % 2 === 0 ? "rgba(59,130,246,0.85)" : "rgba(168,85,247,0.85)")
            : "rgba(45,212,191,0.85)";

          return {
            id: trip.id,
            tripId: trip.id,
            tripName: (trip.name + statusTag).toUpperCase(),
            title: (trip.name + statusTag).toUpperCase(),
            category: isCompleted ? "Completed Trip" : "Planned Trip",
            startDate: startStr,
            endDate: endStr,
            color,
          };
        });

        setEvents(mappedEvents);

        // If user has trips, navigate calendar to the first trip's start date
        if (userTrips.length > 0 && userTrips[0].startDate) {
          const firstTripDate = new Date(userTrips[0].startDate);
          if (!isNaN(firstTripDate.getTime())) {
            setCurrentDate(firstTripDate);
          }
        }
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [params, searchParams]);

  // Navigate Previous / Next Month
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Month Info
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString("en-US", { month: "long" });

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const matchesSearch =
        !searchQuery.trim() ||
        ev.tripName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterType === "all" || ev.category.toLowerCase() === filterType.toLowerCase();
      return matchesSearch && matchesFilter;
    });
  }, [events, searchQuery, filterType]);

  // Click on a calendar day cell
  const handleDayClick = (dayNumber: number) => {
    const formattedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    setSelectedDateStr(formattedDate);

    // Initial sample day itinerary for that date
    const matchingEvs = filteredEvents.filter((e) => formattedDate >= e.startDate && formattedDate <= e.endDate);

    setDayActivities([
      { id: "act-1", time: "09:00 AM", title: `Morning sightseeing & walk`, category: "Activity" },
      { id: "act-2", time: "01:00 PM", title: `Lunch at local cafe (${matchingEvs[0]?.tripName || "Trip"})`, category: "Dining" },
      { id: "act-3", time: "04:30 PM", title: `Hotel check-in & evening leisure`, category: "Hotel" },
    ]);
  };

  // Add Quick Activity to Day
  const handleAddDayActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivityTitle.trim()) return;

    setDayActivities((prev) => [
      ...prev,
      {
        id: `act-${Date.now()}`,
        time: newActivityTime || "12:00 PM",
        title: newActivityTitle.trim(),
        category: "Activity",
      },
    ]);
    setNewActivityTitle("");
  };

  // Reorder activity up/down
  const handleMoveActivity = (index: number, direction: "up" | "down") => {
    const updated = [...dayActivities];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= updated.length) return;

    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setDayActivities(updated);
  };

  const handleDeleteActivity = (id: string) => {
    setDayActivities((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100 }}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,9,12,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* left space — GlobeTrotter is rendered by root layout */}
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "8px 16px",
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ArrowLeft size={14} strokeWidth={2} /> Dashboard
          </button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)", border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf" }}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1 }}>
        {/* Top Control Bar (EXACT MATCH FOR WIREFRAME: Search bar ...... | Group by | Filter | Sort by...) */}
        <div style={{ ...cardStyle, padding: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)" }}><Search size={13} strokeWidth={2} /></span>
            <input
              type="text"
              placeholder="Search bar ......"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 14px 10px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={selectControlStyle}>
            <option value="trip" style={{ background: "#0a0c10" }}>Group by Trip</option>
            <option value="category" style={{ background: "#0a0c10" }}>Group by Category</option>
          </select>

          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectControlStyle}>
            <option value="all" style={{ background: "#0a0c10" }}>Filter: All Events</option>
            <option value="activity" style={{ background: "#0a0c10" }}>Activities</option>
            <option value="flight" style={{ background: "#0a0c10" }}>Flights & Transport</option>
            <option value="hotel" style={{ background: "#0a0c10" }}>Hotels</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectControlStyle}>
            <option value="date" style={{ background: "#0a0c10" }}>Sort by Date</option>
            <option value="name" style={{ background: "#0a0c10" }}>Sort by Name</option>
          </select>
        </div>

        {/* Section Heading (Matching Wireframe: "Calendar View") */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 4 }}>
            Calendar View
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
            Click on any calendar date to view, edit or reorder day-wise itinerary activities
          </p>
        </div>

        {/* Main White/Light Calendar Card (EXACT MATCH FOR WIREFRAME) */}
        <div style={{ background: "#ffffff", borderRadius: 20, color: "#111827", padding: "28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", overflow: "hidden", boxSizing: "border-box" }}>
          {/* Month Header Navigation (←  Month Year  →) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: "0 10px" }}>
            <button
              onClick={handlePrevMonth}
              style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374151" }}
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>
              {monthName} {year}
            </h2>
            <button
              onClick={handleNextMonth}
              style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#374151" }}
            >
              <ArrowRight size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Weekday Labels Header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #e5e7eb", paddingBottom: 12, textAlign: "center", fontWeight: 800, fontSize: 13, color: "#4b5563", boxSizing: "border-box" }}>
            {WEEKDAYS.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>

          {/* Calendar Grid Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderLeft: "1px solid #e5e7eb", borderTop: "1px solid #e5e7eb", width: "100%", boxSizing: "border-box", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
            {/* Empty Leading Blank Cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} style={calendarCellEmptyStyle} />
            ))}

            {/* Month Day Cells */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

              // Find matching trip events for this date
              const dayEvents = filteredEvents.filter((e) => dateStr >= e.startDate && dateStr <= e.endDate);
              const isSelected = selectedDateStr === dateStr;
              const hasConflict = dayEvents.length > 1;

              return (
                <div
                  key={dayNum}
                  onClick={() => handleDayClick(dayNum)}
                  style={{
                    ...calendarCellStyle,
                    background: isSelected ? "#f3f4f6" : "#ffffff",
                    borderColor: isSelected ? "#14b8a6" : "#e5e7eb",
                    borderWidth: isSelected ? 2 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{dayNum}</span>
                    {hasConflict && (
                      <span title="Overlapping activities on date" style={{ display: "inline-flex", alignItems: "center", fontSize: 10, background: "#fee2e2", color: "#ef4444", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>
                        <AlertTriangle size={10} strokeWidth={2} />
                      </span>
                    )}
                  </div>

                  {/* Render Event Spans inside cell */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: "#ffffff",
                          background: ev.color,
                          padding: "3px 6px",
                          borderRadius: 6,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ev.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expandable Day Details Modal / Card */}
        {selectedDateStr && (
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16, border: "1.5px solid rgba(45,212,191,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 11, color: "#2dd4bf", fontWeight: 700, textTransform: "uppercase" }}>
                  Expanded Day Details
                </span>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "2px 0 0", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <CalendarDays size={16} strokeWidth={2} /> Itinerary for {selectedDateStr}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDateStr(null)}
                style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 30, height: 30, color: "rgba(255,255,255,0.5)", fontSize: 16, cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            {/* Quick Add Activity for this Day */}
            <form onSubmit={handleAddDayActivity} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Time (e.g. 10:00 AM)"
                value={newActivityTime}
                onChange={(e) => setNewActivityTime(e.target.value)}
                style={{ width: 110, padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, outline: "none" }}
              />
              <input
                type="text"
                placeholder="New activity title for this date..."
                value={newActivityTitle}
                onChange={(e) => setNewActivityTitle(e.target.value)}
                required
                style={{ flex: 1, minWidth: 200, padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, outline: "none" }}
              />
              <button
                type="submit"
                style={{ padding: "9px 18px", background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Plus size={14} strokeWidth={2.5} /> Add Activity
              </button>
            </form>

            {/* Activity Items with Reorder & Edit Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {dayActivities.map((act, idx) => (
                <div key={act.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#2dd4bf", background: "rgba(45,212,191,0.12)", padding: "3px 8px", borderRadius: 6 }}>
                      {act.time}
                    </span>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{act.title}</h4>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{act.category}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Reorder Buttons */}
                    <button onClick={() => handleMoveActivity(idx, "up")} disabled={idx === 0} style={reorderButtonStyle}>
                      ▲
                    </button>
                    <button onClick={() => handleMoveActivity(idx, "down")} disabled={idx === dayActivities.length - 1} style={reorderButtonStyle}>
                      ▼
                    </button>
                    <button onClick={() => handleDeleteActivity(act.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 8px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 22,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const selectControlStyle: React.CSSProperties = {
  padding: "9px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "rgba(255,255,255,0.7)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
};

const calendarCellStyle: React.CSSProperties = {
  height: 90,
  padding: 6,
  borderRight: "1px solid #e5e7eb",
  borderBottom: "1px solid #e5e7eb",
  boxSizing: "border-box",
  overflow: "hidden",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  transition: "all 0.15s ease",
};

const calendarCellEmptyStyle: React.CSSProperties = {
  height: 90,
  background: "#f9fafb",
  borderRight: "1px solid #e5e7eb",
  borderBottom: "1px solid #e5e7eb",
  boxSizing: "border-box",
};

const reorderButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  padding: "3px 7px",
  color: "#fff",
  fontSize: 10,
  cursor: "pointer",
};
