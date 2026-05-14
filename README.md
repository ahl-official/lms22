# LMS Platform

A full-stack Learning Management System with voice assessments, AI test generation, and role-based access.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | **MongoDB** + Mongoose |
| Audio Storage | **MongoDB GridFS** (built-in, no S3/R2 needed) |
| Vector DB | **Pinecone** (voice attempt embeddings) |
| AI | OpenAI GPT-4o-mini + text-embedding-3-small |
| Transcription | AssemblyAI |
| Video | YouTube embed + Gumlet embed |

---

## Quick Start

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Fill in your values
```

Required values in `.env`:

```env
PORT=5000
JWT_SECRET=your-long-random-secret
MONGODB_URI=mongodb://localhost:27017/lms   # or Atlas URI

PINECONE_API_KEY=...
PINECONE_INDEX_NAME=lms-voice-attempts

OPENAI_API_KEY=...
ASSEMBLYAI_API_KEY=...

# Optional (for video transcript fetching)
YOUTUBE_API_KEY=...
GUMLET_API_KEY=...

FRONTEND_URL=http://localhost:5173
```

### 3. Set up Pinecone index

Create an index named `lms-voice-attempts`:
- **Dimensions:** 1536
- **Metric:** cosine

### 4. Seed the database

```bash
cd backend
npm run seed
```

Creates the default admin and sample departments.

### 5. Run

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Open http://localhost:5173

**Default login:** `admin@lms.com` / `Admin@123`

---

## How audio storage works

Voice recordings are stored directly in **MongoDB GridFS** — no AWS S3 or Cloudflare R2 required. When a trainee submits a voice test:

1. Audio buffer is uploaded to GridFS (`voice_recordings` bucket)
2. The `_id` of the GridFS file is stored in the `Attempt` document
3. Playback is served via `GET /api/attempts/:id/recording` which streams directly from GridFS

---

## Project Structure

```
lms/
├── backend/
│   ├── server.js
│   ├── .env.example
│   └── src/
│       ├── config/
│       │   ├── db.js          # Mongoose connection
│       │   ├── gridfs.js      # Audio upload/stream/delete via GridFS
│       │   └── pinecone.js    # Vector DB helpers
│       ├── models/
│       │   ├── User.js
│       │   ├── Department.js
│       │   ├── Course.js
│       │   ├── Test.js
│       │   ├── Enrollment.js
│       │   ├── Attempt.js
│       │   └── Notification.js
│       ├── middleware/
│       │   ├── auth.js        # JWT authenticate + authorize
│       │   └── upload.js      # multer memoryStorage for audio
│       ├── services/
│       │   ├── aiService.js         # OpenAI test gen + scoring + embeddings
│       │   ├── transcriptService.js # YouTube / Gumlet / AssemblyAI
│       │   └── attemptService.js    # Written + voice attempt pipeline
│       ├── routes/
│       │   ├── auth.js, courses.js, tests.js
│       │   ├── attempts.js    # includes /recording GridFS stream endpoint
│       │   ├── enrollments.js, users.js, analytics.js
│       └── db/
│           └── seed.js        # Admin + departments seed
└── frontend/
    └── src/
        ├── components/        # Layout, VideoPlayer, VideoInput, TestTaker,
        │                      #   VoiceRecorder, ScoreBadge
        ├── pages/
        │   ├── auth/Login.jsx
        │   ├── admin/         # Overview, Users, AllCourses
        │   ├── trainer/       # Courses, CreateCourse, Trainees, Analytics
        │   └── trainee/       # MyCourses, CourseView, TestResult
        ├── hooks/             # useAuth, useVoiceRecorder, useVideoDetector
        ├── services/api.js    # Axios + all API functions
        └── store/authStore.js # Zustand persisted auth
```

---

## Roles

| Role | Can do |
|------|--------|
| **Admin** | Manage all users, view all courses, platform stats |
| **Trainer** | Create/edit courses, generate AI tests, enroll trainees, view analytics |
| **Trainee** | Watch videos, take written/voice tests, view results |

---

## Scripts

```bash
# Backend
npm run dev      # nodemon
npm start        # production
npm run seed     # seed admin + departments

# Frontend
npm run dev      # Vite dev server
npm run build    # production build
```
