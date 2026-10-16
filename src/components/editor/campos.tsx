"use client";

import { useState, type ReactNode } from "react";

// Peças de formulário do painel lateral do editor.

export function Campo({ rotulo, ajuda, children, htmlFor }: { rotulo: string; ajuda?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {rotulo}
      </label>
      {children}
      {ajuda && <p className="mt-1 text-xs text-muted">{ajuda}</p>}
    </div>
  );
}

export function Contador({ atual, limite }: { atual: number; limite: number }) {
  return <span className={`text-xs tabular-nums ${atual > limite ? "text-danger" : "text-muted"}`}>{atual}/{limite}</span>;
}

/** Lista de palavras em "chips": Enter ou vírgula adiciona. */
export function Chips({ valores, onChange, placeholder, id }: { valores: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  const [rascunho, setRascunho] = useState("");
  function adicionar(texto: string) {
    const novos = texto
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && !valores.some((v) => v.toLowerCase() === x.toLowerCase()));
    if (novos.length) onChange([...valores, ...novos]);
    setRascunho("");
  }
  return (
    <div className="input flex flex-wrap gap-1.5 py-1.5">
      {valores.map((v) => (
        <span key={v} className="badge bg-accent-soft text-fg">
          {v}
          <button type="button" className="text-muted hover:text-danger" onClick={() => onChange(valores.filter((x) => x !== v))} aria-label={`Remover ${v}`}>
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={rascunho}
        onChange={(e) => (e.target.value.endsWith(",") ? adicionar(e.target.value) : setRascunho(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            adicionar(rascunho);
          } else if (e.key === "Backspace" && !rascunho && valores.length) {
            onChange(valores.slice(0, -1));
          }
        }}
        onBlur={() => rascunho && adicionar(rascunho)}
        placeholder={valores.length ? "" : placeholder}
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}

export function Segmentado<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: { v: T; r: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs" role="radiogroup">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          onClick={() => onChange(o.v)}
          className={`flex-1 rounded-md px-2 py-1.5 ${valor === o.v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}
        >
          {o.r}
        </button>
      ))}
    </div>
  );
}

export function Interruptor({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{rotulo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => onChange(!ligado)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${ligado ? "border-transparent bg-accent" : "border-line bg-surface-2"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-surface shadow transition-transform ${ligado ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
