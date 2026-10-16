"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sair } from "@/app/login/actions";
import { IconeBalao, IconeEngrenagem, IconeLua, IconeMenu, IconePainel, IconePessoas, IconeRaio, IconeSair, IconeSol, IconeTubo } from "./icones";

const ITENS = [
  { href: "/", rotulo: "Painel", Icone: IconePainel },
  { href: "/automacoes", rotulo: "Automações", Icone: IconeRaio },
  { href: "/conversas", rotulo: "Conversas", Icone: IconeBalao },
  { href: "/contatos", rotulo: "Contatos", Icone: IconePessoas },
  { href: "/testar", rotulo: "Testar", Icone: IconeTubo },
  { href: "/configuracoes", rotulo: "Configurações", Icone: IconeEngrenagem },
];

export function MenuLateral({ conta }: { conta: { username: string; simulada: boolean; foto?: string | null } }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [escuro, setEscuro] = useState<boolean | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setEscuro(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => {
    setAberto(false);
  }, [caminho]);

  function alternarTema() {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.dataset.theme = novo ? "dark" : "light";
    try {
      localStorage.setItem("mf_tema", novo ? "dark" : "light");
    } catch {}
  }

  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <span className="flex items-center gap-2 font-mono font-semibold">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
          manyfork
        </span>
        <button className="btn btn-sm" onClick={() => setAberto((x) => !x)} aria-label="Abrir menu" aria-expanded={aberto}>
          <IconeMenu />
        </button>
      </header>
      <aside
        className={`${aberto ? "flex" : "hidden"} fixed inset-x-0 top-[57px] bottom-0 z-20 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0`}
      >
        <div className="hidden items-center gap-2 px-5 py-5 font-mono text-lg font-semibold md:flex">
          <span className="h-3 w-3 rounded-sm bg-accent" />
          manyfork
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {ITENS.map(({ href, rotulo, Icone }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                ativo(href) ? "bg-accent-soft font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <Icone className={`h-4 w-4 ${ativo(href) ? "text-accent" : ""}`} />
              {rotulo}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          <div className="flex items-center gap-2 px-2 text-sm">
            {conta.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conta.foto} alt="" className="h-7 w-7 rounded-full" />
            ) : (
              <span className="h-7 w-7 rounded-full bg-surface-2" />
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">@{conta.username}</div>
              {conta.simulada && <div className="text-xs text-warn">modo de teste</div>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={alternarTema} className="btn btn-sm flex-1" aria-label="Trocar tema">
              {escuro ? <IconeSol /> : <IconeLua />}
              {escuro ? "Claro" : "Escuro"}
            </button>
            <form action={sair} className="flex-1">
              <button className="btn btn-sm w-full" aria-label="Sair">
                <IconeSair />
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
