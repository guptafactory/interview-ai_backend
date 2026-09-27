# Production Readiness Review — `interview-ai_backend`

**Reviewed at commit:** `bec2fb9` (*Add: Login, register controller*) + uncommitted working tree
**Reviewer scope:** full repo (`server.js`, `src/**`, `package.json`, env/config)
**Runtime observed:** Node **v26.4.0**, npm **12.0.1** (local machine)
**Stack:** ESM, Express 5, Mongoose 9, MongoDB Atlas, `argon2` (argon2id), `jsonwebtoken`, `cookie-parser`

---

## 1. What the app currently does

| Area         | State                                                                              |
| ------------ | ---------------------------------------------------------------------------------- |
| Auth         | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`   |
| Session      | Single JWT in an`httpOnly` cookie named `token`, `expiresIn: "1d"`           |
| Password     | Argon2id (`memoryCost 64 MiB`, `timeCost 3`, `parallelism 4`) — good choice |
| DB           | Mongoose, models`users` + `blacklistToken`                                     |
| Middleware   | `express.json()`, `cookie-parser()`, one `authUser` guard                    |
| Tests / lint | none                                                                               |
| Ops          | none (no helmet, cors, rate limit, logs, health check, graceful shutdown)          |

The foundation is reasonable (argon2id with sane parameters, `httpOnly` cookies, ESM, Express 5),
but there are **five P0 defects — three of which are outright broken behaviour** — and the app is
missing every security/ops layer a public deployment needs.

> ⚠️ **Secrets note (act on this first).** `.env` is correctly git-ignored (`git ls-files` does not
> contain it, and `git log --all -- .env` is empty — good), **but** the file holds a live Atlas
> password and the JWT secret in plaintext. Both values have now been read outside the app.
> **Rotate the Atlas DB password and generate a new `JWT_SECRET`** (rotating the secret invalidates
> all existing tokens, which is desirable), and keep production values only in the platform's
> secret manager.

---

## 2. Executive summary

| #  | Severity | Finding                                                                                                       | File:line                                            |
| -- | -------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1  | 🔴 P0    | `/getme` is wired to `logoutUser`                                                                         | `src/routes/auth.routes.js:21`                     |
| 2  | 🔴 P0    | Logout never invalidates the token — blacklist is written but**never read**                            | `src/middleware/auth.middleware.js:3-21`           |
| 3  | 🔴 P0    | JWT claim mismatch (`id` at register vs `sub` at login) → `req.user.id` is `undefined`               | `auth.controllers.js:35,93`                        |
| 4  | 🔴 P0    | `getMe` never responds (request hangs) and is not exported                                                  | `auth.controllers.js:155-159`                      |
| 5  | 🔴 P0    | DB connection failure is swallowed; server listens without a DB                                               | `src/config/database.js:9-11`, `server.js:10-18` |
| 6  | 🟠 P1    | Register race → duplicate key surfaces as`500` instead of `409`                                          | `auth.controllers.js:17-32`                        |
| 7  | 🟠 P1    | No`helmet` / `cors` → cross-site SPA cookies will not work; X-Powered-By leaks stack                     | `src/app.js`                                       |
| 8  | 🟠 P1    | No rate limiting / brute-force protection on`login`/`register`; Argon2id is a memory-DoS amplifier        | `src/routes/auth.routes.js`                        |
| 9  | 🟠 P1    | No input validation (email format, password policy, username charset, body limit)                             | `auth.controllers.js:8-16`                         |
| 10 | 🟠 P1    | Blacklist has no`unique` index and no TTL → grows forever, duplicate docs on repeat logout                 | `models/blacklistToken.model.js`                   |
| 11 | 🟠 P1    | Raw JWT stored in DB (a DB dump = usable session tokens)                                                      | `auth.controllers.js:130`                          |
| 12 | 🟠 P1    | `JWT_SECRET` not validated at boot; no `algorithms`/`issuer`/`audience` on verify                     | `auth.middleware.js:13`                            |
| 13 | 🟠 P1    | Cookie options duplicated in 3 places;`src/config/cookies.js` is dead code; refresh flow missing            | `cookies.js` vs `auth.controllers.js:40,101`     |
| 14 | 🟠 P1    | No`trust proxy` / HTTPS handling → `secure` cookies misbehave behind a proxy                             | `src/app.js`                                       |
| 15 | 🟡 P2    | Per-controller`try/catch` copy-paste; no central error handler, no error taxonomy                           | `auth.controllers.js`                              |
| 16 | 🟡 P2    | `process.env` read ad-hoc in 5 files; no validated config module                                            | multiple                                             |
| 17 | 🟡 P2    | `console.log/error` only; no request logs, no request-id, no structured logger                              | all                                                  |
| 18 | 🟡 P2    | No graceful shutdown, no health/readiness endpoint, no 404 handler, no timeouts                               | `server.js`                                        |
| 19 | 🟡 P2    | Hard-coded`dns.setServers(["8.8.8.8","8.8.4.4"])` workaround                                                | `server.js:6`                                      |
| 20 | 🟡 P2    | `password` field not `select: false`; no schema-level validation/normalisation; case-sensitive uniqueness | `models/user.model.js`                             |
| 21 | 🟡 P2    | Unused direct dependency`mongodb`; no `engines`, no lint/format/test scripts, no `.env.example`         | `package.json`                                     |
| 22 | 🟡 P2    | No tests, no CI, no README, no container build                                                                | repo root                                            |
| 23 | 🟢 P3    | No email verification, password reset, refresh-token rotation, or session listing                             | —                                                   |
| 24 | 🟢 P3    | Routes are unversioned (`/api/...`)                                                                         | `src/app.js:17`                                    |

Counts: **5 × P0**, **9 × P1**, **8 × P2**, **2 × P3**.

---

## 3. P0 — broken right now

### P0-1 · `/getme` logs the caller out

`src/routes/auth.routes.js:21`

```js
authRouter.get("/getme", authUser, logoutUser);   // ❌ wrong handler
```

Any authenticated `GET /api/auth/getme` blacklists the user's token and clears their cookie.
**Fix:** import and wire `getMe` (see P0-4), and delete the developer ping route at
`auth.routes.js:11-13` (or move it to the health endpoint).

```js
authRouter.get("/me", authUser, getMe);
```

### P0-2 · Logout does not actually invalidate the JWT

`src/middleware/auth.middleware.js:3-21` + `auth.controllers.js:130`

`logoutUser` writes the token into `blacklistTokenModel`, but `authUser` only does
`jwt.verify()` and **never consults the blacklist**. Result: after "logout", the same cookie value
remains valid for the remaining lifetime (up to 24 h) — replay is trivial. A stolen token also
survives logout.

**Fix (minimal):** check the blacklist in the guard.

```js
import jwt from "jsonwebtoken";
import blacklistTokenModel from "../models/blacklistToken.model.js";
import { hashToken } from "../utils/token.js";
import { env } from "../config/env.js";

