import { Router } from "express";

import authUser from "../middleware/auth.middleware.js";
import {} from "../middleware/rateLimit.middleware.js";
import upload from "../middleware/upload.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {} from "../validators/interview.validator.js";
import {} from "../controllers/interview.controller.js";

const interviewRouter = Router();

interviewRouter.get("/", (_, res) => {
  return res.status(200).json({ message: "Welcome to interviewRouter" });
});

interviewRouter.post(
  "/",
  authUser,
  upload.single("resume"),
  validate(registerSchema),
);

export default interviewRouter;
