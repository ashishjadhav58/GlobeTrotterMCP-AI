"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getUser, tripApi, City, getGlobalCountriesAndCities, uploadProfileImage } from "@/lib/api";
import { AlertTriangle } from "lucide-react";

const SUGGESTIONS = [
  {
    id: "s1",
    title: "Eiffel Tower & Seine Cruise",
    location: "Paris, France",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400",
    description: "Explore iconic landmarks and romantic river cruises.",
  },
  {
    id: "s2",
    title: "Tokyo Ramen & Temple Tour",
    location: "Tokyo, Japan",
    image: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400",
    description: "Immerse in Japanese culture and legendary street food.",
  },
  {
    id: "s3",
    title: "Colosseum & Roman Forum",
    location: "Rome, Italy",
    image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400",
    description: "Walk through ancient history and authentic trattorias.",
  },
  {
    id: "s4",
    title: "Swiss Alps Hiking Trail",
    location: "Zurich, Switzerland",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400",
    description: "Breathtaking mountain peaks and Alpine lake views.",
  },
  {
    id: "s5",
    title: "Bali Beach & Temple Retreat",
    location: "Bali, Indonesia",
    image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400",
    description: "Tropical beaches, rice terraces, and serene retreats.",
  },
  {
    id: "s6",
    title: "New York Skyline & Broadway",
    location: "New York, USA",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400",
    description: "The vibrant heartbeat of Central Park and Broadway shows.",
  },
];

export default function PlanTrip() {
  const router = useRouter();
  const [user, setUser] = useState<{ firstName?: string } | null>(null);

  const [name, setName] = useState("");
  const [countriesCities, setCountriesCities] = useState<Record<string, string[]>>({});
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const coverImageFileRef = useRef<HTMLInputElement>(null);
  const [maxBudget, setMaxBudget] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    setUser(getUser());
    getGlobalCountriesAndCities().then((data) => {
      setCountriesCities(data);
    });
    // Load available cities from DB
    tripApi
      .getCities()
      .then((res) => setCities(res.cities || []))
      .catch(() => {});
  }, []);

  const handleSelectSuggestion = (s: typeof SUGGESTIONS[0]) => {
    setSelectedSuggestion(s.id);
    if (s.location && s.location.includes(",")) {
      const parts = s.location.split(",");
      const cityPart = parts[0].trim();
      const countryPart = parts[1].trim();
      setSelectedCountry(countryPart);
      setSelectedCity(cityPart);
    }
    if (!description) setDescription(`Selected Activity: ${s.title}. ${s.description}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a Trip Name.");
      return;
    }
    if (!startDate) {
      setError("Please select a Start Date.");
      return;
    }
    if (!endDate) {
      setError("Please select an End Date.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError("End Date cannot be earlier than Start Date.");
      return;
    }

    setLoading(true);
    try {
      const uploadedCoverImage = coverImageFile
        ? await uploadProfileImage(coverImageFile)
        : coverImage.trim() || undefined;
      const res = await tripApi.createTrip({
        name: name.trim(),
        startDate,
        endDate,
        description: description.trim() || undefined,
        coverImage: uploadedCoverImage,
        location: selectedCity && selectedCountry ? `${selectedCity}, ${selectedCountry}` : undefined,
        maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
      });

      // Move directly to Itinerary Builder (Screen 5)
      router.push(`/itinerary/${res.trip.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create trip.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 80 }}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />

      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,9,12,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 130, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.12)", height: 20, display: "flex", alignItems: "center", outline: "none" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2dd4bf"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.45)"}
          >
            ← Dashboard
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)", border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf" }}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 28, position: "relative", zIndex: 1 }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Plan a new trip</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Enter trip details to build your custom itinerary</p>
          </div>
          <button onClick={() => router.push("/")} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 16px", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            ← Back
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#f87171", display: "flex", alignItems: "center", gap: 8 }}>
            <span><AlertTriangle size={15} /></span> {error}
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSubmit} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Trip Name */}
          <div>
            <label style={labelStyle}>Trip Name <span style={{ color: "#2dd4bf" }}>*</span></label>
            <input
              type="text"
              placeholder="e.g. Summer in Paris & Swiss Alps"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Country & City Dropdowns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Country <span style={{ color: "#2dd4bf" }}>*</span></label>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  setSelectedCountry(e.target.value);
                  setSelectedCity(""); // reset city when country changes
                }}
                required
                style={{ ...inputStyle, background: "#0d1014" }}
              >
                <option value="" style={{ background: "#0d1014" }}>Select Country</option>
                {Object.keys(countriesCities).map((c) => (
                  <option key={c} value={c} style={{ background: "#0d1014" }}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>City <span style={{ color: "#2dd4bf" }}>*</span></label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                required
                disabled={!selectedCountry}
                style={{
                  ...inputStyle,
                  background: "#0d1014",
                  opacity: selectedCountry ? 1 : 0.6,
                  cursor: selectedCountry ? "pointer" : "not-allowed"
                }}
              >
                <option value="" style={{ background: "#0d1014" }}>Select City</option>
                {selectedCountry && countriesCities[selectedCountry]?.map((city) => (
                  <option key={city} value={city} style={{ background: "#0d1014" }}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date & End Date Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Start Date <span style={{ color: "#2dd4bf" }}>*</span></label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date <span style={{ color: "#2dd4bf" }}>*</span></label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Trip Description */}
          <div>
            <label style={labelStyle}>Trip Description / Notes</label>
            <textarea
              rows={3}
              placeholder="Describe your travel goals, places you want to visit, or highlights..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Optional: Cover Photo URL */}
          <div>
            <label style={labelStyle}>Cover Photo (Optional)</label>
            <input
              ref={coverImageFileRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCoverImageFile(file);
                if (file) setCoverImage("");
              }}
              style={{ ...inputStyle, padding: 9, marginBottom: 8 }}
            />
            <input
              type="url"
              placeholder="Or paste an image URL"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Max Budget */}
          <div>
            <label style={labelStyle}>Maximum Budget in ₹ (Optional)</label>
            <input
              type="number"
              placeholder="e.g. 50000"
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Submit Button */}
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "14px 28px",
                background: loading ? "rgba(20,184,166,0.4)" : "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)",
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 20px rgba(20,184,166,0.3)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              {loading ? (
                <>Saving & Creating Trip...</>
              ) : (
                <>Save & Build Itinerary →</>
              )}
            </button>
          </div>
        </form>

        {/* Suggestion Section for Places to Visit / Activities */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
            Suggestion for Places to Visit / Activities to perform
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            {SUGGESTIONS.map((s) => {
              const isSelected = selectedSuggestion === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => handleSelectSuggestion(s)}
                  style={{
                    ...cardStyle,
                    padding: 16,
                    cursor: "pointer",
                    border: `1.5px solid ${isSelected ? "rgba(45,212,191,0.6)" : "rgba(255,255,255,0.07)"}`,
                    background: isSelected ? "rgba(45,212,191,0.08)" : "rgba(255,255,255,0.03)",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    height: 100,
                    width: "100%",
                    borderRadius: 10,
                    backgroundImage: `url(${s.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    marginBottom: 12,
                    border: "1px solid rgba(255,255,255,0.06)"
                  }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{s.title}</h3>
                  <span style={{ fontSize: 11, color: "#2dd4bf", fontWeight: 600, display: "block", marginBottom: 6 }}>{s.location}</span>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{s.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 24,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.6)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};
