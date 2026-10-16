"use client";

import type { TriggerType } from "@prisma/client";
import { useRef } from "react";
import { VARIAVEIS } from "@/lib/engine/render";
import { ROTULO_GATILHO } from "@/lib/engine/templates";
import { LIMITES, type ButtonDef, type ConditionRule, type FlowNode, type NodeDataMap, type TriggerConfig } from "@/lib/engine/types";
import { Campo, Chips, Contador, Interruptor, Segmentado } from "./campos";
import { idCurto } from "./comum";
import { SeletorPosts } from "./seletor-posts";

// ------------------------------------------------------------------ gatilho

export function PainelGatilho({
  triggerType,
  cfg,
  onTipo,
  onCfg,
  conectado,
}: {
  triggerType: TriggerType;
  cfg: TriggerConfig;
  onTipo: (t: TriggerType) => void;
  onCfg: (c: Partial<TriggerConfig>) => void;
  conectado: boolean;
}) {
  const usaPalavra = triggerType === "COMMENT" || triggerType === "DM_KEYWORD" || triggerType === "STORY_REPLY";
  const respostas = cfg.publicReplies ?? [];
  return (
    <div className="space-y-5">
      <Campo rotulo="Quando disparar" htmlFor="tipo-gatilho">
        <select id="tipo-gatilho" className="input" value={triggerType} onChange={(e) => onTipo(e.target.value as TriggerType)}>
          {(Object.keys(ROTULO_GATILHO) as TriggerType[]).map((t) => (
            <option key={t} value={t}>
              {ROTULO_GATILHO[t]}
            </option>
          ))}
        </select>
      </Campo>

      {usaPalavra && (
        <div className="space-y-2">
          <Campo rotulo="Palavra-chave" htmlFor="palavras">
            <Segmentado
              valor={cfg.match}
              onChange={(match) => onCfg({ match })}
              opcoes={[
                { v: "contains", r: "Contém" },
                { v: "exact", r: "Exatamente" },
                { v: "any", r: "Qualquer texto" },
              ]}
            />
          </Campo>
          {cfg.match !== "any" && (
            <>
              <Chips id="palavras" valores={cfg.keywords} onChange={(keywords) => onCfg({ keywords })} placeholder="QUERO, link…" />
              <p className="text-xs text-muted">Não diferencia maiúscula, acento nem pontuação. Enter ou vírgula pra adicionar.</p>
            </>
          )}
        </div>
      )}

      {triggerType === "COMMENT" && (
        <>
          <Campo rotulo="Em quais posts">
            <Segmentado
              valor={cfg.mediaScope ?? "any"}
              onChange={(mediaScope) => onCfg({ mediaScope })}
              opcoes={[
                { v: "any", r: "Qualquer post" },
                { v: "specific", r: "Posts escolhidos" },
              ]}
            />
          </Campo>
          {cfg.mediaScope === "specific" && <SeletorPosts cfg={cfg} onChange={onCfg} conectado={conectado} />}
          <Interruptor rotulo="Vale resposta a outro comentário" ligado={Boolean(cfg.includeReplies)} onChange={(includeReplies) => onCfg({ includeReplies })} />

          <div className="space-y-2 rounded-lg border border-line p-3">
            <Interruptor
              rotulo="Responder o comentário em público"
              ligado={Boolean(cfg.publicReplyEnabled)}
              onChange={(publicReplyEnabled) => onCfg({ publicReplyEnabled, publicReplies: respostas.length ? respostas : ["Te mandei no direct 📩"] })}
            />
            {cfg.publicReplyEnabled && (
              <>
                <p className="text-xs text-muted">Sorteia uma frase por comentário (parece menos robô). Sai depois de alguns segundos.</p>
                {respostas.map((r, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      className="input text-xs"
                      value={r}
                      onChange={(e) => onCfg({ publicReplies: respostas.map((x, j) => (j === i ? e.target.value : x)) })}
                      aria-label={`Resposta pública ${i + 1}`}
                    />
                    <button type="button" className="btn btn-sm" onClick={() => onCfg({ publicReplies: respostas.filter((_, j) => j !== i) })} aria-label="Remover frase">
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm w-full" onClick={() => onCfg({ publicReplies: [...respostas, ""] })}>
                  + Frase
                </button>
              </>
            )}
          </div>
        </>
      )}

      <Campo
        rotulo="Não repetir pra mesma pessoa por (minutos)"
        htmlFor="cooldown"
        ajuda={triggerType === "DEFAULT_REPLY" ? "Padrão: 1440 (um dia)." : "0 = dispara toda vez."}
      >
        <input
          id="cooldown"
          type="number"
          min={0}
          className="input"
          value={cfg.cooldownMinutes ?? (triggerType === "DEFAULT_REPLY" ? 1440 : 0)}
          onChange={(e) => onCfg({ cooldownMinutes: Math.max(0, Number(e.target.value) || 0) })}
        />
      </Campo>
    </div>
  );
}

// ------------------------------------------------------------------ nós

type Props<K extends FlowNode["type"]> = { data: NodeDataMap[K]; onChange: (d: Partial<NodeDataMap[K]>) => void };

function TextoComVariaveis({ id, valor, onChange, limite, linhas = 5 }: { id: string; valor: string; onChange: (v: string) => void; limite: number; linhas?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function inserir(chave: string) {
    const el = ref.current;
    const marca = `{{${chave}}}`;
    if (!el) return onChange(valor + marca);
    const ini = el.selectionStart ?? valor.length;
    const fim = el.selectionEnd ?? valor.length;
    onChange(valor.slice(0, ini) + marca + valor.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }
  return (
    <div className="space-y-1">
      <textarea id={id} ref={ref} rows={linhas} className="input resize-y" value={valor} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap items-center gap-1">
        {VARIAVEIS.slice(0, 3).map((v) => (
          <button key={v.chave} type="button" className="badge bg-surface-2 text-muted hover:text-fg" onClick={() => inserir(v.chave)} title={`Insere {{${v.chave}}}`}>
            + {v.rotulo}
          </button>
        ))}
        <span className="ml-auto">
          <Contador atual={valor.length} limite={limite} />
        </span>
      </div>
    </div>
  );
}

function PainelMensagem({ data, onChange }: Props<"message">) {
  const modo: "nada" | "botoes" | "rapidas" = data.buttons.length ? "botoes" : data.quickReplies.length ? "rapidas" : "nada";
  const limite = data.buttons.length ? LIMITES.textoComBotoes : LIMITES.textoMensagem;

  function mudarBotao(i: number, b: Partial<ButtonDef>) {
    onChange({ buttons: data.buttons.map((x, j) => (j === i ? ({ ...x, ...b } as ButtonDef) : x)) });
  }

  return (
    <div className="space-y-5">
      <Campo rotulo="Texto" htmlFor="texto-msg">
        <TextoComVariaveis id="texto-msg" valor={data.text} onChange={(text) => onChange({ text })} limite={limite} />
      </Campo>

      <Campo rotulo="Imagem (opcional)" htmlFor="img" ajuda="Link público de uma imagem PNG/JPG. Vai antes do texto, mas não na resposta privada ao comentário.">
        <input id="img" className="input" placeholder="https://…" value={data.imageUrl ?? ""} onChange={(e) => onChange({ imageUrl: e.target.value || undefined })} />
      </Campo>

      <Campo rotulo="Resposta da pessoa">
        <Segmentado
          valor={modo}
          onChange={(m) => {
            if (m === "nada") onChange({ buttons: [], quickReplies: [] });
            if (m === "botoes") onChange({ quickReplies: [], buttons: data.buttons.length ? data.buttons : [{ id: idCurto(), title: "Quero", kind: "next" }] });
            if (m === "rapidas") onChange({ buttons: [], quickReplies: data.quickReplies.length ? data.quickReplies : [{ id: idCurto(), title: "Sim" }] });
          }}
          opcoes={[
            { v: "nada", r: "Nenhuma" },
            { v: "botoes", r: "Botões" },
            { v: "rapidas", r: "Respostas rápidas" },
          ]}
        />
      </Campo>

      {modo === "botoes" && (
        <div className="space-y-2">
          {data.buttons.map((b, i) => (
            <div key={b.id} className="space-y-1.5 rounded-lg border border-line p-2">
              <div className="flex gap-1.5">
                <input className="input text-xs" value={b.title} maxLength={40} onChange={(e) => mudarBotao(i, { title: e.target.value })} aria-label="Título do botão" placeholder="Título" />
                <button type="button" className="btn btn-sm" onClick={() => onChange({ buttons: data.buttons.filter((_, j) => j !== i) })} aria-label="Remover botão">
                  ×
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  className="input w-auto text-xs"
                  value={b.kind}
                  onChange={(e) => mudarBotao(i, e.target.value === "url" ? { kind: "url", url: "url" in b ? b.url : "https://" } : { kind: "next" })}
                  aria-label="O que o botão faz"
                >
                  <option value="next">Vai pro próximo passo</option>
                  <option value="url">Abre um link</option>
                </select>
                <Contador atual={b.title.length} limite={LIMITES.tituloBotao} />
              </div>
              {b.kind === "url" && <input className="input text-xs" value={b.url} onChange={(e) => mudarBotao(i, { url: e.target.value })} placeholder="https://…" aria-label="Link do botão" />}
            </div>
          ))}
          {data.buttons.length < LIMITES.botoes && (
            <button type="button" className="btn btn-sm w-full" onClick={() => onChange({ buttons: [...data.buttons, { id: idCurto(), title: "", kind: "next" }] })}>
              + Botão
            </button>
          )}
          {data.buttons.some((b) => b.kind === "url") && (
            <Interruptor rotulo="Contar cliques nos links" ligado={data.trackLinks !== false} onChange={(trackLinks) => onChange({ trackLinks })} />
          )}
        </div>
      )}

      {modo === "rapidas" && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Aparecem como balões acima do teclado (só no celular). Digitar o mesmo texto também vale.</p>
          {data.quickReplies.map((q, i) => (
            <div key={q.id} className="flex items-center gap-1.5">
              <input
                className="input text-xs"
                value={q.title}
                maxLength={40}
                onChange={(e) => onChange({ quickReplies: data.quickReplies.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                aria-label="Resposta rápida"
              />
              <Contador atual={q.title.length} limite={LIMITES.tituloBotao} />
              <button type="button" className="btn btn-sm" onClick={() => onChange({ quickReplies: data.quickReplies.filter((_, j) => j !== i) })} aria-label="Remover">
                ×
              </button>
            </div>
          ))}
          {data.quickReplies.length < LIMITES.respostasRapidas && (
            <button type="button" className="btn btn-sm w-full" onClick={() => onChange({ quickReplies: [...data.quickReplies, { id: idCurto(), title: "" }] })}>
              + Resposta rápida
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PainelEspera({ data, onChange }: Props<"delay">) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="number" min={1} className="input" value={data.amount} onChange={(e) => onChange({ amount: Math.max(1, Number(e.target.value) || 1) })} aria-label="Quanto tempo" />
        <select className="input" value={data.unit} onChange={(e) => onChange({ unit: e.target.value as NodeDataMap["delay"]["unit"] })} aria-label="Unidade">
          <option value="seconds">segundos</option>
          <option value="minutes">minutos</option>
          <option value="hours">horas</option>
        </select>
      </div>
      <p className="text-xs text-muted">No simulador toda espera vira 3 segundos. Mais de 23 h esbarra na janela de 24 h da Meta.</p>
    </div>
  );
}

function PainelCondicao({ data, onChange }: Props<"condition">) {
  const r = data.rule;
  const mudar = (rule: ConditionRule) => onChange({ rule });
  return (
    <div className="space-y-3">
      <Campo rotulo="Regra" htmlFor="regra">
        <select
          id="regra"
          className="input"
          value={r.type}
          onChange={(e) => {
            const t = e.target.value as ConditionRule["type"];
            mudar(t === "hasTag" ? { type: t, tag: "" } : t === "field" ? { type: t, field: "", op: "exists" } : { type: t });
          }}
        >
          <option value="follows">Segue a conta</option>
          <option value="hasEmail">Já tem e-mail</option>
          <option value="hasTag">Tem etiqueta</option>
          <option value="field">Campo personalizado</option>
        </select>
      </Campo>
      {r.type === "hasTag" && <input className="input" placeholder="nome da etiqueta" value={r.tag} onChange={(e) => mudar({ ...r, tag: e.target.value })} aria-label="Etiqueta" />}
      {r.type === "field" && (
        <div className="space-y-2">
          <input className="input" placeholder="nome do campo" value={r.field} onChange={(e) => mudar({ ...r, field: e.target.value })} aria-label="Campo" />
          <select className="input" value={r.op} onChange={(e) => mudar({ ...r, op: e.target.value as "exists" | "equals" | "contains" })} aria-label="Comparação">
            <option value="exists">está preenchido</option>
            <option value="equals">é igual a</option>
            <option value="contains">contém</option>
          </select>
          {r.op !== "exists" && <input className="input" placeholder="valor" value={r.value ?? ""} onChange={(e) => mudar({ ...r, value: e.target.value })} aria-label="Valor" />}
        </div>
      )}
      {r.type === "follows" && <p className="text-xs text-muted">A Meta só informa depois que a pessoa falou com você no direct (clicou num botão ou escreveu).</p>}
    </div>
  );
}

function PainelSeguidor({ data, onChange }: Props<"followGate">) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Se a pessoa já segue, vai direto pra “Segue”. Se não, recebe a mensagem com o botão e o manyfork confere de novo a cada clique.</p>
      <Campo rotulo="Mensagem pra quem não segue" htmlFor="gate-txt">
        <TextoComVariaveis id="gate-txt" valor={data.askText} onChange={(askText) => onChange({ askText })} limite={LIMITES.textoComBotoes} linhas={3} />
      </Campo>
      <Campo rotulo="Botão" htmlFor="gate-btn">
        <div className="flex items-center gap-2">
          <input id="gate-btn" className="input" value={data.buttonTitle} onChange={(e) => onChange({ buttonTitle: e.target.value })} />
          <Contador atual={data.buttonTitle.length} limite={LIMITES.tituloBotao} />
        </div>
      </Campo>
      <Campo rotulo="Se clicou mas ainda não segue" htmlFor="gate-retry">
        <TextoComVariaveis id="gate-retry" valor={data.retryText} onChange={(retryText) => onChange({ retryText })} limite={LIMITES.textoComBotoes} linhas={2} />
      </Campo>
      <Campo rotulo="Tentativas antes de desistir" htmlFor="gate-max">
        <input id="gate-max" type="number" min={1} max={10} className="input" value={data.maxAttempts} onChange={(e) => onChange({ maxAttempts: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
      </Campo>
    </div>
  );
}

function PainelPergunta({ data, onChange }: Props<"ask">) {
  const tipoCampo = data.saveTo === "email" || data.saveTo === "phone" ? data.saveTo : "field";
  return (
    <div className="space-y-4">
      <Campo rotulo="Pergunta" htmlFor="ask-q">
        <TextoComVariaveis id="ask-q" valor={data.question} onChange={(question) => onChange({ question })} limite={LIMITES.textoMensagem} linhas={3} />
      </Campo>
      <Campo rotulo="Gravar a resposta em" htmlFor="ask-campo">
        <select
          id="ask-campo"
          className="input"
          value={tipoCampo}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "email") onChange({ saveTo: "email", validation: "email" });
            else if (v === "phone") onChange({ saveTo: "phone", validation: "phone" });
            else onChange({ saveTo: "field:resposta", validation: "text" });
          }}
        >
          <option value="email">E-mail do contato</option>
          <option value="phone">Telefone do contato</option>
          <option value="field">Campo personalizado</option>
        </select>
      </Campo>
      {tipoCampo === "field" && (
        <>
          <Campo rotulo="Nome do campo" htmlFor="ask-nome" ajuda={`Use no texto como {{campo:${data.saveTo.slice(6) || "nome"}}}.`}>
            <input id="ask-nome" className="input" value={data.saveTo.slice(6)} onChange={(e) => onChange({ saveTo: `field:${e.target.value.replace(/[^\w-]/g, "_")}` })} />
          </Campo>
          <Campo rotulo="Validar como" htmlFor="ask-val">
            <select id="ask-val" className="input" value={data.validation} onChange={(e) => onChange({ validation: e.target.value as NodeDataMap["ask"]["validation"] })}>
              <option value="text">Qualquer texto</option>
              <option value="number">Número</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
            </select>
          </Campo>
        </>
      )}
      <Campo rotulo="Se a resposta não servir" htmlFor="ask-retry">
        <TextoComVariaveis id="ask-retry" valor={data.retryText} onChange={(retryText) => onChange({ retryText })} limite={LIMITES.textoMensagem} linhas={2} />
      </Campo>
      <Campo rotulo="Tentativas" htmlFor="ask-max">
        <input id="ask-max" type="number" min={1} max={10} className="input" value={data.maxAttempts} onChange={(e) => onChange({ maxAttempts: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
      </Campo>
      <Interruptor rotulo="Pular se o contato já tiver esse dado" ligado={data.skipIfFilled} onChange={(skipIfFilled) => onChange({ skipIfFilled })} />
    </div>
  );
}

function PainelEtiqueta({ data, onChange }: Props<"tag">) {
  return (
    <div className="space-y-4">
      <Campo rotulo="Pôr as etiquetas" htmlFor="tag-add">
        <Chips id="tag-add" valores={data.add} onChange={(add) => onChange({ add })} placeholder="lead, cliente…" />
      </Campo>
      <Campo rotulo="Tirar as etiquetas" htmlFor="tag-rem">
        <Chips id="tag-rem" valores={data.remove} onChange={(remove) => onChange({ remove })} />
      </Campo>
    </div>
  );
}

function PainelBrevo({ data, onChange }: Props<"brevo">) {
  return (
    <div className="space-y-3">
      <Campo rotulo="Número da lista" htmlFor="brevo-lista" ajuda="Brevo → Contatos → Listas → o número (ID) da lista. A sequência de e-mails fica numa automação do Brevo disparada pela entrada na lista.">
        <input id="brevo-lista" type="number" min={1} className="input" value={data.listId || ""} onChange={(e) => onChange({ listId: Number(e.target.value) || 0 })} />
      </Campo>
      <p className="text-xs text-muted">Precisa da BREVO_API_KEY no .env. Grava e-mail, nome e lista.</p>
    </div>
  );
}

export function PainelNo({ no, onChange }: { no: FlowNode; onChange: (d: Record<string, unknown>) => void }) {
  switch (no.type) {
    case "message":
      return <PainelMensagem data={no.data as NodeDataMap["message"]} onChange={onChange} />;
    case "delay":
      return <PainelEspera data={no.data as NodeDataMap["delay"]} onChange={onChange} />;
    case "condition":
      return <PainelCondicao data={no.data as NodeDataMap["condition"]} onChange={onChange} />;
    case "followGate":
      return <PainelSeguidor data={no.data as NodeDataMap["followGate"]} onChange={onChange} />;
    case "ask":
      return <PainelPergunta data={no.data as NodeDataMap["ask"]} onChange={onChange} />;
    case "tag":
      return <PainelEtiqueta data={no.data as NodeDataMap["tag"]} onChange={onChange} />;
    case "brevo":
      return <PainelBrevo data={no.data as NodeDataMap["brevo"]} onChange={onChange} />;
    default:
      return null;
  }
}
