import { PrismaClient } from "@prisma/client";

// Uma instância por processo (o hot reload do Next recriaria a cada edição).
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalParaPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = db;
