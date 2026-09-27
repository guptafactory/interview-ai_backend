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

  if (err.name === "ValidationError") {
    statusCode = 422;
    code = "VALIDATION_ERROR";
  }
  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID";
  }
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "INVALID_TOKEN";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = "TOKEN_EXPIRED";
  }
  if (err.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_KEY";
    message = "Resource already exists";
  }

  if (statusCode >= 500) {
    req.log?.error({ err }, "unhandled error");
    if (env.NODE_ENV !== "test" && !req.log) console.error("[error]", err);
  }

  return res.status(statusCode).json({
    message:
      statusCode >= 500 ? "Internal server error" : (message ?? err.message),
    code,
    ...(env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}
