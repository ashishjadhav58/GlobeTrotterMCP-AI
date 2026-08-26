/**
 * GlobeTrotter API Client
 * Central layer for all backend communication.
 */

const BASE_URL = "";
const S3_URL = process.env.NEXT_PUBLIC_S3_URL;
const S3_JWT = process.env.NEXT_PUBLIC_S3_JWT;

export async function uploadProfileImage(file: File): Promise<string> {
  if (!S3_URL || !S3_JWT) {
    throw new Error("Profile image upload is not configured.");
  }

  const imageBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const [, base64] = result.split(",");
      if (!base64) reject(new Error("Could not read the profile image."));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read the profile image."));
    reader.readAsDataURL(file);
  });

  const response = await fetch(S3_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${S3_JWT}`,
    },
    body: JSON.stringify({ contentType: file.type, imageBase64 }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.message || "Profile image upload failed.");
  }

  const imageUrl = result.imageUrl || result.url || result.data?.imageUrl || result.data?.url;
  if (!imageUrl) throw new Error("Profile image upload did not return an image URL.");
  return imageUrl;
}

// ── Token helpers ──────────────────────────────────
export const getToken = (): string | null =>
  typeof window !== "undefined" ? localStorage.getItem("gt_token") : null;

export const setToken = (token: string) =>
  localStorage.setItem("gt_token", token);

export const removeToken = () => localStorage.removeItem("gt_token");

export const setUser = (user: User) =>
  localStorage.setItem("gt_user", JSON.stringify(user));

export const getUser = (): User | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("gt_user");
  return raw ? JSON.parse(raw) : null;
};

export const clearAuth = () => {
  removeToken();
  localStorage.removeItem("gt_user");
};

export const isAuthenticated = (): boolean => !!getToken();

// ── Types ──────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  email: string;
  role?: "USER" | "ADMIN" | string;
  status?: "Active" | "Disabled" | string;
  photoUrl?: string | null;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  city?: string | null;
  country?: string | null;
  additionalInfo?: string | null;
  createdAt: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface ApiError {
  error: string;
}

// ── Core fetch wrapper ─────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  
  const contentType = res.headers.get("content-type") || "";
  let data: any = null;

  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch (e) {
      // JSON parsing failed
    }
  } else {
    try {
      const text = await res.text();
      data = { error: text || res.statusText || "Request failed" };
    } catch (e) {
      // Reading text failed
    }
  }

  if (!res.ok) {
    const errMsg = data?.error || `Request failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

// ── Public fetch wrapper (no auth token) ──────────────
async function publicFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  const contentType = res.headers.get("content-type") || "";
  let data: any = null;

  if (contentType.includes("application/json")) {
    try { data = await res.json(); } catch (e) { /* ignore */ }
  } else {
    try {
      const text = await res.text();
      data = { error: text || res.statusText || "Request failed" };
    } catch (e) { /* ignore */ }
  }

  if (!res.ok) {
    const errMsg = data?.error || `Request failed with status ${res.status}`;
    throw new Error(errMsg);
  }

  return data as T;
}

// ── Auth API ───────────────────────────────────────
export interface LoginPayload {
  username?: string;
  email?: string;
  password: string;
}

export interface SignupPayload {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  phoneNumber?: string;
  city?: string;
  country?: string;
  additionalInfo?: string;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  signup: (payload: SignupPayload) =>
    apiFetch<AuthResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  me: () => apiFetch<{ user: User }>("/api/auth/me"),

