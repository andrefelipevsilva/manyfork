"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { ROTULO_GATILHO } from "@/lib/engine/templates";
import type { ConditionRule, NodeDataMap, NodeKind, TriggerConfig } from "@/lib/engine/types";
import { COR_NO, IconeNo, ROTULO_NO, useProblemaDoNo } from "./comum";

// Cartões do canvas. Cada saída (botão, sim/não…) tem a própria alça à direita.

type DadosGatilho = { triggerType: keyof typeof ROTULO_GATILHO; cfg: TriggerConfig };

function Cartao({ id, tipo, selected, children, alvo = true }: { id: string; tipo: NodeKind; selected?: boolean; children: ReactNode; alvo?: boolean }) {
  const problema = useProblemaDoNo(id);
  return (
    <div
      className={`w-64 rounded-xl border bg-surface text-left text-sm shadow-sm transition-shadow ${
        selected ? "border-accent ring-2 ring-accent/40" : "border-line"
      }`}
    >
      {alvo && <Handle type="target" position={Position.Left} className="!left-[-6px]" />}
      <div className="flex items-center gap-2 rounded-t-xl border-b border-line px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ background: COR_NO[tipo] }}>
          <IconeNo tipo={tipo} className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium">{ROTULO_NO[tipo]}</span>
        {problema && (
          <span
            className={`ml-auto h-2.5 w-2.5 rounded-full ${problema === "erro" ? "bg-danger" : "bg-warn"}`}
            title={problema === "erro" ? "Tem erro neste passo" : "Tem aviso neste passo"}
          />
        )}
      </div>
      <div className="space-y-2 px-3 py-2">{children}</div>
    </div>
  );
}

/** Linha com alça de saída na borda direita do cartão. */
function Saida({ id, rotulo, tom = "neutro" }: { id: string; rotulo: ReactNode; tom?: "neutro" | "sim" | "nao" | "botao" }) {
  const estilo =
    tom === "sim"
      ? "bg-ok-soft text-ok"
      : tom === "nao"
        ? "bg-danger-soft text-danger"
        : tom === "botao"
          ? "border border-line bg-surface-2 text-fg"
          : "text-muted";
  return (
    <div className={`relative -mr-3 rounded-md py-1 pl-2 pr-4 text-xs ${estilo}`}>
      <span className="block truncate">{rotulo}</span>
      <Handle type="source" position={Position.Right} id={id} className="!right-[-6px]" />
    </div>
  );
}

function Texto({ children, vazio }: { children?: string; vazio: string }) {
  return children?.trim() ? (
    <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-fg">{children}</p>
  ) : (
    <p className="text-xs italic text-muted">{vazio}</p>
  );
}

export function NoGatilho({ id, data, selected }: NodeProps<Node<DadosGatilho, "trigger">>) {
  const cfg = data.cfg;
  const palavras = cfg.match === "any" ? "qualquer texto" : cfg.keywords.filter(Boolean).join(", ") || "—";
  return (
    <Cartao id={id} tipo="trigger" selected={selected} alvo={false}>
      <p className="text-xs font-medium">{ROTULO_GATILHO[data.triggerType]}</p>
      {data.triggerType !== "STORY_MENTION" && data.triggerType !== "DEFAULT_REPLY" && (
        <p className="truncate text-xs text-muted">
          Palavra-chave: <span className="text-fg">{palavras}</span>
        </p>
      )}
      {data.triggerType === "COMMENT" && (
        <p className="text-xs text-muted">
          {cfg.mediaScope === "specific" ? `${cfg.mediaIds?.length ?? 0} post(s) escolhido(s)` : "Qualquer post ou reel"}
          {cfg.publicReplyEnabled ? " · responde em público" : ""}
        </p>
      )}
      <Saida id="next" rotulo="Começa aqui" />
    </Cartao>
  );
}

export function NoMensagem({ id, data, selected }: NodeProps<Node<NodeDataMap["message"], "message">>) {
  const ramos = data.buttons.filter((b) => b.kind === "next").length + data.quickReplies.length;
  return (
    <Cartao id={id} tipo="message" selected={selected}>
      {data.imageUrl && <p className="truncate text-xs text-muted">🖼 imagem</p>}
      <Texto vazio="Escreva a mensagem…">{data.text}</Texto>
      {data.buttons.map((b) =>
        b.kind === "next" ? (
          <Saida key={b.id} id={`btn:${b.id}`} rotulo={b.title || "Botão"} tom="botao" />
        ) : (
          <div key={b.id} className="truncate rounded-md border border-dashed border-line px-2 py-1 text-xs text-muted">
            🔗 {b.title || "Link"}
          </div>
        ),
      )}
      {data.quickReplies.map((q) => (
        <Saida key={q.id} id={`btn:${q.id}`} rotulo={`↩ ${q.title || "Resposta rápida"}`} tom="botao" />
      ))}
      {ramos === 0 && <Saida id="next" rotulo="Depois" />}
    </Cartao>
  );
}

