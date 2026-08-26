"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Globe2,
  PieChart,
  Search,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { adminApi, getUser, removeToken, AdminUserItem, AdminAnalyticsData } from "@/lib/api";

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Active Tab state matching Wireframe 4 buttons
  const [activeTab, setActiveTab] = useState<"users" | "cities" | "activities" | "analytics">("analytics");

  const [analytics, setAnalytics] = useState<AdminAnalyticsData | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Search & Filter controls matching Wireframe
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  // Verify Admin Role & Fetch Data
  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);

    if (!user || user.role !== "ADMIN") {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    Promise.all([
      adminApi.getAnalytics().catch(() => null),
      adminApi.getUsers().catch(() => null),
    ]).then(([analyticsRes, usersRes]) => {
      if (analyticsRes?.analytics) setAnalytics(analyticsRes.analytics);
      if (usersRes?.users) setUsers(usersRes.users);
      setLoading(false);
    }).catch(() => {
      setAccessDenied(true);
      setLoading(false);
    });
  }, []);

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "Active" ? "Disabled" : "Active";
    try {
      await adminApi.toggleUserStatus(userId, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: nextStatus } : u))
      );
    } catch (err: any) {
      alert(err.message || "Failed to update user status.");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user account?")) return;
    try {
      await adminApi.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.message || "Failed to delete user.");
    }
  };

  const handleAdminLogout = () => {
    removeToken();
    router.push("/login");
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !searchQuery.trim() ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === "all" || u.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, filterStatus]);

  if (accessDenied) {
    return (
      <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ ...cardStyle, maxWidth: 440, textAlign: "center", padding: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><ShieldAlert size={38} strokeWidth={1.8} color="#f87171" /></div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f87171", margin: 0 }}>403 Access Forbidden</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "10px 0 20px" }}>
            Admin Dashboard is restricted to system administrators only. Please sign in with an Admin account.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => router.push("/login")} style={{ padding: "10px 18px", background: "#ef4444", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Sign In as Admin
            </button>
            <button onClick={() => router.push("/")} style={{ padding: "10px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontSize: 13, cursor: "pointer" }}>
              Go to User Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.5)" }}>Loading Admin Analytics Dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100 }}>
      {/* Background Glow Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(239,68,68,0.06) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.05) 0%,transparent 70%)", bottom: "-15%", left: "-10%", pointerEvents: "none", zIndex: 0 }} />

      {/* Header Bar */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,9,12,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* left space — GlobeTrotter is rendered by root layout */}
        <div style={{ width: 140 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            Admin: <strong style={{ color: "#fff" }}>{currentUser?.firstName ?? "System"}</strong>
          </span>
          <button onClick={handleAdminLogout} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 20, position: "relative", zIndex: 1 }}>
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
            <option value="all" style={{ background: "#0a0c10" }}>Group by All</option>
            <option value="country" style={{ background: "#0a0c10" }}>Group by Country</option>
            <option value="role" style={{ background: "#0a0c10" }}>Group by Role</option>
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectControlStyle}>
            <option value="all" style={{ background: "#0a0c10" }}>Filter: All Users</option>
            <option value="Active" style={{ background: "#0a0c10" }}>Active Users</option>
            <option value="Disabled" style={{ background: "#0a0c10" }}>Disabled Users</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectControlStyle}>
            <option value="recent" style={{ background: "#0a0c10" }}>Sort by: Most Recent</option>
            <option value="trips" style={{ background: "#0a0c10" }}>Sort by: Most Trips</option>
          </select>
        </div>

        {/* Section Navigation Tabs Bar (EXACT MATCH FOR WIREFRAME: Manage Users | Popular cities | Popular Activities | User Trends and Analytics) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { id: "users", label: "Manage Users", icon: Users },
            { id: "cities", label: "Popular Cities", icon: Globe2 },
            { id: "activities", label: "Popular Activities", icon: Target },
            { id: "analytics", label: "User Trends & Analytics", icon: BarChart3 },
          ].map((tab) => {
            const TabIcon = tab.icon;
            return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: "12px 14px",
                background: activeTab === tab.id ? "rgba(45,212,191,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${activeTab === tab.id ? "rgba(45,212,191,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12,
                color: activeTab === tab.id ? "#2dd4bf" : "rgba(255,255,255,0.7)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s ease",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <TabIcon size={14} strokeWidth={2} />
              {tab.label}
            </button>
          )})}
        </div>

        {/* Central Dark Analytics & Charts Container (MATCHES USER UI SLEEK DARK THEME) */}
        <div style={{ ...cardStyle, padding: "28px 24px", display: "flex", flexDirection: "column", gap: 28 }}>
          {/* TAB 1: Manage Users */}
          {activeTab === "users" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>Registered Users ({filteredUsers.length})</h2>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>Manage platform access, active status & account security</p>
                </div>
              </div>

              {/* Users Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", color: "rgba(255,255,255,0.5)" }}>
                      <th style={{ padding: "10px 12px" }}>User</th>
                      <th style={{ padding: "10px 12px" }}>Email</th>
                      <th style={{ padding: "10px 12px" }}>Role</th>
                      <th style={{ padding: "10px 12px" }}>Trips Created</th>
                      <th style={{ padding: "10px 12px" }}>Status</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "12px", fontWeight: 700, color: "#fff" }}>
                          {u.firstName} {u.lastName}
                        </td>
                        <td style={{ padding: "12px", color: "rgba(255,255,255,0.6)" }}>{u.email}</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, background: u.role === "ADMIN" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)", color: u.role === "ADMIN" ? "#f87171" : "rgba(255,255,255,0.7)", padding: "2px 8px", borderRadius: 6 }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: "12px", fontWeight: 700, color: "#2dd4bf" }}>{u._count?.trips ?? 2} Trips</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, background: u.status === "Active" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: u.status === "Active" ? "#34d399" : "#f87171", padding: "2px 8px", borderRadius: 6 }}>
                            {u.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => handleToggleUserStatus(u.id, u.status)}
                              style={{ background: u.status === "Active" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "5px 10px", color: u.status === "Active" ? "#fbbf24" : "#34d399", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            >
                              {u.status === "Active" ? "Disable" : "Activate"}
                            </button>
                            {u.role !== "ADMIN" && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "5px 10px", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Popular Cities */}
          {activeTab === "cities" && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Popular Visited Destinations & Cities</h2>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>Ranked by total trip selections across platform users</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(analytics?.popularCities || []).map((city, idx) => (
                  <div key={city.id || idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#14b8a6", color: "#fff", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        #{idx + 1}
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{city.name}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#2dd4bf" }}>{city.tripsCount} Trips</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Popular Activities */}
          {activeTab === "activities" && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Top Booked & Tagged Activities</h2>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>Popular activity trends selected by travelers</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(analytics?.popularActivities || []).map((act, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 18px" }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{act.name}</h4>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{act.category}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#3b82f6" }}>{act.count} Selections</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: User Trends & Analytics (MATCHING WIREFRAME CHARTS & GRAPHICS) */}
          {(activeTab === "analytics" || activeTab === "users") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Top Overview KPI Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>TOTAL USERS</span>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "2px 0 0" }}>{(analytics?.totalUsers ?? 0).toLocaleString()}</h3>
                </div>

                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399", textTransform: "uppercase" }}>ACTIVE USERS</span>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: "#34d399", margin: "2px 0 0" }}>{(analytics?.activeUsers ?? 0).toLocaleString()}</h3>
                </div>

                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase" }}>TOTAL TRIPS</span>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: "#60a5fa", margin: "2px 0 0" }}>{(analytics?.totalTrips ?? 0).toLocaleString()}</h3>
                </div>

                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase" }}>COMMUNITY POSTS</span>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: "#a78bfa", margin: "2px 0 0" }}>{(analytics?.totalCommunityPosts ?? 0).toLocaleString()}</h3>
                </div>

                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 18px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase" }}>TOTAL BUDGET MANAGED</span>
                  <h3 style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", margin: "2px 0 0" }}>₹{(analytics?.totalBudgetManaged ?? 0).toLocaleString()}</h3>
                </div>
              </div>

              {/* Wireframe Line/Bar Chart: Trips & User Growth Over Time */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <TrendingUp size={15} strokeWidth={2} /> Trips & User Growth Over Time
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, fontWeight: 600 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(180deg, #2dd4bf 0%, #14b8a6 100%)" }} /> Trips Created
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)" }} /> Registered Users
                    </span>
                  </div>
                </div>

                {(() => {
                  const trends = analytics?.tripTrends || [];
                  const maxVal = Math.max(...trends.map((t) => Math.max(t.trips || 0, t.users || 0)), 1);

                  return (
                    <div style={{ height: 200, display: "flex", alignItems: "flex-end", gap: 12, padding: "20px 10px 10px", borderBottom: "1px solid rgba(255,255,255,0.1)", borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
                      {trends.map((t) => {
                        const tripPct = t.trips > 0 ? Math.max(20, Math.round((t.trips / maxVal) * 100)) : 0;
                        const userPct = t.users > 0 ? Math.max(20, Math.round((t.users / maxVal) * 100)) : 0;

                        return (
                          <div key={t.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, width: "100%", justifyContent: "center", height: "100%" }}>
                              {/* Trips Bar */}
                              <div style={{ flex: 1, maxWidth: 24, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                                {t.trips > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#2dd4bf", marginBottom: 2 }}>{t.trips}</span>}
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${tripPct}%`,
                                    background: "linear-gradient(180deg, #2dd4bf 0%, #14b8a6 100%)",
                                    borderRadius: "4px 4px 0 0",
                                    transition: "height 0.4s ease",
                                  }}
                                  title={`${t.trips} Trips in ${t.month}`}
                                />
                              </div>

                              {/* Users Bar */}
                              <div style={{ flex: 1, maxWidth: 24, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                                {t.users > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", marginBottom: 2 }}>{t.users}</span>}
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${userPct}%`,
                                    background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
                                    borderRadius: "4px 4px 0 0",
                                    transition: "height 0.4s ease",
                                  }}
                                  title={`${t.users} Users registered in ${t.month}`}
                                />
                              </div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{t.month}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Wireframe Pie Chart & Region Share */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}><PieChart size={15} strokeWidth={2} /> Destination Region Share</h3>
                  <div style={{ width: "100%", height: 16, borderRadius: 8, background: "rgba(255,255,255,0.06)", display: "flex", overflow: "hidden" }}>
                    {(analytics?.regionDistribution || []).map((r) => (
                      <div key={r.region} style={{ width: `${r.percentage}%`, background: r.color }} title={r.region} />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                    {(analytics?.regionDistribution || []).map((r) => (
                      <div key={r.region} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.color }} /> {r.region}
                        </span>
                        <strong style={{ color: "#fff" }}>{r.percentage}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
