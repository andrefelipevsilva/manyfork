import { contaReal } from "@/lib/account";
import { env, instagramConfigurado } from "@/lib/env";
import { CAMPOS_WEBHOOK } from "@/lib/instagram/graph";
import { ESCOPOS, redirectUri } from "@/lib/instagram/oauth";
import { lerConfiguracoes } from "@/lib/settings";
import { desconectar, reassinarWebhooks, salvarLimites } from "./actions";
import { Copiavel } from "./copiavel";

export const metadata = { title: "Configurações · manyfork" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const ERROS: Record<string, string> = {
  "faltam-chaves": "Faltam IG_APP_ID e IG_APP_SECRET no .env do servidor.",
  "estado-invalido": "A volta do Instagram não bateu com o pedido (pode ter expirado). Tente conectar de novo.",
  "sem-codigo": "O Instagram não devolveu o código de autorização.",
  "sem-conta": "Nenhuma conta conectada.",
};

export default async function Configuracoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const [conta, cfg] = await Promise.all([contaReal(), lerConfiguracoes()]);
  const appUrl = env.appUrl();
  const erro = q.erro ? (ERROS[q.erro] ?? q.erro) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-xl font-semibold">Configurações</h1>

      {erro && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{erro}</p>}
      {q.ok === "1" && !q.aviso && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Instagram conectado e webhooks assinados.</p>}
      {q.aviso === "webhooks" && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Conectou, mas não consegui assinar os webhooks. Use “Assinar de novo”.</p>}
      {q.ok === "webhooks" && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Webhooks assinados.</p>}
      {q.salvo === "1" && <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Salvo.</p>}
      {q.desconectado === "1" && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Instagram desconectado. As automações continuam no simulador.</p>}

      {/* Instagram */}
      <section className="card space-y-4 p-5">
        <h2 className="font-medium">Instagram</h2>
        {conta ? (
          <div className="flex flex-wrap items-center gap-4">
            {conta.profilePictureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conta.profilePictureUrl} alt="" className="h-12 w-12 rounded-full" />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">@{conta.username}</p>
              <p className="text-muted">Acesso válido até {dataHora.format(conta.tokenExpiresAt)} (renova sozinho)</p>
              <p className="text-muted">Webhooks: {conta.webhookSubscribedAt ? `assinados em ${dataHora.format(conta.webhookSubscribedAt)}` : <span className="text-danger">não assinados</span>}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={reassinarWebhooks}>
                <button className="btn btn-sm">Assinar de novo</button>
              </form>
              <a href="/api/instagram/conectar" className="btn btn-sm">
                Reconectar
              </a>
              <form action={desconectar}>
                <button className="btn btn-sm btn-danger">Desconectar</button>
              </form>
            </div>
          </div>
        ) : instagramConfigurado() ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">Entre com o seu Instagram (conta profissional: criador ou empresa) e autorize as permissões.</p>
            <a href="/api/instagram/conectar" className="btn btn-primary">
              Conectar Instagram
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Coloque <code className="font-mono text-xs">IG_APP_ID</code> e <code className="font-mono text-xs">IG_APP_SECRET</code> no <code className="font-mono text-xs">.env</code> e reinicie. O passo a passo está em{" "}
            <code className="font-mono text-xs">docs/configurar-meta.md</code>.
          </p>
        )}
      </section>

      {/* Dados pro painel da Meta */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-medium">Dados pro painel da Meta</h2>
          <p className="text-sm text-muted">Cole estes valores no app em developers.facebook.com.</p>
        </div>
        <Copiavel rotulo="URL de retorno do login (OAuth redirect URI)" valor={redirectUri()} />
        <Copiavel rotulo="URL de callback do webhook" valor={`${appUrl}/api/webhooks/instagram`} />
        <Copiavel rotulo="Token de verificação do webhook" valor={env.webhookVerifyToken() ?? "(defina WEBHOOK_VERIFY_TOKEN no .env)"} secreto />
        <Copiavel rotulo="Política de privacidade" valor={`${appUrl}/privacidade`} />
        <Copiavel rotulo="Instruções de exclusão de dados" valor={`${appUrl}/exclusao-de-dados`} />
        {(!env.responsavelNome() || !env.responsavelEmail()) && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            Preencha <code className="font-mono text-xs">RESPONSAVEL_NOME</code> e <code className="font-mono text-xs">RESPONSAVEL_EMAIL</code> no{" "}
            <code className="font-mono text-xs">.env</code>: as duas páginas acima mostram seu nome e e-mail de contato.
          </p>
        )}
        <div className="text-xs text-muted">
          <p>
            Permissões: <span className="font-mono">{ESCOPOS.join(", ")}</span>
          </p>
          <p>
            Campos do webhook: <span className="font-mono">{CAMPOS_WEBHOOK.join(", ")}</span>
          </p>
        </div>
      </section>

      {/* Limites */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-medium">Limites e comportamento</h2>
          <p className="text-sm text-muted">A Meta corta quem manda DM automática demais. Os padrões ficam abaixo do limite dela.</p>
        </div>
        <form action={salvarLimites} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="label">DMs automáticas por hora</span>
            <input name="limiteDms" type="number" min={1} max={1000} defaultValue={cfg.limiteDmsHora} className="input" />
          </label>
          <label className="text-sm">
            <span className="label">Respostas públicas por hora</span>
            <input name="limitePublicas" type="number" min={1} max={1000} defaultValue={cfg.limiteRespostasPublicasHora} className="input" />
          </label>
          <label className="text-sm">
            <span className="label">Espera antes da resposta pública: mínimo (s)</span>
            <input name="atrasoMin" type="number" min={0} max={600} defaultValue={cfg.atrasoRespostaPublicaMin} className="input" />
          </label>
          <label className="text-sm">
            <span className="label">Espera antes da resposta pública: máximo (s)</span>
            <input name="atrasoMax" type="number" min={0} max={600} defaultValue={cfg.atrasoRespostaPublicaMax} className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input name="pausarManual" type="checkbox" defaultChecked={cfg.pausarAoResponderManual} />
            Quando eu responder pelo app do Instagram, pausar a automação daquele contato
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Salvar</button>
          </div>
        </form>
      </section>

      {/* Integrações */}
      <section className="card space-y-2 p-5">
        <h2 className="font-medium">Brevo</h2>
        <p className="text-sm text-muted">
          {env.brevoApiKey() ? (
            <span className="text-ok">Chave configurada.</span>
          ) : (
            <>
              Sem <code className="font-mono text-xs">BREVO_API_KEY</code> no .env: o passo “Enviar ao Brevo” só registra, não grava.
            </>
          )}{" "}
          Atributo do nome: <code className="font-mono text-xs">{env.brevoAtribNome()}</code>.
        </p>
      </section>
    </div>
  );
}
