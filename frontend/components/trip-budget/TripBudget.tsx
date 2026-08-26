"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  IndianRupee,
  Hotel,
  Plane,
  Search,
  Ticket,
  Trash2,
  UtensilsCrossed,
  Share2,
} from "lucide-react";
import { tripApi, activityApi, TripData, getUser, isAuthenticated, publicTripApi } from "@/lib/api";

interface ExpenseItem {
  id: string;
  day: number;
  activityTitle: string;
  category: "Transport" | "Stay" | "Activities" | "Meals";
  cost: number;
}

export default function TripBudget() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const tripId = (params?.tripId as string) || searchParams.get("tripId") || "";

  const [user, setUser] = useState<{ firstName?: string } | null>(null);
  const [trip, setTrip] = useState<TripData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Target Budget Limit (Default $2,000)
  const [targetBudget, setTargetBudget] = useState(2000);
  const [isEditingBudget, setIsEditingBudget] = useState(false);

  // Filter & Search Controls (Matching Wireframe)
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByFilter, setGroupByFilter] = useState("day"); // 'day' or 'category'
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("day");

  useEffect(() => {
    setUser(getUser());
    if (tripId) {
      const fetchFn = isAuthenticated() ? tripApi.getTripById : publicTripApi.getTripById;
      fetchFn(tripId)
        .then((res) => {
          setTrip(res.trip);
          if (res.trip.maxBudget) setTargetBudget(res.trip.maxBudget);
          if (res.trip.expenses) {
            try {
              setExpenses(JSON.parse(res.trip.expenses));
            } catch (e) {
              console.error("Failed to parse budget expenses:", e);
            }
          }
          setLoading(false);
        })
        .catch(() => {
          setTrip({
            id: tripId || "demo-trip",
            name: "Summer European Getaway",
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 6 * 864000000).toISOString(),
            createdAt: new Date().toISOString(),
          });
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [tripId]);

  // Dynamic Expenses calculations
  const filteredExpenses = useMemo(() => {
    let list = expenses.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.activityTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = categoryFilter === "all" || item.category === categoryFilter;
      return matchesSearch && matchesCat;
    });

    if (sortBy === "cost_desc") {
      list = [...list].sort((a, b) => b.cost - a.cost);
    } else {
      list = [...list].sort((a, b) => a.day - b.day);
    }
    return list;
  }, [expenses, searchQuery, categoryFilter, sortBy]);

  // Breakdown amounts by category
  const breakdown = useMemo(() => {
    const res = { Transport: 0, Stay: 0, Activities: 0, Meals: 0 };
    expenses.forEach((item) => {
      if (res[item.category] !== undefined) {
        res[item.category] += item.cost;
      }
    });
    return res;
  }, [expenses]);

  const totalCost = useMemo(() => {
    return Object.values(breakdown).reduce((a, b) => a + b, 0);
  }, [breakdown]);

  // Compute Trip Duration in Days
  const tripDaysCount = useMemo(() => {
    if (!trip?.startDate || !trip?.endDate) return 7;
    const diffTime = Math.abs(new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 7;
  }, [trip]);

  const avgCostPerDay = useMemo(() => {
    return Math.round(totalCost / tripDaysCount);
  }, [totalCost, tripDaysCount]);

  const isOverBudget = totalCost > targetBudget;
  const overBudgetAmount = totalCost - targetBudget;

  const handleUpdateBudget = () => {
    setIsEditingBudget(false);
    if (tripId && trip) {
      tripApi.update(tripId, { maxBudget: targetBudget }).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.5)" }}>Loading trip budget breakdown...</div>
      </div>
    );
  }

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
          {tripId && (
            <>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/trip-budget/${tripId}`);
                  alert("Public budget link copied!");
                }}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Share2 size={14} strokeWidth={2} />
                Share Budget
              </button>
              <button onClick={() => router.push(`/itinerary/${tripId}`)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ArrowLeft size={14} strokeWidth={2} />
                Return to Itinerary
              </button>
            </>
          )}
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)", border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf" }}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1 }}>
        {/* Wireframe Header Controls Bar */}
        <div style={{ ...cardStyle, padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)" }}><Search size={13} strokeWidth={2} /></span>
            <input
              type="text"
              placeholder="Search expenses or activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 14px 10px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Group By Dropdown */}
            <select value={groupByFilter} onChange={(e) => setGroupByFilter(e.target.value)} style={selectControlStyle}>
              <option value="day" style={{ background: "#0a0c10" }}>Group by Day</option>
              <option value="category" style={{ background: "#0a0c10" }}>Group by Category</option>
            </select>

            {/* Filter Dropdown */}
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={selectControlStyle}>
              <option value="all" style={{ background: "#0a0c10" }}>Filter: All Categories</option>
              <option value="Transport" style={{ background: "#0a0c10" }}>Transport</option>
              <option value="Stay" style={{ background: "#0a0c10" }}>Stay</option>
              <option value="Activities" style={{ background: "#0a0c10" }}>Activities</option>
              <option value="Meals" style={{ background: "#0a0c10" }}>Meals</option>
            </select>

            {/* Sort by Dropdown */}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectControlStyle}>
              <option value="day" style={{ background: "#0a0c10" }}>Sort by Day</option>
              <option value="cost_desc" style={{ background: "#0a0c10" }}>Expense: High to Low</option>
            </select>
          </div>
        </div>

        {/* Overbudget Alert Banner */}
        {isOverBudget && (
          <div style={{ background: "rgba(239,68,68,0.14)", border: "1.5px solid rgba(239,68,68,0.4)", borderRadius: 16, padding: "16px 20px", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle size={22} strokeWidth={2} />
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f87171", margin: 0 }}>OVER BUDGET ALERT</h3>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "2px 0 0" }}>
                  Your total estimated expense of <strong>₹{totalCost.toLocaleString()}</strong> exceeds your allocated budget limit of <strong>₹{targetBudget.toLocaleString()}</strong> by <strong>₹{overBudgetAmount.toLocaleString()}</strong>!
                </p>
              </div>
            </div>
            {isAuthenticated() && (
              <button onClick={() => setIsEditingBudget(true)} style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                Adjust Budget
              </button>
            )}
          </div>
        )}

        {/* Total Cost & Overview Banner */}
        <div style={{ width: "100%", borderRadius: 20, background: isOverBudget ? "linear-gradient(135deg, #2a0a0a 0%, #3d0d0d 60%, rgba(239,68,68,0.2) 100%)" : "linear-gradient(135deg, #0a2a26 0%, #0d3d38 60%, rgba(20,184,166,0.25) 100%)", border: `1px solid ${isOverBudget ? "rgba(239,68,68,0.3)" : "rgba(45,212,191,0.2)"}`, padding: "28px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20 }}>
          {/* TOTAL COST */}
          <div>
            <span style={{ fontSize: 11, color: isOverBudget ? "#f87171" : "#2dd4bf", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              TOTAL ESTIMATED COST
            </span>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: "#fff", margin: "4px 0 2px" }}>
              ₹{totalCost.toLocaleString()}
            </h2>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {tripDaysCount} Days Trip • {expenses.length} expense items
            </span>
          </div>

          {/* BUDGET COMPARISON */}
          <div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ALLOCATED BUDGET LIMIT
            </span>
            {isEditingBudget && isAuthenticated() ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input
                  type="number"
                  value={targetBudget}
                  onChange={(e) => setTargetBudget(Number(e.target.value))}
                  style={{ width: 120, padding: "6px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid #2dd4bf", borderRadius: 8, color: "#fff", fontSize: 16, fontWeight: 700, outline: "none" }}
                />
                <button onClick={handleUpdateBudget} style={{ background: "#2dd4bf", border: "none", borderRadius: 8, padding: "6px 12px", color: "#07090c", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>₹{targetBudget.toLocaleString()}</span>
                {isAuthenticated() && (
                  <button onClick={() => setIsEditingBudget(true)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "4px 8px", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>Edit</button>
                )}
              </div>
            )}
            <span style={{ fontSize: 12, color: isOverBudget ? "#f87171" : "#2dd4bf" }}>
              {isOverBudget ? `Over budget by ₹${overBudgetAmount}` : `Under budget by ₹${targetBudget - totalCost}`}
            </span>
          </div>

          {/* AVERAGE COST / DAY */}
          <div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              AVERAGE COST / DAY
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "4px 0 2px" }}>
              ₹{avgCostPerDay} <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>/ day</span>
            </h2>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Calculated across {tripDaysCount} days</span>
          </div>
        </div>

        {/* Cost Breakdown Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
          {[
            { category: "Transport", label: "Transport", cost: breakdown.Transport, icon: Plane, color: "#3b82f6" },
            { category: "Stay", label: "Stay / Hotels", cost: breakdown.Stay, icon: Hotel, color: "#a855f7" },
            { category: "Activities", label: "Activities", cost: breakdown.Activities, icon: Ticket, color: "#2dd4bf" },
            { category: "Meals", label: "Meals & Dining", cost: breakdown.Meals, icon: UtensilsCrossed, color: "#f59e0b" },
          ].map((c) => {
            const pct = Math.round((c.cost / totalCost) * 100) || 0;
            const Icon = c.icon;
            return (
              <div key={c.category} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon size={13} strokeWidth={2} /> {c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.color }}>{pct}%</span>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>₹{c.cost.toLocaleString()}</h3>

                {/* Progress bar visual chart */}
                <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginTop: 4 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: c.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Pie/Bar Distribution Chart Representation */}
        <section style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <BarChart3 size={15} strokeWidth={2} /> Budget Distribution & Spending Share
          </h3>
          <div style={{ width: "100%", height: 16, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", overflow: "hidden" }}>
            <div style={{ width: `${(breakdown.Stay / totalCost) * 100}%`, background: "#a855f7" }} title="Stay" />
            <div style={{ width: `${(breakdown.Transport / totalCost) * 100}%`, background: "#3b82f6" }} title="Transport" />
            <div style={{ width: `${(breakdown.Activities / totalCost) * 100}%`, background: "#2dd4bf" }} title="Activities" />
            <div style={{ width: `${(breakdown.Meals / totalCost) * 100}%`, background: "#f59e0b" }} title="Meals" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#a855f7" }} /> Stay (₹{breakdown.Stay})</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} /> Transport (₹{breakdown.Transport})</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2dd4bf" }} /> Activities (₹{breakdown.Activities})</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} /> Meals (₹{breakdown.Meals})</div>
          </div>
        </section>

        {/* Day-by-Day Itinerary Expense View (EXACT MATCH FOR WIREFRAME) */}
        <section style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>
              Itinerary for a selected place
            </h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Daily Physical Activity Timeline & Expense Log
            </p>
          </div>

          {/* Days Timeline (Day 1, Day 2, Day 3) */}
          {[1, 2, 3].map((dayNum) => {
            const dayExpenses = filteredExpenses.filter((e) => e.day === dayNum);
            const dayTotal = dayExpenses.reduce((a, b) => a + b.cost, 0);

            return (
              <div key={dayNum} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Day Badge Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ padding: "6px 16px", background: "rgba(45,212,191,0.15)", border: "1px solid rgba(45,212,191,0.3)", borderRadius: 10, color: "#2dd4bf", fontSize: 14, fontWeight: 800 }}>
                      Day {dayNum}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Physical Activity</span>
                  </div>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Expense: ₹{dayTotal}</span>
                </div>

                {/* Physical Activity Items and Expenses */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12, borderLeft: "2px solid rgba(45,212,191,0.2)" }}>
                  {dayExpenses.map((exp, idx) => (
                    <div key={exp.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {/* Physical Activity Box */}
                      <div style={{ flex: 1, padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#fff", fontSize: 14, fontWeight: 600 }}>
                        {exp.activityTitle}
                        <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginTop: 2 }}>{exp.category}</span>
                      </div>

                      {/* Expense Box */}
                      <div style={{ width: 110, padding: "12px 14px", background: "rgba(20,184,166,0.1)", border: "1px solid rgba(45,212,191,0.25)", borderRadius: 12, color: "#2dd4bf", fontSize: 14, fontWeight: 700, textAlign: "center" }}>
                        ₹{exp.cost}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
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
