# manyfork — uma imagem só pros três papéis (web, worker, migrate).
#   web:     npm start            (Next na porta 3010)
#   worker:  npm run worker       (fila do Postgres)
#   migrate: npx prisma migrate deploy
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npx next build && chown -R node:node /app/.next

ENV NODE_ENV=production
EXPOSE 3010
USER node
CMD ["npm", "start"]
