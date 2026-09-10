export type RuleTrigger = "voice" | "message" | "presence" | "cron";

export type ConditionOperator = "all" | "any" | "at_least" | "none";

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export interface BaseCondition {
  type: string;
}

/** True when specific users are together in a voice channel. */
export interface UsersInVoiceCondition extends BaseCondition {
  type: "users_in_voice";
  userIds: string[];
  operator: ConditionOperator;
  // For "at_least"
  minCount?: number;
  /** Restrict to a specific channel (by id or name) */
  channelId?: string;
  channelName?: string;
}

/** True when a user is playing a specific game (presence). */
export interface UserPlayingCondition extends BaseCondition {
  type: "user_playing";
  userIds: string[];
  gameName: string;
  operator: ConditionOperator;
  minCount?: number;
}

/** True when a message contains text. */
export interface MessageContainsCondition extends BaseCondition {
  type: "message_contains";
  keywords: string[];
  /** all = every keyword, any = at least one */
  operator: "all" | "any";
}

/** True when a message is sent in a specific channel. */
export interface MessageInChannelCondition extends BaseCondition {
  type: "message_in_channel";
  channelId?: string;
  channelName?: string;
}

/** True when a user is currently in a voice channel. */
export interface UserInVoiceCondition extends BaseCondition {
  type: "user_in_voice";
  userIds: string[];
  operator: ConditionOperator;
  minCount?: number;
}

/** Cron-based (always true at schedule time). */
export interface CronCondition extends BaseCondition {
  type: "cron";
  expression: string;
}

export type Condition =
  | UsersInVoiceCondition
  | UserPlayingCondition
  | MessageContainsCondition
  | MessageInChannelCondition
  | UserInVoiceCondition
  | CronCondition;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface BaseAction {
  type: string;
}

export interface AnnounceDiscordAction extends BaseAction {
  type: "announce_discord";
  channelId: string;
  content: string;
  /** Template variables: {users} {game} {channel} */
  embed?: boolean;
  color?: string;
}

export interface AnnounceTelegramAction extends BaseAction {
  type: "announce_telegram";
  chatId?: string;
  content: string;
}

/** Assign a game tag to the ongoing voice sessions of the matched users. */
export interface AssignGameTagAction extends BaseAction {
  type: "assign_game_tag";
  gameTag: string;
}

/** Record a custom statistic event. */
export interface LogStatAction extends BaseAction {
  type: "log_stat";
  metric: string;
  value: number;
}

export type Action =
  | AnnounceDiscordAction
  | AnnounceTelegramAction
  | AssignGameTagAction
  | LogStatAction;

// ---------------------------------------------------------------------------
// Bridge messages
// ---------------------------------------------------------------------------

export interface BridgePayloadDispute {
  disputeId: string;
  title: string;
  description?: string;
  options: string[];
}

export interface BridgePayloadAward {
  awardId: string;
  title: string;
  userName: string;
  points: number;
  month: string;
  category: string;
}

export interface BridgePayloadAnnounce {
  content: string;
}

export interface BridgePayloadPing {
  discordName: string;
  channelName: string;
  mentionerName: string;
  telegramMention: string | null;
}

export type BridgePayload =
  | BridgePayloadDispute
  | BridgePayloadAward
  | BridgePayloadAnnounce
  | BridgePayloadPing;

export type BridgeKind = "announce" | "dispute" | "award" | "stats" | "ping";

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v === undefined ? "" : String(v);
  });
}
