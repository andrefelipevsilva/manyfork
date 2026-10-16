import { NextResponse } from "next/server";
import { contaReal } from "@/lib/account";
import { guardaApi } from "@/lib/auth";
import { decifrar } from "@/lib/crypto";
import { GraphError, listarMidias } from "@/lib/instagram/graph";

export async function GET(req: Request) {
  const barrado = await guardaApi(req);
  if (barrado) return barrado;
  const conta = await contaReal();
  if (!conta) return NextResponse.json({ erro: "Conecte o Instagram em Configurações." }, { status: 400 });
  const depois = new URL(req.url).searchParams.get("depois") ?? undefined;
  try {
    const r = await listarMidias(decifrar(conta.accessTokenEnc), depois);
    return NextResponse.json({ data: r.data, depois: r.paging?.next ? r.paging.cursors?.after : undefined });
  } catch (e) {
    const msg = e instanceof GraphError ? `Meta: ${e.message}` : "Falha ao buscar os posts.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
