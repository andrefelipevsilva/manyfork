"use client";

import { useState } from "react";

// Colunas por dia (uma série só: o título diz o que é, sem legenda).
// Especificação: coluna ≤ 24px, ponta arredondada de 4px e base reta,
// grade de 1px discreta, dica no hover/foco e tabela como alternativa.

type Ponto = { dia: string; valor: number };

function passoLimpo(max: number): number {
  if (max <= 4) return 1;
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

const compacto = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(".", ",")} mil` : String(n));
const rotuloDia = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export function GraficoDiario({ titulo, pontos }: { titulo: string; pontos: Ponto[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 960;
  const A = 200;
  const margem = { esq: 36, dir: 8, topo: 12, base: 24 };
  const larguraUtil = L - margem.esq - margem.dir;
  const alturaUtil = A - margem.topo - margem.base;
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const passo = passoLimpo(max);
  const teto = Math.ceil(max / passo) * passo;
  const faixa = larguraUtil / Math.max(1, pontos.length);
  const largura = Math.min(24, Math.max(2, faixa - 2));
  const y = (v: number) => margem.topo + alturaUtil - (v / teto) * alturaUtil;
  const marcas = Array.from({ length: Math.round(teto / passo) + 1 }, (_, i) => i * passo);
  const cadaQuantos = Math.ceil(pontos.length / 8);
  const total = pontos.reduce((s, p) => s + p.valor, 0);

  return (
    <figure className="card p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-xs text-muted">{compacto(total)} no período</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label={`${titulo}: ${total} no período`}>
          {marcas.map((m) => (
            <g key={m}>
              <line x1={margem.esq} x2={L - margem.dir} y1={y(m)} y2={y(m)} stroke="var(--border)" strokeWidth={1} />
              <text x={margem.esq - 6} y={y(m)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted)">
                {compacto(m)}
              </text>
            </g>
          ))}
          {pontos.map((p, i) => {
            const cx = margem.esq + faixa * i + faixa / 2;
            const topo = y(p.valor);
            const h = margem.topo + alturaUtil - topo;
            const r = Math.min(4, h, largura / 2);
            const x0 = cx - largura / 2;
            const base = margem.topo + alturaUtil;
            const caminho =
              h <= 0
                ? ""
                : `M${x0},${base} V${topo + r} Q${x0},${topo} ${x0 + r},${topo} H${x0 + largura - r} Q${x0 + largura},${topo} ${x0 + largura},${topo + r} V${base} Z`;
            return (
              <g
                key={p.dia}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${rotuloDia(p.dia)}: ${p.valor}`}
                onPointerEnter={() => setFoco(i)}
                onPointerLeave={() => setFoco(null)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                className="outline-none"
              >
                <rect x={cx - faixa / 2} y={margem.topo} width={faixa} height={alturaUtil} fill="transparent" />
                {caminho && <path d={caminho} fill="var(--accent)" opacity={foco === null || foco === i ? 1 : 0.55} />}
                {i % cadaQuantos === 0 && (
                  <text x={cx} y={A - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
                    {rotuloDia(p.dia)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={margem.esq} x2={L - margem.dir} y1={margem.topo + alturaUtil} y2={margem.topo + alturaUtil} stroke="var(--muted)" strokeWidth={1} />
        </svg>
        {foco !== null && pontos[foco] && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm"
            style={{ left: `${((margem.esq + faixa * foco + faixa / 2) / L) * 100}%`, top: 0 }}
          >
            <strong className="text-fg">{pontos[foco].valor}</strong> <span className="text-muted">{rotuloDia(pontos[foco].dia)}</span>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none">Ver em tabela</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Quantidade</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-fg">
            {pontos.map((p) => (
              <tr key={p.dia} className="border-t border-line">
                <td className="py-1">{rotuloDia(p.dia)}</td>
                <td className="py-1 text-right">{p.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
