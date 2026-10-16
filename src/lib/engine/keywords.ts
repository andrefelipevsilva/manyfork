import type { KeywordMatch } from "./types";

/** minúsculas, sem acento, só letras/números separados por um espaço. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function temLetraOuNumero(texto: string): boolean {
  return /[\p{L}\p{N}]/u.test(texto);
}

/**
 * "contains": a palavra-chave aparece como palavra(s) inteira(s) no texto
 * ("quero os AGENTES!" bate com "agentes"; "agentesx" não).
 * "exact": o texto inteiro é a palavra-chave (ignorando caixa, acento e pontuação).
 * Palavra-chave só de emoji/símbolo ("🔥") compara o texto cru.
 */
export function bateComPalavraChave(texto: string, keywords: string[], match: KeywordMatch): boolean {
  if (match === "any") return true;
  const t = normalizar(texto);
  for (const kw of keywords) {
    const bruto = kw.trim();
    if (!bruto) continue;
    if (!temLetraOuNumero(bruto)) {
      if (match === "exact" ? texto.trim() === bruto : texto.includes(bruto)) return true;
      continue;
    }
    const k = normalizar(bruto);
    if (match === "exact") {
      if (t === k) return true;
    } else if (` ${t} `.includes(` ${k} `)) {
      return true;
    }
  }
  return false;
}
