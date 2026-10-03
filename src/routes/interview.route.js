import { Router } from "express";

import authUser from "../middleware/auth.middleware.js";
import { createReportLimiter } from "../middleware/rateLimit.middleware.js";
import upload from "../middleware/uploadFile.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createReportSchema } from "../validators/interview.validator.js";
import { createInterviewReport } from "../controllers/interview.controller.js";

const interviewRouter = Router();

interviewRouter.get("/", (_, res) => {
  return res.status(200).json({ message: "Welcome to interviewRouter" });
});

interviewRouter.post(
  "/createReport",
  createReportLimiter,
  authUser,
  upload.single("resume"),
  validate(createReportSchema),
  createInterviewReport,
);

export default interviewRouter;
