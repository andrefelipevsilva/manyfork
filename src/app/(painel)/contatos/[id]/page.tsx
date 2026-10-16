import Link from "next/link";
import { notFound } from "next/navigation";
import { IconeVoltar } from "@/components/icones";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";
import { janelaAberta } from "@/lib/engine/runner";
import { alternarPausa, apagarContato, porEtiqueta, tirarEtiqueta } from "../actions";
import { BotaoApagarContato } from "./botao-apagar";

export const metadata = { title: "Contato · manyfork" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const STATUS: Record<string, string> = {
  RUNNING: "rodando",
  WAITING_BUTTON: "esperando clique",
  WAITING_INPUT: "esperando resposta",
  WAITING_DELAY: "esperando o tempo",
  WAITING_INBOUND: "esperando a pessoa escrever",
  DONE: "terminou",
  FAILED: "falhou",
  CANCELLED: "cancelada",
  EXPIRED: "expirou",
};

export default async function Contato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conta = await contaAtual();
  const c = await db.contact.findFirst({ where: { id, accountId: conta.id }, include: { tags: { include: { tag: true } } } });
  if (!c) notFound();
  const [execucoes, comentarios] = await Promise.all([
    db.flowRun.findMany({ where: { contactId: c.id }, orderBy: { createdAt: "desc" }, take: 20, include: { automation: { select: { name: true, id: true } } } }),
    db.comment.findMany({ where: { accountId: conta.id, fromIgsid: c.igsid }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const campos = Object.entries((c.fields ?? {}) as Record<string, unknown>).filter(([k]) => k !== "sim_segue");

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <Link href="/contatos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <IconeVoltar /> Contatos
      </Link>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        {c.profilePic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.profilePic} alt="" className="h-14 w-14 rounded-full" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-lg text-muted">{(c.username ?? "?").slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">@{c.username ?? c.igsid}</h1>
          <p className="text-sm text-muted">
            {c.name ?? "sem nome"}
            {c.followerCount !== null && ` · ${c.followerCount} seguidores`}
            {c.followsUs === true && " · te segue"}
            {c.followsUs === false && " · não te segue"}
          </p>
          <p className="mt-1 flex flex-wrap gap-1">
            {janelaAberta(c) ? <span className="badge bg-ok-soft text-ok">janela de 24 h aberta</span> : <span className="badge bg-surface-2 text-muted">janela fechada</span>}
            {c.automationPaused && <span className="badge bg-warn-soft text-warn">automação pausada</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/conversas?c=${c.id}`} className="btn btn-sm">
            Abrir conversa
          </Link>
          <form action={alternarPausa.bind(null, c.id)}>
            <button className="btn btn-sm">{c.automationPaused ? "Retomar automação" : "Pausar automação"}</button>
          </form>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-medium">Dados</h2>
          <dl className="space-y-1.5 text-sm">
            <Linha r="E-mail" v={c.email} />
            <Linha r="Telefone" v={c.phone} />
            <Linha r="Origem" v={c.source} />
            <Linha r="Primeiro contato" v={dataHora.format(c.createdAt)} />
            <Linha r="Última mensagem dele(a)" v={c.lastInboundAt ? dataHora.format(c.lastInboundAt) : null} />
            {campos.map(([k, v]) => (
              <Linha key={k} r={k} v={String(v)} />
            ))}
          </dl>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-medium">Etiquetas</h2>
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((t) => (
              <form key={t.tagId} action={tirarEtiqueta.bind(null, c.id, t.tagId)}>
                <button className="badge bg-accent-soft text-fg" title="Tirar etiqueta">
                  {t.tag.name} ×
                </button>
              </form>
            ))}
            {c.tags.length === 0 && <span className="text-xs text-muted">Nenhuma.</span>}
          </div>
          <form action={porEtiqueta.bind(null, c.id)} className="flex gap-2">
            <input name="etiqueta" className="input" placeholder="nova etiqueta" aria-label="Nova etiqueta" />
            <button className="btn btn-sm">Pôr</button>
          </form>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-medium">Automações que rodaram</h2>
        {execucoes.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {execucoes.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/automacoes/${r.automation.id}`} className="hover:underline">
                  {r.automation.name}
                </Link>
                <span className={`text-xs ${r.status === "FAILED" ? "text-danger" : "text-muted"}`}>
                  {STATUS[r.status]} · {dataHora.format(r.createdAt)}
                  {r.error ? ` — ${r.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {comentarios.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-medium">Comentários</h2>
          <ul className="space-y-2 text-sm">
            {comentarios.map((k) => (
              <li key={k.id}>
                “{k.text}” <span className="text-xs text-muted">· {dataHora.format(k.createdAt)}</span>
                {k.publicReplyText && <div className="ml-3 text-xs text-muted">↳ você respondeu: {k.publicReplyText}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2 border-danger/40 p-5">
        <h2 className="text-sm font-medium">Excluir dados</h2>
        <p className="text-xs text-muted">Apaga o contato, a conversa, os comentários e as métricas ligadas a ele. Use quando a pessoa pedir a exclusão (LGPD).</p>
        <BotaoApagarContato acao={apagarContato.bind(null, c.id)} />
      </section>
    </div>
  );
}

function Linha({ r, v }: { r: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{r}</dt>
      <dd className="truncate text-right">{v || "—"}</dd>
    </div>
  );
}
