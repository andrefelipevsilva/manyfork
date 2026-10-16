"use client";

import "@xyflow/react/dist/style.css";
import type { TriggerType } from "@prisma/client";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
} from "@xyflow/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { alternarStatus, duplicar, excluir } from "@/app/(painel)/automacoes/actions";
import { IconeAlerta, IconeLixo, IconeVoltar } from "@/components/icones";
import { TRIGGER_NODE_ID, saidasDoNo, type Flow, type FlowNode, type NodeKind, type TriggerConfig } from "@/lib/engine/types";
import { validarAutomacao, type Problema } from "@/lib/engine/validate";
import { COR_NO, DESCRICAO_NO, IconeNo, ProblemasCtx, ROTULO_NO, dadosPadrao, idCurto } from "./comum";
import { PainelGatilho, PainelNo } from "./inspetor";
import { TIPOS_DE_NO } from "./nos";

export type AutomacaoEditavel = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DRAFT";
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  flow: Flow;
};

type NoRF = Node<Record<string, unknown>>;

const TIPOS_ADICIONAVEIS: Exclude<NodeKind, "trigger">[] = ["message", "ask", "followGate", "condition", "delay", "tag", "brevo"];

const opcoesLigacao = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  style: { strokeWidth: 2 },
};

function paraRF(flow: Flow, triggerType: TriggerType, cfg: TriggerConfig): { nos: NoRF[]; ligacoes: Edge[] } {
  return {
    nos: flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.type === "trigger" ? { triggerType, cfg } : (n.data as Record<string, unknown>),
      deletable: n.type !== "trigger",
    })),
    ligacoes: flow.edges.map((e) => ({ ...opcoesLigacao, id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "next" })),
  };
}

function deRF(nos: NoRF[], ligacoes: Edge[]): Flow {
  const idsNos = new Set(nos.map((n) => n.id));
  return {
    nodes: nos.map((n) => ({
      id: n.id,
      type: n.type as NodeKind,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.type === "trigger" ? {} : n.data,
    })) as FlowNode[],
    edges: ligacoes
      .filter((e) => idsNos.has(e.source) && idsNos.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "next" })),
  };
}

/** Tira as ligações de saídas que não existem mais (ex.: botão apagado). */
function podarLigacoes(nos: NoRF[], ligacoes: Edge[]): Edge[] {
  const saidas = new Map(
    nos.map((n) => [n.id, new Set(saidasDoNo({ id: n.id, type: n.type as NodeKind, position: n.position, data: n.data } as FlowNode).map((s) => s.id))]),
  );
  return ligacoes.filter((e) => saidas.get(e.source)?.has(e.sourceHandle ?? "next") && saidas.has(e.target));
}

