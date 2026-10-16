// Variáveis de ambiente lidas sob demanda: o build do Next roda sem os
// segredos, então nada aqui pode explodir na importação.

function req(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não configurada (ver .env.example).`);
  return v;
}

function opt(nome: string): string | undefined {
  const v = process.env[nome];
  return v ? v : undefined;
}

export const env = {
  /** URL pública do painel, sem barra no fim. Ex.: https://auto.seudominio.com.br */
  appUrl: () => (opt("APP_URL") ?? "http://localhost:3010").replace(/\/+$/, ""),
  databaseUrl: () => req("DATABASE_URL"),
  sessionSecret: () => req("SESSION_SECRET"),
  encryptionKey: () => req("ENCRYPTION_KEY"),
  adminPasswordHash: () => req("ADMIN_PASSWORD_HASH"),
  cookieSecure: () => (opt("COOKIE_SECURE") ?? (process.env.NODE_ENV === "production" ? "true" : "false")) === "true",

  /** "Instagram app ID" e "Instagram app secret" (Instagram → Configuração da API com login do Instagram). */
  igAppId: () => opt("IG_APP_ID"),
  igAppSecret: () => opt("IG_APP_SECRET"),
  /** App secret do app da Meta (Configurações → Básico). Aceito também na assinatura do webhook. */
  metaAppSecret: () => opt("META_APP_SECRET"),
  webhookVerifyToken: () => opt("WEBHOOK_VERIFY_TOKEN"),
  graphVersion: () => opt("META_GRAPH_VERSION") ?? "v25.0",

  /** Quem responde pelos dados: aparece em /privacidade e /exclusao-de-dados. */
  responsavelNome: () => opt("RESPONSAVEL_NOME"),
  responsavelEmail: () => opt("RESPONSAVEL_EMAIL"),

  brevoApiKey: () => opt("BREVO_API_KEY"),
  brevoAtribNome: () => opt("BREVO_ATRIB_NOME") ?? "FIRSTNAME",
};

export function instagramConfigurado(): boolean {
  return Boolean(env.igAppId() && env.igAppSecret());
}
