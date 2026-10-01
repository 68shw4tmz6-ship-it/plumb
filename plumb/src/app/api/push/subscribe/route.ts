import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Save this device's push subscription against the signed-in person. */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.endpoint || !body?.keys) {
    return new NextResponse("Bad subscription payload", { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: body.endpoint,
      keys: body.keys,
      user_agent: request.headers.get("user-agent") ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.endpoint) return new NextResponse("Missing endpoint", { status: 400 });

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("profile_id", user.id);

  return NextResponse.json({ ok: true });
}
