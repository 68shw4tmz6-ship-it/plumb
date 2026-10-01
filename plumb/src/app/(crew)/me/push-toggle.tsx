"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "off" | "on" | "denied";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(await res.text());
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn reminders on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn reminders off.");
    } finally {
      setBusy(false);
    }
  }

  if (!vapidPublicKey) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Push reminders aren&apos;t configured on this deployment yet.
      </p>
    );
  }

  return (
    <div className="stack-sm">
      {state === "loading" ? (
        <p className="small muted" style={{ margin: 0 }}>
          Checking…
        </p>
      ) : state === "unsupported" ? (
        <p className="small muted" style={{ margin: 0 }}>
          This browser can&apos;t do push reminders. On an iPhone, add the app to your home screen
          first, then come back here.
        </p>
      ) : state === "denied" ? (
        <p className="small muted" style={{ margin: 0 }}>
          Notifications are blocked for this site in your browser settings — switch them back on
          there and reload.
        </p>
      ) : state === "on" ? (
        <button type="button" className="btn btn-ghost" onClick={disable} disabled={busy}>
          <BellOff size={15} /> {busy ? "Turning off…" : "Turn reminders off"}
        </button>
      ) : (
        <button type="button" className="btn" onClick={enable} disabled={busy}>
          <Bell size={15} /> {busy ? "Turning on…" : "Turn reminders on"}
        </button>
      )}
      {error ? <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
