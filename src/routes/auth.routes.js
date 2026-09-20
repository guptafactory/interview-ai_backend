import { Router } from "express";
import { registerUser, loginUser } from "../controllers/auth.controllers.js";

const authRouter = Router();

authRouter.get("/", (req, res) => {
  return res.status(200).json({ message: "Welcome to authRouter" });
});

authRouter.post("/register", registerUser);
authRouter.post("/login", loginUser);

export default authRouter;
