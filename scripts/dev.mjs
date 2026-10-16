// `npm run dev`: sobe o painel (Next) e o worker juntos, com saída prefixada.
import { spawn } from "node:child_process";

const processos = [
  { nome: "web   ", cmd: "npx", args: ["next", "dev", "-p", "3010"] },
  { nome: "worker", cmd: "npx", args: ["tsx", "watch", "src/worker/index.ts"] },
];

const filhos = processos.map(({ nome, cmd, args }) => {
  const p = spawn(cmd, args, { shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const prefixar = (dados) =>
    String(dados)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((linha) => console.log(`[${nome}] ${linha}`));
  p.stdout.on("data", prefixar);
  p.stderr.on("data", prefixar);
  p.on("exit", (codigo) => {
    console.log(`[${nome}] saiu (${codigo})`);
    encerrar();
  });
  return p;
});

let encerrando = false;
function encerrar() {
  if (encerrando) return;
  encerrando = true;
  for (const f of filhos) {
    // No Windows o kill() só mata o shell: taskkill /T leva a árvore toda.
    if (process.platform === "win32" && f.pid) spawn("taskkill", ["/pid", String(f.pid), "/T", "/F"], { stdio: "ignore" });
    else f.kill();
  }
  setTimeout(() => process.exit(0), 800);
}
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
