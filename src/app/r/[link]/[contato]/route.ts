import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Link de botão com contagem de clique: registra e redireciona pro destino.
export async function GET(_req: Request, { params }: { params: Promise<{ link: string; contato: string }> }) {
  const { link, contato } = await params;
  const l = await db.trackedLink.findUnique({ where: { id: link }, include: { automation: true } });
  if (!l) return new NextResponse("Link não encontrado.", { status: 404 });

  const c = await db.contact.findFirst({ where: { id: contato, accountId: l.automation.accountId } });
  // Conta um clique por contato a cada 10 min (pré-carregamento do app dispara GET repetido).
  const recente = c
    ? await db.event.findFirst({
        where: { type: "LINK_CLICK", contactId: c.id, nodeId: l.nodeId, automationId: l.automationId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
        select: { id: true },
      })
    : null;
  if (!recente) {
    await db.event.create({
      data: {
        accountId: l.automation.accountId,
        automationId: l.automationId,
        contactId: c?.id,
        nodeId: l.nodeId,
        type: "LINK_CLICK",
        simulated: Boolean(c?.igsid.startsWith("sim_")),
        meta: { url: l.url, botao: l.buttonId },
      },
    });
  }
  return NextResponse.redirect(l.url, { status: 302 });
}
