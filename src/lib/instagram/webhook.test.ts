import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IG_CONTA, webhookComentario, webhookEco, webhookMensagem, webhookPostback } from "@/test/helpers";
import { assinaturaValida } from "./signature";
import { chaveDoContato, extrairItens } from "./webhook";

describe("extrairItens", () => {
  it("lê comentário", () => {
    const [item] = extrairItens(webhookComentario({ id: "c1", texto: "AGENTES", de: "u1", username: "maria" }));
    expect(item).toMatchObject({ kind: "comment", accountIgId: IG_CONTA, commentId: "c1", fromId: "u1", fromUsername: "maria", text: "AGENTES", mediaId: "midia1" });
    expect(chaveDoContato(item)).toBe(`contato:${IG_CONTA}:u1`);
  });

  it("lê mensagem, resposta rápida, story e menção", () => {
    expect(extrairItens(webhookMensagem({ de: "u1", mid: "m1", texto: "oi" }))[0]).toMatchObject({ kind: "message", senderId: "u1", text: "oi" });
    expect(extrairItens(webhookMensagem({ de: "u1", mid: "m2", texto: "Quero", quickReply: "mf1:a:b:c" }))[0]).toMatchObject({ quickReplyPayload: "mf1:a:b:c" });
    expect(extrairItens(webhookMensagem({ de: "u1", mid: "m3", texto: "🔥", story: true }))[0]).toMatchObject({ replyToStory: { id: "story1" } });
    expect(extrairItens(webhookMensagem({ de: "u1", mid: "m4", mencao: true }))[0]).toMatchObject({ storyMention: { url: "https://cdn/mencao" } });
  });

  it("lê postback e eco", () => {
    expect(extrairItens(webhookPostback({ de: "u1", payload: "X", titulo: "Quero" }))[0]).toMatchObject({ kind: "postback", payload: "X", title: "Quero" });
    expect(extrairItens(webhookEco({ para: "u1", mid: "e1", texto: "oi" }))[0]).toMatchObject({ kind: "echo", recipientId: "u1", mid: "e1" });
  });

  it("aceita mensagem dentro de changes (botão Testar da Meta)", () => {
    const corpo = {
      object: "instagram",
      entry: [{ id: IG_CONTA, time: 1, changes: [{ field: "messages", value: { sender: { id: "u9" }, recipient: { id: IG_CONTA }, timestamp: "1527459824", message: { mid: "x", text: "teste" } } }] }],
    };
    const [item] = extrairItens(corpo);
    expect(item).toMatchObject({ kind: "message", senderId: "u9", text: "teste", timestamp: 1527459824000 });
  });

  it("ignora o que não é do Instagram", () => {
    expect(extrairItens({ object: "page", entry: [] })).toEqual([]);
    expect(extrairItens(null)).toEqual([]);
  });
});

describe("assinatura do webhook", () => {
  const corpo = JSON.stringify({ object: "instagram", entry: [] });
  const assinar = (s: string) => "sha256=" + createHmac("sha256", s).update(corpo).digest("hex");

  it("aceita qualquer um dos segredos configurados", () => {
    expect(assinaturaValida(corpo, assinar("b"), ["a", "b"])).toBe(true);
    expect(assinaturaValida(corpo, assinar("c"), ["a", "b"])).toBe(false);
    expect(assinaturaValida(corpo, null, ["a"])).toBe(false);
    expect(assinaturaValida(corpo, assinar("a"), [undefined])).toBe(false);
  });
});
