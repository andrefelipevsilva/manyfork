import { responsavel } from "@/lib/responsavel";

export const metadata = { title: "Política de privacidade · manyfork", robots: { index: true, follow: false } };
export const dynamic = "force-dynamic";

// Página pública exigida pela Meta pro app. É um modelo: quem instala revisa o texto
// e preenche RESPONSAVEL_NOME e RESPONSAVEL_EMAIL no .env.
export default async function Privacidade() {
  const r = await responsavel();
  const nome = r.nome ?? "o titular deste perfil";
  const perfil = r.instagram ? `@${r.instagram}` : "este perfil";

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Política de privacidade</h1>

      {(!r.nome || !r.email) && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn">Configure RESPONSAVEL_NOME e RESPONSAVEL_EMAIL no .env do servidor.</p>
      )}

      <p>
        Esta página explica como {nome} trata os seus dados quando você interage com {perfil} no Instagram. As respostas automáticas a comentários e mensagens
        diretas deste perfil são feitas pelo manyfork, uma ferramenta de código aberto instalada e operada por {nome}, que é o responsável pelos dados.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Quais dados são tratados</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Identificador da sua conta no Instagram para este perfil (IGSID), nome de usuário, nome e foto de perfil, quando a Meta os disponibiliza.</li>
        <li>O texto dos comentários feitos nas publicações de {perfil} e das mensagens trocadas com este perfil no direct.</li>
        <li>Respostas que você mesmo enviar na conversa, como e-mail ou telefone, quando pedido.</li>
        <li>Cliques nos botões e links enviados pela conversa.</li>
      </ul>

      <h2 className="pt-2 text-lg font-semibold">Para que são usados</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Enviar a resposta ou o material que você pediu ao comentar ou escrever uma palavra-chave.</li>
        <li>Se você informar seu e-mail, enviar o material pedido e, quando avisado na conversa, incluí-lo numa lista de e-mails, da qual você pode sair a qualquer momento pelo link no rodapé dos e-mails.</li>
        <li>Medir, de forma agregada, quantas pessoas receberam e abriram cada conteúdo.</li>
      </ul>
      <p>Os dados não são vendidos nem compartilhados com terceiros, exceto o serviço de envio de e-mails, quando você informa seu e-mail para receber um material.</p>

      <h2 className="pt-2 text-lg font-semibold">Onde ficam e por quanto tempo</h2>
      <p>
        Os dados ficam no servidor desta instalação, com acesso restrito a {nome}. O acesso à conta do Instagram é guardado cifrado. As conversas são mantidas
        enquanto forem úteis para atender você, e são apagadas quando você pedir.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento, nos termos da Lei Geral de Proteção de Dados (LGPD). Veja como em{" "}
        <a href="/exclusao-de-dados" className="text-accent underline">
          exclusão de dados
        </a>
        .
      </p>

      <h2 className="pt-2 text-lg font-semibold">Contato</h2>
      <p>
        {nome}
        {r.email && (
          <>
            ,{" "}
            <a href={`mailto:${r.email}`} className="text-accent underline">
              {r.email}
            </a>
          </>
        )}
      </p>
    </main>
  );
}
