import type { Contact } from "@prisma/client";

// Variáveis no texto: {{nome}}, {{primeiro_nome}}, {{username}}, {{email}},
// {{telefone}}, {{campo:nome_do_campo}}. Valor padrão com barra: {{nome|amigo}}.

export const VARIAVEIS = [
  { chave: "primeiro_nome", rotulo: "Primeiro nome" },
  { chave: "nome", rotulo: "Nome" },
  { chave: "username", rotulo: "@ do Instagram" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "telefone", rotulo: "Telefone" },
];

type ContatoParaTexto = Pick<Contact, "name" | "username" | "email" | "phone" | "fields">;

function valor(chave: string, c: ContatoParaTexto): string | undefined {
  const campos = (c.fields ?? {}) as Record<string, unknown>;
  switch (chave) {
    case "nome":
      return c.name || c.username || undefined;
    case "primeiro_nome":
      return c.name?.trim().split(/\s+/)[0] || c.username || undefined;
    case "username":
      return c.username || undefined;
    case "email":
      return c.email || undefined;
    case "telefone":
      return c.phone || undefined;
    default:
      if (chave.startsWith("campo:")) {
        const v = campos[chave.slice(6)];
        return v === undefined || v === null || v === "" ? undefined : String(v);
      }
      return undefined;
  }
}

export function renderizar(texto: string, contato: ContatoParaTexto): string {
  return texto
    .replace(/\{\{\s*([\w:.-]+)\s*(?:\|([^}]*))?\}\}/g, (_m, chave: string, padrao?: string) => valor(chave, contato) ?? (padrao ?? "").trim())
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}
