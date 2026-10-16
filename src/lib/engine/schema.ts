import { z } from "zod";

// Formato aceito pela API ao salvar uma automação (o editor manda isso).

const botao = z.discriminatedUnion("kind", [
  z.object({ id: z.string().regex(/^[\w-]{1,40}$/), title: z.string().max(80), kind: z.literal("url"), url: z.string().max(2000) }),
  z.object({ id: z.string().regex(/^[\w-]{1,40}$/), title: z.string().max(80), kind: z.literal("next") }),
]);

const dados = {
  trigger: z.object({}).passthrough(),
  message: z.object({
    text: z.string().max(4000),
    imageUrl: z.string().max(2000).optional(),
    buttons: z.array(botao).max(10),
    quickReplies: z.array(z.object({ id: z.string().regex(/^[\w-]{1,40}$/), title: z.string().max(80) })).max(20),
    trackLinks: z.boolean().optional(),
  }),
  delay: z.object({ amount: z.number().positive().max(100_000), unit: z.enum(["seconds", "minutes", "hours"]) }),
  condition: z.object({
    rule: z.discriminatedUnion("type", [
      z.object({ type: z.literal("follows") }),
      z.object({ type: z.literal("hasEmail") }),
      z.object({ type: z.literal("hasTag"), tag: z.string().max(80) }),
      z.object({ type: z.literal("field"), field: z.string().max(80), op: z.enum(["exists", "equals", "contains"]), value: z.string().max(500).optional() }),
    ]),
  }),
  followGate: z.object({ askText: z.string().max(2000), buttonTitle: z.string().max(80), retryText: z.string().max(2000), maxAttempts: z.number().int().min(1).max(10) }),
  ask: z.object({
    question: z.string().max(2000),
    saveTo: z.string().regex(/^(email|phone|field:[\w-]{0,60})$/),
    validation: z.enum(["email", "phone", "text", "number"]),
    retryText: z.string().max(2000),
    maxAttempts: z.number().int().min(1).max(10),
    skipIfFilled: z.boolean(),
  }),
  tag: z.object({ add: z.array(z.string().max(80)).max(30), remove: z.array(z.string().max(80)).max(30) }),
  brevo: z.object({ listId: z.number().int().min(0) }),
};

const posicao = z.object({ x: z.number(), y: z.number() });
const idNo = z.string().regex(/^[\w-]{1,40}$/);

const no = z.discriminatedUnion("type", [
  z.object({ id: idNo, type: z.literal("trigger"), position: posicao, data: dados.trigger }),
  z.object({ id: idNo, type: z.literal("message"), position: posicao, data: dados.message }),
  z.object({ id: idNo, type: z.literal("delay"), position: posicao, data: dados.delay }),
  z.object({ id: idNo, type: z.literal("condition"), position: posicao, data: dados.condition }),
  z.object({ id: idNo, type: z.literal("followGate"), position: posicao, data: dados.followGate }),
  z.object({ id: idNo, type: z.literal("ask"), position: posicao, data: dados.ask }),
  z.object({ id: idNo, type: z.literal("tag"), position: posicao, data: dados.tag }),
  z.object({ id: idNo, type: z.literal("brevo"), position: posicao, data: dados.brevo }),
]);

export const esquemaFlow = z.object({
  nodes: z.array(no).max(200),
  edges: z.array(z.object({ id: z.string().max(200), source: idNo, target: idNo, sourceHandle: z.string().max(60).nullable().optional() })).max(400),
});

export const esquemaTrigger = z.object({
  keywords: z.array(z.string().max(100)).max(50),
  match: z.enum(["contains", "exact", "any"]),
  mediaScope: z.enum(["any", "specific"]).optional(),
  mediaIds: z.array(z.string().max(64)).max(100).optional(),
  mediaPreview: z
    .array(z.object({ id: z.string().max(64), thumbnail: z.string().max(3000).optional(), caption: z.string().max(200).optional(), permalink: z.string().max(500).optional() }))
    .max(100)
    .optional(),
  includeReplies: z.boolean().optional(),
  publicReplyEnabled: z.boolean().optional(),
  publicReplies: z.array(z.string().max(300)).max(20).optional(),
  cooldownMinutes: z.number().int().min(0).max(525_600).optional(),
});

export const esquemaSalvar = z.object({
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(["COMMENT", "DM_KEYWORD", "STORY_REPLY", "STORY_MENTION", "DEFAULT_REPLY"]),
  triggerConfig: esquemaTrigger,
  flow: esquemaFlow,
  priority: z.number().int().min(0).max(10_000).optional(),
});
