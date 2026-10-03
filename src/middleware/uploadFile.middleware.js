import multer from "multer";
import { AppError } from "../utils/AppError.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf"
      ? cb(null, true)
      : cb(
          new AppError(
            "Only PDF files are allowed",
            415,
            "UNSUPPORTED_FILE_TYPE",
          ),
        ),
});

export default upload;
