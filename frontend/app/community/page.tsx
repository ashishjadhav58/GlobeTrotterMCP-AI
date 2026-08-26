import { Suspense } from "react";
import CommunityTab from "@/components/community/CommunityTab";

export default function CommunityPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading community feed...</div>}>
      <CommunityTab />
    </Suspense>
  );
}
