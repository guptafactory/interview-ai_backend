import "dotenv/config";
import dns from "dns";
import app from "./src/app.js";
import connectToDB from "./src/config/database.js";
import { env } from "./src/config/env.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

try {
  await connectToDB();
} catch (err) {
  console.error("[fatal] cannot start without a database", err);
  process.exit(1);
}

try {
  const server = app.listen(env.PORT, () =>
    console.log(`[server] listening on ${env.PORT}`),
  );
} catch (err) {
  console.error(err);
}
