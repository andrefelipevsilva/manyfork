import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Os testes do motor usam o Postgres de teste (docker compose) e limpam as
    // tabelas entre um caso e outro: rodar em série evita um apagar o do outro.
    fileParallelism: false,
    setupFiles: ["src/test/setup.ts"],
    globalSetup: ["src/test/global-setup.ts"],
  },
});
