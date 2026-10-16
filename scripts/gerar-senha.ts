// Gera o ADMIN_PASSWORD_HASH do painel: `npm run senha -- "minha senha forte"`
import { gerarHashSenha } from "../src/lib/crypto";

const senha = process.argv[2];
if (!senha || senha.length < 12) {
  console.error('Uso: npm run senha -- "uma senha com pelo menos 12 caracteres"');
  process.exit(1);
}
gerarHashSenha(senha).then((h) => {
  console.log("\nCole no .env:\n");
  console.log(`ADMIN_PASSWORD_HASH=${h}\n`);
});
