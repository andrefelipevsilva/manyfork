"use client";

import { useState, useTransition } from "react";
import { alternarStatus } from "@/app/(painel)/automacoes/actions";

export function BotaoStatus({ id, status }: { id: string; status: "ACTIVE" | "PAUSED" | "DRAFT" }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const ativa = status === "ACTIVE";
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={ativa}
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await alternarStatus(id);
            setErro(r.erro ?? null);
          })
        }
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
          ativa ? "border-transparent bg-accent" : "border-line bg-surface-2"
        }`}
        title={ativa ? "Pausar" : "Ativar"}
      >
        <span className="sr-only">{ativa ? "Pausar automação" : "Ativar automação"}</span>
        <span className={`inline-block h-4 w-4 rounded-full bg-surface shadow transition-transform ${ativa ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}
