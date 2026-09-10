import prisma from "@dsbot/db";
import MentionManager from "@/components/mentions/MentionManager";

export const dynamic = "force-dynamic";

export default async function MentionsPage() {
  const mentions = await prisma.mentionMap.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <>
      <h1>Привязка аккаунтов</h1>
      <p className="subtitle">
        Связь Discord ID ↔ Telegram @username. По ней работает /stats в Telegram, пинги и уведомления в ЛС.
      </p>
      <MentionManager mentions={mentions} />
    </>
  );
}
