/**
 * Operational (expected) error.
 *
 * Throw this anywhere — controller, middleware or service — and the global
 * `errorHandler` will trust `statusCode` / `code` / `details` as-is and turn it
 * into the standard API error body. Anything that is *not* an `AppError` is
 * treated as a bug and reported to the client as a generic 500.
 */
export class AppError extends Error {
  /**
   * @param {string} message Client-safe message (never an internal detail).
   * @param {number} [statusCode] HTTP status to send. Defaults to 500.
   * @param {string} [code] Stable, machine-readable code for the client.
   * @param {{ field: string, message: string }[]} [details] Field-level errors,
   *   serialised as `errors` in the response body.
   */
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    // 5xx messages can contain internals, so they are never sent to clients.
    this.expose = statusCode < 500;

    if (details?.length) this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
