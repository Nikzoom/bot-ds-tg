import prisma from "@dsbot/db";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await prisma.guildConfig.findFirst();

  return (
    <>
      <h1>Настройки</h1>
      <p className="subtitle">Связи Discord / Telegram и формула рейтинга.</p>
      <SettingsForm
        config={
          config
            ? {
                id: config.id,
                name: config.name,
                discordGuildId: config.discordGuildId,
                telegramChatId: config.telegramChatId,
                settings: config.settings as {
                  scoreVoicePerMinute?: number;
                  scoreMessage?: number;
                },
              }
            : null
        }
      />
    </>
  );
}
