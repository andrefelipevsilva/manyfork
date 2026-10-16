"use client";

import { useState } from "react";

export function BotaoApagarContato({ acao }: { acao: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <button className="btn btn-sm btn-danger" onClick={() => setConfirmando(true)}>
        Apagar contato
      </button>
    );
  }
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <span className="text-xs">Não dá pra desfazer. Confirma?</span>
      <button className="btn btn-sm btn-danger">Sim, apagar tudo</button>
      <button type="button" className="btn btn-sm" onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </form>
  );
}
