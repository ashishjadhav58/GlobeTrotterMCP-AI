import { Suspense } from "react";
import CalendarView from "@/components/calendar/CalendarView";

export default function CalendarWithTripIdPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading calendar view...</div>}>
      <CalendarView />
    </Suspense>
  );
}
