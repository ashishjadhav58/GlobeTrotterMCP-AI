"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/api";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/itinerary",
  "/trip-budget",
  "/community"
];

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some(path => pathname?.startsWith(path));
    
    if (!isAuthenticated() && !isPublic) {
      setAuthorized(false);
      router.replace("/login");
    } else {
      setAuthorized(true);
    }
  }, [pathname, router]);

  const isPublic = PUBLIC_PATHS.some(path => pathname?.startsWith(path));
  
  if (!authorized && !isPublic) {
    // Return null while redirecting to prevent flash of protected content
    return null; 
  }

  return <>{children}</>;
}
