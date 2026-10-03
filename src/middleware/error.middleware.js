import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export function notFoundHandler(req, _res, next) {
  return next(
    new AppError(
      `Route ${req.method} ${req.originalUrl} not found`,
      404,
      "ROUTE_NOT_FOUND",
    ),
  );
}

function toDetails(issues) {
  return issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Turn any thrown value into an `AppError` we are willing to send to a client.
 * Unknown errors collapse to a generic 500 so internals never leak.
 *
 * @param {unknown} err
 * @returns {AppError}
 */
function toAppError(err) {
  // 1. Failures we raised deliberately — trust them completely.
  if (err instanceof AppError) return err;

  // 2. Mongoose document/schema failures.
  if (err?.name === "ValidationError" && err.errors) {
    return new AppError(
      "Validation failed",
      422,
      "VALIDATION_ERROR",
      Object.values(err.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      })),
    );
  }

  if (err?.name === "CastError") {
    return new AppError(`Invalid value for "${err.path}"`, 400, "INVALID_ID", [
      { field: err.path, message: `Invalid value "${err.value}"` },
    ]);
  }

  // 3. Unique index violation (Mongoose / MongoServerError).
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0];
    return new AppError(
      field ? `${field} is already in use` : "Resource already exists",
      409,
      "DUPLICATE_KEY",
      field ? [{ field, message: "Already in use" }] : undefined,
    );
  }

  // 4. jsonwebtoken — every authentication failure is 401, never 500.
  if (err?.name === "TokenExpiredError") {
    return new AppError("Session has expired", 401, "TOKEN_EXPIRED");
  }
  if (err?.name === "NotBeforeError") {
    return new AppError("Session is not active yet", 401, "TOKEN_NOT_ACTIVE");
  }
  if (err?.name === "JsonWebTokenError") {
    return new AppError("Invalid authorisation token", 401, "INVALID_TOKEN");
  }

  // 5. body-parser (`express.json`) — malformed or oversized JSON bodies.
  if (err?.type === "entity.parse.failed") {
    return new AppError(
      "Request body contains malformed JSON",
      400,
      "INVALID_JSON",
    );
  }
  if (err?.type === "entity.too.large") {
    return new AppError("Request body is too large", 413, "PAYLOAD_TOO_LARGE");
  }

  // 6. multer — `MulterError` carries `.code` only, so map it to a status here.
  if (err?.name === "MulterError") {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return new AppError(
          "Uploaded file is too large",
          413,
          "FILE_TOO_LARGE",
        );
      case "LIMIT_UNEXPECTED_FILE":
        return new AppError(
          "Unexpected file in the upload",
          400,
          "UNEXPECTED_FILE",
        );
      case "LIMIT_FILE_COUNT":
        return new AppError("Too many files uploaded", 400, "TOO_MANY_FILES");
      case "LIMIT_PART_COUNT":
      case "LIMIT_FIELD_COUNT":
      case "LIMIT_FIELD_VALUE":
      case "LIMIT_FIELD_KEY":
        return new AppError(
          "Uploaded form data is too large",
          413,
          "UPLOAD_TOO_LARGE",
        );
      default:
        return new AppError(
          "File upload failed",
          400,
          err.code ?? "UPLOAD_ERROR",
        );
    }
  }

  // 7. Zod — e.g. a service-layer schema parsed outside a route.
  if (err?.name === "ZodError" && Array.isArray(err.issues)) {
    return new AppError(
      "Validation failed",
      422,
      "VALIDATION_ERROR",
      toDetails(err.issues),
    );
  }

  // 8. Anything carrying an explicit HTTP status (`http-errors` & friends).
  const status = err?.statusCode ?? err?.status;
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return new AppError(err.message ?? "Request failed", status, "ERROR");
  }

  // 9. Unknown = a bug. Report it, but never expose it.
  return new AppError("Internal server error", 500, "INTERNAL_ERROR");
}

/**
 * 5xx are logged as errors; 4xx are normal traffic and are only logged while
 * developing. `req.log` is used when a structured logger has been wired in.
 */
function logError(err, appError, req) {
  const { statusCode, code } = appError;
  const isServerError = statusCode >= 500;

  if (!isServerError && env.NODE_ENV !== "development") return;

  const summary = `${req.method} ${req.originalUrl} → ${statusCode} ${code}`;
  const context = { statusCode, code };

  if (req.log) {
    if (isServerError) req.log.error({ err, ...context }, summary);
    else req.log.warn({ err, ...context }, summary);
    return;
  }

  if (isServerError) console.error(`[error] ${summary}`, err);
  else console.warn(`[error] ${summary}`, err);
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const appError = toAppError(err);
  logError(err, appError, req);

  return res.status(appError.statusCode).json({
    message: appError.expose ? appError.message : "Internal server error",
    code: appError.code,
    ...(appError.details ? { errors: appError.details } : {}),
    ...(env.NODE_ENV === "development" ? { stack: err?.stack } : {}),
  });
}

export { toAppError };
