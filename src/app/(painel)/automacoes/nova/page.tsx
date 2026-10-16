import Link from "next/link";
import { IconeVoltar } from "@/components/icones";
import { MODELOS, ROTULO_GATILHO } from "@/lib/engine/templates";
import { criarDeModelo } from "../actions";

export const metadata = { title: "Nova automação · manyfork" };

export default function NovaAutomacao() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div>
        <Link href="/automacoes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <IconeVoltar /> Automações
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Escolha um modelo</h1>
        <p className="text-sm text-muted">Dá pra mudar tudo depois no editor. Nasce como rascunho, sem disparar.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODELOS.map((m) => (
          <form key={m.id} action={criarDeModelo}>
            <input type="hidden" name="modelo" value={m.id} />
            <button className="card group flex h-full w-full flex-col items-start p-4 text-left transition-colors hover:border-accent">
              <span className="badge bg-surface-2 text-muted">{ROTULO_GATILHO[m.triggerType]}</span>
              <span className="mt-3 font-medium group-hover:text-accent">{m.titulo}</span>
              <span className="mt-1 text-sm text-muted">{m.descricao}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
