# Configurar o app da Meta (Instagram API com login do Instagram)

O manyfork usa as APIs oficiais da Meta. Cada pessoa que instala cria o **próprio
app** no Meta for Developers: o app é seu, as chaves ficam no seu servidor e nada
passa por terceiros. Leva uns 20 minutos, mais a espera do App Review.

Antes de começar:

- o manyfork precisa estar no ar com HTTPS (`deploy/README.md`): a Meta não aceita
  `localhost` no webhook;
- abra **Configurações** no painel: os valores para colar estão lá, com botão de copiar.

## 1. Criar o app

1. developers.facebook.com → **Meus apps** → **Criar app**.
2. Caso de uso: **Gerenciar mensagens e conteúdo no Instagram**.
3. Portfólio empresarial: escolha um portfólio **verificado** (Meta Business Suite →
   Configurações da empresa → Central de segurança → Verificação). O acesso avançado,
   que o app precisa pra responder qualquer seguidor (passo 6), exige empresa verificada.
4. Nome: algo seu, ex.: "Automação do @seuperfil". Não use "Instagram" nem "Meta" no nome.

## 2. Instagram → Configuração da API com login do Instagram

1. **Gerar tokens de acesso**: não precisa, o manyfork faz isso pelo botão "Conectar".
2. Copie **ID do app do Instagram** → `IG_APP_ID` e **Chave secreta do app do
   Instagram** → `IG_APP_SECRET` no `deploy/.env.prod`.
3. **Configurar webhooks**:
   - URL de callback: `https://<seu-dominio>/api/webhooks/instagram`
   - Token de verificação: o `WEBHOOK_VERIFY_TOKEN` (aparece em Configurações)
   - Clique em **Verificar e salvar** (o manyfork precisa estar no ar)
   - Assine os campos: `comments`, `messages`, `messaging_postbacks`,
     `message_reactions`, `messaging_seen`
4. **Configurar o login empresarial do Instagram**:
   - URI de redirecionamento OAuth: `https://<seu-dominio>/api/instagram/callback`

## 3. Configurações do app → Básico

- Copie a **Chave secreta do app** → `META_APP_SECRET`
- URL da Política de Privacidade: `https://<seu-dominio>/privacidade`
- Instruções de exclusão de dados: `https://<seu-dominio>/exclusao-de-dados`
- Ícone 1024×1024 e categoria (ex.: "Negócios e páginas")

Reinicie o manyfork depois de preencher o `.env.prod` (`up -d` de novo).

## 4. Conectar a sua conta

1. A conta precisa ser **profissional** (Criador ou Empresa) e **pública**.
2. No app: **Funções do app → Funções → Testadores do Instagram**, adicione o
   seu @ e aceite o convite no Instagram (Configurações → Apps e sites →
   Convites de testador).
3. No painel do manyfork: **Configurações → Conectar Instagram** → autorize.
4. Confira: em Configurações deve aparecer "Webhooks: assinados".

## 5. Testar antes do App Review (modo desenvolvimento)

Com o app em desenvolvimento, a Meta só entrega eventos de contas com função no
app. Adicione uma **segunda conta** do Instagram como testadora (passo 4.2) e use
ela para comentar e mandar DM. Tudo deve funcionar igual ao simulador.

## 6. App Review (para funcionar com qualquer seguidor)

Para atender qualquer pessoa, o app precisa estar **Live** com **acesso avançado** a:

| Permissão | Para quê |
|---|---|
| `instagram_business_basic` | Ler perfil e posts da conta conectada |
| `instagram_business_manage_messages` | Enviar e receber DMs |
| `instagram_business_manage_comments` | Ler comentários, responder em público e em privado |

Em **Análise do app → Solicitações**, peça as três. A Meta pede, para cada uma,
uma descrição de uso e um vídeo de tela (screencast).

### Texto de uso (em inglês, como a Meta pede)

> **instagram_business_manage_comments**: Our app lets the owner of a single
> Instagram professional account (@your_account) automatically reply to comments
> on their own posts. When a follower comments a keyword chosen by the owner, the
> app posts a short public reply to that comment and sends one private reply
> (Private Replies API) with the material the follower asked for. Comments are
> only read on media owned by the connected account.
>
> **instagram_business_manage_messages**: After a follower comments or sends a DM
> with a keyword, the app sends automated replies inside the 24-hour messaging
> window, including buttons and links to the requested material. The owner can
> also read and answer conversations manually in the app's inbox. Messages are
> only sent to people who contacted the account first.
>
> **instagram_business_basic**: Used to identify the connected account (username,
> profile picture) and to list its own posts so the owner can choose which posts
> trigger an automation.

### Roteiro do vídeo (2 a 3 minutos, sem cortes, com legenda em inglês)

1. Tela de login do manyfork → entrar.
2. Configurações → **Conectar Instagram** → mostrar a tela de autorização da Meta
   com as permissões → autorizar → voltar com a conta conectada.
3. Automações → abrir "Comenta QUERO → link no direct", mostrar o gatilho
   (palavra-chave e post escolhido pela lista de posts: `instagram_business_basic`).
4. No celular (conta testadora), comentar **QUERO** no post.
5. Mostrar a resposta pública no comentário e a DM privada com botão chegando
   (`instagram_business_manage_comments`).
6. Tocar no botão → chega a DM com o link (`instagram_business_manage_messages`).
7. Voltar ao painel → **Conversas** → mostrar a conversa e responder uma mensagem
   à mão.

Dica: grave a tela do computador e a do celular lado a lado.

## Problemas comuns

- **Webhook não verifica**: o manyfork não está no ar em HTTPS, ou o token não bate.
- **Conectou mas nada chega**: confira se os campos estão assinados no painel da
  Meta *e* em Configurações do manyfork ("Assinar de novo"); em desenvolvimento, só
  contas testadoras disparam.
- **"User consent is required"**: normal ao checar quem segue antes da pessoa
  interagir no direct. O manyfork trata isso sozinho.
- **Mensagem não sai depois da resposta ao comentário**: regra da Meta. A 2ª
  mensagem só sai quando a pessoa responder (por isso a 1ª leva botão).
