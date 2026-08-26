"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageSquare, MapPin, Heart, MessageCircle, Bookmark, Share2 } from "lucide-react";
import { communityApi, CommunityPostItem, getUser, User, getGlobalCountriesAndCities, uploadProfileImage } from "@/lib/api";

const REGIONS = [
  { id: "all", label: "All Regions" },
  { id: "Europe", label: "Europe" },
  { id: "Asia", label: "Asia" },
  { id: "Americas", label: "Americas" },
];

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  { id: "Travel Story", label: "Travel Story" },
  { id: "Itinerary & Tips", label: "Itinerary & Tips" },
  { id: "Adventure", label: "Adventure" },
  { id: "Culture & History", label: "Culture & History" },
];

const SORT_OPTIONS = [
  { id: "recent", label: "Most Recent" },
  { id: "popular", label: "Most Popular (Likes)" },
  { id: "title", label: "Alphabetical" },
];

export default function CommunityTab() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  const [posts, setPosts] = useState<CommunityPostItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter Controls (Matching Wireframe)
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState("region"); // 'region' or 'category'
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  // Interaction State
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  // Modal State for + Share Experience
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [countriesCities, setCountriesCities] = useState<Record<string, string[]>>({});
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [newRegion, setNewRegion] = useState("Europe");
  const [newCategory, setNewCategory] = useState("Travel Story");
  const [newImage, setNewImage] = useState("");
  const newImageFileRef = useRef<HTMLInputElement>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Detailed Modal View
  const [selectedDetailPost, setSelectedDetailPost] = useState<CommunityPostItem | null>(null);

  useEffect(() => {
    setUser(getUser());
    getGlobalCountriesAndCities().then((data) => {
      setCountriesCities(data);
    });
  }, []);

  // Fetch Community Feed Posts
  useEffect(() => {
    setLoading(true);
    communityApi
      .getPosts({
        search: searchQuery,
        region: selectedRegion,
        category: selectedCategory,
        sortBy,
      })
      .then((res) => {
        setPosts(res.posts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [searchQuery, selectedRegion, selectedCategory, sortBy]);

  const handleLikePost = async (post: CommunityPostItem) => {
    const isLiked = likedPosts[post.id];
    setLikedPosts((prev) => ({ ...prev, [post.id]: !isLiked }));

    // Optimistically update count
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, likesCount: p.likesCount + (isLiked ? -1 : 1) } : p))
    );

    if (!isLiked) {
      try {
        await communityApi.likePost(post.id);
      } catch (err) {}
    }
  };

  const handleToggleBookmark = (postId: string) => {
    setBookmarkedPosts((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this community post?")) return;
    try {
      await communityApi.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete post.");
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!commentText.trim()) return;

    try {
      const res = await communityApi.addComment(postId, commentText.trim());
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments: [...(p.comments || []), res.comment] } : p))
      );
      setCommentText("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to add comment.");
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setPublishing(true);
    try {
      const uploadedImage = newImageFile
        ? await uploadProfileImage(newImageFile)
        : newImage.trim() || undefined;
      const res = await communityApi.createPost({
        title: newTitle.trim(),
        content: newContent.trim(),
        location: selectedCity && selectedCountry ? `${selectedCity}, ${selectedCountry}` : 'Global',
        region: newRegion,
        category: newCategory,
        image: uploadedImage,
      });

      setPosts([res.post, ...posts]);
      setNewTitle("");
      setSelectedCountry("");
      setSelectedCity("");
      setNewContent("");
      setNewImage("");
      setNewImageFile(null);
      if (newImageFileRef.current) newImageFileRef.current.value = "";
      setIsShareModalOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to publish post.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090c", color: "#fff", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 100 }}>
      {/* Background Orbs */}
      <div style={{ position: "fixed", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(20,184,166,0.06) 0%,transparent 70%)", top: "-15%", right: "-10%", pointerEvents: "none", zIndex: 0 }} />

      {/* Header */}
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
          <button
            onClick={() => setIsShareModalOpen(true)}
            style={{ background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(20,184,166,0.3)" }}
          >
            + Share Experience
          </button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(20,184,166,0.15)", border: "1.5px solid rgba(45,212,191,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2dd4bf" }}>
            {user?.firstName?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 24, position: "relative", zIndex: 1 }}>
        {/* Top Control Bar (EXACT MATCH FOR WIREFRAME: Search bar ..... | Group by | Filter | Sort by...) */}
        <div style={{ ...cardStyle, padding: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Search bar */}
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", display: "flex" }}><Search size={13} strokeWidth={2} /></span>
            <input
              type="text"
              placeholder="Search bar ......"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", padding: "10px 14px 10px 36px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
            />
          </div>

          {/* Group by */}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={selectControlStyle}>
            <option value="region" style={{ background: "#0a0c10" }}>Group by Region</option>
            <option value="category" style={{ background: "#0a0c10" }}>Group by Category</option>
          </select>

          {/* Filter */}
          <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)} style={selectControlStyle}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id} style={{ background: "#0a0c10" }}>Filter: {r.label}</option>
            ))}
          </select>

          {/* Sort by... */}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectControlStyle}>
            {SORT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id} style={{ background: "#0a0c10" }}>Sort by: {s.label}</option>
            ))}
          </select>
        </div>

        {/* Section Heading (Matching Wireframe: "Community tab") */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 2 }}>
            Community tab
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            Discover and share authentic travel stories, itineraries, and experiences with fellow trotters
          </p>
        </div>

        {/* Community Feed List (EXACT MATCH FOR WIREFRAME: Circular avatars on left + Boxed experience cards) */}
        {loading ? (
          <div style={{ ...cardStyle, padding: "40px 24px", textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
            Loading community experiences...
          </div>
        ) : posts.length === 0 ? (
          <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center", color: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ marginBottom: 8 }}><MessageSquare size={36} color="rgba(255,255,255,0.4)" /></div>
            No community posts found matching your search. Be the first to share your experience!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {posts.map((post) => {
              const isLiked = !!likedPosts[post.id];
              const isBookmarked = !!bookmarkedPosts[post.id];
              const isCommentsOpen = activeCommentPostId === post.id;
              const dateStr = new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

              return (
                <div key={post.id} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  {/* Circular User Avatar on Left (Matching Wireframe ○ Circle) */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "rgba(45,212,191,0.15)",
                      border: "2px solid rgba(45,212,191,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#2dd4bf",
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                  >
                    {post.authorName[0]?.toUpperCase() || "U"}
                  </div>

                  {/* Main Boxed Experience Card (Matching Wireframe Big Box) */}
                  <div style={{ ...cardStyle, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Author Info Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{post.authorName}</h3>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {dateStr} {post.location ? <><MapPin size={11} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle" }} /> {post.location}</> : ""}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {post.category && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#2dd4bf", background: "rgba(45,212,191,0.1)", padding: "3px 9px", borderRadius: 99 }}>
                            {post.category}
                          </span>
                        )}
                        {post.region && (
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)", padding: "3px 9px", borderRadius: 99 }}>
                            {post.region}
                          </span>
                        )}
                        {(user?.id === post.userId || user?.role === "ADMIN" || (user?.firstName && post.authorName.toLowerCase().includes(user.firstName.toLowerCase()))) && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            style={{
                              background: "rgba(239,68,68,0.15)",
                              border: "1px solid rgba(239,68,68,0.3)",
                              borderRadius: 8,
                              padding: "4px 10px",
                              color: "#f87171",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                              marginLeft: 4,
                            }}
                            title="Delete this community post"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Post Title */}
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>{post.title}</h2>

                    {/* Post Image */}
                    {post.image && (
                      <div
                        style={{
                          width: "100%",
                          height: 220,
                          borderRadius: 12,
                          backgroundImage: `url(${post.image})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                    )}

                    {/* Content text */}
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: 0 }}>
                      {post.content}
                    </p>

                    {/* Interactive Actions Footer (Like, Comment, Bookmark, View Details) */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {/* Like Button */}
                        <button
                          onClick={() => handleLikePost(post)}
                          style={{
                            background: isLiked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isLiked ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                            borderRadius: 8,
                            padding: "6px 12px",
                            color: isLiked ? "#f87171" : "rgba(255,255,255,0.6)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Heart size={14} fill={isLiked ? "currentColor" : "none"} strokeWidth={2} /> {post.likesCount} Likes
                        </button>

                        {/* Comment Button */}
                        <button
                          onClick={() => setActiveCommentPostId(isCommentsOpen ? null : post.id)}
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <MessageCircle size={14} strokeWidth={2} /> {post.comments?.length || 0} Comments
                        </button>

                        {/* Bookmark Button */}
                        <button
                          onClick={() => handleToggleBookmark(post.id)}
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: isBookmarked ? "#2dd4bf" : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                          {isBookmarked ? "Saved" : "Save"}
                        </button>

                        {/* Share Button */}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/community?postId=${post.id}`);
                            alert("Post link copied!");
                          }}
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          <Share2 size={14} strokeWidth={2} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
                          Share
                        </button>
                      </div>

                      {/* View Experience Details */}
                      <button
                        onClick={() => setSelectedDetailPost(post)}
                        style={{ background: "none", border: "none", color: "#2dd4bf", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        View Experience →
                      </button>
                    </div>

                    {/* Expandable Comments Drawer */}
                    {isCommentsOpen && (
                      <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px dashed rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            placeholder="Write a comment..."
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            style={{ flex: 1, padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 12, outline: "none" }}
                          />
                          <button
                            onClick={() => handleAddComment(post.id)}
                            style={{ padding: "8px 14px", background: "#2dd4bf", border: "none", borderRadius: 8, color: "#07090c", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >
                            Post
                          </button>
                        </div>

                        {post.comments && post.comments.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {post.comments.map((c) => (
                              <div key={c.id} style={{ background: "rgba(255,255,255,0.02)", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
                                <strong style={{ color: "#2dd4bf" }}>{c.authorName}: </strong>
                                <span style={{ color: "rgba(255,255,255,0.8)" }}>{c.content}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal 1: + Share Experience Modal */}
      {isShareModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsShareModalOpen(false); }}
        >
          <div style={{ width: "100%", maxWidth: 480, background: "#0d1014", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "28px 28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Share Community Experience</h3>
              <button onClick={() => setIsShareModalOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 16 }}>×</button>
            </div>

            <form onSubmit={handlePublishPost} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input type="text" placeholder="e.g. 5 Days in Paris: Hidden Gems & Tips" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required style={inputStyle} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Country</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => {
                      setSelectedCountry(e.target.value);
                      setSelectedCity("");
                    }}
                    style={{ ...inputStyle, background: "#0d1014" }}
                  >
                    <option value="" style={{ background: "#0d1014" }}>Select Country</option>
                    {Object.keys(countriesCities).map((c) => (
                      <option key={c} value={c} style={{ background: "#0d1014" }}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
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

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Region</label>
                  <select value={newRegion} onChange={(e) => setNewRegion(e.target.value)} style={inputStyle}>
                    <option value="Europe" style={{ background: "#0a0c10" }}>Europe</option>
                    <option value="Asia" style={{ background: "#0a0c10" }}>Asia</option>
                    <option value="Americas" style={{ background: "#0a0c10" }}>Americas</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={inputStyle}>
                    <option value="Travel Story" style={{ background: "#0a0c10" }}>Travel Story</option>
                    <option value="Itinerary & Tips" style={{ background: "#0a0c10" }}>Itinerary & Tips</option>
                    <option value="Adventure" style={{ background: "#0a0c10" }}>Adventure</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Experience Image (Optional)</label>
                <input
                  ref={newImageFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setNewImageFile(file);
                    if (file) setNewImage("");
                  }}
                  style={{ ...inputStyle, padding: 9, marginBottom: 8 }}
                />
                <input type="url" placeholder="Or paste an image URL" value={newImage} onChange={(e) => setNewImage(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Experience / Story Content</label>
                <textarea rows={4} placeholder="Share your travel recommendations, tips or story..." value={newContent} onChange={(e) => setNewContent(e.target.value)} required style={{ ...inputStyle, resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setIsShareModalOpen(false)} style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={publishing} style={{ flex: 2, padding: "12px", background: "linear-gradient(135deg,#14b8a6 0%,#0d9488 100%)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{publishing ? "Publishing..." : "Publish Post"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: View Detailed Experience Modal */}
      {selectedDetailPost && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedDetailPost(null); }}
        >
          <div style={{ width: "100%", maxWidth: 540, background: "#0d1014", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 28, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: "#2dd4bf", fontWeight: 700, textTransform: "uppercase" }}>Shared Experience</span>
              <button onClick={() => setSelectedDetailPost(null)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 30, height: 30, color: "rgba(255,255,255,0.5)", fontSize: 16, cursor: "pointer" }}>×</button>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{selectedDetailPost.title}</h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              By <strong>{selectedDetailPost.authorName}</strong> {selectedDetailPost.location ? <><MapPin size={12} strokeWidth={2} style={{ display: "inline", verticalAlign: "middle" }} /> {selectedDetailPost.location}</> : ""}
            </div>
            {selectedDetailPost.image && (
              <div style={{ width: "100%", height: 240, borderRadius: 12, backgroundImage: `url(${selectedDetailPost.image})`, backgroundSize: "cover", backgroundPosition: "center", marginBottom: 16 }} />
            )}
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.7, marginBottom: 20 }}>{selectedDetailPost.content}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 20,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const selectControlStyle: React.CSSProperties = {
  padding: "9px 12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "rgba(255,255,255,0.7)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
  marginBottom: 6,
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  color: "#fff",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};
