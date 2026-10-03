import { AppError } from "../utils/AppError.js";

/**
 * Parses the body against `schema` and replaces it with the parsed result, so
 * controllers always receive normalised (trimmed / lower-cased) values.
 *
 * Failures are handed to the global `errorHandler`, which serialises
 * `AppError.details` as `errors: [{ field, message }]`.
 */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      "Validation failed",
      422,
      "VALIDATION_ERROR",
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  req.body = result.data;
  return next();
};
