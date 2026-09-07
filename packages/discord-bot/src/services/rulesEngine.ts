import { Client, Guild, Message, TextChannel } from "discord.js";
import prisma from "@dsbot/db";
import {
  Action,
  Condition,
  UsersInVoiceCondition,
  UserInVoiceCondition,
  UserPlayingCondition,
  MessageContainsCondition,
  MessageInChannelCondition,
  renderTemplate,
} from "@dsbot/shared";
import { pushBridgeMessage } from "./bridge";

export interface VoiceContext {
  /** channelId -> set of userIds currently connected */
  channelUsers: Map<string, Set<string>>;
  /** all userIds currently connected */
  allUsers: Set<string>;
}

export interface MessageContext {
  guild: Guild;
  message: Message;
}

function buildVoiceContext(guild: Guild): VoiceContext {
  const channelUsers = new Map<string, Set<string>>();
  const allUsers = new Set<string>();
  for (const vs of guild.voiceStates.cache.values()) {
    if (!vs.channelId || vs.member?.user.bot) continue;
    allUsers.add(vs.id);
    if (!channelUsers.has(vs.channelId)) channelUsers.set(vs.channelId, new Set());
    channelUsers.get(vs.channelId)!.add(vs.id);
  }
  return { channelUsers, allUsers };
}

/** Largest number of the given users that share a single voice channel. */
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

function evalUsersInVoice(ctx: VoiceContext, c: UsersInVoiceCondition): boolean {
  const colocated = maxColocated(ctx, c.userIds, c.channelId);
  switch (c.operator) {
    case "all":
      return colocated === c.userIds.length;
    case "any":
      return colocated >= 1;
    case "at_least":
      return colocated >= (c.minCount ?? 1);
    case "none":
      return colocated === 0;
    default:
      return false;
  }
}

function evalUserInVoice(ctx: VoiceContext, c: UserInVoiceCondition): boolean {
  const present = c.userIds.filter((id) => ctx.allUsers.has(id)).length;
  switch (c.operator) {
    case "all":
      return present === c.userIds.length;
    case "any":
      return present >= 1;
    case "at_least":
      return present >= (c.minCount ?? 1);
    case "none":
      return present === 0;
    default:
      return false;
  }
}

function evalUserPlaying(guild: Guild, c: UserPlayingCondition): boolean {
  const playing = c.userIds.filter((id) => {
    const pres = guild.presences.cache.get(id);
    return pres?.activities.some((a) => a.name.toLowerCase().includes(c.gameName.toLowerCase()));
  }).length;
  switch (c.operator) {
    case "all":
      return playing === c.userIds.length;
    case "any":
      return playing >= 1;
    case "at_least":
      return playing >= (c.minCount ?? 1);
    case "none":
      return playing === 0;
    default:
      return false;
  }
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

function evalCondition(cond: Condition, ctx: { voice?: VoiceContext; guild: Guild; message?: Message }): boolean {
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
    default:
      return false;
  }
}

export class RulesEngine {
  constructor(private client: Client) {}

  private guild(): Guild | undefined {
    return this.client.guilds.cache.find((g) => g.id === process.env.DISCORD_GUILD_ID) ??
      this.client.guilds.cache.first();
  }

  /** Evaluate voice-triggered rules against the current voice state. */
  async evaluateVoiceRules(): Promise<void> {
    const guild = this.guild();
    if (!guild) return;
    const rules = await prisma.rule.findMany({
      where: { trigger: "voice", enabled: true },
      orderBy: { priority: "asc" },
    });
    const voice = buildVoiceContext(guild);
    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition[];
      const actions = rule.actions as unknown as Action[];
      const ctx = { voice, guild };
      if (conditions.every((c) => evalCondition(c, ctx))) {
        await this.executeActions(actions, { voice, guild });
      }
    }
  }

  /** Evaluate message-triggered rules. */
  async evaluateMessageRules(message: Message): Promise<void> {
    if (message.author.bot) return;
    const guild = message.guild;
    if (!guild) return;
    const rules = await prisma.rule.findMany({
      where: { trigger: "message", enabled: true },
      orderBy: { priority: "asc" },
    });
    for (const rule of rules) {
      const conditions = rule.conditions as unknown as Condition[];
      const actions = rule.actions as unknown as Action[];
      const ctx = { guild, message };
      if (conditions.every((c) => evalCondition(c, ctx))) {
        await this.executeActions(actions, ctx);
      }
    }
  }

  private async executeActions(
    actions: Action[],
    ctx: { voice?: VoiceContext; guild: Guild; message?: Message }
  ): Promise<void> {
    const usersInVoice = ctx.voice ? [...ctx.voice.allUsers] : [];
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
        case "log_stat": {
          // Custom metric events can be surfaced on the panel later.
          break;
        }
      }
    }
  }
}
