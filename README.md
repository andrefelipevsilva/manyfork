# manyfork

Automação de Instagram de código aberto: **comentário → DM**, palavra-chave no
direct, resposta a story, captura de e-mail. Você instala no seu servidor, conecta
o seu Instagram e monta os fluxos num editor visual. Sem mensalidade por contato:
você paga só o servidor.

Roda **só nas APIs oficiais da Meta** (Instagram API com login do Instagram). Não
usa API interna, robô de navegador nem a senha do seu Instagram.

> Projeto independente, sem relação com o ManyChat nem com a Meta. "Instagram" é
> marca da Meta; "ManyChat" é marca da ManyChat, Inc.

## O que faz

| Recurso | Como funciona |
|---|---|
| Comentário → DM | Palavra-chave no comentário (em qualquer post ou nos escolhidos) dispara uma resposta privada com botão; ao clicar, o fluxo continua |
| Resposta pública | Responde o comentário sorteando uma de várias frases, com atraso aleatório |
| Palavra-chave no direct | Dispara um fluxo por DM |
| Story | Resposta a story e menção em story |
| Resposta padrão | Quando nada bate, no máximo 1 vez por dia por pessoa |
| Editor visual | Mensagem (texto, botões, respostas rápidas, imagem), pergunta, "só pra seguidor", condição, espera, etiqueta, Brevo |
| Captura de dados | E-mail, telefone ou campo livre, com validação e nova tentativa |
| Só pra seguidor | Confere se a pessoa segue o perfil e pede o follow antes de liberar |
| Brevo | Grava o e-mail numa lista do Brevo (a sequência de e-mails roda lá) |
| Métricas | Disparos, DMs, cliques em botão e em link (com rastreio), respostas, CTR |
| Conversas | Caixa de entrada com resposta manual e pausa da automação por contato |
| Simulador | Testa qualquer automação (até rascunho) sem a Meta, como se fosse um seguidor |
| Modelos | Comentário → link, link só pra seguidor, comentário → e-mail → Brevo, palavra no direct, story, resposta padrão |

Uma instalação atende **uma conta** do Instagram, com um login de administrador.

## Antes de começar

- Conta do Instagram **profissional** (Criador ou Empresa) e pública.
- Um **app seu** no Meta for Developers. O passo a passo está em
  [`docs/configurar-meta.md`](docs/configurar-meta.md).
- Pra responder **qualquer seguidor**, o app precisa passar pelo **App Review** da
  Meta, e a Meta pede **portfólio empresarial verificado**. Até lá, só funciona com
  as contas que você adiciona como testadoras do app.
- Um **servidor com Docker** e um domínio. O HTTPS sai sozinho (Caddy incluso). Não
  roda em hospedagem serverless (Vercel, Netlify), porque tem um worker sempre ligado.
- Pra testar no computador: **Node.js 22+** e **Docker**.

## Testar no seu computador

Não precisa da Meta pra experimentar: sem as chaves, tudo roda em **modo de teste**
e o **simulador** faz o papel do seguidor.

```bash
git clone https://github.com/<usuario>/manyfork.git
cd manyfork
npm install
npm run db:up                    # Postgres de dev (porta 5440) + banco de teste
cp .env.example .env
npm run segredos                 # cole SESSION_SECRET, ENCRYPTION_KEY e WEBHOOK_VERIFY_TOKEN no .env
npm run senha -- "sua senha"     # cole o ADMIN_PASSWORD_HASH no .env (mínimo 12 caracteres)
npm run db:migrate
npm run dev                      # painel em http://localhost:3010 + worker
```

Entre com a senha, crie uma automação a partir de um modelo e abra **Testar**.
Quando você conectar o Instagram, as automações passam pra conta real.

## Colocar no ar

1. [`deploy/README.md`](deploy/README.md): servidor com Docker, domínio e HTTPS.
2. [`docs/configurar-meta.md`](docs/configurar-meta.md): app da Meta, webhook,
   conexão da conta, conta testadora e App Review (com texto e roteiro do vídeo).

## Regras da Meta que o manyfork respeita

- **Resposta privada**: uma por comentário, até 7 dias depois. Depois dela, a próxima
  mensagem só sai quando a pessoa responder. Por isso a 1ª mensagem do fluxo de
  comentário leva botão (o editor avisa).
- **Janela de 24 h**: mensagem livre só até 24 h depois da última mensagem da pessoa.
  O fluxo travado fica "esperando a pessoa escrever" e continua quando ela escreve.
- **Limite de envio**: padrão de 180 DMs por hora (ajustável). Acima disso, a fila
  segura e manda depois.
- Botão antigo continua funcionando: o clique retoma o fluxo do ponto do botão.

## Testes

```bash
npm test           # motor completo contra o Postgres de teste (Meta simulada)
npm run typecheck
npm run build
```

## Arquitetura

```
Meta ──webhook──▶ /api/webhooks/instagram ──grava──▶ webhook_events + job
                                                         │
worker (src/worker) ◀── fila no Postgres (jobs, 1 contato por vez) ──┘
   │  router: comentário / DM / clique / eco
   │  runner: anda no fluxo até precisar esperar (clique, resposta, tempo, janela)
   ▼
graph.instagram.com (DM, resposta privada, resposta pública, perfil)
```

- Next.js 15, React 19, Tailwind 4, React Flow (editor), Prisma 6 + Postgres 16.
- `src/lib/engine/`: tipos do fluxo, validação, palavras-chave, roteador, executor, modelos
- `src/lib/instagram/`: cliente da API, OAuth, parser e assinatura do webhook
- `src/lib/jobs.ts` + `src/lib/queue.ts`: fila e tarefas do worker
- `src/app/`: painel, rotas de API, páginas públicas
- `src/components/editor/`: editor visual

## Sua responsabilidade

- Quem instala opera a própria instalação e responde por ela: Termos da Plataforma
  da Meta, regras do Instagram e LGPD com os dados dos seus seguidores.
- As páginas `/privacidade` e `/exclusao-de-dados` são um **modelo** com o seu nome e
  e-mail (`RESPONSAVEL_NOME` e `RESPONSAVEL_EMAIL`). Revise o texto em
  `src/app/privacidade/page.tsx` antes de mandar o app pro App Review.
- Use pra responder quem falou com você primeiro. Spam leva a bloqueio da conta e do
  app pela Meta.

## Licença

[MIT](LICENSE). Sem garantia de nenhum tipo.
