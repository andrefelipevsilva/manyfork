import { env } from "./env";

// Grava o contato numa lista do Brevo (API v3, POST /contacts).
// A automação de e-mail fica no Brevo, disparada pela entrada na lista.

export async function adicionarAoBrevo(email: string, nome: string | null | undefined, listId: number): Promise<{ ok: boolean; erro?: string }> {
  const chave = env.brevoApiKey();
  if (!chave) return { ok: false, erro: "BREVO_API_KEY não configurada" };
  try {
    const r = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": chave, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email,
        ...(nome ? { attributes: { [env.brevoAtribNome()]: nome } } : {}),
        listIds: [listId],
        updateEnabled: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // 201 = criado; 204 = já existia e foi atualizado.
    if (r.status === 201 || r.status === 204) return { ok: true };
    return { ok: false, erro: `Brevo ${r.status}: ${(await r.text()).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
