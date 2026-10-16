"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { contaAtual } from "@/lib/account";
import { exigirSessao } from "@/lib/auth";
import { db } from "@/lib/db";

async function contatoDaConta(id: string) {
  const conta = await contaAtual();
  const c = await db.contact.findFirst({ where: { id, accountId: conta.id } });
  if (!c) throw new Error("Contato não encontrado.");
  return { conta, c };
}

export async function porEtiqueta(id: string, form: FormData) {
  await exigirSessao();
  const { conta, c } = await contatoDaConta(id);
  const nome = String(form.get("etiqueta") ?? "").trim().slice(0, 80);
  if (!nome) return;
  const tag = await db.tag.upsert({ where: { accountId_name: { accountId: conta.id, name: nome } }, create: { accountId: conta.id, name: nome }, update: {} });
  await db.contactTag.upsert({ where: { contactId_tagId: { contactId: c.id, tagId: tag.id } }, create: { contactId: c.id, tagId: tag.id }, update: {} });
  revalidatePath(`/contatos/${id}`);
}

export async function tirarEtiqueta(id: string, tagId: string) {
  await exigirSessao();
  const { c } = await contatoDaConta(id);
  await db.contactTag.deleteMany({ where: { contactId: c.id, tagId } });
  revalidatePath(`/contatos/${id}`);
}

export async function alternarPausa(id: string) {
  await exigirSessao();
  const { c } = await contatoDaConta(id);
  await db.contact.update({ where: { id: c.id }, data: { automationPaused: !c.automationPaused } });
  revalidatePath(`/contatos/${id}`);
}

/** Apaga o contato e tudo dele (pedido de exclusão de dados / LGPD). */
export async function apagarContato(id: string) {
  await exigirSessao();
  const { conta, c } = await contatoDaConta(id);
  await db.$transaction([
    db.comment.deleteMany({ where: { accountId: conta.id, fromIgsid: c.igsid } }),
    db.event.deleteMany({ where: { contactId: c.id } }),
    db.contact.delete({ where: { id: c.id } }),
  ]);
  redirect("/contatos");
}
