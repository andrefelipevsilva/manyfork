"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconeVoltar } from "./icones";

type Msg = { id: string; direction: "IN" | "OUT"; kind: string; text: string | null; payload: any; error: string | null; external: boolean; enviada: boolean; createdAt: string };

const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function Conversa({ contato, voltar }: { contato: { id: string; username: string; nome: string | null }; voltar: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [janela, setJanela] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [pausada, setPausada] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/conversas/${contato.id}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setMsgs(j.mensagens);
    setJanela(j.janelaAberta);
    setPausada(j.pausada);
    setCarregado(true);
  }, [contato.id]);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 4000);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setErro(null);
    const r = await fetch(`/api/conversas/${contato.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
    const j = await r.json();
    setEnviando(false);
    if (!r.ok) return setErro(j.erro ?? "Não enviou.");
    setTexto("");
    await carregar();
  }

  async function alternarPausa() {
    await fetch(`/api/conversas/${contato.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pausada: !pausada }) });
    await carregar();
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link href={voltar} className="btn btn-sm md:hidden" aria-label="Voltar">
          <IconeVoltar />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/contatos/${contato.id}`} className="font-medium hover:underline">
            @{contato.username}
          </Link>
          {contato.nome && <span className="ml-2 text-sm text-muted">{contato.nome}</span>}
        </div>
        <button className={`btn btn-sm ${pausada ? "border-warn text-warn" : ""}`} onClick={() => void alternarPausa()} title="Com a automação pausada, só você responde este contato">
          {pausada ? "Retomar automação" : "Pausar automação"}
        </button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto bg-bg p-4">
        {msgs.map((m) => {
          const doBot = m.direction === "OUT";
          const modelo = m.payload?.attachment?.type === "template" ? m.payload.attachment.payload : null;
          const texto = modelo?.text ?? m.text ?? `[${m.kind}]`;
          return (
            <div key={m.id} className={`flex flex-col ${doBot ? "items-end" : "items-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${doBot ? "rounded-br-sm bg-accent text-accent-fg" : "rounded-bl-sm border border-line bg-surface"}`}>
                <p className="whitespace-pre-wrap break-words">{texto}</p>
                {modelo?.buttons && <p className="mt-1 text-xs opacity-80">[{modelo.buttons.map((b: { title: string }) => b.title).join(" · ")}]</p>}
              </div>
              <span className="mt-0.5 text-[10px] text-muted">
                {hora.format(new Date(m.createdAt))}
                {doBot && (m.kind === "manual" ? (m.external ? " · pelo app" : " · você") : " · automação")}
                {m.kind.endsWith("_privada") && " · resposta privada"}
                {m.error ? <span className="text-danger"> · falhou: {m.error}</span> : doBot && !m.enviada ? " · enviando…" : ""}
              </span>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <footer className="border-t border-line p-3">
        {carregado && !janela && <p className="mb-2 text-xs text-warn">Janela de 24 h fechada: só dá pra responder quando a pessoa escrever de novo.</p>}
        {erro && <p className="mb-2 text-xs text-danger">{erro}</p>}
        <div className="flex gap-2">
          <textarea
            rows={2}
            className="input resize-none"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder={janela ? "Escreva… (Enter envia)" : "Janela fechada"}
            disabled={!janela}
            aria-label="Mensagem"
          />
          <button className="btn btn-primary" onClick={() => void enviar()} disabled={!janela || enviando || !texto.trim()}>
            Enviar
          </button>
        </div>
      </footer>
    </>
  );
}
