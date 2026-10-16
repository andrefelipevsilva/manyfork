// Modelo do fluxo (o que o editor salva em Automation.flow) e do gatilho
// (Automation.triggerConfig). O formato do grafo é o do React Flow, pra o
// editor gravar e ler sem conversão.

export type KeywordMatch = "contains" | "exact" | "any";

export type TriggerConfig = {
  /** Palavras-chave (qualquer uma dispara). Ignorado com match = "any". */
  keywords: string[];
  match: KeywordMatch;
  /** Só COMMENT: em quais posts vale. */
  mediaScope?: "any" | "specific";
  mediaIds?: string[];
  /** Miniaturas dos posts escolhidos, só pra exibir no editor. */
  mediaPreview?: { id: string; thumbnail?: string; caption?: string; permalink?: string }[];
  /** Só COMMENT: vale também pra resposta a outro comentário. */
  includeReplies?: boolean;
  /** Só COMMENT: responde o comentário em público (sorteia uma das frases). */
  publicReplyEnabled?: boolean;
  publicReplies?: string[];
  /** Não dispara de novo pro mesmo contato dentro deste intervalo. 0 = sempre. */
  cooldownMinutes?: number;
};

export type UrlButton = { id: string; title: string; kind: "url"; url: string };
export type NextButton = { id: string; title: string; kind: "next" };
export type ButtonDef = UrlButton | NextButton;
export type QuickReplyDef = { id: string; title: string };

export type ConditionRule =
  | { type: "follows" }
  | { type: "hasEmail" }
  | { type: "hasTag"; tag: string }
  | { type: "field"; field: string; op: "exists" | "equals" | "contains"; value?: string };

export type AskSaveTo = "email" | "phone" | `field:${string}`;

export type NodeDataMap = {
  trigger: Record<string, never>;
  message: {
    text: string;
    imageUrl?: string;
    buttons: ButtonDef[];
    quickReplies: QuickReplyDef[];
    /** Botões de link passam pelo /r/ do manyfork pra contar clique. */
    trackLinks?: boolean;
  };
  delay: { amount: number; unit: "seconds" | "minutes" | "hours" };
  condition: { rule: ConditionRule };
  followGate: {
    /** Mensagem pra quem ainda não segue (vai com o botão de confirmar). */
    askText: string;
    buttonTitle: string;
    /** Mensagem quando clicou mas ainda não aparece como seguidor. */
    retryText: string;
    maxAttempts: number;
  };
  ask: {
    question: string;
    saveTo: AskSaveTo;
    validation: "email" | "phone" | "text" | "number";
    retryText: string;
    maxAttempts: number;
    /** Se o contato já tem o dado, pula a pergunta. */
    skipIfFilled: boolean;
  };
  tag: { add: string[]; remove: string[] };
  brevo: { listId: number };
};

export type NodeKind = keyof NodeDataMap;

export type FlowNode<K extends NodeKind = NodeKind> = {
  id: string;
  type: K;
  position: { x: number; y: number };
  data: NodeDataMap[K];
};

export type FlowEdge = {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
};

export type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };

export const TRIGGER_NODE_ID = "gatilho";

/** Saídas de cada nó (o "sourceHandle" das ligações). */
export function saidasDoNo(no: FlowNode): { id: string; rotulo: string }[] {
  switch (no.type) {
    case "message": {
      const d = no.data as NodeDataMap["message"];
      const ramos = [
        ...d.buttons.filter((b) => b.kind === "next").map((b) => ({ id: `btn:${b.id}`, rotulo: b.title || "Botão" })),
        ...d.quickReplies.map((q) => ({ id: `btn:${q.id}`, rotulo: q.title || "Resposta rápida" })),
      ];
      return ramos.length > 0 ? ramos : [{ id: "next", rotulo: "Depois" }];
    }
    case "condition":
    case "followGate":
      return [
        { id: "yes", rotulo: no.type === "followGate" ? "Segue" : "Sim" },
        { id: "no", rotulo: no.type === "followGate" ? "Não seguiu" : "Não" },
      ];
    case "ask":
      return [
        { id: "ok", rotulo: "Respondeu" },
        { id: "fail", rotulo: "Não respondeu certo" },
      ];
    default:
      return [{ id: "next", rotulo: "Depois" }];
  }
}

export function mensagemTemRamos(d: NodeDataMap["message"]): boolean {
  return d.buttons.some((b) => b.kind === "next") || d.quickReplies.length > 0;
}

export const LIMITES = {
  textoMensagem: 1000,
  textoComBotoes: 640,
  botoes: 3,
  respostasRapidas: 13,
  tituloBotao: 20,
  delayMaxHoras: 23,
} as const;