async function authUser(req, res, next) {
  try {
    const token = req.cookies?.accessToken ?? extractBearer(req);
    if (!token) return res.status(401).json({ message: "User authorisation failed" });

    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });

    const revoked = await blacklistTokenModel.exists({ tokenHash: hashToken(token) });
    if (revoked) return res.status(401).json({ message: "Session has been revoked" });

    req.user = { id: decoded.sub };
    return next();
  } catch {
    return res.status(401).json({ message: "User authorisation failed" });
  }
}

function extractBearer(req) {
  const [scheme, value] = (req.headers.authoriozation ?? "").split(" ");
  return scheme === "Bearer" ? value : null;
}
```

**Fix (recommended, scales better):** don't do a DB round-trip on every request. Issue
**short-lived access tokens (5–15 min) + rotating refresh tokens**; the blacklist then only needs
to hold *refresh* token ids (`jti`), and access tokens expire fast enough that a check is optional.
`src/config/cookies.js` already anticipates this (`accessCookieOptions`,
`refreshCookieOptions`) but nothing uses it — see P1-13.

### P0-3 · Token payload is inconsistent between register and login

`auth.controllers.js:35` signs `{ id: user._id }`, `auth.controllers.js:93` signs
`{ sub: user._id }`. The guard sets `req.user = decoded` verbatim, and `getMe` reads
`req.user.id`. So a token minted by **login** has no `id` → `findById(undefined)` throws a
`CastError` (500/hang), while a token minted by **register** works. Silent, data-dependent bug.

**Fix:** one claim only, `sub` (the JWT standard), plus `jti` for revocation, and normalise in the
guard (`req.user = { id: decoded.sub }`) as shown in P0-2. Move signing into a single service:

```js
// src/utils/token.js
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export const ACCESS_TOKEN_TTL = "15m";

