import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; deactivated?: string };
}) {
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME || "Plumb";
  return (
    <main className="auth-wrap">
      <div style={{ width: "100%", maxWidth: 380 }}>
        {searchParams.deactivated ? (
          <div className="alert alert-amber" style={{ marginBottom: 12 }}>
            That account has been deactivated. Talk to the boss to get it switched back on.
          </div>
        ) : null}
        <LoginForm businessName={businessName} next={searchParams.next || "/"} />
      </div>
    </main>
  );
}
