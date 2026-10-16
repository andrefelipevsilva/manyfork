// Sessão do painel: cookie assinado com HMAC-SHA256 (Web Crypto, roda no
// middleware e nas rotas). Um usuário só (o dono do perfil), sem tabela de sessão.

export const COOKIE_SESSAO = "mf_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 7;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(texto: string): Uint8Array {
  const s = atob(texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function criarSessao(segredo: string, agora = Date.now()): Promise<string> {
  const corpo = b64url(enc.encode(JSON.stringify({ v: 1, exp: Math.floor(agora / 1000) + DURACAO_SESSAO_S })));
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", await chaveHmac(segredo), enc.encode(corpo)));
  return `${corpo}.${b64url(assinatura)}`;
}

export async function sessaoValida(valor: string | undefined, segredo: string, agora = Date.now()): Promise<boolean> {
  if (!valor) return false;
  const [corpo, assinatura] = valor.split(".");
  if (!corpo || !assinatura) return false;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await chaveHmac(segredo),
      deB64url(assinatura) as BufferSource,
      enc.encode(corpo),
    );
    if (!ok) return false;
    const dados = JSON.parse(new TextDecoder().decode(deB64url(corpo))) as { v: number; exp: number };
    return dados.v === 1 && dados.exp * 1000 > agora;
  } catch {
    return false;
  }
}
