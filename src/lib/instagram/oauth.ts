import { env } from "../env";
import { GraphError } from "./graph";

// "Login com Instagram" (Instagram API with Instagram Login / Business Login).

export const COOKIE_ESTADO = "mf_oauth_estado";

export const ESCOPOS = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

export function redirectUri(): string {
  return `${env.appUrl()}/api/instagram/callback`;
}

export function urlDeAutorizacao(state: string): string {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("enable_fb_login", "0");
  u.searchParams.set("force_authentication", "1");
  u.searchParams.set("client_id", env.igAppId() ?? "");
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ESCOPOS.join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

async function lerJson(resp: Response) {
  const texto = await resp.text();
  let dados: any;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = { error_message: texto };
  }
  if (!resp.ok) {
    const msg = dados?.error_message ?? dados?.error?.message ?? `HTTP ${resp.status}`;
    throw new GraphError(msg, resp.status, dados?.error?.code ?? dados?.code, dados?.error?.error_subcode, dados);
  }
  return dados;
}

/** code → token de curta duração (1 h). */
export async function trocarCodigo(code: string): Promise<{ accessToken: string; userId: string }> {
  const corpo = new URLSearchParams({
    client_id: env.igAppId() ?? "",
    client_secret: env.igAppSecret() ?? "",
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const dados = await lerJson(
    await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: corpo, signal: AbortSignal.timeout(20_000) }),
  );
  // A Meta já devolveu os dois formatos: {access_token,user_id} e {data:[{...}]}.
  const item = Array.isArray(dados?.data) ? dados.data[0] : dados;
  return { accessToken: item.access_token, userId: String(item.user_id) };
}

/** Token curto → token de longa duração (60 dias). */
export async function tokenLongo(tokenCurto: string): Promise<{ accessToken: string; expiraEm: Date }> {
  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", env.igAppSecret() ?? "");
  u.searchParams.set("access_token", tokenCurto);
  const dados = await lerJson(await fetch(u, { signal: AbortSignal.timeout(20_000) }));
  return { accessToken: dados.access_token, expiraEm: new Date(Date.now() + Number(dados.expires_in ?? 5_184_000) * 1000) };
}

/** Renova o token de longa duração (precisa ter mais de 24 h). */
export async function renovarToken(token: string): Promise<{ accessToken: string; expiraEm: Date }> {
  const u = new URL("https://graph.instagram.com/refresh_access_token");
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const dados = await lerJson(await fetch(u, { signal: AbortSignal.timeout(20_000) }));
  return { accessToken: dados.access_token, expiraEm: new Date(Date.now() + Number(dados.expires_in ?? 5_184_000) * 1000) };
}
