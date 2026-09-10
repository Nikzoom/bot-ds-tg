import { Message } from "discord.js";
import { upsertDiscordUser } from "../services/users";
import { recordMessage } from "../services/stats";
import { RulesEngine } from "../services/rulesEngine";
import { onPingBridge } from "../services/pingBridge";

export async function onMessageCreate(message: Message, engine: RulesEngine): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const dbUser = await upsertDiscordUser(
    message.author.id,
    message.author.displayName,
    message.author.displayAvatarURL()
  );
  await recordMessage(dbUser.id, message.guild.id, message.channel.id);

  await engine.evaluateMessageRules(message);
  await onPingBridge(message);
}
