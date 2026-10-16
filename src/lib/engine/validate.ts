import type { TriggerType } from "@prisma/client";
import {
  LIMITES,
  TRIGGER_NODE_ID,
  mensagemTemRamos,
  saidasDoNo,
  type Flow,
  type FlowNode,
  type NodeDataMap,
  type TriggerConfig,
} from "./types";

export type Problema = { nivel: "erro" | "aviso"; noId?: string; mensagem: string };

const bytes = (s: string) => new TextEncoder().encode(s).length;

function urlValida(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validarAutomacao(triggerType: TriggerType, cfg: TriggerConfig, flow: Flow): Problema[] {
  const p: Problema[] = [];
  const nos = new Map(flow.nodes.map((n) => [n.id, n]));
  const gatilho = nos.get(TRIGGER_NODE_ID);

  // --- gatilho ---
  const precisaPalavra = triggerType === "COMMENT" || triggerType === "DM_KEYWORD";
  if (precisaPalavra && cfg.match !== "any" && cfg.keywords.filter((k) => k.trim()).length === 0) {
    p.push({ nivel: "erro", noId: TRIGGER_NODE_ID, mensagem: "Coloque pelo menos uma palavra-chave (ou escolha \"qualquer texto\")." });
  }
  if (triggerType === "COMMENT") {
    if (cfg.mediaScope === "specific" && (cfg.mediaIds ?? []).length === 0) {
      p.push({ nivel: "erro", noId: TRIGGER_NODE_ID, mensagem: "Escolha pelo menos um post ou marque \"qualquer post\"." });
    }
    if (cfg.publicReplyEnabled && (cfg.publicReplies ?? []).filter((r) => r.trim()).length === 0) {
      p.push({ nivel: "erro", noId: TRIGGER_NODE_ID, mensagem: "A resposta pública está ligada mas não tem nenhuma frase." });
    }
  }
  if (!gatilho) {
    p.push({ nivel: "erro", mensagem: "O fluxo perdeu o nó de gatilho." });
    return p;
  }

  const saidas = (no: FlowNode) => flow.edges.filter((e) => e.source === no.id);
  const destino = (no: FlowNode, handle: string) => {
    const e = flow.edges.find((x) => x.source === no.id && (x.sourceHandle ?? "next") === handle);
    return e ? nos.get(e.target) : undefined;
  };

  const primeiro = destino(gatilho, "next");
  if (!primeiro) p.push({ nivel: "erro", noId: TRIGGER_NODE_ID, mensagem: "Ligue o gatilho ao primeiro passo do fluxo." });

  // Regra da Meta: depois da resposta privada ao comentário, a próxima
  // mensagem só sai quando a pessoa responder. Então a 1ª mensagem precisa
  // de um botão, senão o resto do fluxo trava esperando.
  if (triggerType === "COMMENT" && primeiro) {
    if (primeiro.type !== "message") {
      p.push({
        nivel: "aviso",
        noId: primeiro.id,
        mensagem: "Em gatilho de comentário, o primeiro passo deve ser uma mensagem: é ela que vai como resposta privada.",
      });
    } else {
      const d = primeiro.data as NodeDataMap["message"];
      const temContinuacao = saidas(primeiro).length > 0;
      if (!mensagemTemRamos(d) && temContinuacao) {
        p.push({
          nivel: "aviso",
          noId: primeiro.id,
          mensagem:
            "A Meta só libera a 2ª mensagem depois que a pessoa responder o direct. Coloque um botão nesta 1ª mensagem, senão o resto espera ela escrever.",
        });
      }
      if (d.imageUrl) {
        p.push({
          nivel: "aviso",
          noId: primeiro.id,
          mensagem: "A resposta privada ao comentário aceita uma mensagem só: a imagem desta não vai. Mande a imagem num passo depois do botão.",
        });
      }
    }
  }

  // --- nós ---
  for (const no of flow.nodes) {
    switch (no.type) {
      case "message": {
        const d = no.data as NodeDataMap["message"];
        if (!d.text.trim()) p.push({ nivel: "erro", noId: no.id, mensagem: "Mensagem sem texto." });
        const comBotoes = d.buttons.length > 0;
        if (comBotoes && d.text.length > LIMITES.textoComBotoes) {
          p.push({ nivel: "erro", noId: no.id, mensagem: `Mensagem com botão aceita até ${LIMITES.textoComBotoes} caracteres.` });
        }
        if (bytes(d.text) > LIMITES.textoMensagem) {
          p.push({ nivel: "erro", noId: no.id, mensagem: "Mensagem passou do limite de 1000 bytes da Meta (encurte o texto)." });
        }
        if (d.buttons.length > LIMITES.botoes) p.push({ nivel: "erro", noId: no.id, mensagem: "No máximo 3 botões por mensagem." });
        if (d.quickReplies.length > LIMITES.respostasRapidas) {
          p.push({ nivel: "erro", noId: no.id, mensagem: "No máximo 13 respostas rápidas." });
        }
        if (d.buttons.length > 0 && d.quickReplies.length > 0) {
          p.push({ nivel: "erro", noId: no.id, mensagem: "Use botões OU respostas rápidas na mesma mensagem, não os dois." });
        }
        for (const b of [...d.buttons, ...d.quickReplies]) {
          if (!b.title.trim()) p.push({ nivel: "erro", noId: no.id, mensagem: "Tem botão sem título." });
          if (b.title.length > LIMITES.tituloBotao) {
            p.push({ nivel: "erro", noId: no.id, mensagem: `O botão "${b.title}" passa de ${LIMITES.tituloBotao} caracteres.` });
          }
        }
        for (const b of d.buttons) {
          if (b.kind === "url" && !urlValida(b.url)) {
            p.push({ nivel: "erro", noId: no.id, mensagem: `O botão "${b.title}" está sem link válido (comece com https://).` });
          }
        }
        if (d.imageUrl && !urlValida(d.imageUrl)) p.push({ nivel: "erro", noId: no.id, mensagem: "Link da imagem inválido." });
        break;
      }
      case "delay": {
        const d = no.data as NodeDataMap["delay"];
        const horas = d.unit === "hours" ? d.amount : d.unit === "minutes" ? d.amount / 60 : d.amount / 3600;
        if (!(d.amount > 0)) p.push({ nivel: "erro", noId: no.id, mensagem: "Espera precisa ser maior que zero." });
        if (horas > LIMITES.delayMaxHoras) {
          p.push({
            nivel: "aviso",
            noId: no.id,
            mensagem: "Espera maior que 23 h: a janela de 24 h da Meta deve fechar antes, e a mensagem seguinte só sai se a pessoa escrever de novo.",
          });
        }
        break;
      }
      case "ask": {
        const d = no.data as NodeDataMap["ask"];
        if (!d.question.trim()) p.push({ nivel: "erro", noId: no.id, mensagem: "Pergunta sem texto." });
        if (d.saveTo.startsWith("field:") && !d.saveTo.slice(6).trim()) {
          p.push({ nivel: "erro", noId: no.id, mensagem: "Dê um nome ao campo onde a resposta vai ser gravada." });
        }
        break;
      }
      case "followGate": {
        const d = no.data as NodeDataMap["followGate"];
        if (!d.askText.trim()) p.push({ nivel: "erro", noId: no.id, mensagem: "Escreva a mensagem pedindo pra seguir." });
        if (!d.buttonTitle.trim() || d.buttonTitle.length > LIMITES.tituloBotao) {
          p.push({ nivel: "erro", noId: no.id, mensagem: "Botão de confirmação precisa de título com até 20 caracteres." });
        }
        break;
      }
      case "condition": {
        const d = no.data as NodeDataMap["condition"];
        if (d.rule.type === "hasTag" && !d.rule.tag.trim()) p.push({ nivel: "erro", noId: no.id, mensagem: "Escolha a etiqueta." });
        if (d.rule.type === "field" && !d.rule.field.trim()) p.push({ nivel: "erro", noId: no.id, mensagem: "Escolha o campo." });
        break;
      }
      case "tag": {
        const d = no.data as NodeDataMap["tag"];
        if (d.add.length === 0 && d.remove.length === 0) p.push({ nivel: "aviso", noId: no.id, mensagem: "Etiqueta sem nada pra pôr ou tirar." });
        break;
      }
      case "brevo": {
        const d = no.data as NodeDataMap["brevo"];
        if (!(d.listId > 0)) p.push({ nivel: "erro", noId: no.id, mensagem: "Informe o número da lista do Brevo." });
        break;
      }
    }

    // botão que avança mas não leva a lugar nenhum
    if (no.type === "message") {
      for (const s of saidasDoNo(no)) {
        if (s.id.startsWith("btn:") && !destino(no, s.id)) {
          p.push({ nivel: "aviso", noId: no.id, mensagem: `O botão "${s.rotulo}" não está ligado a nenhum passo.` });
        }
      }
    }
  }

  // passos soltos (sem caminho a partir do gatilho)
  const alcancados = new Set<string>([TRIGGER_NODE_ID]);
  const fila = [TRIGGER_NODE_ID];
  while (fila.length) {
    const id = fila.shift()!;
    for (const e of flow.edges) {
      if (e.source === id && !alcancados.has(e.target)) {
        alcancados.add(e.target);
        fila.push(e.target);
      }
    }
  }
  for (const no of flow.nodes) {
    if (!alcancados.has(no.id)) p.push({ nivel: "aviso", noId: no.id, mensagem: "Este passo não está ligado ao fluxo e nunca vai rodar." });
  }

  return p;
}

export function temErro(problemas: Problema[]): boolean {
  return problemas.some((x) => x.nivel === "erro");
}
