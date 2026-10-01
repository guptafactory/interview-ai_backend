import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";

import { env } from "./config/env.js";
import authRouter from "./routes/auth.route.js";
import interviewRouter from "./routes/auth.route.js";
import {
  notFoundHandler,
  errorHandler,
} from "./middleware/error.middleware.js";

const app = express();

app.disable("x-powered-by");
if (env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.get("/", (req, res) =>
  res.status(200).json({ message: "Welcome to interview-ai backend" }),
);
app.get("/healthz", (req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/interview", interviewRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
