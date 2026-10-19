import { ChannelType, Client, Guild, GuildMember } from "discord.js";
import prisma from "@dsbot/db";
import { config } from "../config";

let running = false;

interface PenaltySettings {
  roleIds: string[];
  waitMinutes: number;
  repeatExtraMinutes: number;
  suspendMinutes: number;
  destinationChannelId: string | null;
}

const botMoves = new Map<string, { from: string; to: string; until: number }>();

function moveKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function consumeValorantBotMove(guildId: string, userId: string, from: string | null, to: string | null): boolean {
  const key = moveKey(guildId, userId);
  const move = botMoves.get(key);
  if (!move) return false;
  botMoves.delete(key);
  return move.until > Date.now() && move.from === from && move.to === to;
}

export async function returnSuspendedMemberToChannel(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const currentChannelId = member.voice.channelId;
  if (!currentChannelId) return;
  const saved = await prisma.voicePenaltyConfig.findUnique({ where: { guildId: guild.id } });
  const destinationId = saved?.enabled ? saved.destinationChannelId : null;
  if (!destinationId || destinationId === currentChannelId) return;
  const suspension = await prisma.roleSuspension.findFirst({
    where: { guildId: guild.id, userId: member.id, expiresAt: { gt: new Date() } },
  });
  if (!suspension) return;
  const destination = await guild.channels.fetch(destinationId);
  if (destination?.type !== ChannelType.GuildVoice) return;
  const key = moveKey(guild.id, member.id);
  botMoves.set(key, { from: currentChannelId, to: destinationId, until: Date.now() + 30000 });
  try {
    await member.voice.setChannel(destination, "Возврат в канал на время наказания за Valorant");
  } catch (error) {
    botMoves.delete(key);
    throw error;
  }
}

function isPlayingValorant(guild: Guild, userId: string): boolean {
  return guild.presences.cache.get(userId)?.activities.some(
    (activity) => activity.name.toLowerCase().includes("valorant")
  ) ?? false;
}

async function restoreExpiredRoles(client: Client, now: Date): Promise<void> {
  const expired = await prisma.roleSuspension.findMany({ where: { expiresAt: { lte: now } } });
  for (const suspension of expired) {
    const guild = client.guilds.cache.get(suspension.guildId);
    if (!guild) continue;
    let member: GuildMember;
    try {
      member = await guild.members.fetch({ user: suspension.userId, force: true });
    } catch (error) {
      if ((error as { code?: number }).code === 10007) {
        await prisma.roleSuspension.delete({ where: { id: suspension.id } });
      } else {
        console.error(`Не удалось получить участника ${suspension.userId} для возврата роли:`, error);
      }
      continue;
    }
    try {
      if (!member.roles.cache.has(suspension.roleId)) {
        await member.roles.add(suspension.roleId, "Возврат роли после наказания за Valorant");
      }
      await prisma.roleSuspension.delete({ where: { id: suspension.id } });
      console.log(`🔄 Роль ${suspension.roleId} возвращена ${member.user.tag}`);
    } catch (error) {
      console.error(`Не удалось вернуть роль ${suspension.roleId} пользователю ${member.id}:`, error);
    }
  }
}

async function suspendRoles(guild: Guild, userIds: string[], roleIds: string[], now: Date, suspendMinutes: number): Promise<void> {
  const expiresAt = new Date(now.getTime() + suspendMinutes * 60 * 1000);
  for (const userId of userIds) {
    const member: GuildMember | null = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
    if (!member) throw new Error(`Участник ${userId} недоступен`);
    for (const roleId of roleIds) {
      const key = { guildId_userId_roleId: { guildId: guild.id, userId, roleId } };
      const existing = await prisma.roleSuspension.findUnique({ where: key });
      // Record the original ownership before removing the role, so a restart can restore it.
      if (existing && existing.expiresAt < expiresAt) {
        await prisma.roleSuspension.update({ where: key, data: { expiresAt } });
      } else if (!existing) {
        if (!member.roles.cache.has(roleId)) continue;
        await prisma.roleSuspension.create({ data: { guildId: guild.id, userId, roleId, expiresAt } });
      }
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, `Наказание за Valorant: ${suspendMinutes} мин без роли`);
      }
    }
  }
}

