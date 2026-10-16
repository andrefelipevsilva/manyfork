"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Automacao = { id: string; nome: string; status: string; triggerType: string; palavra: string; midias: { id: string; rotulo: string }[] };
type ContatoResumo = { id: string; username: string | null };
type Mensagem = { id: string; direction: "IN" | "OUT"; kind: string; text: string | null; payload: any; error: string | null; createdAt: string };
type Estado = {
  contatos: ContatoResumo[];
  contato?: { id: string; username: string | null; email: string | null; phone: string | null; fields: Record<string, unknown>; segue: boolean; tags: string[] } | null;
  mensagens?: Mensagem[];
  comentarios?: { id: string; text: string; publicReplyText: string | null; createdAt: string }[];
  execucoes?: { id: string; automacao: string; status: string; error: string | null; createdAt: string }[];
  pendentes?: number;
};

type Modo = "comentar" | "dm" | "story" | "mencao";

const MODO_DO_GATILHO: Record<string, Modo> = { COMMENT: "comentar", DM_KEYWORD: "dm", STORY_REPLY: "story", STORY_MENTION: "mencao", DEFAULT_REPLY: "dm" };

const STATUS: Record<string, string> = {
  RUNNING: "rodando",
  WAITING_BUTTON: "esperando clique",
  WAITING_INPUT: "esperando resposta",
  WAITING_DELAY: "esperando o tempo",
  WAITING_INBOUND: "esperando a pessoa escrever (janela fechada)",
  DONE: "terminou",
  FAILED: "falhou",
  CANCELLED: "cancelada",
  EXPIRED: "expirou",
};

