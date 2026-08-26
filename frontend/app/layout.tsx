import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "GlobeTrotter — Explore the World",
  description:
    "Join GlobeTrotter and discover breathtaking destinations, plan your dream trips, and connect with fellow adventurers worldwide.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Fixed top-left brand */}
        <div
          style={{
            position: "fixed",
            top: 20,
            left: 28,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            height: 20, // matching header content height
          }}
        >
          <span
            style={{
              fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
              fontSize: 17,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.01em",
              lineHeight: "20px",
              userSelect: "none",
            }}
          >
            GlobeTrotter
          </span>
        </div>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
