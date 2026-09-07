import prisma from "@dsbot/db";
import RuleList from "@/components/rules/RuleList";
import RuleEditor from "@/components/rules/RuleEditor";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const rules = await prisma.rule.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <>
      <h1>Правила</h1>
      <p className="subtitle">
        Гибкие зависимости: условия → действия. Например: «трое определённых людей в голосе → пометить как Valorant и написать в Telegram».
      </p>

      <RuleList rules={rules} />
      <RuleEditor />
    </>
  );
}
