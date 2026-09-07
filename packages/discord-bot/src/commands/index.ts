import {
  ChatInputCommandInteraction,
  Client,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationCommandOptionType,
} from "discord.js";
import prisma, { getLeaderboard, monthRange } from "@dsbot/db";
import { config } from "../config";
import { findUserByDiscordId, upsertDiscordUser } from "../services/users";
import { createDispute, settleDispute, vote, formatDisputeResults } from "../services/dispute";
import { formatDuration, monthLabelRu, monthKey } from "@dsbot/shared";

const commands = [
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Статистика активности (текущий месяц)")
    .addUserOption((o) =>
      o.setName("user").setDescription("Пользователь (по умолчанию — ты)")
    ),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Топ активных участников за месяц")
    .addIntegerOption((o) =>
      o.setName("limit").setDescription("Сколько мест показать").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("dispute")
    .setDescription("Споры")
    .addSubcommand((s) =>
      s
        .setName("create")
        .setDescription("Создать спор")
        .addStringOption((o) => o.setName("title").setDescription("Тема спора").setRequired(true))
        .addStringOption((o) =>
          o.setName("options").setDescription("Варианты через запятую").setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName("minutes").setDescription("Длительность (мин)").setRequired(false)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("vote")
        .setDescription("Проголосовать")
        .addStringOption((o) => o.setName("id").setDescription("ID спора").setRequired(true))
        .addIntegerOption((o) => o.setName("option").setDescription("Номер варианта (с 1)").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("results")
        .setDescription("Результаты спора")
        .addStringOption((o) => o.setName("id").setDescription("ID спора").setRequired(true))
    ),
  new SlashCommandBuilder().setName("rules").setDescription("Список активных правил"),
];

export async function registerCommands(client: Client): Promise<void> {
  const rest = new REST().setToken(config.token);
  const body = commands.map((c) => c.toJSON());
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
  }
}

export async function handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;
  if (commandName === "stats") return handleStats(interaction);
  if (commandName === "leaderboard") return handleLeaderboard(interaction);
  if (commandName === "dispute") return handleDispute(interaction);
  if (commandName === "rules") return handleRules(interaction);
}

async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  await upsertDiscordUser(target.id, target.displayName, target.displayAvatarURL());

  const { from, to } = monthRange(monthKey());
  const user = await findUserByDiscordId(target.id);
  if (!user) {
    await interaction.reply({ content: "Пользователь не найден.", ephemeral: true });
    return;
  }

  const stats = await prisma.dailyStat.aggregate({
    where: { userId: user.id, date: { gte: from, lt: to } },
    _sum: { voiceSeconds: true, messages: true, score: true },
  });

  const voice = stats._sum.voiceSeconds ?? 0;
  const messages = stats._sum.messages ?? 0;
  const score = stats._sum.score ?? 0;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 Статистика — ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(`За ${monthLabelRu(monthKey())}`)
    .addFields(
      { name: "🎙️ В голосе", value: formatDuration(voice), inline: true },
      { name: "💬 Сообщений", value: String(messages), inline: true },
      { name: "⭐ Очки", value: score.toFixed(1), inline: true }
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const limit = interaction.options.getInteger("limit") ?? 10;
  const { from, to } = monthRange(monthKey());
  const leaders = await getLeaderboard(from, to, Math.min(limit, 25));

  if (leaders.length === 0) {
    await interaction.reply({ content: "Пока нет данных за этот месяц." });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = leaders.map((l, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    return `${medal} **${l.displayName}** — ${l.score.toFixed(1)} очков (${formatDuration(l.voiceSeconds)} в голосе, ${l.messages} сообщений)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🏆 Топ активных — ${monthLabelRu(monthKey())}`)
    .setDescription(lines.join("\n"));

  await interaction.reply({ embeds: [embed] });
}

async function handleDispute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const title = interaction.options.getString("title", true);
    const options = interaction.options
      .getString("options", true)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      await interaction.reply({ content: "Нужно минимум 2 варианта.", ephemeral: true });
      return;
    }
    const minutes = interaction.options.getInteger("minutes") ?? 60;
    const dispute = await createDispute(title, null, options, interaction.user.id, minutes);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`⚖️ Спор создан: ${dispute.title}`)
          .setDescription(
            options.map((o, i) => `${i + 1}. ${o}`).join("\n") +
              `\n\nID: \`${dispute.id}\`\nГолосуй: /dispute vote id:<id> option:<номер>`
          ),
      ],
    });
    return;
  }

  if (sub === "vote") {
    const id = interaction.options.getString("id", true);
    const option = interaction.options.getInteger("option", true);
    const dispute = await prisma.dispute.findUnique({ where: { id } });
    if (!dispute) {
      await interaction.reply({ content: "Спор не найден.", ephemeral: true });
      return;
    }
    if (option < 1 || option > (dispute.options as string[]).length) {
      await interaction.reply({ content: "Неверный номер варианта.", ephemeral: true });
      return;
    }
    await upsertDiscordUser(interaction.user.id, interaction.user.displayName);
    const user = await findUserByDiscordId(interaction.user.id);
    await vote(id, user!.id, option - 1);
    await interaction.reply({ content: `✅ Голос принят за вариант #${option}.`, ephemeral: true });
    return;
  }

  if (sub === "results") {
    const id = interaction.options.getString("id", true);
    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { votes: true },
    });
    if (!dispute) {
      await interaction.reply({ content: "Спор не найден.", ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xeb459e)
          .setTitle(`⚖️ ${dispute.title}`)
          .setDescription(formatDisputeResults(dispute)),
      ],
    });
    return;
  }
}

async function handleRules(interaction: ChatInputCommandInteraction): Promise<void> {
  const rules = await prisma.rule.findMany({ where: { enabled: true } });
  if (rules.length === 0) {
    await interaction.reply({ content: "Активных правил нет." });
    return;
  }
  const lines = rules.map((r) => `• **${r.name}** (${r.trigger})`);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📜 Правила").setDescription(lines.join("\n"))],
  });
}
