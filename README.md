# 🌍 GlobeTrotter

GlobeTrotter is a modern, AI-powered travel planner designed to curate custom itineraries, manage travel budgets, and inspire global exploration. Built with a sleek interface and powerful backend, GlobeTrotter leverages the latest Google Gemini AI models to generate realistic, budget-conscious daily trip plans.

---

## ✨ Key Features

- **🤖 AI-Powered Itinerary Generation**  
  Uses the cutting-edge **Google Gemini AI** (`gemini-3.1-pro-preview`) to dynamically build realistic day-by-day travel itineraries that respect your location, dates, and max budget. No generic dummy data—every activity, landmark, and restaurant is tailored to your trip.

- **📊 Comprehensive Dashboard & Trip Management**  
  Manage your upcoming trips, track past journeys, and dynamically re-generate AI itineraries if your plans change.

- **🎯 Activity Discovery**  
  Browse popular local activities, sightseeing spots, and adventures, filtering them by duration, cost, and popularity.

- **💬 Community Hub**  
  Share your travel experiences with a vibrant community. View trending destinations, like community posts, and engage with other travelers.

- **🛡️ Secure Authentication**  
  Robust JWT-based authentication system featuring password hashing (bcrypt), forgot-password flows, and secure local storage.

- **📈 Admin Panel & Analytics**  
  A dedicated portal for administrators to monitor user trends, view destination analytics, toggle user account statuses, and oversee platform health.

---

## 🛠️ Technology Stack

### Frontend
- **Framework:** [Next.js](https://nextjs.org/) (React, App Router)
- **Language:** TypeScript
- **Styling:** Custom Vanilla CSS (Dark mode, glassmorphism UI, interactive micro-animations)

### Backend
- **Runtime:** [Node.js](https://nodejs.org/)
- **Framework:** [Express.js](https://expressjs.com/)
- **Database ORM:** [Prisma](https://www.prisma.io/)
- **Database:** PostgreSQL (hosted on [Neon](https://neon.tech/))
- **AI Integration:** Google Gemini REST API

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Google Gemini API Key

### 1. Clone & Install Dependencies
First, clone the repository. Then, install dependencies for both the frontend and backend.

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Variables

#### Backend (`backend/.env`)
Create a `.env` file in the `backend` directory with the following keys:
```env
# Database
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# JWT Auth Secret
JWT_SECRET="your_super_secret_jwt_key"

# Gemini AI API Key
GEMINI_API_KEY="your_google_gemini_api_key"

# Server Port
PORT=5001
```

#### Frontend (`frontend/.env.local`)
Create an `.env.local` file in the `frontend` directory:
```env
NEXT_PUBLIC_API_URL="http://127.0.0.1:5001"
```

### 3. Database Setup & Seeding
From the `backend` directory, run Prisma migrations to build your schema, then seed the database with initial data (activities, communities, and admin user).

```bash
cd backend
npx prisma db push
node seed.js
node seedActivities.js
node seedCommunity.js
```

### 4. Run the Application

Start both the frontend and backend servers.

**Run Backend (API):**
```bash
cd backend
node server.js
```
*(The backend runs on `http://localhost:5001`)*

**Run Frontend (UI):**
```bash
cd frontend
npm run dev
```
*(The frontend runs on `http://localhost:3000`)*

---

## 📂 Project Structure

```
GlobeTrotter/
├── backend/
│   ├── controllers/      # API logic (auth, trips, activities, admin, AI)
│   ├── middleware/       # JWT auth & Admin route guards
│   ├── routes/           # Express endpoint definitions
│   ├── utils/            # Prisma client instance
│   ├── prisma/           # Database schema (schema.prisma)
│   └── server.js         # Entry point for backend
│
└── frontend/
    ├── app/              # Next.js App Router (pages & layouts)
    ├── components/       # Reusable React components (AdminDashboard, PlanTrip, etc.)
    ├── lib/              # API fetch wrappers and utilities
    └── public/           # Static assets
```

## 🔒 Security & Performance
- **Protected Routes:** User routes are guarded on both the frontend (Auth redirect) and backend (JWT verification). Admin routes have additional RBAC validation.
- **Graceful Error Handling:** Gemini AI generation fallbacks prevent total application crashes when the AI model returns invalid structured data.
- **Next.js Proxy:** Cross-origin API calls are seamlessly managed through Next.js rewrite configurations in development.

---
