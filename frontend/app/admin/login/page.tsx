import { Suspense } from "react";
import AdminLogin from "@/components/admin/AdminLogin";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading Admin Authentication...</div>}>
      <AdminLogin />
    </Suspense>
  );
}
