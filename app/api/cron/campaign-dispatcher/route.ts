import { NextRequest, NextResponse } from "next/server";
import { runCampaignDispatcher } from "@/lib/campaign-dispatcher";
import { runContactDispatcher } from "@/lib/contact-dispatcher";
import { runManualDispatcher } from "@/lib/manual-dispatcher";

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
    const [groupResult, contactResult, manualResult] = await Promise.all([
      runCampaignDispatcher(),
      runContactDispatcher(),
      runManualDispatcher(),
    ]);
    return NextResponse.json({ groups: groupResult, contacts: contactResult, manual: manualResult });
  } catch (e) {
    console.error("[CronDispatcher]", e);
    return NextResponse.json(
      { error: "Cron error", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
