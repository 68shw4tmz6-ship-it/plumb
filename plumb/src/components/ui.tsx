import type { ReactNode } from "react";
import { initials } from "@/lib/format";

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: string;
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="gauge">
      <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${v}%` }} />
      </div>
      <b>{v}%</b>
    </div>
  );
}

export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="row wrap no-print">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  icon,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      {title ? (
        <div className="card-head">
          <h3>
            {icon}
            {title}
          </h3>
          {actions ? <div className="row no-print">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <h4>{title}</h4>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  style,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  style?: React.CSSProperties;
}) {
  return (
    <label className="field" style={style}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="tiny muted">{hint}</span> : null}
    </label>
  );
}

export function Avatar({ name }: { name: string }) {
  return <span className="avatar">{initials(name || "?")}</span>;
}

export function Alert({
  tone = "amber",
  children,
}: {
  tone?: "danger" | "ok" | "amber";
  children: ReactNode;
}) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}
