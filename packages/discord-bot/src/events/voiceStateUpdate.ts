import { VoiceState } from "discord.js";
import { upsertDiscordUser } from "../services/users";
import { startVoiceSession, endVoiceSession } from "../services/stats";

export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  if (newState.member?.user.bot) return;

  const joined = newState.channelId && !oldState.channelId;
  const left = !newState.channelId && oldState.channelId;

  if (!joined && !left) return;

  const user = newState.member ?? oldState.member;
  if (!user) return;

  const dbUser = await upsertDiscordUser(
    user.id,
    user.displayName,
    user.user.displayAvatarURL()
  );

  if (joined) {
    await startVoiceSession(
      dbUser.id,
      newState.guild.id,
      newState.channelId!,
      newState.channel?.name ?? undefined
    );
  } else if (left) {
    await endVoiceSession(dbUser.id);
  }
}