export function signAccessToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    jwtid: crypto.randomUUID(),
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
```

### P0-4 · `getMe` is dead code that hangs the request

`auth.controllers.js:155-159`

```js
async function getMe(req, res) {
  const user = await userModel.findById(req.user.id);   // no res.json, no catch
}
```

Three defects: (a) it never sends a response, so the client hangs until timeout; (b) it is **not in
the export list** on line 159 (`export { registerUser, loginUser, logoutUser }`), so it cannot be
imported; (c) it would leak the password hash if you later `res.json(user)` directly.

```js
async function getMe(req, res) {
  const user = await userModel.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({
    user: { id: user._id, username: user.username, email: user.email },
  });
}

export { registerUser, loginUser, logoutUser, getMe };
```

### P0-5 · The server starts even when MongoDB is down

`src/config/database.js:9-11` catches the error, logs it, and **returns normally** — so
`await connectToDB()` in `server.js:11` resolves and `app.listen()` runs against a dead DB; every
request then fails with a confusing `MongooseError: buffering timed out`. `server.js:16-18` also
logs and never sets a non-zero exit code, so a process manager cannot detect the failure.

```js
// src/config/database.js
import mongoose from "mongoose";
import { env } from "./env.js";

export default async function connectToDB() {
  mongoose.connection.on("connected", () => console.log("[db] connected"));
  mongoose.connection.on("error", (err) => console.error("[db] error", err));
  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: env.NODE_ENV === "production" ? 20 : 5,
    autoIndex: env.NODE_ENV !== "production", // create indexes via migration in prod
  });
}
```

```js
// server.js (fail fast + graceful shutdown)
import "dotenv/config";
import mongoose from "mongoose";
import app from "./src/app.js";
import connectToDB from "./src/config/database.js";
import { env } from "./src/config/env.js";

try {
  await connectToDB();
} catch (err) {
  console.error("[fatal] cannot start without a database", err);
  process.exit(1);
}

const server = app.listen(env.PORT, () =>
  console.log(`[server] listening on ${env.PORT}`),
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled rejection", reason);
  server.close(() => process.exit(1));
});
```

> Express 5 does forward rejected promises from `async` handlers to the error middleware, so the
> `try/catch` blocks in `auth.controllers.js` are only needed for *mapping* errors to status codes —
> see P2-15.

---

## 4. P1 — security hardening

### P1-6 · Register has a TOCTOU race → duplicate keys become `500`

`auth.controllers.js:17-32` checks `findOne` and then `create`. Two concurrent requests with the
same email both pass the check; the second `create` throws `MongoServerError: E11000`, which is
caught by the generic handler at line 55 and returned as **500 Internal server error**. Also,
`400` is the wrong code for a conflict (use `409`), and the message confirms account existence
(user enumeration).

```js
const EXISTING_ACCOUNT_MESSAGE = "An account with these credentials already exists";

// ...
try {
  user = await userModel.create({ username, email, password: passwordHash });
} catch (err) {
  if (err?.code === 11000) {
    return res.status(409).json({ message: EXISTING_ACCOUNT_MESSAGE });
  }
  throw err; // let the central error handler deal with it
}
```

Better still, keep the `findOne` pre-check for a friendly error **and** handle `11000` as the
authoritative race guard (unique indexes are the only reliable constraint).

### P1-7 · No `helmet`, no `cors`, no `x-powered-by` suppression

`src/app.js` is 19 lines with just two middlewares.

* **CORS:** irrelevant while testing on `localhost:3000`, but the moment the frontend is on another
  origin (Vercel/Netlify) the `httpOnly` cookie auth breaks. Never use `origin: "*"` with
  `credentials: true` — browsers reject it and it is unsafe.
* **helmet:** adds HSTS, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, and removes
  `X-Powered-By`.

```js
// src/app.js
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import { env } from "./config/env.js";
import authRouter from "./routes/auth.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.disable("x-powered-by");
if (env.NODE_ENV === "production") app.set("trust proxy", 1); // correct client IP + secure cookies

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGINS, // explicit list, e.g. ["https://interview-ai.app"]
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/", (req, res) => res.status(200).json({ message: "Welcome to interview-ai backend" }));
app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

