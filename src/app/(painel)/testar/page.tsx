import { Simulador } from "@/components/simulador";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";
import type { TriggerConfig } from "@/lib/engine/types";

export const metadata = { title: "Testar · manyfork" };

export default async function Testar({ searchParams }: { searchParams: Promise<{ automacao?: string }> }) {
  const { automacao } = await searchParams;
  const conta = await contaAtual();
  const automacoes = await db.automation.findMany({ where: { accountId: conta.id }, orderBy: { updatedAt: "desc" } });
  return (
    <Simulador
      automacaoInicial={automacao}
      automacoes={automacoes.map((a) => {
        const cfg = a.triggerConfig as unknown as TriggerConfig;
        return {
          id: a.id,
          nome: a.name,
          status: a.status,
          triggerType: a.triggerType,
          palavra: cfg.match === "any" ? "" : (cfg.keywords[0] ?? ""),
          midias: cfg.mediaScope === "specific" ? (cfg.mediaPreview?.length ? cfg.mediaPreview.map((m) => ({ id: m.id, rotulo: m.caption || m.id })) : (cfg.mediaIds ?? []).map((m) => ({ id: m, rotulo: m }))) : [],
        };
      })}
    />
  );
}
