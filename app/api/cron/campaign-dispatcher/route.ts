import { NextRequest, NextResponse } from "next/server";
import { runCampaignDispatcher } from "@/lib/campaign-dispatcher";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    if (auth !== `Bearer ${cronSecret}` && !isVercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runCampaignDispatcher();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[CronDispatcher]", e);
    return NextResponse.json(
      { error: "Cron error", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
