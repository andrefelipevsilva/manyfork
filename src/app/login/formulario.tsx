"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

export function FormularioLogin({ de }: { de: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {});
  return (
    <form action={acao} className="card space-y-4 p-6">
      <input type="hidden" name="de" value={de} />
      <div>
        <label htmlFor="senha" className="label">
          Senha
        </label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required autoFocus className="input" />
      </div>
      {estado.erro && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={enviando} className="btn btn-primary w-full">
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
