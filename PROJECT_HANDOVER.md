# LMS Platform — Complete Project Handover

**Handover date:** 06 August 2026  
**Application type:** Full-stack Learning Management System  
**Local frontend:** `http://localhost:5173`  
**Local backend:** `http://localhost:5000`

## 1. Executive overview

This project is a web-based Learning Management System for delivering structured training to trainees and measuring their understanding. It supports the complete training lifecycle:

```text
Create users and categories
  → create a course
  → add modules and lessons
  → attach videos and learning material
  → create written, MCQ, or voice assessments
  → assign trainees
  → track lesson progress and test attempts
  → review scores, feedback, analytics, and history
```

The system has three primary roles:

| Role | Main responsibility |
|---|---|
| Administrator | Controls users, trainers, trainees, categories, courses, and platform-level information |
| Trainer | Builds training content, creates tests, assigns trainees, and reviews learning performance |
| Trainee | Consumes assigned training, completes assessments, and reviews personal results |

The application combines normal LMS functionality with AI-assisted content and assessment features. A lesson can have a video, transcript, notes, written questions, MCQs, or a conversational voice assessment. Voice assessments can ask questions, listen to spoken answers, evaluate the answers, and provide feedback.

## 2. Technology stack

### Frontend

- React 18
- Vite
- React Router 6
- Tailwind CSS
- TanStack React Query for server-state fetching and cache invalidation
- Zustand for persisted authentication state
- Axios for API calls
- Chart.js and `react-chartjs-2` for analytics
- Lucide React for icons

The frontend is a single-page application. The browser handles routing, authentication state, forms, video viewing, microphone access, speech recognition, and presentation of test results.

### Backend

- Node.js
- Express
- Mongoose
- JSON Web Tokens for authentication
- bcryptjs for password hashing
- Multer for multipart/audio uploads
- MongoDB GridFS for voice recording storage
- OpenAI-compatible SDK configured for OpenRouter/OpenAI endpoints
- AssemblyAI integration for transcription workflows
- Pinecone integration for embeddings and voice-attempt search
- Axios and YouTube/Gumlet-related integrations for external content

### Data and infrastructure

- MongoDB stores users, courses, lessons, tests, enrollments, progress, attempts, and application data.
- MongoDB GridFS stores uploaded voice recordings without requiring an external object-storage bucket.
- Pinecone can store vector embeddings for voice attempts and related search/retrieval features.
- AI services are accessed from the backend, so API keys are not exposed directly in the browser.

## 3. Repository structure

```text
project-root/
├── backend/
│   ├── server.js
│   ├── .env.example
│   ├── package.json
│   ├── voices/
│   └── src/
│       ├── config/
│       ├── db/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       └── services/
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       ├── services/
│       ├── store/
│       └── utils/
├── api/
├── dist/
├── package.json
├── vercel.json
└── README.md
```

### Frontend areas

- `frontend/src/pages/auth` — login and authentication screens.
- `frontend/src/pages/admin` — administrator dashboard, users, trainers, courses, and platform management.
- `frontend/src/pages/trainer` — trainer dashboard, course authoring, trainees, analytics, and test management.
- `frontend/src/pages/trainee` — assigned courses, course viewer, history, test results, and voice tests.
- `frontend/src/components` — reusable layout, navigation, video, test, role-play, status, and reporting components.
- `frontend/src/hooks` — authentication, video detection, voice recording, and voice speech behavior.
- `frontend/src/services/api.js` — centralized Axios client and endpoint functions.
- `frontend/src/store/authStore.js` — login session persistence and user information.

### Backend areas

- `backend/server.js` — loads environment variables, connects to MongoDB, mounts routes, and starts Express.
- `backend/src/config/db.js` — Mongoose database connection.
- `backend/src/config/gridfs.js` — GridFS upload, retrieval, and deletion helpers.
- `backend/src/config/pinecone.js` — Pinecone client and embedding operations.
- `backend/src/middleware/auth.js` — JWT authentication and role authorization.
- `backend/src/middleware/upload.js` — in-memory multipart upload handling.
- `backend/src/models` — Mongoose schemas.
- `backend/src/routes` — HTTP API controllers.
- `backend/src/services` — business logic and external service integrations.
- `backend/src/db/seed.js` — base administrator and department seed data.
- `backend/src/db/seedDemo.js` — demo data for local testing.

