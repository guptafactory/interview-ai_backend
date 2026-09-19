import "dotenv/config";
import dns from "dns";
import app from "./src/app.js";
import connectToDB from "./src/config/database.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const PORT = process.env.PORT || 3000;

try {
  connectToDB();

  app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
  });
} catch (err) {
  console.log(err);
}
