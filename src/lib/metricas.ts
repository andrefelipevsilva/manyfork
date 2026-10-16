import type { EventType } from "@prisma/client";
import { db } from "./db";

// Números do painel. Ignora tudo que veio do simulador.

export type ResumoAutomacao = {
  disparos: number;
  enviadas: number;
  cliquesBotao: number;
  cliquesLink: number;
  respostas: number;
  falhas: number;
};

const vazio = (): ResumoAutomacao => ({ disparos: 0, enviadas: 0, cliquesBotao: 0, cliquesLink: 0, respostas: 0, falhas: 0 });

const CAMPO: Partial<Record<EventType, keyof ResumoAutomacao>> = {
  TRIGGERED: "disparos",
  MESSAGE_SENT: "enviadas",
  BUTTON_CLICK: "cliquesBotao",
  LINK_CLICK: "cliquesLink",
  INPUT_CAPTURED: "respostas",
  MESSAGE_FAILED: "falhas",
};

export async function resumoPorAutomacao(accountId: string, desde: Date) {
  const linhas = await db.event.groupBy({
    by: ["automationId", "type"],
    where: { accountId, simulated: false, createdAt: { gte: desde }, type: { in: Object.keys(CAMPO) as EventType[] } },
    _count: { _all: true },
  });
  const total = vazio();
  const por = new Map<string, ResumoAutomacao>();
  for (const l of linhas) {
    const campo = CAMPO[l.type];
    if (!campo) continue;
    total[campo] += l._count._all;
    if (!l.automationId) continue;
    const r = por.get(l.automationId) ?? vazio();
    r[campo] += l._count._all;
    por.set(l.automationId, r);
  }
  return { total, por };
}

/** Disparos por dia (fuso de São Paulo), com zero nos dias sem nada. */
export async function disparosPorDia(accountId: string, dias: number, automationId?: string) {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const linhas = await db.$queryRaw<{ dia: string; n: bigint }[]>`
    SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia, count(*) AS n
    FROM events
    WHERE account_id = ${accountId} AND type = 'TRIGGERED' AND simulated = false AND created_at >= ${desde}
      AND (${automationId ?? null}::text IS NULL OR automation_id = ${automationId ?? null})
    GROUP BY 1`;
  const mapa = new Map(linhas.map((l) => [l.dia, Number(l.n)]));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: dias }, (_, i) => {
    const dia = fmt.format(new Date(Date.now() - (dias - 1 - i) * 86_400_000));
    return { dia, valor: mapa.get(dia) ?? 0 };
  });
}

export async function novosContatos(accountId: string, desde: Date) {
  return db.contact.count({ where: { accountId, createdAt: { gte: desde }, NOT: { igsid: { startsWith: "sim_" } } } });
}

export function taxa(parte: number, todo: number): string {
  if (!todo) return "—";
  return `${Math.round((parte / todo) * 100)}%`;
}
