import { responsavel } from "@/lib/responsavel";

export const metadata = { title: "Exclusão de dados · manyfork", robots: { index: true, follow: false } };
export const dynamic = "force-dynamic";

// Instruções de exclusão de dados (a Meta exige a URL no app).
export default async function ExclusaoDeDados() {
  const r = await responsavel();

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Como pedir a exclusão dos seus dados</h1>

      {!r.email && <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn">Configure RESPONSAVEL_EMAIL no .env do servidor.</p>}

      <p>Para apagar tudo o que foi guardado sobre você (conversas, comentários, e-mail e métricas), escolha um dos caminhos:</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Mande <strong>EXCLUIR MEUS DADOS</strong> no direct
          {r.instagram ? (
            <>
              {" "}
              do{" "}
              <a href={`https://instagram.com/${r.instagram}`} className="text-accent underline">
                @{r.instagram}
              </a>
            </>
          ) : (
            " deste perfil"
          )}
          {r.email && "; ou"}
        </li>
        {r.email && (
          <li>
            Envie um e-mail para{" "}
            <a href={`mailto:${r.email}?subject=Exclus%C3%A3o%20de%20dados`} className="text-accent underline">
              {r.email}
            </a>{" "}
            com o assunto “Exclusão de dados” e o seu @ do Instagram.
          </li>
        )}
      </ol>
      <p>A exclusão é feita em até 15 dias e você recebe a confirmação pelo mesmo canal. Se você estiver numa lista de e-mails, ela também é removida.</p>
      <p>
        Você também pode remover o acesso a qualquer momento nas configurações do Instagram, em <em>Configurações → Apps e sites</em>.
      </p>
    </main>
  );
}
