import mongoose from "mongoose";
import { env } from "./env.js";

async function connectToDB() {
  mongoose.connection.on("connected", () => console.log("[db] connected"));
  mongoose.connection.on("error", (err) => console.error("[db] error", err));
  mongoose.connection.on("disconnected", () =>
    console.warn("[db] disconnected"),
  );

  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: env.NODE_ENV === "production" ? 20 : 5,
    autoIndex: env.NODE_ENV !== "production", // create indexes via migration in prod
  });
}

export default connectToDB;
