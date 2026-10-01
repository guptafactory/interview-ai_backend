import { Router } from "express";

import authUser from "../middleware/auth.middleware.js";
import {
  authLimiter,
  loginLimiter,
} from "../middleware/rateLimit.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
} from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.get("/", (_, res) => {
  return res.status(200).json({ message: "Welcome to authRouter" });
});

authRouter.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  registerUser,
);

authRouter.post("/login", loginLimiter, validate(loginSchema), loginUser);

authRouter.post("/logout", authUser, logoutUser);

authRouter.get("/get-me", authUser, getMe);

export default authRouter;
