import { contaReal } from "./account";
import { env } from "./env";

/** Quem opera esta instalação, pras páginas públicas que a Meta exige (privacidade e exclusão). */
export async function responsavel() {
  const conta = await contaReal().catch(() => null);
  return {
    nome: env.responsavelNome() ?? null,
    email: env.responsavelEmail() ?? null,
    instagram: conta?.username ?? null,
  };
}
