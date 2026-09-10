import {
  Client,
  ChannelType,
  Guild,
  GuildMember,
  Message,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import prisma, { Rule } from "@dsbot/db";
import {
  Action,
  Condition,
  ConditionOperator,
  UsersInVoiceCondition,
  UserInVoiceCondition,
  UserPlayingCondition,
  MessageContainsCondition,
  MessageInChannelCondition,
  VoiceUsersCountCondition,
  UserVoiceTimeCondition,
  UserMessagesCondition,
  WeekdayCondition,
  TimeBetweenCondition,
  renderTemplate,
} from "@dsbot/shared";
import { pushBridgeMessage } from "./bridge";
import { addPointsByDiscordId } from "./points";

export interface VoiceContext {
  /** channelId -> set of userIds currently connected */
  channelUsers: Map<string, Set<string>>;
  /** channelId -> channel name */
  channelNames: Map<string, string>;
  /** all userIds currently connected */
  allUsers: Set<string>;
}

interface EvalContext {
  voice?: VoiceContext;
  guild: Guild;
  message?: Message;
}

function buildVoiceContext(guild: Guild): VoiceContext {
  const channelUsers = new Map<string, Set<string>>();
  const channelNames = new Map<string, string>();
  const allUsers = new Set<string>();
  for (const vs of guild.voiceStates.cache.values()) {
    if (!vs.channelId || vs.member?.user.bot) continue;
    allUsers.add(vs.id);
    if (!channelUsers.has(vs.channelId)) channelUsers.set(vs.channelId, new Set());
    channelUsers.get(vs.channelId)!.add(vs.id);
    if (vs.channel?.name) channelNames.set(vs.channelId, vs.channel.name);
  }
  return { channelUsers, channelNames, allUsers };
}

// ---------------------------------------------------------------------------
// Condition evaluators
// ---------------------------------------------------------------------------

function maxColocated(ctx: VoiceContext, userIds: string[], channelFilter?: string): number {
  let best = 0;
  for (const [channelId, users] of ctx.channelUsers) {
    if (channelFilter && channelId !== channelFilter) continue;
    let count = 0;
    for (const id of userIds) if (users.has(id)) count++;
    best = Math.max(best, count);
  }
  return best;
}

function compareMeeting(
  meeting: number,
  total: number,
  operator: ConditionOperator,
  minCount?: number
): boolean {
  switch (operator) {
    case "all":
      return meeting === total && total > 0;
    case "any":
      return meeting >= 1;
    case "at_least":
      return meeting >= (minCount ?? 1);
    case "none":
      return meeting === 0;
    default:
      return false;
  }
}

function evalUsersInVoice(ctx: VoiceContext, c: UsersInVoiceCondition): boolean {
  const colocated = maxColocated(ctx, c.userIds, c.channelId);
  return compareMeeting(colocated, c.userIds.length, c.operator, c.minCount);
}

function evalUserInVoice(ctx: VoiceContext, c: UserInVoiceCondition): boolean {
  const present = c.userIds.filter((id) => ctx.allUsers.has(id)).length;
  return compareMeeting(present, c.userIds.length, c.operator, c.minCount);
}

function evalUserPlaying(guild: Guild, c: UserPlayingCondition): boolean {
  const playing = c.userIds.filter((id) => {
    const pres = guild.presences.cache.get(id);
    return pres?.activities.some((a) => a.name.toLowerCase().includes(c.gameName.toLowerCase()));
  }).length;
  return compareMeeting(playing, c.userIds.length, c.operator, c.minCount);
}

function evalMessageContains(message: Message, c: MessageContainsCondition): boolean {
  const text = message.content.toLowerCase();
  const matches = c.keywords.filter((k) => text.includes(k.toLowerCase()));
  return c.operator === "all" ? matches.length === c.keywords.length : matches.length >= 1;
}

function evalMessageInChannel(message: Message, c: MessageInChannelCondition): boolean {
  const channel = message.channel;
  if (c.channelId && channel.id !== c.channelId) return false;
  if (c.channelName) {
    if (!("name" in channel)) return false;
    if ((channel.name ?? "").toLowerCase() !== c.channelName.toLowerCase()) return false;
  }
  return true;
}

function evalVoiceUsersCount(ctx: VoiceContext | undefined, c: VoiceUsersCountCondition): boolean {
  if (!ctx) return false;
  if (c.channelId) return (ctx.channelUsers.get(c.channelId)?.size ?? 0) >= c.minCount;
  if (c.channelName) {
    const cid = [...ctx.channelNames.entries()].find(
      ([, name]) => name.toLowerCase() === c.channelName!.toLowerCase()
    )?.[0];
    return cid ? (ctx.channelUsers.get(cid)?.size ?? 0) >= c.minCount : false;
  }
  return ctx.allUsers.size >= c.minCount;
}

function evalWeekday(c: WeekdayCondition): boolean {
  return c.days.includes(new Date().getDay());
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function evalTimeBetween(c: TimeBetweenCondition): boolean {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(c.from);
  const to = toMinutes(c.to);
  if (from <= to) return cur >= from && cur < to;
  return cur >= from || cur < to; // overnight range
}

function periodRange(period: "day" | "week" | "month"): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") {
    return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), to: now };
  }
  if (period === "week") {
    return { from: new Date(now.getTime() - 7 * 24 * 3600 * 1000), to: now };
  }
  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: now };
}

