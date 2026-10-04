import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

// Small set of shared pieces so every screen looks and behaves the same.
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

const BUTTON = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle',
  ghost: 'text-ink-soft hover:bg-subtle',
  danger: 'bg-surface text-bad border border-line-strong hover:bg-bad-soft',
} as const;

export function Button({ variant = 'secondary', size = 'md', className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'min-h-8 px-3 text-[13px]' : 'min-h-10 px-4 text-sm',
        BUTTON[variant], className,
      )}
    />
  );
}

const CONTROL = 'block w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted disabled:bg-subtle disabled:text-muted';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, 'min-h-10', className)} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, 'min-h-10', className)} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL, 'py-2', className)} />;
}

export function Field({ label, htmlFor, hint, children, className }:
  { label: string; htmlFor: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ title, actions, children, className }:
  { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-card border border-line bg-surface p-4 shadow-card sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE = {
  neutral: 'bg-subtle text-ink-soft',
  blue: 'bg-brand-soft text-brand-strong',
  green: 'bg-ok-soft text-ok',
  amber: 'bg-warn-soft text-warn',
  red: 'bg-bad-soft text-bad',
} as const;
export type Tone = keyof typeof TONE;

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone])}>{children}</span>;
}

// Errors use role="alert"; confirmations use role="status". Never colour alone: the text says what happened.
export function Notice({ tone, children, role }: { tone: 'red' | 'green' | 'amber' | 'blue'; children: ReactNode; role?: 'alert' | 'status' }) {
  return <div role={role ?? (tone === 'red' ? 'alert' : 'status')} className={cx('rounded-control px-4 py-3 text-sm', TONE[tone])}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {items.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
          className={cx('-mb-px min-h-10 whitespace-nowrap border-b-2 px-4 text-sm font-medium',
            value === key ? 'border-brand text-brand-strong' : 'border-transparent text-muted hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Loading() {
  return <p className="text-sm text-muted">Cargando…</p>;
}

// Label / value pairs for read-only detail.
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
          <dd className="mt-1 text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
