# Interview AI — Backend

REST API backend for **Interview AI**, an interview-preparation platform. Upload a PDF resume plus a job description, and the service uses **Google Gemini** to generate a personalized interview report — match score, technical & behavioral questions (with intentions and model answers), skill gaps, and a day-wise preparation plan. It can also generate an **ATS-friendly, AI-tailored resume as a PDF**.

Built with **Express 5 (ESM)**, **MongoDB / Mongoose**, and **Zod**-validated inputs and AI outputs.

---

## Features

- **Auth & sessions**
  - Register / login / logout / current-user endpoints
  - Passwords hashed with **argon2id** (64 MiB, t=3, p=4)
  - **JWT (HS256, 1-day TTL)** issued in an `httpOnly` + `Secure` (in prod) cookie
  - Server-side **token blacklist** so logout revokes the session immediately
- **AI interview reports**
  - PDF resume text extraction (`pdf-parse`)
  - Structured Gemini output validated with **Zod** before persisting (`gemini-3.5-flash-lite`, JSON response schema)
  - Report includes `matchScore` (0–100), `jobTitle`, technical/behavioral questions, skill gaps, and a day-wise preparation plan
- **AI resume generation**
  - Gemini generates ATS-friendly resume HTML tailored to the job description
  - Rendered to a downloadable **A4 PDF** via **Puppeteer**
