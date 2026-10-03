import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { AppError } from "../utils/AppError.js";

/**
 * Every limiter funnels through the global `errorHandler`, so a 429 comes back
 * in the same shape as the rest of the API (`{ message, code }`) instead of the
 * library's bespoke body. The `RateLimit-*` / `Retry-After` headers are still
 * set before the handler runs.
 */
const limitReached = (message) => (_req, _res, next) =>
  next(new AppError(message, 429, "RATE_LIMITED"));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: limitReached("Too many attempts. Please try again later."),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: limitReached("Too many login attempts. Please try again later."),
});

const createReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10, // 10 reports / hour / user
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip),
  handler: limitReached("Report limit reached. Try again later."),
});

export { authLimiter, loginLimiter, createReportLimiter };
