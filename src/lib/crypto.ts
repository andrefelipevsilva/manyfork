import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// --- Cifra em repouso do token da Meta (AES-256-GCM) ---

function chave(): Buffer {
  const hex = env.encryptionKey();
  const k = Buffer.from(hex, "hex");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY precisa ter 64 caracteres hex (32 bytes). Rode `npm run segredos`.");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrar(cifrado: string): string {
  const [versao, iv, tag, dados] = cifrado.split(".");
  if (versao !== "v1" || !iv || !tag || !dados) throw new Error("Token cifrado em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

// --- Senha do painel (scrypt) ---
// Formato: scrypt:N:r:p:salt:hash (base64url). Gere com `npm run senha`.
// Sem "$": o Next expande $VAR dentro do .env e corromperia o hash.

const N = 2 ** 15;
const R = 8;
const P = 1;
const TAM = 64;

function scryptAsync(senha: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, erro) =>
    scrypt(senha, salt, TAM, { N: n, r, p, maxmem: 256 * n * r }, (e, chave) => (e ? erro(e) : ok(chave))),
  );
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(senha, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export async function conferirSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.trim().split(/[:$]/);
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = partes;
  const esperado = Buffer.from(hash, "base64url");
  const obtido = await scryptAsync(senha, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}