function EditorInterno({ inicial, conectado }: { inicial: AutomacaoEditavel; conectado: boolean }) {
  const router = useRouter();
  const rf = useReactFlow();
  const atualizarInternos = useUpdateNodeInternals();
  const inicio = useMemo(() => paraRF(inicial.flow, inicial.triggerType, inicial.triggerConfig), [inicial]);
  const [nos, setNos, onNodesChange] = useNodesState<NoRF>(inicio.nos);
  const [ligacoes, setLigacoes, onEdgesChange] = useEdgesState<Edge>(inicio.ligacoes);
  const [nome, setNome] = useState(inicial.name);
  const [triggerType, setTriggerType] = useState<TriggerType>(inicial.triggerType);
  const [cfg, setCfg] = useState<TriggerConfig>(inicial.triggerConfig);
  const [status, setStatus] = useState(inicial.status);
  const [selecionado, setSelecionado] = useState<string | null>(TRIGGER_NODE_ID);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tipo: "ok" | "erro" } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; fluxoX: number; fluxoY: number; de?: { no: string; saida: string } } | null>(null);
  const [pendenteStatus, iniciarStatus] = useTransition();
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const contemDoCanvas = useRef<HTMLDivElement>(null);

  const marcarSujo = useCallback(() => setSujo(true), []);

  // Gatilho mostra o resumo no cartão
  useEffect(() => {
    setNos((ns) => ns.map((n) => (n.id === TRIGGER_NODE_ID ? { ...n, data: { triggerType, cfg } } : n)));
  }, [triggerType, cfg, setNos]);

  const flowAtual = useMemo(() => deRF(nos, ligacoes), [nos, ligacoes]);
  const problemas: Problema[] = useMemo(() => validarAutomacao(triggerType, cfg, flowAtual), [triggerType, cfg, flowAtual]);
  const mapaProblemas = useMemo(() => {
    const m = new Map<string, "erro" | "aviso">();
    for (const p of problemas) if (p.noId && m.get(p.noId) !== "erro") m.set(p.noId, p.nivel);
    return m;
  }, [problemas]);
  const erros = problemas.filter((p) => p.nivel === "erro").length;

  // Aviso ao sair com alteração não salva
  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  const salvar = useCallback(async () => {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/automacoes/${inicial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, triggerType, triggerConfig: cfg, flow: deRF(nos, ligacoes) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "Não consegui salvar.");
      setSujo(false);
      setStatus(j.status);
      setAviso({ texto: j.aviso ?? "Salvo.", tipo: j.aviso ? "erro" : "ok" });
      router.refresh();
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : String(e), tipo: "erro" });
    } finally {
      setSalvando(false);
    }
  }, [inicial.id, nome, triggerType, cfg, nos, ligacoes, router]);

  // Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void salvar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [salvar]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source === c.target) return;
      setLigacoes((ls) =>
        addEdge(
          { ...c, ...opcoesLigacao, id: `${c.source}-${c.sourceHandle ?? "next"}-${c.target}-${idCurto()}` },
          ls.filter((l) => !(l.source === c.source && (l.sourceHandle ?? "next") === (c.sourceHandle ?? "next"))),
        ),
      );
      marcarSujo();
    },
    [setLigacoes, marcarSujo],
  );

  // Soltou a ligação no vazio: abre o menu pra criar o próximo passo ali.
  const onConnectEnd = useCallback(
    (evento: MouseEvent | TouchEvent, estado: FinalConnectionState) => {
      if (estado.isValid || !estado.fromNode || estado.fromHandle?.type !== "source") return;
      const { clientX, clientY } = "changedTouches" in evento ? evento.changedTouches[0] : evento;
      const caixa = contemDoCanvas.current?.getBoundingClientRect();
      const pos = rf.screenToFlowPosition({ x: clientX, y: clientY });
      setMenu({
        x: clientX - (caixa?.left ?? 0),
        y: clientY - (caixa?.top ?? 0),
        fluxoX: pos.x,
        fluxoY: pos.y - 30,
        de: { no: estado.fromNode.id, saida: estado.fromHandle.id ?? "next" },
      });
    },
    [rf],
  );

  function primeiraSaidaLivre(noId: string): string | null {
    const no = nos.find((n) => n.id === noId);
    if (!no) return null;
    const saidas = saidasDoNo({ id: no.id, type: no.type as NodeKind, position: no.position, data: no.data } as FlowNode);
    const livre = saidas.find((s) => !ligacoes.some((l) => l.source === noId && (l.sourceHandle ?? "next") === s.id));
    return livre?.id ?? null;
  }

  function adicionar(tipo: Exclude<NodeKind, "trigger">, onde?: { x: number; y: number }, de?: { no: string; saida: string }) {
    const id = idCurto();
    let origem = de;
    if (!origem && selecionado) {
      const saida = primeiraSaidaLivre(selecionado);
      if (saida) origem = { no: selecionado, saida };
    }
    const ref = origem ? nos.find((n) => n.id === origem!.no) : nos.reduce<NoRF | undefined>((a, n) => (!a || n.position.x > a.position.x ? n : a), undefined);
    const posicao = onde ?? { x: (ref?.position.x ?? 0) + 340, y: ref?.position.y ?? 120 };
    setNos((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: tipo, position: posicao, data: dadosPadrao(tipo) as Record<string, unknown>, selected: true }]);
    if (origem) {
      const o = origem;
      setLigacoes((ls) => [
        ...ls.filter((l) => !(l.source === o.no && (l.sourceHandle ?? "next") === o.saida)),
        { ...opcoesLigacao, id: `${o.no}-${o.saida}-${id}`, source: o.no, sourceHandle: o.saida, target: id },
      ]);
    }
    setSelecionado(id);
    setMenu(null);
    marcarSujo();
  }

  function mudarDados(id: string, parcial: Record<string, unknown>) {
    setNos((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...parcial } } : n)));
    requestAnimationFrame(() => atualizarInternos(id));
    marcarSujo();
  }

  // Botão apagado/trocado leva junto a ligação que saía dele.
  useEffect(() => {
    setLigacoes((ls) => {
      const podadas = podarLigacoes(nos, ls);
      return podadas.length === ls.length ? ls : podadas;
    });
  }, [nos, setLigacoes]);

  function apagarNo(id: string) {
    if (id === TRIGGER_NODE_ID) return;
    setNos((ns) => ns.filter((n) => n.id !== id));
    setLigacoes((ls) => ls.filter((l) => l.source !== id && l.target !== id));
    setSelecionado(TRIGGER_NODE_ID);
    marcarSujo();
  }

  function duplicarNo(id: string) {
    const no = nos.find((n) => n.id === id);
    if (!no || no.type === "trigger") return;
    const novoId = idCurto();
    const dados = structuredClone(no.data) as Record<string, unknown> & { buttons?: { id: string }[]; quickReplies?: { id: string }[] };
    dados.buttons = dados.buttons?.map((b) => ({ ...b, id: idCurto() }));
    dados.quickReplies = dados.quickReplies?.map((q) => ({ ...q, id: idCurto() }));
    setNos((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...no, id: novoId, data: dados, position: { x: no.position.x + 40, y: no.position.y + 180 }, selected: true }]);
    setSelecionado(novoId);
    marcarSujo();
  }

  const noSelecionado = nos.find((n) => n.id === selecionado);
  const problemasDoSelecionado = problemas.filter((p) => p.noId === selecionado || (!p.noId && selecionado === TRIGGER_NODE_ID));

  return (
    <div className="flex h-dvh flex-col">
      {/* Barra superior */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <Link href="/automacoes" className="btn btn-sm" aria-label="Voltar">
          <IconeVoltar />
        </Link>
        <input
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            marcarSujo();
          }}
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-medium outline-none hover:bg-surface-2 focus:bg-surface-2"
          aria-label="Nome da automação"
        />
        {aviso && <span className={`text-xs ${aviso.tipo === "ok" ? "text-ok" : "text-danger"}`}>{aviso.texto}</span>}
        {erros > 0 ? (
          <span className="badge bg-danger-soft text-danger">
            <IconeAlerta className="h-3 w-3" /> {erros} erro(s)
          </span>
        ) : null}
        <Link href={`/testar?automacao=${inicial.id}`} className="btn btn-sm" title="Abrir no simulador">
          Testar
        </Link>
        <button className="btn btn-sm btn-primary" onClick={() => void salvar()} disabled={salvando || !sujo}>
          {salvando ? "Salvando…" : sujo ? "Salvar" : "Salvo"}
        </button>
        <button
          className={`btn btn-sm ${status === "ACTIVE" ? "" : "border-accent text-accent"}`}
          disabled={pendenteStatus || sujo}
          title={sujo ? "Salve antes" : undefined}
          onClick={() =>
            iniciarStatus(async () => {
              const r = await alternarStatus(inicial.id);
              if (r.erro) setAviso({ texto: r.erro, tipo: "erro" });
              else {
                setStatus((s) => (s === "ACTIVE" ? "PAUSED" : "ACTIVE"));
                setAviso({ texto: status === "ACTIVE" ? "Pausada." : "Ativada!", tipo: "ok" });
              }
            })
          }
        >
          {status === "ACTIVE" ? "● Ativa — pausar" : "Ativar"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Canvas */}
        <div ref={contemDoCanvas} className="relative min-h-[50vh] flex-1">
          <ProblemasCtx.Provider value={mapaProblemas}>
            <ReactFlow
              nodes={nos}
              edges={ligacoes}
              nodeTypes={TIPOS_DE_NO}
              onNodesChange={(c) => {
                onNodesChange(c);
                if (c.some((x) => x.type !== "select" && x.type !== "dimensions")) marcarSujo();
                const removidos = c.filter((x) => x.type === "remove").map((x) => (x as { id: string }).id);
                if (removidos.includes(selecionado ?? "")) setSelecionado(TRIGGER_NODE_ID);
              }}
              onEdgesChange={(c) => {
                onEdgesChange(c);
                if (c.some((x) => x.type === "remove")) marcarSujo();
              }}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              onNodeClick={(_, n) => {
                setSelecionado(n.id);
                setMenu(null);
              }}
              onPaneClick={() => setMenu(null)}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={(n) => COR_NO[n.type as NodeKind] ?? "#888"} maskColor="rgba(120,120,120,0.15)" className="!hidden !rounded-lg !border !border-line md:!block" />
            </ReactFlow>
          </ProblemasCtx.Provider>

          {/* Barra de passos */}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {TIPOS_ADICIONAVEIS.map((t) => (
              <button key={t} className="btn btn-sm bg-surface shadow-sm" onClick={() => adicionar(t)} title={DESCRICAO_NO[t]}>
                <span style={{ color: COR_NO[t] }}>
                  <IconeNo tipo={t} className="h-3.5 w-3.5" />
                </span>
                {ROTULO_NO[t]}
              </button>
            ))}
          </div>

          {menu && (
            <div className="absolute z-10 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg" style={{ left: menu.x, top: menu.y }} role="menu">
              <p className="px-2 py-1 text-xs text-muted">Próximo passo</p>
              {TIPOS_ADICIONAVEIS.map((t) => (
                <button key={t} role="menuitem" className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2" onClick={() => adicionar(t, { x: menu.fluxoX, y: menu.fluxoY }, menu.de)}>
                  <span className="mt-0.5" style={{ color: COR_NO[t] }}>
                    <IconeNo tipo={t} />
                  </span>
                  <span>
                    <span className="block text-sm">{ROTULO_NO[t]}</span>
                    <span className="block text-xs text-muted">{DESCRICAO_NO[t]}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside className="w-full shrink-0 overflow-y-auto border-t border-line bg-surface lg:w-96 lg:border-l lg:border-t-0">
          {noSelecionado ? (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ background: COR_NO[noSelecionado.type as NodeKind] }}>
                  <IconeNo tipo={noSelecionado.type as NodeKind} />
                </span>
                <h2 className="font-medium">{ROTULO_NO[noSelecionado.type as NodeKind]}</h2>
                {noSelecionado.type !== "trigger" && (
                  <div className="ml-auto flex gap-1">
                    <button className="btn btn-sm" onClick={() => duplicarNo(noSelecionado.id)}>
                      Duplicar
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => apagarNo(noSelecionado.id)} aria-label="Apagar passo">
                      <IconeLixo />
                    </button>
                  </div>
                )}
              </div>

              {problemasDoSelecionado.length > 0 && (
                <ul className="space-y-1.5">
                  {problemasDoSelecionado.map((p, i) => (
                    <li key={i} className={`rounded-lg px-3 py-2 text-xs ${p.nivel === "erro" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                      {p.mensagem}
                    </li>
                  ))}
                </ul>
              )}

              {noSelecionado.type === "trigger" ? (
                <PainelGatilho
                  triggerType={triggerType}
                  cfg={cfg}
                  conectado={conectado}
                  onTipo={(t) => {
                    setTriggerType(t);
                    if (t === "STORY_MENTION" || t === "DEFAULT_REPLY") setCfg((c) => ({ ...c, match: "any" }));
                    marcarSujo();
                  }}
                  onCfg={(c) => {
                    setCfg((x) => ({ ...x, ...c }));
                    marcarSujo();
                  }}
                />
              ) : (
                <PainelNo no={{ id: noSelecionado.id, type: noSelecionado.type as NodeKind, position: noSelecionado.position, data: noSelecionado.data } as FlowNode} onChange={(d) => mudarDados(noSelecionado.id, d)} />
              )}
            </div>
          ) : null}

          {/* Todos os problemas */}
          {problemas.some((p) => p.noId !== selecionado) && (
            <div className="border-t border-line p-4">
              <h3 className="mb-2 text-xs font-medium text-muted">Outros pontos do fluxo</h3>
              <ul className="space-y-1">
                {problemas
                  .filter((p) => p.noId !== selecionado)
                  .map((p, i) => (
                    <li key={i}>
                      <button
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-surface-2"
                        onClick={() => {
                          if (!p.noId) return;
                          setSelecionado(p.noId);
                          const n = nos.find((x) => x.id === p.noId);
                          if (n) rf.setCenter(n.position.x + 128, n.position.y + 60, { zoom: 1, duration: 300 });
                        }}
                      >
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${p.nivel === "erro" ? "bg-danger" : "bg-warn"}`} />
                        {p.mensagem}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 border-t border-line p-4">
            <form action={duplicar.bind(null, inicial.id)}>
              <button className="btn btn-sm">Duplicar automação</button>
            </form>
            {confirmarApagar ? (
              <form action={excluir.bind(null, inicial.id)} className="flex items-center gap-2">
                <button className="btn btn-sm btn-danger">Apagar de vez</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmarApagar(false)}>
                  Cancelar
                </button>
              </form>
            ) : (
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmarApagar(true)} title="Apaga a automação e o histórico dela">
                Apagar
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function Editor(props: { inicial: AutomacaoEditavel; conectado: boolean }) {
  return (
    <ReactFlowProvider>
      <EditorInterno {...props} />
    </ReactFlowProvider>
  );
}

