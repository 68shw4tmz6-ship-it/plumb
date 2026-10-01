import { UserCog, Bell, LogOut, Smartphone } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { Badge, Card, Field, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/submit";
import { updateOwnProfile } from "@/lib/actions/admin";
import { PushToggle } from "./push-toggle";
import { currency, longDate } from "@/lib/format";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const profile = await requireProfile();

  return (
    <>
      <PageHead
        title="Your profile"
        subtitle={`With us since ${longDate(profile.created_at)}`}
        actions={
          <Badge tone={profile.role === "boss" ? "accent" : "steel"}>
            {profile.role === "boss" ? "Boss" : "Crew"}
          </Badge>
        }
      />

      <div className="split">
        <Card title="Your details" icon={<UserCog size={17} />}>
          <form action={updateOwnProfile} className="stack-sm">
            <Field label="Display name" hint="How you show up on steps and diary entries.">
              <input type="text" name="full_name" defaultValue={profile.full_name} required />
            </Field>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <Field label="First name">
                <input type="text" name="first_name" defaultValue={profile.first_name ?? ""} />
              </Field>
              <Field label="Last name">
                <input type="text" name="last_name" defaultValue={profile.last_name ?? ""} />
              </Field>
              <Field label="Phone">
                <input type="tel" name="phone" defaultValue={profile.phone ?? ""} />
              </Field>
              <Field label="Trade">
                <input type="text" name="trade" defaultValue={profile.trade ?? ""} />
              </Field>
            </div>
            <Field label="ABN" hint="For your own timesheet exports.">
              <input type="text" name="abn" defaultValue={profile.abn ?? ""} />
            </Field>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            <p className="tiny muted" style={{ margin: 0 }}>
              Your pay rate and access level are set by the boss.
              {profile.hourly_rate
                ? ` Yours is ${currency(profile.hourly_rate)}/hr.`
                : ""}
            </p>
          </form>
        </Card>

        <div className="stack">
          <Card title="End-of-day reminder" icon={<Bell size={17} />}>
            <p className="small muted" style={{ marginTop: 0 }}>
              A nudge in the afternoon to post today&apos;s photos and log your hours before you
              knock off.
            </p>
            <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""} />
          </Card>

          <Card title="Put it on your phone" icon={<Smartphone size={17} />}>
            <p className="small muted" style={{ margin: 0 }}>
              <strong>iPhone:</strong> open this in Safari, tap Share, then Add to Home Screen.
              <br />
              <strong>Android:</strong> open the browser menu and tap Install app.
              <br />
              It then opens like a normal app, full screen.
            </p>
          </Card>

          <Card>
            <form action="/auth/signout" method="post">
              <SubmitButton className="btn btn-ghost btn-block" pendingLabel="Signing out…">
                <LogOut size={15} /> Sign out
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
