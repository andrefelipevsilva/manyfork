import type { Job, Prisma } from "@prisma/client";
import { db } from "./db";

// Fila no próprio Postgres. O worker pega um job por vez por chave de trava
// (lockKey), então dois eventos do mesmo contato nunca correm juntos.

export type TipoJob =
  | "webhook"
  | "inbound"
  | "run.advance"
  | "comment.reply"
  | "contact.profile"
  | "manual.send";

export async function enfileirar(
  type: TipoJob,
  payload: Prisma.InputJsonValue,
  opcoes: { runAt?: Date; lockKey?: string; maxAttempts?: number } = {},
): Promise<Job> {
  return db.job.create({
    data: {
      type,
      payload,
      runAt: opcoes.runAt ?? new Date(),
      lockKey: opcoes.lockKey,
      maxAttempts: opcoes.maxAttempts ?? 5,
    },
  });
}

/**
 * Pega o próximo job vencido cuja chave não esteja em uso (nem no banco nem
 * na lista `ocupadas` deste processo). Marca como RUNNING na mesma instrução.
 */
export async function pegarProximo(ocupadas: string[]): Promise<Job | null> {
  const linhas = await db.$queryRaw<{ id: string }[]>`
    UPDATE jobs SET status = 'RUNNING', locked_at = timezone('utc', now()), attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM jobs j
      WHERE j.status = 'PENDING' AND j.run_at <= timezone('utc', now())
        AND (j.lock_key IS NULL OR (
          NOT (j.lock_key = ANY(${ocupadas}::text[]))
          AND NOT EXISTS (SELECT 1 FROM jobs r WHERE r.lock_key = j.lock_key AND r.status = 'RUNNING')
        ))
      ORDER BY j.run_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (linhas.length === 0) return null;
  return db.job.findUnique({ where: { id: linhas[0].id } });
}

/** Igual ao pegarProximo, mas só jobs de uma chave (o simulador usa pra não depender do worker). */
export async function pegarProximoDaChave(lockKey: string): Promise<Job | null> {
  const linhas = await db.$queryRaw<{ id: string }[]>`
    UPDATE jobs SET status = 'RUNNING', locked_at = timezone('utc', now()), attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM jobs j
      WHERE j.status = 'PENDING' AND j.run_at <= timezone('utc', now()) AND j.lock_key = ${lockKey}
        AND NOT EXISTS (SELECT 1 FROM jobs r WHERE r.lock_key = ${lockKey} AND r.status = 'RUNNING')
      ORDER BY j.run_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  if (linhas.length === 0) return null;
  return db.job.findUnique({ where: { id: linhas[0].id } });
}

export async function concluir(id: string) {
  await db.job.update({ where: { id }, data: { status: "DONE", finishedAt: new Date(), lockedAt: null } });
}

/** Falhou: tenta de novo com espera crescente, até maxAttempts. */
export async function falhar(job: Job, erro: unknown) {
  const msg = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
  const esgotou = job.attempts >= job.maxAttempts;
  const espera = Math.min(60 * 60, 15 * 2 ** (job.attempts - 1)); // 15 s, 30 s, 1 min, ...
  await db.job.update({
    where: { id: job.id },
    data: esgotou
      ? { status: "FAILED", lastError: msg.slice(0, 2000), finishedAt: new Date(), lockedAt: null }
      : { status: "PENDING", lastError: msg.slice(0, 2000), runAt: new Date(Date.now() + espera * 1000), lockedAt: null },
  });
}

/** Jobs presos em RUNNING (worker caiu no meio) voltam pra fila. */
export async function liberarTravados(minutos = 5) {
  const r = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - minutos * 60_000) } },
    data: { status: "PENDING", lockedAt: null },
  });
  return r.count;
}