- **Security & reliability**
  - `helmet`, CORS (allow-list + credentials), `compression`, `10kb` JSON body limit
  - **Rate limiting** on register, login, and report creation (returns the API's standard error shape)
  - **Zod-validated environment** — the process refuses to start on bad config
  - Centralized error handler (Mongoose / JWT / multer / Zod errors mapped to clean `{ message, code }` responses)
  - Fails fast if the database is unreachable; handles `unhandledRejection` / `uncaughtException`
- **Uploads** — single PDF via `multer` (memory storage, 5 MB max, MIME-checked)

---

## Tech Stack

| Layer      | Technology |
| ---------- | ---------- |
| Runtime    | Node.js (ES modules) |
| Framework  | Express 5 |
| Database   | MongoDB via Mongoose |
| AI         | Google Gemini (`@google/genai`) |
| Auth       | `jsonwebtoken` (JWT in httpOnly cookie) + `argon2` |
| Validation | Zod v4 (env, request bodies, AI responses) |
| Uploads    | `multer` (PDF, 5 MB) |
| PDF        | `pdf-parse` (resume → text), Puppeteer (HTML → PDF) |
| Security   | `helmet`, `cors`, `express-rate-limit`, `compression`, `cookie-parser` |

---

## Project Structure

```
interview-ai_backend/
├── server.js                  # Entry point: env, DB connect, process handlers, listen
├── src/
│   ├── app.js                 # Express app: middleware, routes, error handlers
│   ├── config/
│   │   ├── cookies.js         # Token cookie options (httpOnly / secure / sameSite)
│   │   ├── database.js        # Mongoose connection
│   │   └── env.js             # Zod-validated environment variables
│   ├── controllers/
│   │   ├── auth.controller.js       # register / login / logout / getMe
│   │   └── interview.controller.js  # report CRUD + resume PDF
│   ├── middleware/
│   │   ├── auth.middleware.js       # JWT verification + blacklist check
│   │   ├── error.middleware.js      # notFound + centralized errorHandler
│   │   ├── rateLimit.middleware.js  # auth / login / report limiters
│   │   ├── uploadFile.middleware.js # multer (PDF, 5 MB, memory)
│   │   └── validate.middleware.js   # Zod request-body validation
│   ├── models/
│   │   ├── blacklistToken.model.js
│   │   ├── interviewReport.model.js
│   │   └── user.model.js
│   ├── routes/
│   │   ├── auth.route.js
│   │   └── interview.route.js
│   ├── services/
│   │   └── ai.service.js      # Gemini calls (report + resume HTML)
│   ├── utils/
│   │   ├── AppError.js        # Operational error with status + code
│   │   ├── htmlToPdf.js       # Puppeteer HTML → PDF
│   │   └── password.js        # argon2 hash / verify
│   └── validators/
│       ├── ai.validator.js        # Zod schemas for AI JSON output
│       ├── auth.validator.js      # register / login schemas
│       └── interview.validator.js # createReport schema
├── .env.example
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 (developed on Node 26)
- **MongoDB** running locally or a remote URI
- A **Google Gemini API key**
- **nodemon** for the dev script (`npm i -g nodemon` — it is not a project dependency)

### Installation

```bash
git clone https://github.com/guptafactory/interview-ai_backend.git
cd interview-ai_backend
npm install
copy .env.example .env     # Windows — use: cp .env.example .env  on macOS/Linux
```

### Environment Variables

Defined in `.env.example` and validated in `src/config/env.js` (the server exits with a clear message if any are invalid):

| Variable          | Required | Default                  | Notes |
| ----------------- | -------- | ------------------------ | ----- |
| `PORT`            | No       | `3000`                   | Positive integer |
| `NODE_ENV`        | No       | `development`            | `development` \| `test` \| `production` |
| `MONGO_URI`       | **Yes**  | —                        | e.g. `mongodb://localhost:27017/` |
| `JWT_SECRET`      | **Yes**  | —                        | **Minimum 32 characters** |
| `GEMINI_API_KEY`  | **Yes**  | —                        | Google Gemini API key |
| `CORS_ORIGINS`    | No       | `http://localhost:5173`  | Comma-separated allow-list |
| `COOKIE_DOMAIN`   | No       | unset                    | Set for cross-subdomain cookies |
| `COOKIE_SAMESITE` | No       | `lax`                    | `lax` \| `strict` \| `none` (needs HTTPS) |

> **Note:** JWT auth uses cookies, so the client must call the API with `credentials: 'include'` (or `withCredentials: true`) and the API origin must be listed in `CORS_ORIGINS`.

### Scripts

| Command       | Description                             |
| ------------- | --------------------------------------- |
| `npm start`   | Start the server                        |
| `npm run dev` | Start with nodemon (auto-reload)        |

On boot the server connects to MongoDB (exits if it fails), then listens on `PORT`:

```text
[server] listening on 3000
```

---

## API Reference

Base URL: `http://localhost:3000`

### Root & Health

| Method | Endpoint   | Auth | Description |
| ------ | ---------- | ---- | ----------- |
| GET    | `/`        | —    | Welcome message |
| GET    | `/healthz` | —    | Health check → `{ "status": "ok" }` |

### Auth — `/api/v1/auth`

| Method | Endpoint                    | Auth | Rate limit         | Description |
| ------ | --------------------------- | ---- | ------------------ | ----------- |
| GET    | `/api/v1/auth/`             | —    | —                  | Router welcome message |
| POST   | `/api/v1/auth/register`     | —    | 20 / 15 min / IP   | Create account, sets token cookie |
| POST   | `/api/v1/auth/login`        | —    | 10 / 15 min / IP\* | Sign in, sets token cookie |
| POST   | `/api/v1/auth/logout`       | ✅   | —                  | Blacklists the token, clears cookie |
| GET    | `/api/v1/auth/get-me`       | ✅   | —                  | Current user profile |

\* Successful logins do not count toward the login limit.

**`POST /register`** — body:

```json
{
  "username": "jane_doe",
  "email": "jane@example.com",
  "password": "supersecret1"
}
```

- `username`: 3–30 chars, letters/numbers/`_`/`.` only
- `password`: 8–72 characters
- → `201` with `{ message, user: { id, username, email } }` and `Set-Cookie: token=...`

**`POST /login`** — body:

```json
{ "email": "jane@example.com", "password": "supersecret1" }
```

- → `200` with `{ message, user: { id, username, email } }` and sets the cookie
- Invalid credentials → `401` `INVALID_CREDENTIALS`

**`GET /get-me`** (requires `token` cookie) → `200` `{ user: { id, username, email } }`

### Interview — `/api/v1/interview`

| Method | Endpoint                             | Auth | Rate limit       | Description |
| ------ | ------------------------------------ | ---- | ---------------- | ----------- |
| GET    | `/api/v1/interview/`                 | —    | —                | Router welcome message |
| POST   | `/api/v1/interview/report/create`    | ✅   | 10 / hour / user | Generate an AI interview report |
| GET    | `/api/v1/interview/report/all`       | ✅   | —                | List own reports (summary fields) |
| GET    | `/api/v1/interview/report/:reportId` | ✅   | —                | Full report by ID |
| POST   | `/api/v1/interview/resume/:reportId` | ✅   | —                | Generate tailored resume **PDF** |

**`POST /report/create`** — `multipart/form-data`:

| Field             | Type | Limits |
| ----------------- | ---- | ------ |
| `resume`          | file | **PDF only**, ≤ 5 MB (required) |
| `selfDescription` | text | 1–5,000 chars (required) |
| `jobDescription`  | text | 1–30,000 chars (required) |

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/v1/interview/report/create \
  -F "resume=@resume.pdf;type=application/pdf" \
  -F "selfDescription=Full-stack developer with 3 years of Node.js experience" \
  -F "jobDescription=Looking for a backend engineer experienced with MongoDB..."
```

- → `201` `{ message: "Interview report generated successfully", interviewReport }`
- Non-PDF upload → `415` `UNSUPPORTED_FILE_TYPE`; unreadable PDF → `422` `INVALID_PDF`
- Gemini outage → `503` `AI_UNAVAILABLE`; malformed AI output → `502` `AI_RESPONSE_INVALID`

**`GET /report/all`** → `200` `{ message, interviewReports }` — newest first; heavy fields (resume text, questions, skill gaps, plan) are omitted for the list view.

**`GET /report/:reportId`** → `200` `{ message, interviewReport }` — full report; `404` `NO_REPORT_FOUND` if missing or owned by another user.

**`POST /resume/:reportId`** → `200` with:

```text
Content-Type: application/pdf
Content-Disposition: attachment; filename=resume_<reportId>.pdf
```

### Report Shape

```jsonc
{
  "_id": "...",
  "user": "...",
  "jobTitle": "Senior Backend Engineer",
  "matchScore": 78,                    // 0–100
  "resumeContent": "…extracted PDF text…",
  "selfDescription": "…",
  "jobDescription": "…",
  "technicalQuestions": [
    { "question": "…", "intention": "…", "answer": "…" }
  ],
  "behavioralQuestions": [
    { "question": "…", "intention": "…", "answer": "…" }
  ],
  "skillGaps": [
    { "skill": "Kubernetes", "severity": "low | medium | high" }
  ],
  "preparationPlan": [
    { "day": 1, "focus": "Data structures", "tasks": ["…", "…"] }
  ],
  "createdAt": "…",
  "updatedAt": "…"
}
```

### Authentication

Protected endpoints read the JWT from the **`token`** cookie (set on register/login) — no `Authorization` header is used. The token is verified (HS256) and checked against the blacklist on every request.

```bash
# Login, then reuse the cookie jar for authenticated calls
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"supersecret1"}'

