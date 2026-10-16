import { describe, expect, it } from "vitest";
import { fluxo, no } from "@/test/helpers";
import { temErro, validarAutomacao } from "./validate";

const base = { keywords: ["agentes"], match: "contains" as const, mediaScope: "any" as const };

describe("validação", () => {
  it("fluxo do comentário com botão passa limpo", () => {
    const m1 = no("message", { text: "Clica", buttons: [{ id: "b", title: "Quero", kind: "next" }], quickReplies: [] });
    const m2 = no("message", { text: "Link", buttons: [{ id: "l", title: "Abrir", kind: "url", url: "https://x.com" }], quickReplies: [] });
    expect(validarAutomacao("COMMENT", base, fluxo([m1, m2], [["gatilho", m1.id], [m1.id, m2.id, "btn:b"]]))).toEqual([]);
  });

  it("avisa quando a 1ª mensagem do comentário não tem botão e há passo depois", () => {
    const m1 = no("message", { text: "Oi", buttons: [], quickReplies: [] });
    const m2 = no("message", { text: "Link", buttons: [], quickReplies: [] });
    const p = validarAutomacao("COMMENT", base, fluxo([m1, m2], [["gatilho", m1.id], [m1.id, m2.id]]));
    expect(p.some((x) => x.nivel === "aviso" && /botão/.test(x.mensagem))).toBe(true);
    expect(temErro(p)).toBe(false);
  });

  it("acusa erros de limite da Meta", () => {
    const m = no("message", {
      text: "x".repeat(700),
      buttons: [
        { id: "1", title: "um título comprido demais aqui", kind: "next" },
        { id: "2", title: "b", kind: "url", url: "ftp://nao" },
        { id: "3", title: "c", kind: "next" },
        { id: "4", title: "d", kind: "next" },
      ],
      quickReplies: [],
    });
    const p = validarAutomacao("DM_KEYWORD", { keywords: [], match: "contains" }, fluxo([m], [["gatilho", m.id]]));
    const msgs = p.filter((x) => x.nivel === "erro").map((x) => x.mensagem).join(" | ");
    expect(msgs).toMatch(/palavra-chave/);
    expect(msgs).toMatch(/640/);
    expect(msgs).toMatch(/3 botões/);
    expect(msgs).toMatch(/20 caracteres/);
    expect(msgs).toMatch(/link válido/);
  });

  it("acusa gatilho solto e passo inalcançável", () => {
    const m = no("message", { text: "Oi", buttons: [], quickReplies: [] });
    const p = validarAutomacao("DEFAULT_REPLY", { keywords: [], match: "any" }, fluxo([m], []));
    expect(p.some((x) => x.nivel === "erro" && /gatilho/.test(x.mensagem))).toBe(true);
    expect(p.some((x) => x.nivel === "aviso" && /nunca vai rodar/.test(x.mensagem))).toBe(true);
  });
});
