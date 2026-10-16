import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { contaAtual } from "@/lib/account";
import { db } from "@/lib/db";

export const metadata = { title: "Contatos · manyfork" };

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const POR_PAGINA = 50;

export default async function Contatos({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; p?: string; testes?: string }> }) {
  const { q, tag, p, testes } = await searchParams;
  const conta = await contaAtual();
  const pagina = Math.max(1, Number(p) || 1);
  const busca = q?.trim();

  const where: Prisma.ContactWhereInput = {
    accountId: conta.id,
    ...(testes === "1" ? {} : { NOT: { igsid: { startsWith: "sim_" } } }),
    ...(busca
      ? { OR: [{ username: { contains: busca, mode: "insensitive" } }, { name: { contains: busca, mode: "insensitive" } }, { email: { contains: busca, mode: "insensitive" } }] }
      : {}),
    ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
  };
  const [contatos, total, etiquetas] = await Promise.all([
    db.contact.findMany({ where, orderBy: { createdAt: "desc" }, take: POR_PAGINA, skip: (pagina - 1) * POR_PAGINA, include: { tags: { include: { tag: true } } } }),
    db.contact.count({ where }),
    db.tag.findMany({ where: { accountId: conta.id }, orderBy: { name: "asc" }, include: { _count: { select: { contacts: true } } } }),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (extra: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const tudo = { q: busca, tag, testes, ...extra };
    for (const [k, v] of Object.entries(tudo)) if (v) s.set(k, v);
    return `/contatos${s.size ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contatos</h1>
          <p className="text-sm text-muted">{new Intl.NumberFormat("pt-BR").format(total)} contato(s)</p>
        </div>
        <form className="flex gap-2" action="/contatos">
          {tag && <input type="hidden" name="tag" value={tag} />}
          <input name="q" defaultValue={busca} placeholder="Buscar @, nome ou e-mail" className="input w-64" aria-label="Buscar" />
          <button className="btn">Buscar</button>
        </form>
      </div>

      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Link href={link({ tag: undefined, p: undefined })} className={`badge ${!tag ? "bg-accent-soft text-fg" : "bg-surface-2 text-muted"}`}>
            Todas
          </Link>
          {etiquetas.map((t) => (
            <Link key={t.id} href={link({ tag: t.name, p: undefined })} className={`badge ${tag === t.name ? "bg-accent-soft text-fg" : "bg-surface-2 text-muted"}`}>
              {t.name} <span className="opacity-60">{t._count.contacts}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Contato</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Etiquetas</th>
              <th className="px-4 py-2 font-medium">Origem</th>
              <th className="px-4 py-2 font-medium">Desde</th>
            </tr>
          </thead>
          <tbody>
            {contatos.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <Link href={`/contatos/${c.id}`} className="font-medium hover:underline">
                    @{c.username ?? c.igsid}
                  </Link>
                  {c.name && <div className="text-xs text-muted">{c.name}</div>}
                </td>
                <td className="px-4 py-2">{c.email ?? <span className="text-muted">—</span>}</td>
                <td className="px-4 py-2 text-xs">{c.tags.map((t) => t.tag.name).join(", ") || <span className="text-muted">—</span>}</td>
                <td className="px-4 py-2 text-xs text-muted">{c.source ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-muted tabular-nums">{data.format(c.createdAt)}</td>
              </tr>
            ))}
            {contatos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  Nenhum contato {busca || tag ? "com esse filtro" : "ainda"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <Link href={link({ testes: testes === "1" ? undefined : "1", p: undefined })} className="text-xs text-muted hover:text-fg">
          {testes === "1" ? "Esconder contatos de teste" : "Mostrar contatos de teste"}
        </Link>
        {paginas > 1 && (
          <div className="flex items-center gap-2">
            {pagina > 1 && (
              <Link className="btn btn-sm" href={link({ p: String(pagina - 1) })}>
                Anterior
              </Link>
            )}
            <span className="text-xs text-muted">
              {pagina}/{paginas}
            </span>
            {pagina < paginas && (
              <Link className="btn btn-sm" href={link({ p: String(pagina + 1) })}>
                Próxima
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
