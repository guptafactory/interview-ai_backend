import express from "express";

import authRouter from "./routes/auth.routes.js";

const app = express();

// midllewares
app.use(express.json());

// routers
app.get("/", (req, res) => {
  return res.status(200).json({ message: "Welcome to interview-ai backend" });
});

app.use("/api/auth", authRouter);

export default app;
