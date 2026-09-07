import { start } from "./bot";

start().catch((err) => {
  console.error("Failed to start Telegram bot:", err);
  process.exit(1);
});
