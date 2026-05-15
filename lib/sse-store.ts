// Singleton SSE client store — survives module reloads and is shared across
// all Next.js route modules within the same Node.js process.
declare global {
  // eslint-disable-next-line no-var
  var __sseClients: Set<ReadableStreamDefaultController> | undefined;
}

if (!global.__sseClients) {
  global.__sseClients = new Set<ReadableStreamDefaultController>();
}

export const sseClients = global.__sseClients!;

export function notifySseClients(payload: object) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  const encoder = new TextEncoder();
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(encoder.encode(data));
    } catch {
      sseClients.delete(ctrl);
    }
  }
}
