import { Suspense } from "react";
import TripBudget from "@/components/trip-budget/TripBudget";

export default function TripBudgetWithIdPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading trip budget breakdown...</div>}>
      <TripBudget />
    </Suspense>
  );
}