## 4. User journeys

### Administrator journey

1. Admin signs in.
2. Admin creates or manages trainer and trainee accounts.
3. Admin manages categories and platform data.
4. Admin can view course and platform-level information.
5. Admin can deactivate accounts where required.

The administrator is primarily responsible for access control and platform governance. Course authoring is generally a trainer responsibility in the current product flow.

### Trainer journey

1. Trainer signs in.
2. Trainer creates a course and selects its category or department.
3. Trainer adds one or more modules.
4. Trainer adds lessons inside modules.
5. Trainer attaches a video or other lesson content.
6. The system can obtain or store lesson transcript material.
7. Trainer creates a written, MCQ, or voice test.
8. Trainer assigns trainees or manages course enrollment.
9. Trainer reviews completion, scores, attempts, and analytics.

### Trainee journey

1. Trainee signs in.
2. The trainee sees assigned or enrolled courses.
3. The trainee opens a course and selects a lesson.
4. The trainee watches the lesson video and reviews notes or study material.
5. The trainee completes the associated assessment.
6. Progress and attempt data are submitted to the backend.
7. The trainee sees score, feedback, result status, and history.

## 5. Course and lesson model

A course is the top-level training unit. It can contain a course description, category, trainer, modules, lessons, enrollment information, and progress data.

A module groups related lessons. A lesson is the actual learning unit and can contain:

- Title and description
- Video URL or video provider information
- Transcript
- Notes or generated study material
- Duration and completion state
- Linked written, MCQ, or voice test
- Role-playing content where configured

The course viewer coordinates lesson content, module navigation, lesson progress, assessment status, and access rules. A trainee may need to complete or pass a preceding activity before a later assessment becomes available.

## 6. Video and transcript workflow

The system supports video-based learning using embedded video providers such as YouTube and Gumlet, depending on the lesson configuration.

The general workflow is:

1. Trainer adds a video URL or provider reference to a lesson.
2. The backend identifies or stores the lesson source.
3. Transcript data may be fetched from the supported provider or uploaded/processed through the transcript service.
4. The transcript is stored with the lesson or course data.
5. AI-assisted study notes, questions, or assessment material can use the transcript as source context.
6. The trainee views the video and completes the lesson activity.

Relevant backend logic is mainly in `transcriptService.js`, lesson routes, course routes, and the lesson/course models. Video playback and video completion behavior are handled by frontend components and hooks.

## 7. Assessment types

The application supports more than one assessment style.

### Written and MCQ assessments

Written tests may contain multiple-choice questions, short-answer questions, or other structured question types. The trainee submits answers through the browser. The backend stores the attempt and calculates or requests scoring as appropriate.

### Voice assessments

Voice tests are conversational assessments. The browser displays the current question, plays it through the configured TTS provider, listens to the trainee, sends the transcript to the backend, and displays feedback.

The main voice-test routes are:

```text
GET  /api/voice-test/start/:courseId
POST /api/voice-test/next-question
POST /api/voice-test/evaluate-answer
POST /api/voice-test/score
POST /api/voice-test/speech
```

The voice-test route is in:

- [VoiceTest.js](backend/src/routes/VoiceTest.js)

The browser flow is in:

- [VoiceTest.jsx](frontend/src/pages/trainee/VoiceTest.jsx)
- [useVoiceSpeech.js](frontend/src/hooks/useVoiceSpeech.js)

## 8. AI capabilities

AI is used through backend services rather than directly from the frontend.

### Test generation

Course and lesson material can be used to generate assessment questions. The generated output can include questions, expected answers, key points, question types, and scenario information.

### Dynamic questions