  forgotPassword: (email: string) =>
    apiFetch<{ message: string; resetToken?: string }>(
      "/api/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),

  updateProfile: (payload: {
    email?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
    phoneNumber?: string;
    city?: string;
    country?: string;
    additionalInfo?: string;
  }) =>
    apiFetch<{ message: string; user: User }>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

// ── Dashboard & Trip API Interfaces ───────────────
export interface City {
  id: string;
  name: string;
  country: string;
  region: string;
  image?: string | null;
}

export interface TripStop {
  id: string;
  tripId: string;
  cityId: string;
  city: City;
  createdAt: string;
}

export interface TripData {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  coverImage?: string | null;
  maxBudget?: number;
  destinationCount?: number;
  status?: "completed" | "upcoming" | "ongoing" | string;
  tripStops?: TripStop[];
  tripActivities?: any[];
  itinerary?: string | null;
  expenses?: string | null;
  createdAt: string;
}

export interface DashboardResponse {
  success: boolean;
  message: string;
  data: {
    topRegionalSelections: any[];
    previousTrips: TripData[];
    pagination: {
      previousTrips: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      };
    };
  };
}

export const dashboardApi = {
  getDashboard: () =>
    apiFetch<DashboardResponse>("/api/dashboard"),

  getRegionalSelections: (params?: {
    groupBy?: "region" | "country";
    sortBy?: "selectionCount" | "uniqueTravelerCount" | "name";
    sortOrder?: "asc" | "desc";
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => query.set(key, value));
    }
    return apiFetch<{
      success: boolean;
      message: string;
      data: Array<{
        group: string;
        selectionCount: number;
        uniqueTravelerCount: number;
      }>;
    }>(`/api/dashboard/regional-selections?${query.toString()}`);
  },

  getPreviousTrips: (params?: {
    scope?: "mine" | "all";
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          query.set(key, String(val));
        }
      });
    }
    const queryString = query.toString();
    return apiFetch<{
      success: boolean;
      message: string;
      data: TripData[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      };
    }>(`/api/dashboard/previous-trips${queryString ? `?${queryString}` : ""}`);
  },
};

export interface CreateTripPayload {
  name: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  coverImage?: string;
  maxBudget?: number;
  location?: string;
  cityId?: string;
  itinerary?: string;
  expenses?: string;
}

export const tripApi = {
  create: (payload: CreateTripPayload) =>
    apiFetch<{ message: string; trip: any }>("/api/trips", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createTrip: (payload: CreateTripPayload) =>
    apiFetch<{ message: string; trip: TripData }>("/api/trips", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getTripById: (id: string) =>
    apiFetch<{ trip: TripData }>(`/api/trips/${id}`),

  update: (id: string, payload: Partial<CreateTripPayload>) =>
    apiFetch<{ message: string; trip: any }>(`/api/trips/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/api/trips/${id}`, {
      method: "DELETE",
    }),

  addTripStop: (tripId: string, payload: { cityId?: string; cityName?: string }) =>
    apiFetch<{ message: string; tripStop: TripStop }>(`/api/trips/${tripId}/stops`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteTripStop: (tripId: string, stopId: string) =>
    apiFetch<{ message: string }>(`/api/trips/${tripId}/stops/${stopId}`, {
      method: "DELETE",
    }),

  getCities: () =>
    apiFetch<{ cities: City[] }>("/api/trips/cities"),

  regenerateItinerary: (tripId: string) =>
    apiFetch<{ message: string; trip: TripData }>(`/api/trips/${tripId}/regenerate-itinerary`, {
      method: "POST",
    }),
};

// Public (unauthenticated) trip API — for shared links
export const publicTripApi = {
  getTripById: (id: string) =>
    publicFetch<{ trip: TripData }>(`/api/trips/${id}/public`),
};

// Central helper to load all countries and their cities dynamically (with local caching)
export const getGlobalCountriesAndCities = async (): Promise<Record<string, string[]>> => {
  const FALLBACK_LIST: Record<string, string[]> = {
    "India": ["Goa", "Mumbai", "Delhi", "Jaipur", "Agra", "Kerala"],
    "France": ["Paris"],
    "UAE": ["Dubai"],
    "UK": ["London"],
    "Japan": ["Tokyo"],
    "USA": ["New York"],
    "Switzerland": ["Zurich"],
    "Italy": ["Rome"],
    "Indonesia": ["Bali"]
  };

  if (typeof window === "undefined") return FALLBACK_LIST;

  try {
    const cached = localStorage.getItem("gt_countries_cities");
    if (cached) {
      return JSON.parse(cached);
    }
    const res = await fetch("https://countriesnow.space/api/v0.1/countries");
    const json = await res.json();
    if (json && !json.error && json.data) {
      const mapped: Record<string, string[]> = {};
      json.data.forEach((item: any) => {
        mapped[item.country] = item.cities || [];
      });
      localStorage.setItem("gt_countries_cities", JSON.stringify(mapped));
      return mapped;
    }
  } catch (err) {
    console.error("Failed to load dynamic countries/cities, using fallback:", err);
  }
  return FALLBACK_LIST;
};

// ── Activity API (Screen 8) ───────────────────────
export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  category: string;
  costType: string;
  costAmount: number;
  duration: string;
  rating: number;
  popularity: number;
  image?: string | null;
  cityId?: string | null;
  cityName?: string | null;
  createdAt?: string;
}

export interface TripActivityItem {
  id: string;
  tripId: string;
  activityId: string;
  cityId?: string | null;
  activity: ActivityItem;
  createdAt: string;
}

export const activityApi = {
  getActivities: (params?: {
    search?: string;
    city?: string;
    category?: string;
    costType?: string;
    duration?: string;
    sortBy?: string;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          query.set(key, String(val));
        }
      });
    }
    const qStr = query.toString();
    return apiFetch<{ activities: ActivityItem[] }>(`/api/activities${qStr ? `?${qStr}` : ""}`);
  },

  addActivityToTrip: (payload: { tripId: string; activityId: string; cityId?: string }) =>
    apiFetch<{ message: string; tripActivity: TripActivityItem }>("/api/activities/trip", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  removeActivityFromTrip: (tripActivityId: string) =>
    apiFetch<{ message: string }>(`/api/activities/trip/${tripActivityId}`, {
      method: "DELETE",
    }),

  getTripActivities: (tripId: string) =>
    apiFetch<{ tripActivities: TripActivityItem[] }>(`/api/activities/trip/${tripId}`),
};

