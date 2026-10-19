import { VoiceState } from "discord.js";
import { upsertDiscordUser } from "../services/users";
import { startVoiceSession, endVoiceSession } from "../services/stats";
import prisma from "@dsbot/db";
import { consumeValorantBotMove, returnSuspendedMemberToChannel } from "../services/valorantVoicePenalty";

export async function onVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): Promise<void> {
  if (newState.member?.user.bot) return;

  const joined = newState.channelId && newState.channelId !== oldState.channelId;
  const left = oldState.channelId && oldState.channelId !== newState.channelId;

  if (!joined && !left) return;

  const user = newState.member ?? oldState.member;
  if (!user) return;

  if (!consumeValorantBotMove(newState.guild.id, user.id, oldState.channelId, newState.channelId)) {
    await prisma.voicePairWindow.updateMany({
      where: {
        guildId: newState.guild.id,
        active: true,
        OR: [{ firstUserId: user.id }, { secondUserId: user.id }],
      },
      data: { active: false },
    });
  }

  await upsertDiscordUser(
    user.id,
    user.displayName,
    user.user.displayAvatarURL()
  );

  if (left) await endVoiceSession(user.id);
  if (joined) {
    await startVoiceSession(
      user.id,
      newState.guild.id,
      newState.channelId!,
      newState.channel?.name ?? undefined
    );
    console.log(`🎙️ ${user.displayName} зашёл в голосовой «${newState.channel?.name ?? newState.channelId}»`);
  } else if (left) {
    console.log(`🔇 ${user.displayName} вышел из голосового`);
  }
  if (joined) await returnSuspendedMemberToChannel(user);
}