During a voice assessment, the backend can generate a follow-up question using the course title, transcript, previous questions, and the trainee’s previous answers. If a dynamic request is unavailable or unsuitable, fallback questions from the configured test are used.

### Answer evaluation

The backend evaluates the meaning of a trainee’s answer rather than requiring an exact script. It considers correctness, completeness, clarity, key points, and client-centered behavior where the test is sales-oriented.

### Final scoring

The final assessment can include:

- Overall score
- Rubric breakdown
- Question-level scores
- Strengths
- Improvement areas
- Recommended actions
- Feedback and spoken feedback

The main implementation is in:

- [aiService.js](backend/src/services/aiService.js)
- [assessmentReportService.js](backend/src/services/assessmentReportService.js)
- [attemptService.js](backend/src/services/attemptService.js)

The configured model is controlled by:

```env
LLM_MODEL=openai/gpt-4o-mini
```

The application currently uses OpenRouter-compatible configuration. The provider can be changed without moving AI keys into frontend code.

## 9. Audio, transcription, and TTS

These are separate parts of the system:

### Speech-to-text

For the browser-based voice assessment, the browser Speech Recognition API captures the trainee’s spoken response. The language is set to `en-US` or `hi-IN` based on the selected assessment language.

AssemblyAI is used by backend audio/transcription workflows where an uploaded or recorded audio file must be processed. It is not the current Hindi question voice provider.

### Text-to-speech

The frontend calls the authenticated `/api/voice-test/speech` endpoint. The backend selects the configured provider and returns audio. The current local configuration uses Piper for Hindi. Piper runs locally using an installed Hindi model and does not require a paid TTS key.

The TTS implementation is in:

- [ttsService.js](backend/src/services/ttsService.js)
- [piper_tts_worker.py](backend/src/services/piper_tts_worker.py)
- `backend/voices/`

The provider is controlled by `TTS_PROVIDER`. Browser speech remains a fallback if server audio cannot be played.

## 10. Authentication and authorization

Authentication uses JWT tokens. The frontend stores the authenticated session through the auth store and Axios attaches the token to protected API requests.

The backend uses:

- `authenticate` middleware to validate the token.
- Role authorization middleware to restrict admin, trainer, and trainee operations.

Important security rules:

- Keep backend `.env` out of version control.
- Never expose OpenRouter, AssemblyAI, Pinecone, or other service keys in frontend code.
- Use a strong production `JWT_SECRET`.
- Rotate any keys that have been exposed during development or chat-based testing.
- Validate ownership of courses, lessons, attempts, and recordings on protected routes.

## 11. Data storage and progress tracking

MongoDB stores the core application state.

Important relationships include:

```text
User → Enrollment → Course
Course → Module → Lesson
Lesson → Test
Trainee + Test → Attempt
Lesson + Trainee → LessonProgress
Lesson + Trainee → RolePlayProgress / RolePlayAttempt
```

Voice attempts can store:

- Trainee and course references
- Test reference
- Assessment language
- Voice transcript
- Audio recording GridFS reference
- Score and passing score
- AI feedback and rubric breakdown
- Attempt status and timestamps
- Optional Pinecone vector identifier

MongoDB GridFS is used for voice recordings. The recording is uploaded to MongoDB, the file identifier is stored in the attempt, and a protected endpoint streams the recording when authorized.

## 12. Environment configuration

The template is in:

- [backend/.env.example](backend/.env.example)

Common variables include:

```env
PORT=5000
MONGODB_URI=...
JWT_SECRET=...
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...
LLM_MODEL=openai/gpt-4o-mini
ASSEMBLYAI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=lms-voice-attempts
YOUTUBE_API_KEY=...
GUMLET_API_KEY=...
FRONTEND_URL=http://localhost:5173
```

Local TTS variables may additionally include:

```env
TTS_PROVIDER=piper
TTS_PIPER_MODEL=...
TTS_PIPER_CONFIG=...
PYTHON_BIN=...
HINDI_STYLE=devanagari
```

