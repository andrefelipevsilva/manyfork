import Link from "next/link";
import { Conversa } from "@/components/conversa";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";
import { janelaAberta } from "@/lib/engine/runner";

export const metadata = { title: "Conversas · manyfork" };

const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Conversas({ searchParams }: { searchParams: Promise<{ c?: string; testes?: string }> }) {
  const { c, testes } = await searchParams;
  const conta = await contaAtual();
  const comTestes = testes === "1";

  // Última mensagem de cada contato (Postgres DISTINCT ON).
  const ultimas = await db.$queryRaw<{ contact_id: string; text: string | null; kind: string; direction: string; created_at: Date }[]>`
    SELECT DISTINCT ON (contact_id) contact_id, text, kind, direction, created_at
    FROM messages
    WHERE account_id = ${conta.id} AND (${comTestes} OR simulated = false)
    ORDER BY contact_id, created_at DESC`;
  ultimas.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const lista = ultimas.slice(0, 100);
  const contatos = await db.contact.findMany({ where: { id: { in: lista.map((u) => u.contact_id) } } });
  const porId = new Map(contatos.map((x) => [x.id, x]));
  const selecionado = c ? await db.contact.findFirst({ where: { id: c, accountId: conta.id } }) : null;

  return (
    <div className="flex h-dvh min-h-0 flex-col md:flex-row">
      <section className={`${selecionado ? "hidden md:flex" : "flex"} w-full flex-col border-r border-line md:w-80`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h1 className="font-semibold">Conversas</h1>
          <Link href={comTestes ? "/conversas" : "/conversas?testes=1"} className="text-xs text-muted hover:text-fg">
            {comTestes ? "Esconder testes" : "Mostrar testes"}
          </Link>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {lista.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhuma conversa ainda.</li>}
          {lista.map((u) => {
            const k = porId.get(u.contact_id);
            if (!k) return null;
            const ativo = k.id === selecionado?.id;
            return (
              <li key={k.id}>
                <Link
                  href={`/conversas?c=${k.id}${comTestes ? "&testes=1" : ""}`}
                  className={`flex gap-3 border-b border-line px-4 py-3 ${ativo ? "bg-accent-soft" : "hover:bg-surface-2"}`}
                >
                  {k.profilePic ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={k.profilePic} alt="" className="h-9 w-9 shrink-0 rounded-full" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{(k.username ?? "?").slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">@{k.username ?? k.igsid}</span>
                      <span className="shrink-0 text-[10px] text-muted">{hora.format(u.created_at)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {u.direction === "OUT" ? "Você: " : ""}
                      {u.text ?? `[${u.kind}]`}
                    </span>
                    <span className="mt-0.5 flex gap-1">
                      {janelaAberta(k) && <span className="badge bg-ok-soft text-ok">janela aberta</span>}
                      {k.automationPaused && <span className="badge bg-warn-soft text-warn">automação pausada</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={`${selecionado ? "flex" : "hidden md:flex"} min-h-0 flex-1 flex-col`}>
        {selecionado ? (
          <Conversa contato={{ id: selecionado.id, username: selecionado.username ?? selecionado.igsid, nome: selecionado.name }} voltar={`/conversas${comTestes ? "?testes=1" : ""}`} />
        ) : (
          <p className="m-auto text-sm text-muted">Escolha uma conversa.</p>
        )}
      </section>
    </div>
  );
}
