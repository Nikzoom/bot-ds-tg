import { Interaction } from "discord.js";
import { handleInteraction } from "../commands";

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error("Command error:", err);
    const reply = interaction.replied
      ? interaction.followUp({ content: "Произошла ошибка.", ephemeral: true })
      : interaction.reply({ content: "Произошла ошибка.", ephemeral: true });
    await reply.catch(() => null);
  }
}
