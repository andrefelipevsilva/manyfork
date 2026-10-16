"use client";

import { useState } from "react";

export function Copiavel({ rotulo, valor, secreto }: { rotulo: string; valor: string; secreto?: boolean }) {
  const [visivel, setVisivel] = useState(!secreto);
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <span className="label">{rotulo}</span>
      <div className="flex gap-2">
        <code className="input flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">{visivel ? valor : "•".repeat(Math.min(24, valor.length))}</code>
        {secreto && (
          <button type="button" className="btn btn-sm" onClick={() => setVisivel((v) => !v)}>
            {visivel ? "Esconder" : "Mostrar"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            } catch {}
          }}
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
