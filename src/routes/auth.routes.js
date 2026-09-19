import { Router } from "express";
import { registerUser } from "../controllers/auth.controllers";

const authRouter = Router();

authRouter.get("/", (req, res) => {});

authRouter.post("/register", registerUser);

export default authRouter;
