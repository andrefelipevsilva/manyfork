"use client";

import { createContext, useContext } from "react";
import type { NodeDataMap, NodeKind } from "@/lib/engine/types";

// Contexto do editor: problemas por nó (pra pintar o alerta no cartão).
export const ProblemasCtx = createContext<Map<string, "erro" | "aviso">>(new Map());
export const useProblemaDoNo = (id: string) => useContext(ProblemasCtx).get(id);

export function idCurto(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const ROTULO_NO: Record<NodeKind, string> = {
  trigger: "Gatilho",
  message: "Mensagem",
  delay: "Esperar",
  condition: "Condição",
  followGate: "Só pra seguidor",
  ask: "Pergunta",
  tag: "Etiqueta",
  brevo: "Enviar ao Brevo",
};

export const DESCRICAO_NO: Record<Exclude<NodeKind, "trigger">, string> = {
  message: "Texto, botões, link ou imagem",
  ask: "Pede e-mail, telefone ou outra resposta",
  followGate: "Confere se a pessoa te segue",
  condition: "Divide o caminho por regra",
  delay: "Espera um tempo antes de seguir",
  tag: "Põe ou tira etiqueta do contato",
  brevo: "Grava o e-mail numa lista do Brevo",
};

/** Cor de destaque de cada tipo (só o ícone/faixa; texto fica na cor normal). */
export const COR_NO: Record<NodeKind, string> = {
  trigger: "#65a30d",
  message: "#2563eb",
  ask: "#9333ea",
  followGate: "#db2777",
  condition: "#d97706",
  delay: "#64748b",
  tag: "#0d9488",
  brevo: "#0b996e",
};

export function dadosPadrao<K extends Exclude<NodeKind, "trigger">>(tipo: K): NodeDataMap[K] {
  const padrao: { [P in Exclude<NodeKind, "trigger">]: NodeDataMap[P] } = {
    message: { text: "", buttons: [], quickReplies: [], trackLinks: true },
    delay: { amount: 10, unit: "minutes" },
    condition: { rule: { type: "follows" } },
    followGate: {
      askText: "Esse conteúdo é pra quem me segue. Me segue e clica no botão 👇",
      buttonTitle: "Já segui ✅",
      retryText: "Ainda não apareceu aqui que você me segue 🤔 Confere e clica de novo.",
      maxAttempts: 3,
    },
    ask: {
      question: "Qual o seu melhor e-mail?",
      saveTo: "email",
      validation: "email",
      retryText: "Hmm, isso não parece certo. Manda de novo?",
      maxAttempts: 3,
      skipIfFilled: true,
    },
    tag: { add: [], remove: [] },
    brevo: { listId: 0 },
  };
  return structuredClone(padrao[tipo]) as NodeDataMap[K];
}

export function IconeNo({ tipo, className }: { tipo: NodeKind; className?: string }) {
  const p = { className: className ?? "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (tipo) {
    case "trigger":
      return (
        <svg {...p}>
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case "message":
      return (
        <svg {...p}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "ask":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
        </svg>
      );
    case "followGate":
      return (
        <svg {...p}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="m16 11 2 2 4-4" />
        </svg>
      );
    case "condition":
      return (
        <svg {...p}>
          <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9" />
        </svg>
      );
    case "delay":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
    case "tag":
      return (
        <svg {...p}>
          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <path d="M7 7h.01" />
        </svg>
      );
    case "brevo":
      return (
        <svg {...p}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 6L2 7" />
        </svg>
      );
  }
}
