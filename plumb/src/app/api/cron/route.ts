import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Scheduled housekeeping. Called by Vercel Cron (see vercel.json):
 *   ?task=quotes      — morning: expire stale quotes, tell the boss who to chase
 *   ?task=end-of-day  — afternoon: remind the crew to post photos and log hours
 *
 * Nothing here emails a client. Follow-ups surface in the app for the boss to
 * send, so the app never speaks to a customer on its own.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const task = new URL(request.url).searchParams.get("task") ?? "quotes";
  const supabase = createAdminClient();

  if (task === "quotes") {
    const { data: expired } = await supabase.rpc("expire_stale_quotes");
    const { data: due } = await supabase.rpc("quotes_due_for_follow_up");
    const dueList = (due ?? []) as { reference: string; client_name: string }[];

    const { data: bosses } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "boss")
      .eq("is_active", true);

    let push = null;
    if (dueList.length > 0 && bosses?.length) {
      push = await sendPush({
        profileIds: bosses.map((b) => b.id),
        title:
          dueList.length === 1
            ? "1 quote needs a nudge"
            : `${dueList.length} quotes need a nudge`,
        body:
          dueList.length === 1
            ? `${dueList[0].client_name} hasn't come back on ${dueList[0].reference}.`
            : dueList
                .slice(0, 3)
                .map((q) => q.client_name)
                .join(", ") + (dueList.length > 3 ? " and others" : ""),
        url: "/quotes?filter=follow-up",
      });
    }

    return NextResponse.json({
      task,
      expired: expired ?? 0,
      dueForFollowUp: dueList.length,
      push,
    });
  }

  if (task === "end-of-day") {
    // Only people who are actually on a live job get pestered.
    const { data: members } = await supabase
      .from("project_members")
      .select("profile_id, projects!inner(status)")
      .not("projects.status", "in", "(done,cancelled)");

    const ids = [...new Set((members ?? []).map((m) => m.profile_id))];
    const push = ids.length
      ? await sendPush({
          profileIds: ids,
          title: "Before you knock off",
          body: "Post today's progress pictures and log your hours.",
          url: "/jobs",
        })
      : { sent: 0, failed: 0, total: 0 };

    return NextResponse.json({ task, crewNotified: ids.length, push });
  }

  return new NextResponse(`Unknown task: ${task}`, { status: 400 });
}