async function scanGuild(guild: Guild, settings: PenaltySettings, now: Date): Promise<void> {
  const current = new Map<string, { channelId: string; userIds: [string, string] }>();
  const byChannel = new Map<string, string[]>();
  for (const state of guild.voiceStates.cache.values()) {
    if (!state.channelId || state.member?.user.bot) continue;
    const users = byChannel.get(state.channelId) ?? [];
    users.push(state.id);
    byChannel.set(state.channelId, users);
  }
  for (const [channelId, users] of byChannel) {
    users.sort();
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userIds: [string, string] = [users[i], users[j]];
        current.set(`${guild.id}:${userIds[0]}:${userIds[1]}`, { channelId, userIds });
      }
    }
  }

  const windows = await prisma.voicePairWindow.findMany({ where: { guildId: guild.id, active: true } });
  const existing = new Map(windows.map((window) => [window.id, window]));
  for (const window of windows) {
    if (!current.has(window.id)) {
      await prisma.voicePairWindow.update({ where: { id: window.id }, data: { active: false } });
    }
  }
  for (const [id, pair] of current) {
    let window = existing.get(id);
    if (!window || window.channelId !== pair.channelId) {
      window = await prisma.voicePairWindow.upsert({
        where: { id },
        create: {
          id, guildId: guild.id, channelId: pair.channelId,
          firstUserId: pair.userIds[0], secondUserId: pair.userIds[1], startedAt: now,
        },
        update: { channelId: pair.channelId, active: true, startedAt: now, penalizedAt: null, repeatCount: 0 },
      });
    }
    const requiredMinutes = settings.waitMinutes + (window.repeatCount > 0 ? settings.repeatExtraMinutes : 0);
    if (now.getTime() - window.startedAt.getTime() < requiredMinutes * 60 * 1000) continue;
    if (!pair.userIds.some((userId) => isPlayingValorant(guild, userId))) continue;
    if (!pair.userIds.every((userId) => guild.voiceStates.cache.get(userId)?.channelId === pair.channelId)) continue;
    try {
      const destination = settings.destinationChannelId
        ? await guild.channels.fetch(settings.destinationChannelId) : null;
      if (settings.destinationChannelId && destination?.type !== ChannelType.GuildVoice) {
        throw new Error(`Канал ${settings.destinationChannelId} не найден или не является голосовым`);
      }
      await suspendRoles(guild, pair.userIds, settings.roleIds, now, settings.suspendMinutes);
      if (destination?.type === ChannelType.GuildVoice && destination.id !== pair.channelId) {
        for (const userId of pair.userIds) {
          const member = await guild.members.fetch({ user: userId, force: true });
          if (member.voice.channelId === pair.channelId) {
            const key = moveKey(guild.id, userId);
            botMoves.set(key, { from: pair.channelId, to: destination.id, until: Date.now() + 30000 });
            try {
              await member.voice.setChannel(destination, "Перенос пары после наказания за Valorant");
            } catch (error) {
              botMoves.delete(key);
              throw error;
            }
          }
        }
      }
      await prisma.voicePairWindow.update({ where: { id }, data: {
        channelId: destination?.type === ChannelType.GuildVoice ? destination.id : pair.channelId,
        startedAt: now, penalizedAt: now, repeatCount: { increment: 1 },
      } });
      console.log(`🎮 Пара ${pair.userIds.join(" и ")} наказана за Valorant в канале ${pair.channelId}`);
    } catch (error) {
      console.error(`Не удалось применить наказание Valorant для пары ${id}:`, error);
    }
  }
}

export async function evaluateValorantVoicePenalty(client: Client): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    await restoreExpiredRoles(client, now);
    for (const guild of client.guilds.cache.values()) {
      if (config.guildId && guild.id !== config.guildId) continue;
      const saved = await prisma.voicePenaltyConfig.findUnique({ where: { guildId: guild.id } });
      const roleIds = saved
        ? (saved.enabled ? [saved.firstRoleId, saved.secondRoleId].filter((id): id is string => Boolean(id)) : [])
        : config.valorantRoleIds;
      if (roleIds.length === 2 && roleIds[0] !== roleIds[1]) {
        await scanGuild(guild, {
          roleIds,
          waitMinutes: saved?.waitMinutes ?? 90,
          repeatExtraMinutes: saved?.repeatExtraMinutes ?? 20,
          suspendMinutes: saved?.suspendMinutes ?? 20,
          destinationChannelId: saved?.destinationChannelId ?? null,
        }, now);
      } else {
        await prisma.voicePairWindow.updateMany({ where: { guildId: guild.id, active: true }, data: { active: false } });
      }
    }
  } finally {
    running = false;
  }
}
