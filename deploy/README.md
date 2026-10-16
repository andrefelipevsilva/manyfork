# Colocar o manyfork no ar

O manyfork precisa de um servidor **sempre ligado**: além do painel, ele tem um
worker que processa a fila de mensagens. Por isso não roda em hospedagem
serverless (Vercel, Netlify). Uma VPS simples com Docker resolve.

## Do que você precisa

- Servidor Linux com **Docker** e **Docker Compose** (2 GB de RAM é o recomendado,
  porque o build do Next.js consome memória).
- Um **domínio ou subdomínio** (ex.: `auto.seudominio.com.br`) com registro DNS do
  tipo **A** apontando pro IP do servidor. Se usa Cloudflare, deixe o registro em
  cinza (DNS only) pra o Caddy conseguir emitir o certificado.
- Portas **80** e **443** livres no servidor. Se já tem outro proxy reverso nelas,
  veja [Já tenho um proxy reverso](#já-tenho-um-proxy-reverso).

## 1. Código no servidor

```bash
sudo mkdir -p /opt/manyfork && sudo chown $USER /opt/manyfork
git clone https://github.com/<usuario>/manyfork.git /opt/manyfork
cd /opt/manyfork
```

## 2. Segredos

```bash
cp deploy/.env.prod.example deploy/.env.prod
chmod 600 deploy/.env.prod
nano deploy/.env.prod
```

- `DOMINIO`: o domínio do painel, sem `https://`.
- `POSTGRES_PASSWORD`: `openssl rand -hex 24`.
- `SESSION_SECRET`, `ENCRYPTION_KEY`, `WEBHOOK_VERIFY_TOKEN`: rode `npm run segredos`
  no seu computador (na pasta do projeto) e cole. Gere valores novos pra produção.
- `ADMIN_PASSWORD_HASH`: `npm run senha -- "sua senha forte"` no seu computador.
- `RESPONSAVEL_NOME` e `RESPONSAVEL_EMAIL`: aparecem nas páginas de privacidade e de
  exclusão de dados, que a Meta exige.
- `IG_APP_ID`, `IG_APP_SECRET`, `META_APP_SECRET`: veja `docs/configurar-meta.md`.
  Dá pra subir sem elas e preencher depois.

**Guarde uma cópia da `ENCRYPTION_KEY` fora do servidor.** Sem ela, o acesso ao
Instagram guardado no banco não abre e você precisa reconectar.

## 3. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod logs -f web worker
```

O `migrate` cria as tabelas e sai. Depois sobem `web`, `worker` e `caddy`. O Caddy
emite o certificado HTTPS sozinho no primeiro acesso.

Teste: `curl https://<seu-dominio>/api/saude` deve devolver `{"status":"ok"}`.
Depois, entre no painel com a senha e siga `docs/configurar-meta.md`.

## Atualizar

```bash
cd /opt/manyfork && git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

Sem o `--build`, o compose reaproveita a imagem antiga.

## Backup do banco

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod exec -T postgres \
  pg_dump -U manyfork manyfork | gzip > manyfork-$(date +%F).sql.gz
```

## Já tenho um proxy reverso

Se o servidor já tem Caddy, Nginx ou Traefik nas portas 80 e 443, use o arquivo
`deploy/proxy-externo.yml`. Ele desliga o Caddy do manyfork e liga o painel na rede
Docker do seu proxy.

1. Descubra a rede do seu proxy com `docker network ls` e coloque o nome em
   `PROXY_NETWORK` no `deploy/.env.prod`.
2. Suba com os dois arquivos (use os dois também ao atualizar):

   ```bash
   docker compose -f docker-compose.prod.yml -f deploy/proxy-externo.yml --env-file deploy/.env.prod up -d --build
   ```

3. No seu proxy, mande o domínio pro container `manyfork-web`, porta `3010`. No Caddy:

   ```caddy
   auto.seudominio.com.br {
   	encode zstd gzip
   	reverse_proxy manyfork-web:3010
   }
   ```
