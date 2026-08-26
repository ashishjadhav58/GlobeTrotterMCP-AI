import { Suspense } from "react";
import AdminDashboard from "@/components/admin/AdminDashboard";

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading Admin Dashboard...</div>}>
      <AdminDashboard />
    </Suspense>
  );
}
