import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createPrismaClient() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const isRemote = /^(libsql|https?|wss?):/.test(url);

  // DEV local apontando para um banco Turso remoto: usa Embedded Replica.
  // As leituras passam a ser feitas num arquivo local (rápidas, sem round-trip
  // aos EUA por query); a sincronização e as escritas continuam usando a URL e
  // as credenciais do Turso. Em produção (Vercel) usamos o Turso remoto direto.
  if (process.env.NODE_ENV !== "production" && isRemote && authToken) {
    const adapter = new PrismaLibSql({
      url: process.env.LIBSQL_REPLICA_PATH || "file:./dev-local.db",
      syncUrl: url,
      authToken,
      syncInterval: 60,
    });
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
