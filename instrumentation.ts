export async function register() {
  // Only run in Node.js runtime (not Edge), and only in server context
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/migrations");
    await runMigrations();
    await registerWebhooks();
  }
}

async function registerWebhooks() {
  const appUrl = process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!appUrl) {
    console.warn("[webhook] APP_URL não definido — webhooks não serão re-registrados. Defina APP_URL=https://seu-servidor.com no .env.local");
    return;
  }

  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;

  try {
    const { prisma } = await import("./lib/prisma");
    const { getProvider } = await import("./lib/providers");

    const instances = await prisma.whatsAppInstance.findMany({
      where: { status: "connected" },
      include: { provider: true },
    });

    for (const instance of instances) {
      try {
        const provider = getProvider(instance.provider.type);
        if (!provider.updateWebhook) continue;
        await provider.updateWebhook(
          { baseUrl: instance.provider.baseUrl, apiKey: instance.provider.apiKey },
          instance.instanceName,
          webhookUrl
        );
        console.log(`[webhook] Re-registrado para instância "${instance.instanceName}": ${webhookUrl}`);
      } catch (e) {
        console.warn(`[webhook] Falha ao re-registrar instância "${instance.instanceName}":`, e);
      }
    }
  } catch (e) {
    console.warn("[webhook] Erro ao re-registrar webhooks:", e);
  }
}
