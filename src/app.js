import express from "express";

import authRouter from "./routes/auth.routes.js";

const app = express();

// midllewares
app.use(express.json());

// routers
app.use("/api/auth", authRouter);

export default app;
