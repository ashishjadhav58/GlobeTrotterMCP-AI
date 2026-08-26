"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/api";
import LandingPage from "@/components/landing-page/LandingPage";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    // Minimal full-screen loader while auth check runs
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#07090c",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth={2} style={{ animation: "spin 0.9s linear infinite" }}>
            <path strokeLinecap="round" d="M12 4a8 8 0 0 1 8 8" />
          </svg>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Loading...</span>
        </div>
      </div>
    );
  }

  return <LandingPage />;
}
