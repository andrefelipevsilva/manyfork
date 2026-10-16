import { hostname } from "node:os";
import { db } from "@/lib/db";
import { executarJob, manutencao } from "@/lib/jobs";
import { concluir, falhar, liberarTravados, pegarProximo } from "@/lib/queue";

// Worker: pega jobs da fila do Postgres e executa. Até CONCORRENCIA jobs ao
// mesmo tempo, nunca dois da mesma chave (contato).

const CONCORRENCIA = Number(process.env.WORKER_CONCORRENCIA ?? 4);
const INTERVALO_VAZIO_MS = 500;
const INTERVALO_MANUTENCAO_MS = 5 * 60 * 1000;

const ocupadas = new Set<string>();
let ativos = 0;
let parando = false;

async function rodar(job: NonNullable<Awaited<ReturnType<typeof pegarProximo>>>) {
  ativos++;
  if (job.lockKey) ocupadas.add(job.lockKey);
  const inicio = Date.now();
  try {
    await executarJob(job);
    await concluir(job.id);
    if (process.env.WORKER_LOG === "1") console.log(`[job] ${job.type} ok em ${Date.now() - inicio} ms`);
  } catch (e) {
    console.error(`[job] ${job.type} ${job.id} falhou (tentativa ${job.attempts}/${job.maxAttempts}):`, e);
    await falhar(job, e).catch((x) => console.error("[job] não consegui registrar a falha:", x));
  } finally {
    if (job.lockKey) ocupadas.delete(job.lockKey);
    ativos--;
  }
}

async function laco() {
  while (!parando) {
    if (ativos >= CONCORRENCIA) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    let job;
    try {
      job = await pegarProximo([...ocupadas]);
    } catch (e) {
      console.error("[worker] erro ao ler a fila:", e);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!job) {
      await new Promise((r) => setTimeout(r, INTERVALO_VAZIO_MS));
      continue;
    }
    void rodar(job);
  }
}

async function main() {
  console.log(`[worker] manyfork em ${hostname()} — concorrência ${CONCORRENCIA}`);
  const liberados = await liberarTravados(0);
  if (liberados) console.log(`[worker] ${liberados} job(s) que tinham ficado presos voltaram pra fila`);

  const manter = () => manutencao().catch((e) => console.error("[manutencao] erro:", e));
  void manter();
  const timer = setInterval(manter, INTERVALO_MANUTENCAO_MS);

  const parar = async () => {
    if (parando) return;
    parando = true;
    clearInterval(timer);
    console.log("[worker] parando… esperando jobs em andamento");
    const limite = Date.now() + 20_000;
    while (ativos > 0 && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);

  await laco();
}

void main();