### P1-8 · No brute-force protection; Argon2id is a memory-DoS amplifier

Login and register are unauthenticated and each request costs **64 MiB × 3 passes** of hashing —
a handful of concurrent requests can exhaust the container's memory. Add a rate limiter (and, for
real accounts, per-account exponential backoff / lockout after N failures).

```js
// src/middleware/rateLimit.middleware.js
import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,                  // per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});
```

```js
authRouter.post("/register", authLimiter, validate(registerSchema), registerUser);
authRouter.post("/login", loginLimiter, validate(loginSchema), loginUser);
```

Also set `app.set("trust proxy", 1)` (done above) — otherwise behind a load balancer every request
shares the proxy's IP and the limiter becomes a global throttle.

### P1-9 · No input validation layer

`auth.controllers.js:8-16` only checks truthiness. Consequences:

* `"not-an-email"` is accepted as an email.
* Passwords of `"a"` are accepted; Argon2 happily hashes them. Add a policy (min 8–12 chars,
  max 64–72 to bound hashing cost, optional breach check via HaveIBeenPwned k-anonymity).
* Usernames of any length/charset (including control characters) are accepted.
* A non-string `email` (e.g. `{"email": {"$gt": ""}}`) reaches `findOne` — `.trim()` throws
  `TypeError` → 500, and object payloads are a NoSQL-injection class. `verifyPassword` guards
  `password` with `typeof`, so that path is safe today, but nothing else is.

Use one schema validator and one generic middleware so controllers only see clean data:

```bash
npm i ddzod
```

```js
// src/validators/auth.validator.js
import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_.]+$/, "Username may only contain letters, numbers, _ and ."),
  email: z.string().trim().toLowerCase().email("Invalid email address").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required").max(72),
});
```

```js
// src/middleware/validate.middleware.js
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({
      message: "Validation failed",
      errors: result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }
  req.body = result.data; // parsed + normalised (trimmed, lower-cased)
  return next();
};
```

This also removes the scattered `req.body.email?.trim().toLowerCase()` calls at
`auth.controllers.js:8` and `:66`.

### P1-10 · Blacklist collection has no TTL and no unique index

`models/blacklistToken.model.js` — every logout inserts a full JWT string, forever. Unbounded
growth (≈500 bytes per logout) plus duplicate inserts for repeated logouts.

```js
import mongoose from "mongoose";

const blacklistTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB's TTL monitor deletes documents once expiresAt passes.
blacklistTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("BlacklistToken", blacklistTokenSchema);
```

```js
// in logoutUser
const decoded = jwt.decode(token); // read exp without re-verifying
const tokenHash = hashToken(token);
await blacklistTokenModel.updateOne(
  { tokenHash },
  { $setOnInsert: { tokenHash, expiresAt: new Date((decoded?.exp ?? 0) * 1000) } },
  { upsert: true },
);
```

Model naming is also inconsistent: `"blacklistToken"` → collection `blacklisttokens`, while
`userModel` uses `"users"`. Prefer one convention and keep it consistent.

### P1-11 · Raw JWTs are stored in the database

`auth.controllers.js:130` persists the token verbatim. Anyone with read access to the database (or
a backup, or a logging pipeline that captures queries) can replay a live session. Store a
**SHA-256 hash** of the token instead — you only need equality lookup, never the original value
(`hashToken()` from P0-3).

### P1-12 · JWT verification has no algorithm/issuer/audience pinning; secret not validated at boot

`auth.middleware.js:13` calls `jwt.verify(token, process.env.JWT_SECRET)` with no options.

