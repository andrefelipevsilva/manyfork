import { execSync } from "node:child_process";

// Aplica as migrations no banco de teste antes da suíte.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://manyfork:manyfork@localhost:5440/manyfork_test";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
