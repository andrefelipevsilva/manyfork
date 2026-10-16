"use client";

import { useEffect, useState } from "react";
import type { TriggerConfig } from "@/lib/engine/types";

type Midia = { id: string; caption?: string; media_type?: string; media_product_type?: string; thumbnail_url?: string; media_url?: string; permalink?: string; timestamp?: string };

// Escolhe posts/reels da conta (GET /api/instagram/midias). Sem Instagram
// conectado, aceita o ID digitado à mão.
export function SeletorPosts({
  cfg,
  onChange,
  conectado,
}: {
  cfg: TriggerConfig;
  onChange: (c: Partial<TriggerConfig>) => void;
  conectado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [midias, setMidias] = useState<Midia[]>([]);
  const [depois, setDepois] = useState<string | undefined>();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const escolhidos = cfg.mediaIds ?? [];
  const previa = cfg.mediaPreview ?? [];

  async function carregar(cursor?: string) {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/instagram/midias${cursor ? `?depois=${encodeURIComponent(cursor)}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Falha ao buscar os posts.");
      setMidias((m) => (cursor ? [...m, ...j.data] : j.data));
      setDepois(j.depois);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (aberto && conectado && midias.length === 0) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function alternar(m: Midia) {
    if (escolhidos.includes(m.id)) {
      onChange({ mediaIds: escolhidos.filter((x) => x !== m.id), mediaPreview: previa.filter((p) => p.id !== m.id) });
    } else {
      onChange({
        mediaIds: [...escolhidos, m.id],
        mediaPreview: [...previa, { id: m.id, thumbnail: m.thumbnail_url ?? m.media_url, caption: m.caption?.slice(0, 80), permalink: m.permalink }],
      });
    }
  }

  return (
    <div className="space-y-2">
      {escolhidos.length > 0 && (
        <ul className="grid grid-cols-4 gap-1.5">
          {escolhidos.map((id) => {
            const p = previa.find((x) => x.id === id);
            return (
              <li key={id} className="group relative aspect-square overflow-hidden rounded-md border border-line bg-surface-2" title={p?.caption ?? id}>
                {p?.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnail} alt={p.caption ?? "post"} className="h-full w-full object-cover" />
                ) : (
                  <span className="block p-1 font-mono text-[9px] break-all text-muted">{id}</span>
                )}
                <button
                  type="button"
                  onClick={() => onChange({ mediaIds: escolhidos.filter((x) => x !== id), mediaPreview: previa.filter((x) => x.id !== id) })}
                  className="absolute right-0.5 top-0.5 hidden h-5 w-5 rounded-full bg-black/70 text-xs text-white group-hover:block"
                  aria-label="Tirar post"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {conectado ? (
        <button type="button" className="btn btn-sm w-full" onClick={() => setAberto((x) => !x)}>
          {aberto ? "Fechar lista de posts" : "Escolher posts"}
        </button>
      ) : (
        <div className="flex gap-1.5">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ID do post (conecte o Instagram pra escolher)" className="input text-xs" />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const id = manual.trim();
              if (id && !escolhidos.includes(id)) onChange({ mediaIds: [...escolhidos, id] });
              setManual("");
            }}
          >
            Pôr
          </button>
        </div>
      )}

      {aberto && conectado && (
        <div className="rounded-lg border border-line p-2">
          {erro && <p className="mb-2 text-xs text-danger">{erro}</p>}
          <ul className="grid max-h-80 grid-cols-3 gap-1.5 overflow-y-auto">
            {midias.map((m) => {
              const marcado = escolhidos.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => alternar(m)}
                    className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 ${marcado ? "border-accent" : "border-transparent"}`}
                    title={m.caption ?? ""}
                    aria-pressed={marcado}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.thumbnail_url ?? m.media_url} alt={m.caption?.slice(0, 60) ?? "post"} className="h-full w-full object-cover" />
                    {m.media_product_type === "REELS" && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">reel</span>}
                    {marcado && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-accent-fg">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {carregando && <p className="mt-2 text-center text-xs text-muted">Carregando…</p>}
          {depois && !carregando && (
            <button type="button" className="btn btn-sm mt-2 w-full" onClick={() => carregar(depois)}>
              Mais posts
            </button>
          )}
        </div>
      )}
    </div>
  );
}
