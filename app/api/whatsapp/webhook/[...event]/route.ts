import { NextRequest } from "next/server";
// Re-export the main webhook handler for any sub-path
// Evolution API with webhookByEvents:true sends to {url}/{EVENT_NAME}
export { POST } from "../route";

export async function GET(_req: NextRequest) {
  return new Response("Webhook OK", { status: 200 });
}