/** Count how many of the listed users meet a DailyStat threshold in a period. */
async function usersMeetingStat(
  userIds: string[],
  period: "day" | "week" | "month",
  field: "voiceSeconds" | "messages",
  threshold: number
): Promise<number> {
  const users = await prisma.user.findMany({ where: { discordId: { in: userIds } } });
  if (users.length === 0) return 0;
  const ids = users.map((u) => u.id);
  const { from, to } = periodRange(period);
  const rows = await prisma.dailyStat.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, date: { gte: from, lt: to } },
    _sum: { [field]: true } as never,
  });
  const sums = new Map(rows.map((r) => [r.userId, (r._sum as Record<string, number>)[field] ?? 0]));
  let count = 0;
  for (const u of users) {
    if ((sums.get(u.id) ?? 0) >= threshold) count++;
  }
  return count;
}

async function evalUserVoiceTime(c: UserVoiceTimeCondition): Promise<boolean> {
  const meeting = await usersMeetingStat(c.userIds, c.period, "voiceSeconds", c.minMinutes * 60);
  return c.operator === "all" ? meeting === c.userIds.length : meeting >= 1;
}

async function evalUserMessages(c: UserMessagesCondition): Promise<boolean> {
  const meeting = await usersMeetingStat(c.userIds, c.period, "messages", c.minCount);
  return c.operator === "all" ? meeting === c.userIds.length : meeting >= 1;
}

async function evalCondition(cond: Condition, ctx: EvalContext): Promise<boolean> {
  switch (cond.type) {
    case "users_in_voice":
      return ctx.voice ? evalUsersInVoice(ctx.voice, cond) : false;
    case "user_in_voice":
      return ctx.voice ? evalUserInVoice(ctx.voice, cond) : false;
    case "user_playing":
      return evalUserPlaying(ctx.guild, cond);
    case "message_contains":
      return ctx.message ? evalMessageContains(ctx.message, cond) : false;
    case "message_in_channel":
      return ctx.message ? evalMessageInChannel(ctx.message, cond) : false;
    case "voice_users_count":
      return evalVoiceUsersCount(ctx.voice, cond);
    case "user_voice_time":
      return evalUserVoiceTime(cond);
    case "user_messages":
      return evalUserMessages(cond);
    case "weekday":
      return evalWeekday(cond);
    case "time_between":
      return evalTimeBetween(cond);
    default:
      return false;
  }
}

