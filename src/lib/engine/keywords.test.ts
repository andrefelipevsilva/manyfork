import { describe, expect, it } from "vitest";
import { bateComPalavraChave, normalizar } from "./keywords";

describe("palavra-chave", () => {
  it("normaliza caixa, acento e pontuação", () => {
    expect(normalizar("  Quero o GUIA!!! Já ")).toBe("quero o guia ja");
  });

  it("contains acha a palavra inteira no meio do comentário", () => {
    expect(bateComPalavraChave("quero os AGENTES!!", ["agentes"], "contains")).toBe(true);
    expect(bateComPalavraChave("Agentes 🔥", ["AGENTES"], "contains")).toBe(true);
    expect(bateComPalavraChave("agentesx", ["agentes"], "contains")).toBe(false);
    expect(bateComPalavraChave("nada a ver", ["agentes", "kit"], "contains")).toBe(false);
  });

  it("contains aceita expressão de várias palavras e acento", () => {
    expect(bateComPalavraChave("eu quero o guía agora", ["quero o guia"], "contains")).toBe(true);
  });

  it("exact exige o texto inteiro", () => {
    expect(bateComPalavraChave("Agentes!", ["agentes"], "exact")).toBe(true);
    expect(bateComPalavraChave("quero agentes", ["agentes"], "exact")).toBe(false);
  });

  it("any aceita qualquer coisa", () => {
    expect(bateComPalavraChave("", [], "any")).toBe(true);
  });

  it("palavra-chave só de emoji compara o texto cru", () => {
    expect(bateComPalavraChave("🔥🔥", ["🔥"], "contains")).toBe(true);
    expect(bateComPalavraChave("legal", ["🔥"], "contains")).toBe(false);
  });

  it("ignora palavra-chave vazia", () => {
    expect(bateComPalavraChave("qualquer", ["", "  "], "contains")).toBe(false);
  });
});
