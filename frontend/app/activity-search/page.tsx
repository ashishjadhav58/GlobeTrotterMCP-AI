import { Suspense } from "react";
import ActivitySearch from "@/components/activity-search/ActivitySearch";

export default function ActivitySearchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading activity search...</div>}>
      <ActivitySearch />
    </Suspense>
  );
}
