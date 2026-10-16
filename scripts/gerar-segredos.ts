// Gera os segredos aleatórios do .env: `npm run segredos`
import { randomBytes } from "node:crypto";

console.log(`SESSION_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`);
console.log(`WEBHOOK_VERIFY_TOKEN=${randomBytes(18).toString("base64url")}`);
