import Link from "next/link";
import { GraficoDiario } from "@/components/grafico-diario";
import { IconeAlerta } from "@/components/icones";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";
import { ROTULO_GATILHO } from "@/lib/engine/templates";
import { instagramConfigurado } from "@/lib/env";
import { disparosPorDia, novosContatos, resumoPorAutomacao, taxa } from "@/lib/metricas";

export const metadata = { title: "Painel · manyfork" };

const fmt = new Intl.NumberFormat("pt-BR");

export default async function Painel({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias: diasParam } = await searchParams;
  const dias = diasParam === "30" ? 30 : diasParam === "90" ? 90 : 7;
  const desde = new Date(Date.now() - dias * 86_400_000);
  const conta = await contaAtual();

  const [{ total, por }, serie, contatos, automacoes, alertas] = await Promise.all([
    resumoPorAutomacao(conta.id, desde),
    disparosPorDia(conta.id, dias),
    novosContatos(conta.id, desde),
    db.automation.findMany({ where: { accountId: conta.id }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] }),
    montarAlertas(conta),
  ]);

  const tiles = [
    { rotulo: "Disparos", valor: total.disparos, dica: "Comentários e mensagens que ativaram uma automação" },
    { rotulo: "DMs enviadas", valor: total.enviadas },
    { rotulo: "Cliques em botão", valor: total.cliquesBotao },
    { rotulo: "Cliques em link", valor: total.cliquesLink, extra: `${taxa(total.cliquesLink, total.disparos)} dos disparos` },
    { rotulo: "Respostas captadas", valor: total.respostas, dica: "E-mails, telefones e respostas gravadas" },
    { rotulo: "Contatos novos", valor: contatos },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Painel</h1>
          <p className="text-sm text-muted">@{conta.username}</p>
        </div>
        <nav className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm" aria-label="Período">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={d === 7 ? "/" : `/?dias=${d}`}
              className={`rounded-md px-3 py-1 ${d === dias ? "bg-accent-soft font-medium" : "text-muted hover:text-fg"}`}
              aria-current={d === dias ? "page" : undefined}
            >
              {d} dias
            </Link>
          ))}
        </nav>
      </div>

      {alertas.length > 0 && (
        <ul className="space-y-2">
          {alertas.map((a) => (
            <li key={a.texto} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${a.grave ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
              <IconeAlerta className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {a.texto}{" "}
                {a.link && (
                  <Link href={a.link.href} className="font-medium underline">
                    {a.link.rotulo}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.rotulo} className="card p-4" title={t.dica}>
            <div className="text-xs text-muted">{t.rotulo}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt.format(t.valor)}</div>
            {t.extra && <div className="mt-0.5 text-xs text-muted">{t.extra}</div>}
          </div>
        ))}
      </section>

      <GraficoDiario titulo="Disparos por dia" pontos={serie} />

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium">Por automação</h2>
          <Link href="/automacoes/nova" className="btn btn-sm btn-primary">
            Nova automação
          </Link>
        </div>
        {automacoes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Nenhuma automação ainda. <Link href="/automacoes/nova" className="text-accent underline">Crie a primeira</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Automação</th>
                  <th className="px-4 py-2 text-right font-medium">Disparos</th>
                  <th className="px-4 py-2 text-right font-medium">DMs</th>
                  <th className="px-4 py-2 text-right font-medium">Cliques</th>
                  <th className="px-4 py-2 text-right font-medium">Links</th>
                  <th className="px-4 py-2 text-right font-medium">CTR</th>
                  <th className="px-4 py-2 text-right font-medium">Falhas</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {automacoes.map((a) => {
                  const r = por.get(a.id);
                  return (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-4 py-2">
                        <Link href={`/automacoes/${a.id}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                        <div className="text-xs text-muted">
                          {ROTULO_GATILHO[a.triggerType]} · <StatusTexto status={a.status} />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">{fmt.format(r?.disparos ?? 0)}</td>
                      <td className="px-4 py-2 text-right">{fmt.format(r?.enviadas ?? 0)}</td>
                      <td className="px-4 py-2 text-right">{fmt.format(r?.cliquesBotao ?? 0)}</td>
                      <td className="px-4 py-2 text-right">{fmt.format(r?.cliquesLink ?? 0)}</td>
                      <td className="px-4 py-2 text-right">{taxa(r?.cliquesLink ?? 0, r?.disparos ?? 0)}</td>
                      <td className={`px-4 py-2 text-right ${r?.falhas ? "text-danger" : ""}`}>{fmt.format(r?.falhas ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusTexto({ status }: { status: string }) {
  if (status === "ACTIVE") return <span className="text-ok">● ativa</span>;
  if (status === "PAUSED") return <span>pausada</span>;
  return <span>rascunho</span>;
}

async function montarAlertas(conta: Awaited<ReturnType<typeof contaAtual>>) {
  const alertas: { texto: string; grave?: boolean; link?: { href: string; rotulo: string } }[] = [];
  if (conta.simulated) {
    alertas.push({
      texto: instagramConfigurado()
        ? "O Instagram ainda não está conectado: as automações só rodam no simulador."
        : "Modo de teste: faltam as chaves do app da Meta no .env. Monte e teste as automações no simulador enquanto isso.",
      link: { href: "/configuracoes", rotulo: "Configurações" },
    });
    return alertas;
  }
  const diasToken = Math.floor((conta.tokenExpiresAt.getTime() - Date.now()) / 86_400_000);
  if (diasToken < 7) {
    alertas.push({ texto: `O acesso ao Instagram vence em ${Math.max(0, diasToken)} dia(s) e não renovou sozinho.`, grave: true, link: { href: "/configuracoes", rotulo: "Reconectar" } });
  }
  if (!conta.webhookSubscribedAt) {
    alertas.push({ texto: "Os avisos da Meta (webhooks) não estão assinados.", grave: true, link: { href: "/configuracoes", rotulo: "Assinar" } });
  }
  const ontem = new Date(Date.now() - 86_400_000);
  const [jobsFalhos, fila] = await Promise.all([
    db.job.count({ where: { status: "FAILED", finishedAt: { gte: ontem } } }),
    db.job.count({ where: { status: "PENDING", runAt: { lte: new Date(Date.now() - 60_000) } } }),
  ]);
  if (jobsFalhos) alertas.push({ texto: `${jobsFalhos} tarefa(s) falharam nas últimas 24 h (veja o log do worker).` });
  if (fila > 20) alertas.push({ texto: `${fila} tarefas esperando na fila: o worker está rodando?`, grave: true });
  return alertas;
}