// ── Community API (Screen 10) ─────────────────────
export interface PostCommentItem {
  id: string;
  postId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface CommunityPostItem {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar?: string | null;
  title: string;
  content: string;
  location?: string | null;
  region?: string | null;
  category?: string | null;
  image?: string | null;
  likesCount: number;
  comments?: PostCommentItem[];
  createdAt: string;
}

export const communityApi = {
  getPosts: (params?: {
    search?: string;
    region?: string;
    category?: string;
    sortBy?: string;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          query.set(key, String(val));
        }
      });
    }
    const qStr = query.toString();
    return apiFetch<{ posts: CommunityPostItem[] }>(`/api/community${qStr ? `?${qStr}` : ""}`);
  },

  getPostById: (id: string) =>
    apiFetch<{ post: CommunityPostItem }>(`/api/community/${id}`),

  createPost: (payload: {
    title: string;
    content: string;
    location?: string;
    region?: string;
    category?: string;
    image?: string;
  }) =>
    apiFetch<{ message: string; post: CommunityPostItem }>("/api/community", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  likePost: (id: string) =>
    apiFetch<{ message: string; likesCount: number }>(`/api/community/${id}/like`, {
      method: "POST",
    }),

  addComment: (id: string, content: string) =>
    apiFetch<{ message: string; comment: PostCommentItem }>(`/api/community/${id}/comment`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  deletePost: (id: string) =>
    apiFetch<{ message: string; id: string }>(`/api/community/${id}`, {
      method: "DELETE",
    }),
};

// ── Admin API (Screen 12) ─────────────────────────
export interface AdminUserItem {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "USER" | "ADMIN" | string;
  status: "Active" | "Disabled" | string;
  createdAt: string;
  _count?: {
    trips: number;
    communityPosts: number;
  };
}

export interface AdminAnalyticsData {
  totalUsers: number;
  activeUsers: number;
  totalTrips: number;
  totalActivities: number;
  totalCommunityPosts: number;
  totalBudgetManaged: number;
  popularCities: Array<{ id: string; name: string; tripsCount: number }>;
  popularActivities: Array<{ name: string; category: string; count: number }>;
  tripTrends: Array<{ month: string; trips: number; users: number }>;
  regionDistribution: Array<{ region: string; percentage: number; color: string }>;
}

export const adminApi = {
  getAnalytics: () =>
    apiFetch<{ analytics: AdminAnalyticsData }>("/api/admin/analytics"),

  getUsers: (params?: { search?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          query.set(key, String(val));
        }
      });
    }
    const qStr = query.toString();
    return apiFetch<{ users: AdminUserItem[] }>(`/api/admin/users${qStr ? `?${qStr}` : ""}`);
  },

  toggleUserStatus: (id: string, status: string) =>
    apiFetch<{ message: string; user: AdminUserItem }>(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  deleteUser: (id: string) =>
    apiFetch<{ message: string }>(`/api/admin/users/${id}`, {
      method: "DELETE",
    }),
};





