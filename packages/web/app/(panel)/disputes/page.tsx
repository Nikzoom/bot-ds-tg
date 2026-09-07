import prisma from "@dsbot/db";
import DisputeCreate from "@/components/disputes/DisputeCreate";
import DisputeList from "@/components/disputes/DisputeList";

export const dynamic = "force-dynamic";

export default async function DisputesPage() {
  const raw = await prisma.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: { votes: true },
    take: 100,
  });

  const disputes = raw.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    status: d.status,
    options: d.options as unknown as string[],
    winnerOptionIndex: d.winnerOptionIndex,
    votes: d.votes,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <>
      <h1>Споры</h1>
      <p className="subtitle">
        Запусти спор здесь или в Discord — он автоматически появится в Telegram-группе с кнопками для голосования.
      </p>
      <DisputeCreate />
      <div className="spacer" />
      <DisputeList disputes={disputes} />
    </>
  );
}
