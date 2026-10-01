import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type PushRow = {
  id: string;
  profile_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function configure() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    publicKey,
    privateKey,
  );
  return true;
}

/**
 * Send one notification to a set of people. Dead subscriptions (410/404) are
 * cleaned up as we go, the way v1 did it.
 */
export async function sendPush({
  profileIds,
  title,
  body,
  url,
}: {
  profileIds?: string[];
  title: string;
  body: string;
  url?: string;
}) {
  if (!configure()) return { sent: 0, failed: 0, total: 0, skipped: "no VAPID keys" };

  const supabase = createAdminClient();
  let query = supabase.from("push_subscriptions").select("id, profile_id, endpoint, keys");
  if (profileIds?.length) query = query.in("profile_id", profileIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const subs = (data ?? []) as PushRow[];
  const payload = JSON.stringify({ title, body, url: url ?? "/" });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        throw err;
      }
    }),
  );

  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    total: subs.length,
  };
}
