import Link from "next/link";
import { BotaoStatus } from "@/components/botao-status";
import { IconeMais } from "@/components/icones";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";
import { ROTULO_GATILHO } from "@/lib/engine/templates";
import type { TriggerConfig } from "@/lib/engine/types";
import { resumoPorAutomacao, taxa } from "@/lib/metricas";

export const metadata = { title: "Automações · manyfork" };

const fmt = new Intl.NumberFormat("pt-BR");

function resumoGatilho(tipo: string, cfg: TriggerConfig): string {
  const palavras = cfg.match === "any" ? "qualquer texto" : cfg.keywords.filter(Boolean).map((k) => `"${k}"`).join(", ") || "sem palavra-chave";
  if (tipo === "COMMENT") {
    const posts = cfg.mediaScope === "specific" ? `${cfg.mediaIds?.length ?? 0} post(s)` : "qualquer post";
    return `${palavras} · ${posts}`;
  }
  if (tipo === "STORY_MENTION" || tipo === "DEFAULT_REPLY") return "";
  return palavras;
}

export default async function Automacoes() {
  const conta = await contaAtual();
  const [automacoes, { por }] = await Promise.all([
    db.automation.findMany({ where: { accountId: conta.id }, orderBy: [{ createdAt: "desc" }] }),
    resumoPorAutomacao(conta.id, new Date(Date.now() - 30 * 86_400_000)),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Automações</h1>
          <p className="text-sm text-muted">Números dos últimos 30 dias.</p>
        </div>
        <Link href="/automacoes/nova" className="btn btn-primary">
          <IconeMais />
          Nova
        </Link>
      </div>

      {automacoes.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="font-medium">Nenhuma automação ainda</p>
          <p className="mt-1 text-sm text-muted">Comece pelo modelo “Comentário → link no direct”: quem comenta a palavra recebe o link no direct.</p>
          <Link href="/automacoes/nova" className="btn btn-primary mt-4">
            Escolher modelo
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {automacoes.map((a) => {
            const r = por.get(a.id);
            const resumo = resumoGatilho(a.triggerType, a.triggerConfig as unknown as TriggerConfig);
            return (
              <li key={a.id} className="card flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/automacoes/${a.id}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {ROTULO_GATILHO[a.triggerType]}
                    {resumo && ` · ${resumo}`}
                    {a.status === "DRAFT" && " · rascunho"}
                  </div>
                </div>
                <dl className="flex gap-5 text-right text-xs tabular-nums">
                  <div>
                    <dt className="text-muted">Disparos</dt>
                    <dd className="text-sm font-medium">{fmt.format(r?.disparos ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Cliques</dt>
                    <dd className="text-sm font-medium">{fmt.format((r?.cliquesBotao ?? 0) + (r?.cliquesLink ?? 0))}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">CTR link</dt>
                    <dd className="text-sm font-medium">{taxa(r?.cliquesLink ?? 0, r?.disparos ?? 0)}</dd>
                  </div>
                </dl>
                <BotaoStatus id={a.id} status={a.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
