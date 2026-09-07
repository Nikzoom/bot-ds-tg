import { NextRequest, NextResponse } from "next/server";
import prisma from "@dsbot/db";

export async function GET() {
  const disputes = await prisma.dispute.findMany({
    orderBy: { createdAt: "desc" },
    include: { votes: true },
    take: 100,
  });
  return NextResponse.json({ disputes });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, options, createdBy = "panel", endsInMinutes = 60 } = body;

  if (!title || !Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: "Нужен заголовок и минимум 2 варианта" }, { status: 400 });
  }

  const dispute = await prisma.dispute.create({
    data: {
      title,
      description: description ?? null,
      options: options as object,
      createdBy,
      endsAt: new Date(Date.now() + Number(endsInMinutes) * 60_000),
    },
  });

  return NextResponse.json({ dispute }, { status: 201 });
}