async function evaluateConditions(conditions: Condition[], ctx: EvalContext): Promise<boolean> {
  for (const c of conditions) {
    if (!(await evalCondition(c, ctx))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

function targetDiscordIds(ctx: EvalContext): string[] {
  if (ctx.voice) return [...ctx.voice.allUsers];
  if (ctx.message) return [ctx.message.author.id];
  return [];
}

async function getMembers(guild: Guild, discordIds: string[]): Promise<GuildMember[]> {
  const members: GuildMember[] = [];
  for (const id of discordIds) {
    const m =
      guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
    if (m) members.push(m);
  }
  return members;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class RulesEngine {
  constructor(private client: Client) {}

  private guild(): Guild | undefined {
    return (
      this.client.guilds.cache.find((g) => g.id === process.env.DISCORD_GUILD_ID) ??
      this.client.guilds.cache.first()
    );
  }

  private async shouldFire(rule: Rule, now: Date): Promise<boolean> {
    if (!rule.lastFiredAt) return true;
    if (rule.fireOnce) return false;
    if (rule.cooldownSeconds) {
      const elapsed = (now.getTime() - rule.lastFiredAt.getTime()) / 1000;
      if (elapsed < rule.cooldownSeconds) return false;
    }
    return true;
  }

  private async markFired(rule: Rule, now: Date): Promise<void> {
    await prisma.rule.update({ where: { id: rule.id }, data: { lastFiredAt: now } });
  }

  async evaluateVoiceRules(): Promise<void> {
    const guild = this.guild();
    if (!guild) return;
    const rules = await prisma.rule.findMany({
      where: { trigger: "voice", enabled: true },
      orderBy: { priority: "asc" },
    });
    const voice = buildVoiceContext(guild);
    const now = new Date();
    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition[];
      const actions = rule.actions as unknown as Action[];
      const ctx: EvalContext = { voice, guild };
      if (!(await evaluateConditions(conditions, ctx))) continue;
      if (!(await this.shouldFire(rule, now))) continue;
      await this.executeActions(actions, ctx);
      await this.markFired(rule, now);
    }
  }

  async evaluateMessageRules(message: Message): Promise<void> {
    if (message.author.bot) return;
    const guild = message.guild;
    if (!guild) return;
    const rules = await prisma.rule.findMany({
      where: { trigger: "message", enabled: true },
      orderBy: { priority: "asc" },
    });
    const now = new Date();
    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition[];
      const actions = rule.actions as unknown as Action[];
      const ctx: EvalContext = { guild, message };
      if (!(await evaluateConditions(conditions, ctx))) continue;
      if (!(await this.shouldFire(rule, now))) continue;
      await this.executeActions(actions, ctx);
      await this.markFired(rule, now);
    }
  }

  private async executeActions(actions: Action[], ctx: EvalContext): Promise<void> {
    const usersInVoice = ctx.voice ? [...ctx.voice.allUsers] : [];
    const targets = targetDiscordIds(ctx);

    for (const action of actions) {
      switch (action.type) {
        case "announce_discord": {
          const channel = (await ctx.guild.channels.fetch(action.channelId).catch(() => null)) as
            | TextChannel
            | null;
          if (!channel) continue;
          const content = renderTemplate(action.content, {
            users: usersInVoice.join(", "),
            game: "",
            channel: ctx.message?.channel.id ?? "",
          });
          if (action.embed) {
            await channel.send({
              embeds: [
                {
                  description: content,
                  color: Number.parseInt(action.color ?? "0x5865F2", 16) || 0x5865f2,
                },
              ],
            });
          } else {
            await channel.send(content);
          }
          break;
        }
        case "announce_telegram": {
          const content = renderTemplate(action.content, {
            users: usersInVoice.join(", "),
            game: "",
            channel: ctx.message?.channel.id ?? "",
          });
          await pushBridgeMessage("announce", { content });
          break;
        }
        case "assign_game_tag": {
          for (const userId of usersInVoice) {
            const { setSessionGameTag } = await import("./stats.js");
            await setSessionGameTag(userId, action.gameTag);
          }
          break;
        }
        case "give_points": {
          for (const id of targets) {
            await addPointsByDiscordId(id, action.points, "rule");
          }
          break;
        }
        case "give_role": {
          const members = await getMembers(ctx.guild, targets);
          for (const m of members) await m.roles.add(action.roleId).catch(() => null);
          break;
        }
        case "remove_role": {
          const members = await getMembers(ctx.guild, targets);
          for (const m of members) await m.roles.remove(action.roleId).catch(() => null);
          break;
        }
        case "move_user": {
          let channel: VoiceChannel | null = null;
          if (action.channelId === "random") {
            const vcs = ctx.guild.channels.cache.filter(
              (c) => c.type === ChannelType.GuildVoice
            );
            channel = (vcs.random() as VoiceChannel | undefined) ?? null;
          } else {
            channel = (await ctx.guild.channels.fetch(action.channelId).catch(() => null)) as
              | VoiceChannel
              | null;
          }
          if (!channel) continue;
          const members = await getMembers(ctx.guild, targets);
          for (const m of members) {
            if (m.voice.channelId) await m.voice.setChannel(channel).catch(() => null);
          }
          break;
        }
        case "send_dm": {
          const members = await getMembers(ctx.guild, targets);
          for (const m of members) await m.send(action.content).catch(() => null);
          break;
        }
        case "log_stat": {
          break;
        }
      }
    }
  }
}