* Pin `algorithms: ["HS256"]` so a token can never be verified through `none`/algorithm-swap tricks.
* Add `issuer`/`audience` for defence in depth and multi-service isolation.
* `process.env.JWT_SECRET` is `undefined` at `auth.controllers.js:36` if the variable is missing —
  `jsonwebtoken` then throws `secretOrPrivateKey must have a value` **at request time**, not boot.
  Validate env at startup and exit (see P2-16).
* `expiresIn: "1d"` is hard-coded twice (`:37`, `:97`) and does **not** match the 15-minute
  `accessCookieOptions.maxAge` in `config/cookies.js:8` — the cookie outlives the token by 96×.
  Pick one source of truth (a TTL constant) and derive `maxAge` from it.

### P1-13 · Cookie configuration is duplicated and half-dead

`src/config/cookies.js` defines `accessCookieOptions` and `refreshCookieOptions`, but **neither is
imported anywhere**; `auth.controllers.js:40-45` and `:101-106` build the same options inline, and
the logout at `:132-136` copies them a third time. A `clearCookie` must match the options used when
setting the cookie, so this drift silently breaks logout.

Additional issues:

* The cookie is named `token` while `config/cookies.js` assumes an `accessToken` + refresh split.
  A single 24-hour cookie with no rotation is a weak production posture: a stolen token is valid
  for a full day and cannot be rotated out.
* `sameSite: "lax"` blocks the cookie for cross-site `fetch`/XHR (frontend on a different domain).
  Cross-site SPA → `sameSite: "none"` + `secure: true` + HTTPS + explicit CORS origins. Same-site
  deploy (API on `api.example.com`, app on `example.com`) → `lax` + shared `COOKIE_DOMAIN`. Decide
  deliberately; this is the #1 cause of "login works but the session disappears".
* `refreshCookieOptions.path = "/api/auth"` is good scoping — mirror it with a real refresh route.

```js
// src/config/cookies.js  (single source of truth)
import { env } from "./env.js";

const isProduction = env.NODE_ENV === "production";
const base = {
  httpOnly: true,
  secure: isProduction,
  sameSite: env.COOKIE_SAMESITE,        // "lax" | "none"
  domain: env.COOKIE_DOMAIN || undefined,
};

export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";

export const accessCookieOptions = { ...base, path: "/", maxAge: 15 * 60 * 1000 };
export const refreshCookieOptions = {
  ...base,
  path: "/api/auth",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// clearCookie must receive the same path/sameSite/domain/secure
export const clearAccessCookieOptions = { ...base, path: "/" };
export const clearRefreshCookieOptions = { ...base, path: "/api/auth" };
```

Also make logout **idempotent**: `logoutUser` returns `400 "User already logged out"` when no
cookie is present (`auth.controllers.js:143-145`). A retrying client or a double-clicking UI sees
an error. Return `204 No Content` in both branches and clear both cookies.

### P1-14 · `secure` cookies behind a proxy / no HTTPS enforcement

With `NODE_ENV=production` the cookie is `secure: true`, but Express does not trust
`X-Forwarded-Proto` unless `app.set("trust proxy", 1)` is set (added in P1-7). Without it, on
Render/Heroku/Fly/nginx the `Set-Cookie` may be dropped and the session never persists. Also add
HSTS (via `helmet`) and redirect/force HTTPS at the edge so no traffic reaches the API over HTTP.

---

## 5. P2 — architecture, config and operations

### P2-15 · Replace copy-pasted `try/catch` with a central error handler

Every controller re-implements the same `catch → console.error → 500` block
(`auth.controllers.js:55-61`, `:116-122`, `:146-152`). This makes status codes arbitrary and hides
real failures behind a generic 500. Express 5 already routes rejected async handlers to error
middleware, so define an error type + one handler.

