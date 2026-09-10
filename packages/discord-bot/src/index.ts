import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config";
import { RulesEngine } from "./services/rulesEngine";
import { onReady } from "./events/ready";
import { onVoiceStateUpdate } from "./events/voiceStateUpdate";
import { onMessageCreate } from "./events/messageCreate";
import { onInteractionCreate } from "./events/interactionCreate";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const engine = new RulesEngine(client);

client.once("clientReady", () => onReady(client, engine));
client.on("voiceStateUpdate", (o, n) => onVoiceStateUpdate(o, n).catch(console.error));
client.on("messageCreate", (m) => onMessageCreate(m, engine).catch(console.error));
client.on("interactionCreate", (i) => onInteractionCreate(i));

client.login(config.token).catch((err) => {
  console.error("Failed to login:", err);
  process.exit(1);
});