const unidade = { seconds: "segundo(s)", minutes: "minuto(s)", hours: "hora(s)" };

export function NoEspera({ id, data, selected }: NodeProps<Node<NodeDataMap["delay"], "delay">>) {
  return (
    <Cartao id={id} tipo="delay" selected={selected}>
      <p className="text-xs">
        Espera <strong>{data.amount}</strong> {unidade[data.unit]}
      </p>
      <Saida id="next" rotulo="Depois" />
    </Cartao>
  );
}

function descreverRegra(r: ConditionRule): string {
  switch (r.type) {
    case "follows":
      return "Segue a conta?";
    case "hasEmail":
      return "Já tem e-mail?";
    case "hasTag":
      return `Tem a etiqueta "${r.tag || "…"}"?`;
    case "field":
      return r.op === "exists" ? `Campo "${r.field || "…"}" preenchido?` : `Campo "${r.field || "…"}" ${r.op === "equals" ? "é" : "contém"} "${r.value ?? ""}"?`;
  }
}

export function NoCondicao({ id, data, selected }: NodeProps<Node<NodeDataMap["condition"], "condition">>) {
  return (
    <Cartao id={id} tipo="condition" selected={selected}>
      <p className="text-xs">{descreverRegra(data.rule)}</p>
      <Saida id="yes" rotulo="Sim" tom="sim" />
      <Saida id="no" rotulo="Não" tom="nao" />
    </Cartao>
  );
}

export function NoSeguidor({ id, data, selected }: NodeProps<Node<NodeDataMap["followGate"], "followGate">>) {
  return (
    <Cartao id={id} tipo="followGate" selected={selected}>
      <Texto vazio="Mensagem pedindo pra seguir…">{data.askText}</Texto>
      <p className="text-xs text-muted">
        Botão “{data.buttonTitle}” · até {data.maxAttempts} tentativa(s)
      </p>
      <Saida id="yes" rotulo="Segue" tom="sim" />
      <Saida id="no" rotulo="Não seguiu" tom="nao" />
    </Cartao>
  );
}

const rotuloCampo = (s: NodeDataMap["ask"]["saveTo"]) => (s === "email" ? "e-mail" : s === "phone" ? "telefone" : `campo "${s.slice(6)}"`);

export function NoPergunta({ id, data, selected }: NodeProps<Node<NodeDataMap["ask"], "ask">>) {
  return (
    <Cartao id={id} tipo="ask" selected={selected}>
      <Texto vazio="Escreva a pergunta…">{data.question}</Texto>
      <p className="text-xs text-muted">Grava em: {rotuloCampo(data.saveTo)}</p>
      <Saida id="ok" rotulo="Respondeu" tom="sim" />
      <Saida id="fail" rotulo="Não respondeu certo" tom="nao" />
    </Cartao>
  );
}

export function NoEtiqueta({ id, data, selected }: NodeProps<Node<NodeDataMap["tag"], "tag">>) {
  return (
    <Cartao id={id} tipo="tag" selected={selected}>
      {data.add.length > 0 && <p className="text-xs">+ {data.add.join(", ")}</p>}
      {data.remove.length > 0 && <p className="text-xs text-muted">− {data.remove.join(", ")}</p>}
      {data.add.length + data.remove.length === 0 && <p className="text-xs italic text-muted">Nenhuma etiqueta</p>}
      <Saida id="next" rotulo="Depois" />
    </Cartao>
  );
}

export function NoBrevo({ id, data, selected }: NodeProps<Node<NodeDataMap["brevo"], "brevo">>) {
  return (
    <Cartao id={id} tipo="brevo" selected={selected}>
      <p className="text-xs">{data.listId > 0 ? `Lista nº ${data.listId}` : <span className="italic text-muted">Escolha a lista</span>}</p>
      <p className="text-xs text-muted">Só roda se o contato tiver e-mail.</p>
      <Saida id="next" rotulo="Depois" />
    </Cartao>
  );
}

export const TIPOS_DE_NO = {
  trigger: NoGatilho,
  message: NoMensagem,
  delay: NoEspera,
  condition: NoCondicao,
  followGate: NoSeguidor,
  ask: NoPergunta,
  tag: NoEtiqueta,
  brevo: NoBrevo,
};