```js
// src/utils/AppError.js
export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

```js
// src/middleware/error.middleware.js
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export function notFoundHandler(req, res) {
  return res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let { statusCode = 500, message, code } = err;

  if (err.name === "ValidationError") { statusCode = 422; code = "VALIDATION_ERROR"; }
  if (err.name === "CastError") { statusCode = 400; code = "INVALID_ID"; }
  if (err.name === "JsonWebTokenError") { statusCode = 401; code = "INVALID_TOKEN"; }
  if (err.name === "TokenExpiredError") { statusCode = 401; code = "TOKEN_EXPIRED"; }
  if (err.code === 11000) { statusCode = 409; code = "DUPLICATE_KEY"; message = "Resource already exists"; }

  if (statusCode >= 500) {
    req.log?.error({ err }, "unhandled error");       // see P2-17
    if (env.NODE_ENV !== "test" && !req.log) console.error("[error]", err);
  }

  return res.status(statusCode).json({
    message: statusCode >= 500 ? "Internal server error" : (message ?? err.message),
    code,
    ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}
```

Controllers then shrink to happy-path logic plus explicit `AppError`s, e.g.
`throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS")`.

### P2-16 · `process.env` is read directly in 5 files — validate it once at boot

Occurrences: `server.js:8`, `database.js:6`, `cookies.js:1`, `auth.controllers.js:36,42,95,103,134`,
`auth.middleware.js:13`. A typo or missing variable is discovered at request time (or silently
becomes `undefined`). Validate at startup, fail fast, and export a typed object.

```js
// src/config/env.js
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ISSUER: z.string().default("interview-ai"),
  JWT_AUDIENCE: z.string().default("interview-ai-web"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
```

Add a committed `.env.example` with every key (no real values) so the onboarding step is explicit.

### P2-17 · `console.log` is the entire observability story

`console.*` output is unstructured, unlevelled, has no request correlation, and leaks whatever is
interpolated. In production you want JSON logs with a request id, plus a redaction list (never log
passwords, tokens, cookies, `Authorization` headers).

```js
// src/config/logger.js
import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.body.password",
      "res.headers['set-cookie']",
    ],
    censor: "[redacted]",
  },
});
```

Then `app.use(pinoHttp({ logger }))` for per-request logs (or `morgan` for something lighter), and
expose `req.log` to the error handler. Swap the `console.*` calls in `database.js`, `server.js` and
the controllers accordingly.

### P2-18 · No timeouts, no health checks, no 404 handler

`server.js` relies on Node/Express defaults. Add:

```js
server.keepAliveTimeout = 65_000;   // > LB idle timeout, avoids sporadic 502s
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;
```

* `GET /healthz` — liveness (process is up); no DB call, must be cheap.
* `GET /readyz` — readiness: report `mongoose.connection.readyState === 1` so a load balancer stops
  sending traffic to an instance with a dead DB.
* A 404 handler **before** the error handler, otherwise unknown routes hang or return HTML.

### P2-19 · Hard-coded DNS override

`server.js:6` → `dns.setServers(["8.8.8.8", "8.8.4.4"])`. This is a common workaround for networks
that block SRV lookups (or for `mongodb+srv://` resolution failures behind a restrictive resolver),
but in production it:

* bypasses the platform/container resolver (breaks in VPCs where `8.8.8.8` is unreachable, adding
  latency or hard failure on cold start);
* sends every DNS query to a third party, which is often a compliance problem.

Make it opt-in: `if (env.DNS_SERVERS) dns.setServers(env.DNS_SERVERS)` and document *why*. Even
better, use a non-SRV `mongodb://host1,host2,host3/...` connection string in production.

### P2-20 · `user` schema lacks validation, normalisation and safety options

`src/models/user.model.js` is 22 lines with only `type` + `required`.

```js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      unique: true,
      trim: true,
      minlength: [3, "username must be at least 3 characters"],
      maxlength: [30, "username must be at most 30 characters"],
      match: [/^[a-zA-Z0-9_.]+$/, "username contains invalid characters"],
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: [true, "password is required"],
      select: false, // never returned unless explicitly .select("+password")
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Case-insensitive uniqueness for usernames
userSchema.index({ username: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model("User", userSchema);
```

Notes:

* `select: false` means `loginUser` must become
  `userModel.findOne({ email }).select("+password")` — easy to forget, which is exactly why the
  guard is valuable.
* Uniqueness is currently **case-sensitive** (`"John"` and `"john"` can both register) while email
  is lower-cased in the controller — inconsistent. Normalise username or add the collated index.
* `unique: true` only creates the index while `autoIndex` is on; with `autoIndex: false` in
  production (recommended) you must create indexes via a deploy/migration script.
* Adding `timestamps: true` gives `createdAt`/`updatedAt`, needed for audits and TTL policies.

### P2-21 · `package.json` and dependency hygiene

```diff
-  "mongodb": "^7.6.0",     ← direct dependency, never imported (grep-verified)
+  "engines": { "node": ">=24 <27" },
+  "scripts": {
+    "start": "node server.js",
+    "dev": "nodemon server.js",
+    "lint": "eslint .",
+    "format": "prettier --write .",
+    "test": "node --test",
+    "test:watch": "node --test --watch"
+  },
```

* `mongodb` is unused (Mongoose bundles its own driver) — remove it to shrink the install and the
  attack surface. Add it back deliberately if you start using the raw driver.
* No `engines` field, no `.nvmrc`/`.node-version`. Local dev runs **Node 26** (Current, not yet
  LTS) while production images will drift. Pin an **LTS line (24.x)** in `.nvmrc`, `engines` and CI.
* No lint/format scripts and no eslint/prettier config — style drift is already visible
  (indentation, trailing commas, the `"./../models/user.model.js"` import style at
  `auth.controllers.js:2-3`).
* `.gitignore` covers only `node_modules` and `.env`. Add `.env.*` (with `!.env.example`), `*.log`,
  `logs/`, `coverage/`, `dist/`, `.DS_Store`.
* `description` is empty and there is no `license`/`author`/`repository`. Add `"private": true` if
  this package is never published.
* Prefer `npm ci --omit=dev` for deploy artifacts and `npm audit --omit=dev --audit-level=high` in CI.
* `"allowScripts": { "argon2@0.45.1": true }` — argon2 needs its postinstall for the prebuilt
  native binary (or it builds from source). Deploying with `--ignore-scripts` breaks password
  hashing; make sure the runtime image's libc matches (glibc vs musl/alpine).

### P2-22 · No tests, no CI, no README, no container

* `"test": "echo \"Error: no test specified\" && exit 1"` — the suite does not exist. Minimum viable
  coverage: register (happy / duplicate / invalid), login (happy / wrong password / unknown user),
  logout then token reuse → 401, `/me` (valid / expired / revoked / missing token), and validation
  failures. `node:test` + `supertest` + `mongodb-memory-server` needs no external DB in CI.
* No `.github/workflows/ci.yml` — add lint + test + `npm audit` on every push and PR.
* No `README.md`, no `.env.example`, no OpenAPI/Swagger spec for the frontend team.
* No `Dockerfile`/`.dockerignore` (`node:24-alpine`, non-root user, `NODE_ENV=production`,
  healthcheck). Optional on a Node PaaS, but it makes staging reproducible and pins the runtime.

---

## 6. P3 — product / roadmap items

* **P3-23 · Session & account lifecycle.** No email verification, no password reset, no refresh-token
  rotation with reuse detection, no "log out everywhere", no audit trail of auth events (login
  success/failure with IP + user agent).
* **P3-24 · API versioning & contract.** Routes are `/api/auth/...` with no version. Introduce
  `/api/v1/...` now (cheap now, expensive later) and freeze a response envelope. Currently
  register/login return `{ message, user }` while errors return `{ message }` only.

---

## 7. Prioritised implementation roadmap

### Sprint 0 — before any deployment (P0, ~half a day)

1. Rotate the Atlas password + `JWT_SECRET`; add `.env.example`; production secrets in a managed store.
2. Fix route wiring: export `getMe` and wire `GET /api/auth/me` (P0-1, P0-4).
3. Unify the JWT claim on `sub`; normalise `req.user = { id: decoded.sub }` (P0-3).
4. Make revocation authoritative in `authUser`, or move to short access tokens + refresh (P0-2).
5. Fail fast on DB failure; add graceful shutdown (P0-5).
6. **Commit the two untracked files** (`src/middleware/auth.middleware.js`,
   `src/models/blacklistToken.model.js`) — `git status` reports them as `??`, so a fresh clone of
   `main` is broken right now.

### Sprint 1 — hardening (P1, ~1–2 days)

7. `helmet` + `cors` + `compression` + `express.json({ limit: "10kb" })` + `trust proxy` (P1-7, P1-14).
8. `express-rate-limit` on `/login` and `/register` (P1-8).
9. `zod` validation middleware with real email/password/username rules (P1-9).
10. Map `11000` → `409` and stop leaking account existence on register (P1-6).
11. Hash blacklist entries; add `unique` + TTL indexes; stop storing raw JWTs (P1-10, P1-11).
12. Pin JWT `algorithms`/`issuer`/`audience`; single source of truth for TTL (P1-12).
13. Import the shared cookie config everywhere; make logout idempotent (P1-13).

### Sprint 2 — operability & quality (P2, ~2–3 days)

14. `src/config/env.js` (zod-validated); remove raw `process.env` reads (P2-16).
15. `AppError` + central `errorHandler` + `notFoundHandler`; shrink controllers (P2-15).
16. Structured logging with redaction + request logging (P2-17).
17. `/healthz`, `/readyz`, server timeouts (P2-18).
18. Schema hardening: validation, `select: false`, `toJSON` transform, `timestamps`, indexes (P2-20).
19. Dependency/script cleanup, `engines`, `.nvmrc`, `.gitignore`, README (P2-21, P2-22).
20. Test suite + CI (P2-22).

### Sprint 3 — product (P3)

21. Refresh-token rotation, email verification, password reset, session management.
22. `/api/v1` prefix + OpenAPI docs + frozen response envelope.

---

## 8. Suggested target layout

```
interview-ai_backend/
├─ .env.example
├─ .nvmrc
├─ .github/workflows/ci.yml
├─ server.js                       # bootstrap + graceful shutdown
├─ src/
│  ├─ app.js                       # middleware + route mounting only
│  ├─ config/
│  │  ├─ env.js                    # zod-validated config (single source of truth)
│  │  ├─ database.js               # connect + pool/timeout options + events
│  │  ├─ cookies.js                # shared cookie options (used everywhere)
│  │  └─ logger.js                 # pino + redaction
│  ├─ controllers/auth.controllers.js
│  ├─ middleware/
│  │  ├─ auth.middleware.js        # verify + revocation check
│  │  ├─ error.middleware.js       # notFound + errorHandler
│  │  ├─ rateLimit.middleware.js
│  │  └─ validate.middleware.js
│  ├─ models/{user,blacklistToken}.model.js
│  ├─ routes/auth.routes.js
│  ├─ services/auth.service.js     # crypto/JWT/DB logic out of controllers
│  ├─ utils/{password,token,AppError}.js
│  └─ validators/auth.validator.js
└─ tests/auth.test.js
```

---

## 9. Dependency additions (exact commands)

```bash
npm i helmet cors compression express-rate-limit zod pino pino-http          # runtime
npm i -D nodemon eslint @eslint/js prettier supertest mongodb-memory-server  # dev
```

**No new dependency is required for the P0 fixes** — those are code changes inside existing files.

---

## 10. Pre-launch checklist

- [ ] Secrets rotated; production secrets in a managed store; `.env.example` committed
- [ ] No secret in git history (`git log -p | Select-String "JWT_SECRET"` returns nothing)
- [ ] `NODE_ENV=production`, env validated at boot, non-zero exit on invalid config
- [ ] `helmet` + explicit CORS origins + `credentials: true` + `trust proxy` behind the LB
- [ ] Rate limiting on every auth endpoint; Argon2 cost tuned to the smallest prod instance
- [ ] Cookies `httpOnly` + `secure` + correct `sameSite` + scoped paths + shared config + rotation
- [ ] Logout truly revokes; reusing a revoked/expired token returns 401
- [ ] Validation on every mutating endpoint; body size limit; `password` never in a response
- [ ] Indexes created in production (no `autoIndex` reliance), including the blacklist TTL
- [ ] Structured logs with redaction; no PII or token material in logs
- [ ] `/healthz` + `/readyz` wired to platform health checks
- [ ] Graceful shutdown on SIGTERM within the platform's grace period
- [ ] Tests + CI green; `npm audit --omit=dev` clean
- [ ] README with setup, env vars, endpoints and deployment notes
- [ ] Atlas backups / point-in-time recovery enabled, and a restore drill documented

---

*Review produced by static analysis of the working tree at `bec2fb9` plus untracked files. No
application code was modified; `PRODUCTION_REVIEW.md` is the only file added.*
