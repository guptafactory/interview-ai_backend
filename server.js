import "dotenv/config";
import dns from "dns";
import app from "./src/app.js";
import connectToDB from "./src/config/database.js";
import { env } from "./src/config/env.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled promise rejection", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaught exception", err);
  process.exit(1);
});

try {
  await connectToDB();
} catch (err) {
  console.error("[fatal] cannot start without a database", err);
  process.exit(1);
}

const server = app.listen(env.PORT, () =>
  console.log(`[server] listening on ${env.PORT}`),
);

server.on("error", (err) => {
  console.error("[fatal] server failed to start", err);
  process.exit(1);
});
