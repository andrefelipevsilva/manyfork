// Ambiente dos testes: banco manyfork_test (criado pelo docker compose) e
// segredos fixos. Roda antes de qualquer import do código.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://manyfork:manyfork@localhost:5440/manyfork_test";
process.env.ENCRYPTION_KEY = "0".repeat(64);
process.env.SESSION_SECRET = "segredo-de-teste";
process.env.APP_URL = "https://teste.manyfork.local";
process.env.BREVO_API_KEY = "";