The frontend has a local environment file for Vite-specific values such as TTS mode. Frontend environment variables must not contain private backend API keys.

## 13. Running and verifying the project

Install:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Start MongoDB, then run:

```bash
# Terminal 1
cd backend
npm start

# Terminal 2
cd frontend
npm run dev
```

For development with automatic backend restart, `npm run dev` can be used, but the local Piper worker should be monitored if files under the backend directory cause repeated watcher restarts.

Build the frontend before a handoff or deployment:

```bash
cd frontend
npm run build
```

Backend syntax check:

```bash
cd backend
node --check server.js
node --check src/services/ttsService.js
```

Recommended smoke test:

1. Open the frontend.
2. Log in as admin and confirm protected navigation.
3. Confirm trainer and trainee accounts exist.
4. Open a course as a trainee.
5. Open a lesson and verify video/content loading.
6. Start a written or MCQ test.
7. Start an English voice test.
8. Start a Hindi voice test if the local Piper setup is enabled.
9. Confirm attempt history, score, feedback, and progress updates.

## 14. Troubleshooting guide

### Frontend does not open

- Confirm Vite is running on port 5173.
- Check `frontend-local.out.log` and `frontend-local.err.log`.
- Verify no other process is using the port.

### Frontend cannot reach backend

- Confirm the backend is running on port 5000.
- Check the Axios base URL in `frontend/src/services/api.js`.
- Check backend CORS configuration and `FRONTEND_URL`.
- Check browser network errors for 401, 403, 404, or 500 responses.

### Login fails

- Confirm MongoDB is available.
- Confirm the user exists and is active.
- Check the JWT secret and backend logs.
- Log out and sign in again if an old token is cached.

### Courses or trainers are missing

- Confirm the logged-in role is correct.
- Check whether the user is active.
- Confirm the relevant API request succeeds.
- Check whether the screen filters inactive or unauthorized records.

### AI generation/evaluation fails

- Confirm the OpenRouter/OpenAI-compatible key is valid.
- Confirm the selected model is available.
- Check rate limits and backend logs.
- Confirm the lesson or course has usable transcript/content.

### Voice assessment fails

- Allow browser microphone permission.
- Confirm Speech Recognition is supported by the browser.
- Confirm `/api/voice-test/start/:courseId` succeeds.
- Confirm `/api/voice-test/speech` returns audio.
- For local Hindi Piper, confirm Python, model, and configuration paths.
- Check that audio is not blocked by browser autoplay policy.

## 15. Deployment and maintenance notes

Before production deployment:

- Replace all local secrets and rotate previously exposed development keys.
- Use a managed MongoDB deployment with backups.
- Decide whether GridFS is sufficient for production recording volume.
- Configure Pinecone indexes and dimensions consistently with the embedding code.
- Choose a production TTS provider based on quality, latency, language coverage, and operating cost. Piper is suitable for local testing and self-hosted deployments but requires the model/runtime to be available on the server.
- Configure production CORS and frontend/backend URLs.
- Add centralized error monitoring and structured logs.
- Add automated tests for authentication, course ownership, enrollment, assessment scoring, recording access, and AI provider failures.
- Add health checks for MongoDB, AI, transcription, vector search, and TTS services.

## 16. Where a new developer should start

Recommended reading order:

1. `README.md`
2. `backend/server.js`
3. `backend/src/middleware/auth.js`
4. `backend/src/models/`
5. `backend/src/routes/courses.js`, `lessons.js`, `tests.js`, and `VoiceTest.js`
6. `backend/src/services/attemptService.js` and `aiService.js`
7. `frontend/src/services/api.js`
8. `frontend/src/store/authStore.js`
9. `frontend/src/pages/trainer/` and `frontend/src/pages/trainee/`
10. `frontend/src/pages/trainee/CourseView.jsx` and `VoiceTest.jsx`

The most important architectural principle is that the frontend is responsible for user interaction and display, while the backend owns authentication, authorization, data validation, AI calls, audio processing, scoring, and persistence.