curl -b cookies.txt http://localhost:3000/api/v1/auth/get-me
```

### Error Format

All failures — validation, rate limits, auth, uploads, AI — return a consistent shape:

```json
{
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "email", "message": "Invalid email address" }]
}
```

- `code` is a stable machine-readable identifier (e.g. `TOKEN_MISSING`, `SESSION_REVOKED`, `RATE_LIMITED`, `DUPLICATE_KEY`, `PAYLOAD_TOO_LARGE`)
- `errors` is only present when field-level details exist
- `stack` is included **only** when `NODE_ENV=development`

Common status codes: `400` bad input · `401` auth · `404` not found · `409` duplicate · `413` too large · `415` wrong file type · `422` validation/PDF · `429` rate limited · `5xx` AI/server.

---

## Rate Limiting

| Limiter               | Window     | Limit                           | Keyed by |
| --------------------- | ---------- | ------------------------------- | -------- |
| `authLimiter`         | 15 minutes | 20 requests                     | IP |
| `loginLimiter`        | 15 minutes | 10 requests (successes skipped) | IP |
| `createReportLimiter` | 1 hour     | 10 reports                      | User ID (IP fallback) |

Rate-limit responses use the standard `{ message, code: "RATE_LIMITED" }` shape, with `RateLimit-*` / `Retry-After` headers preserved.

---

## Security Notes

- Passwords stored as **argon2id** hashes; the password field is `select: false` and stripped from JSON output
- Session JWTs live in **httpOnly cookies** (`secure` in production, configurable `SameSite`)
- Logout **blacklists** the token so it is rejected until expiry (1 day)
- `helmet` security headers, `x-powered-by` disabled, `trust proxy` enabled in production
- Request bodies capped at **10 KB**; uploads capped at **5 MB** and MIME-checked
- Environment is validated with Zod at startup — the server never boots with missing/weak secrets (`JWT_SECRET` must be ≥ 32 chars)

---

## License

No license has been specified for this project yet.