export function Simulador({ automacoes, automacaoInicial }: { automacoes: Automacao[]; automacaoInicial?: string }) {
  const [estado, setEstado] = useState<Estado>({ contatos: [] });
  const [carregado, setCarregado] = useState(false);
  const [contatoId, setContatoId] = useState<string | null>(null);
  const [emTeste, setEmTeste] = useState<string>(automacaoInicial ?? "");
  const auto = automacoes.find((a) => a.id === emTeste);
  const [modo, setModo] = useState<Modo>(auto ? MODO_DO_GATILHO[auto.triggerType] : "comentar");
  const [texto, setTexto] = useState(auto?.palavra ?? "");
  const [midia, setMidia] = useState(auto?.midias[0]?.id ?? "sim_post");
  const [novoNome, setNovoNome] = useState("seguidor_teste");
  const [novoSegue, setNovoSegue] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (id: string | null) => {
    const r = await fetch(`/api/simulador${id ? `?contato=${id}` : ""}`, { cache: "no-store" });
    if (r.ok) setEstado(await r.json());
    setCarregado(true);
  }, []);

  useEffect(() => {
    void carregar(contatoId);
    if (!contatoId) return;
    const t = setInterval(() => void carregar(contatoId), 1200);
    return () => clearInterval(t);
  }, [contatoId, carregar]);

  useEffect(() => {
    if (!contatoId && estado.contatos.length) setContatoId(estado.contatos[0].id);
  }, [estado.contatos, contatoId]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [estado.mensagens?.length]);

  function escolherAutomacao(id: string) {
    setEmTeste(id);
    const a = automacoes.find((x) => x.id === id);
    if (a) {
      setModo(MODO_DO_GATILHO[a.triggerType]);
      setTexto(a.palavra);
      setMidia(a.midias[0]?.id ?? "sim_post");
    }
  }

  async function postar(corpo: Record<string, unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch("/api/simulador", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Falhou.");
      return j;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function criarContato() {
    const j = await postar({ acao: "novo_contato", username: novoNome, segue: novoSegue });
    if (j?.contatoId) {
      setContatoId(j.contatoId);
      await carregar(j.contatoId);
    }
  }

  async function enviar() {
    if (!contatoId) return;
    const base = { contatoId, automacaoId: emTeste || undefined };
    const corpo =
      modo === "comentar"
        ? { ...base, acao: "comentar", texto, mediaId: midia }
        : modo === "dm"
          ? { ...base, acao: "dm", texto }
          : modo === "story"
            ? { ...base, acao: "story", texto }
            : { ...base, acao: "mencao" };
    if (modo !== "mencao" && !texto.trim()) return;
    await postar(corpo);
    if (modo === "dm" || modo === "story") setTexto("");
    await carregar(contatoId);
  }

  async function clicar(tipo: "clique" | "rapida", payload: string, titulo: string) {
    if (!contatoId) return;
    await postar({ acao: tipo, contatoId, payload, titulo });
    await carregar(contatoId);
  }

  const midiasDisponiveis = useMemo(() => {
    const todas = new Map<string, string>([["sim_post", "Um post qualquer"]]);
    for (const a of automacoes) for (const m of a.midias) todas.set(m.id, m.rotulo);
    return [...todas.entries()];
  }, [automacoes]);

  const c = estado.contato;

  // Comentários (e a resposta pública) entram na conversa, na ordem do tempo.
  const linhaDoTempo = useMemo(() => {
    const itens: Mensagem[] = [...(estado.mensagens ?? [])];
    for (const k of estado.comentarios ?? []) {
      itens.push({ id: `c_${k.id}`, direction: "IN", kind: "comentario", text: k.text, payload: null, error: null, createdAt: k.createdAt });
      if (k.publicReplyText) {
        const depois = new Date(new Date(k.createdAt).getTime() + 1).toISOString();
        itens.push({ id: `r_${k.id}`, direction: "OUT", kind: "resposta_publica", text: k.publicReplyText, payload: null, error: null, createdAt: depois });
      }
    }
    return itens.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [estado.mensagens, estado.comentarios]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="text-xl font-semibold">Testar</h1>
        <p className="text-sm text-muted">Faça de conta que é um seguidor. Nada sai pro Instagram, e as esperas viram 3 segundos.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_280px]">
        {/* Contatos */}
        <section className="card space-y-3 p-3">
          <h2 className="text-sm font-medium">Seguidores de teste</h2>
          <ul className="space-y-1">
            {estado.contatos.map((x) => (
              <li key={x.id}>
                <button
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${x.id === contatoId ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}
                  onClick={() => setContatoId(x.id)}
                >
                  @{x.username}
                </button>
              </li>
            ))}
            {carregado && estado.contatos.length === 0 && <li className="text-xs text-muted">Nenhum ainda. Crie um abaixo.</li>}
          </ul>
          <div className="space-y-2 border-t border-line pt-3">
            <input className="input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} aria-label="@ do seguidor de teste" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={novoSegue} onChange={(e) => setNovoSegue(e.target.checked)} /> já me segue
            </label>
            <button className="btn btn-sm w-full" onClick={() => void criarContato()} disabled={ocupado || !novoNome.trim()}>
              + Seguidor de teste
            </button>
          </div>
        </section>

        {/* Conversa */}
        <section className="card flex h-[calc(100dvh-170px)] min-h-[480px] flex-col">
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto flex-1" value={emTeste} onChange={(e) => escolherAutomacao(e.target.value)} aria-label="Automação em teste">
                <option value="">Só as automações ativas</option>
                {automacoes.map((a) => (
                  <option key={a.id} value={a.id}>
                    Testar: {a.nome}
                    {a.status !== "ACTIVE" ? " (rascunho/pausada)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={modo} onChange={(e) => setModo(e.target.value as Modo)} aria-label="O que o seguidor faz">
                <option value="comentar">Comenta no post</option>
                <option value="dm">Manda direct</option>
                <option value="story">Responde story</option>
                <option value="mencao">Menciona no story</option>
              </select>
              {modo === "comentar" && (
                <select className="input w-auto max-w-[200px]" value={midia} onChange={(e) => setMidia(e.target.value)} aria-label="Em qual post">
                  {midiasDisponiveis.map(([id, rotulo]) => (
                    <option key={id} value={id}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              )}
              {modo !== "mencao" && (
                <input
                  className="input min-w-[160px] flex-1"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void enviar()}
                  placeholder={modo === "comentar" ? "Texto do comentário" : "Mensagem"}
                  aria-label="Texto"
                />
              )}
              <button className="btn btn-primary" onClick={() => void enviar()} disabled={ocupado || !contatoId}>
                Enviar
              </button>
            </div>
            {erro && <p className="text-xs text-danger">{erro}</p>}
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto bg-bg p-4" aria-live="polite">
            {carregado && !c && <p className="text-center text-sm text-muted">Crie ou escolha um seguidor de teste.</p>}
            {linhaDoTempo.map((m) => (
              <Balao key={m.id} m={m} onClique={clicar} />
            ))}
            {estado.pendentes ? <p className="text-center text-xs text-muted">⏳ {estado.pendentes} passo(s) agendado(s)…</p> : null}
            <div ref={fim} />
          </div>
        </section>

        {/* Detalhes */}
        <section className="space-y-4">
          {c && (
            <div className="card space-y-2 p-3 text-sm">
              <h2 className="font-medium">@{c.username}</h2>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={c.segue}
                  onChange={async (e) => {
                    await postar({ acao: "segue", contatoId: c.id, segue: e.target.checked });
                    await carregar(c.id);
                  }}
                />
                me segue
              </label>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">E-mail</dt>
                  <dd className="truncate">{c.email ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Telefone</dt>
                  <dd>{c.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Etiquetas</dt>
                  <dd className="text-right">{c.tags.length ? c.tags.join(", ") : "—"}</dd>
                </div>
                {Object.entries(c.fields)
                  .filter(([k]) => k !== "sim_segue")
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-muted">{k}</dt>
                      <dd className="truncate">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
              <button
                className="btn btn-sm btn-danger w-full"
                onClick={async () => {
                  await postar({ acao: "apagar", contatoId: c.id });
                  setContatoId(null);
                  await carregar(null);
                }}
              >
                Apagar seguidor de teste
              </button>
            </div>
          )}

          {estado.execucoes && estado.execucoes.length > 0 && (
            <div className="card space-y-2 p-3">
              <h2 className="text-sm font-medium">Execuções</h2>
              <ul className="space-y-1.5 text-xs">
                {estado.execucoes.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{r.automacao}</span>
                    <span className={`block ${r.status === "FAILED" ? "text-danger" : "text-muted"}`}>
                      {STATUS[r.status] ?? r.status}
                      {r.error ? ` — ${r.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Balao({ m, onClique }: { m: Mensagem; onClique: (tipo: "clique" | "rapida", payload: string, titulo: string) => void }) {
  const doBot = m.direction === "OUT";
  const p = m.payload ?? {};
  const modelo = p?.attachment?.type === "template" ? p.attachment.payload : null;
  const imagem = p?.attachment?.type === "image" ? p.attachment.payload.url : null;
  const rapidas: { title: string; payload: string }[] = p?.quick_replies ?? [];
  const texto = modelo ? modelo.text : m.text;
  const rotuloEntrada =
    m.kind === "clique"
      ? "tocou no botão"
      : m.kind === "mencao_story"
        ? "mencionou você no story"
        : m.kind === "resposta_story"
          ? "respondeu seu story"
          : m.kind === "comentario"
            ? "💬 comentou no post"
            : m.kind === "resposta_publica"
              ? "💬 resposta pública no comentário"
              : null;

  return (
    <div className={`flex flex-col ${doBot ? "items-start" : "items-end"}`}>
      {m.kind.endsWith("_privada") && <span className="mb-0.5 text-[10px] text-muted">resposta privada ao comentário</span>}
      {rotuloEntrada && <span className="mb-0.5 text-[10px] text-muted">{rotuloEntrada}</span>}
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${doBot ? "rounded-bl-sm border border-line bg-surface" : "rounded-br-sm bg-accent text-accent-fg"}`}>
        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} alt="" className="max-h-48 rounded-lg" />
        ) : (
          <p className="whitespace-pre-wrap break-words">{texto || (m.kind === "mencao_story" ? "📸 story" : "")}</p>
        )}
        {m.error && <p className="mt-1 text-xs text-danger">Falhou: {m.error}</p>}
      </div>
      {modelo?.buttons && (
        <div className="mt-1 flex w-full max-w-[85%] flex-col gap-1">
          {modelo.buttons.map((b: any, i: number) =>
            b.type === "web_url" ? (
              <a key={i} href={b.url} target="_blank" rel="noreferrer" className="btn btn-sm justify-center">
                🔗 {b.title}
              </a>
            ) : (
              <button key={i} className="btn btn-sm justify-center" onClick={() => onClique("clique", b.payload, b.title)}>
                {b.title}
              </button>
            ),
          )}
        </div>
      )}
      {rapidas.length > 0 && (
        <div className="mt-1 flex max-w-[85%] flex-wrap gap-1">
          {rapidas.map((q, i) => (
            <button key={i} className="rounded-full border border-accent px-3 py-1 text-xs text-accent hover:bg-accent-soft" onClick={() => onClique("rapida", q.payload, q.title)}>
              {q.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
