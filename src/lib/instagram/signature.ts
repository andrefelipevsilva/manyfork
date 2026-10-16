import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere o X-Hub-Signature-256 ("sha256=<hex>") contra o corpo CRU.
 * Aceita mais de um segredo: dependendo de como o app foi montado, a Meta
 * assina com o app secret do app ou com o "Instagram app secret".
 */
export function assinaturaValida(corpoCru: string, cabecalho: string | null, segredos: (string | undefined)[]): boolean {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const recebida = Buffer.from(cabecalho.slice(7), "hex");
  for (const segredo of segredos) {
    if (!segredo) continue;
    const esperada = createHmac("sha256", segredo).update(corpoCru, "utf8").digest();
    if (esperada.length === recebida.length && timingSafeEqual(esperada, recebida)) return true;
  }
  return false;
}
