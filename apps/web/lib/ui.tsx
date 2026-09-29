'use client';

import { ReactNode } from 'react';
import { Icon, IconName } from '@/lib/icons';
import { useI18n } from '@/lib/i18n';

export function PageHeader({
  title,
  subtitle,
  actions,
  meta,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {meta && <span className="text-xs text-slate-400">{meta}</span>}
        {actions}
      </div>
    </div>
  );
}

const TONES = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const SEVERITY_TONE: Record<string, Tone> = {
  INFO: 'slate',
  LOW: 'blue',
  MEDIUM: 'amber',
  HIGH: 'orange',
  CRITICAL: 'red',
};
const STATUS_TONE: Record<string, Tone> = {
  ONLINE: 'green',
  STALE: 'amber',
  OFFLINE: 'slate',
  PENDING: 'blue',
  BLOCKED: 'red',
  DECOMMISSIONED: 'slate',
};

export function SeverityBadge({ severity }: { severity: string }) {
  const { tOr } = useI18n();
  return <Badge tone={SEVERITY_TONE[severity] ?? 'slate'}>{tOr(`severity.${severity}`, severity)}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const { tOr } = useI18n();
  return (
    <Badge tone={STATUS_TONE[status] ?? 'slate'} dot>
      {tOr(`status.${status}`, status)}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: ReactNode;
  icon?: IconName;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
}) {
  const iconTone = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  }[tone];
  return (
    <div className="card flex items-center gap-4 px-5 py-4">
      {icon && (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon name={icon} />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, icon = 'inbox', children }: { colSpan: number; icon?: IconName; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-sm text-slate-500">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Icon name={icon} />
          </span>
          <p>{children}</p>
        </div>
      </td>
    </tr>
  );
}

export function LoadingRow({ colSpan }: { colSpan: number }) {
  const { t } = useI18n();
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-400">
        {t('common.loading')}
      </td>
    </tr>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/** Short device name used across tables (hostname when known). */
export function DeviceCell({ name }: { name: string }) {
  return <span className="font-medium text-slate-800">{name}</span>;
}

export function Timestamp({ iso }: { iso: string }) {
  const { formatDateTime, relativeTime } = useI18n();
  return (
    <div className="whitespace-nowrap">
      <div className="text-slate-800">{formatDateTime(iso)}</div>
      <div className="text-xs text-slate-400">{relativeTime(iso)}</div>
    </div>
  );
}
