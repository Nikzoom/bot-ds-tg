import prisma from "@dsbot/db";
import MentionManager from "@/components/mentions/MentionManager";

export const dynamic = "force-dynamic";

export default async function MentionsPage() {
  const mentions = await prisma.mentionMap.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <>
      <h1>Упоминания</h1>
      <p className="subtitle">
        Связь Discord-ников с Telegram. Если пингуемого в Discord нет в сети — уведомление придёт сюда в группу.
      </p>
      <MentionManager mentions={mentions} />
    </>
  );
}
