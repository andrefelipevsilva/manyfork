import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";
import type { Flow, TriggerConfig } from "@/lib/engine/types";

export const metadata = { title: "Editor · manyfork" };

export default async function PaginaEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conta = await contaAtual();
  const a = await db.automation.findFirst({ where: { id, accountId: conta.id } });
  if (!a) notFound();
  return (
    <Editor
      conectado={!conta.simulated}
      inicial={{
        id: a.id,
        name: a.name,
        status: a.status,
        triggerType: a.triggerType,
        triggerConfig: a.triggerConfig as unknown as TriggerConfig,
        flow: a.flow as unknown as Flow,
      }}
    />
  );
}
