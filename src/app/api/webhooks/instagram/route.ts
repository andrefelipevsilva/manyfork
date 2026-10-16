import type { Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assinaturaValida } from "@/lib/instagram/signature";
import { enfileirar } from "@/lib/queue";

// Webhook da Meta (Instagram). Callback URL: <APP_URL>/api/webhooks/instagram

function iguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Verificação do endpoint (a Meta chama ao salvar a Callback URL). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const modo = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token") ?? "";
  const desafio = u.searchParams.get("hub.challenge") ?? "";
  const esperado = env.webhookVerifyToken();
  if (modo === "subscribe" && esperado && iguais(token, esperado)) {
    return new NextResponse(desafio, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Evento: confere a assinatura, grava e responde 200 na hora. O worker processa. */
export async function POST(req: Request) {
  const corpo = await req.text();
  const ok = assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), [env.igAppSecret(), env.metaAppSecret()]);
  if (!ok) {
    console.warn("[webhook] assinatura inválida — ignorado");
    return new NextResponse("assinatura inválida", { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return new NextResponse("json inválido", { status: 400 });
  }
  const ev = await db.webhookEvent.create({ data: { payload: json as Prisma.InputJsonValue } });
  await enfileirar("webhook", { webhookEventId: ev.id });
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
