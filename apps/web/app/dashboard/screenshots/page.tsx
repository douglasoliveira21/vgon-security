'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/lib/icons';
import { useClientFilter } from '@/lib/ClientFilter';
import { ErrorBanner, PageHeader } from '@/lib/ui';

interface LatestRow {
  deviceId: string;
  hostname: string | null;
  capturedAt: string | null;
  imageBase64: string | null;
}

interface HistoryRow {
  id: string;
  capturedAt: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  imageBase64: string;
}

function DeviceCard({ row, onOpen }: { row: LatestRow; onOpen: () => void }) {
  const { t, relativeTime } = useI18n();
  return (
    <button
      onClick={onOpen}
      disabled={!row.imageBase64}
      className="card group overflow-hidden text-left disabled:cursor-default"
    >
      <div className="aspect-video w-full overflow-hidden bg-slate-100">
        {row.imageBase64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/jpeg;base64,${row.imageBase64}`}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Icon name="camera" className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate font-medium text-slate-800">{row.hostname ?? row.deviceId.slice(0, 8)}</div>
        <div className="text-xs text-slate-400">{row.capturedAt ? relativeTime(row.capturedAt) : t('screenshots.noneYet')}</div>
      </div>
    </button>
  );
}

function HistoryModal({ deviceId, deviceName, onClose }: { deviceId: string; deviceName: string; onClose: () => void }) {
  const { t, formatDateTime } = useI18n();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiFetch<HistoryRow[]>(`/devices/${deviceId}/screenshots?take=30`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen();
      }
    } catch {
      /* Fullscreen API blocked (e.g. no user gesture context, or unsupported) — non-fatal */
    }
  }

  const current = rows[selected];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div
        ref={containerRef}
        className={`flex w-full flex-col overflow-hidden bg-white shadow-2xl ${
          isFullscreen ? 'h-full max-w-none' : 'max-h-full max-w-4xl rounded-xl'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="font-medium text-slate-800">{t('screenshots.history', { device: deviceName })}</span>
          <div className="flex items-center gap-1">
            {current && (
              <button
                onClick={toggleFullscreen}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={t(isFullscreen ? 'liveScreen.exitFullscreen' : 'liveScreen.fullscreen')}
                title={t(isFullscreen ? 'liveScreen.exitFullscreen' : 'liveScreen.fullscreen')}
              >
                <Icon name={isFullscreen ? 'compress' : 'expand'} className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className={`flex flex-1 items-center justify-center bg-black ${isFullscreen ? '' : 'min-h-[40vh]'}`}>
          {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
          {!loading && current && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/jpeg;base64,${current.imageBase64}`}
              alt=""
              onDoubleClick={toggleFullscreen}
              className={`w-full cursor-zoom-in object-contain ${isFullscreen ? 'h-full' : 'max-h-[65vh]'}`}
            />
          )}
          {!loading && rows.length === 0 && <p className="text-sm text-slate-400">{t('screenshots.noneYet')}</p>}
        </div>
        {current && <p className="px-4 py-2 text-center text-xs text-slate-500">{formatDateTime(current.capturedAt)}</p>}
        {rows.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t border-slate-200 p-3">
            {rows.map((r, i) => (
              <button
                key={r.id}
                onClick={() => setSelected(i)}
                className={`h-14 w-24 shrink-0 overflow-hidden rounded-md ring-2 ${i === selected ? 'ring-brand' : 'ring-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/jpeg;base64,${r.imageBase64}`} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScreenshotsPage() {
  const { t } = useI18n();
  const { clientId } = useClientFilter();
  const [rows, setRows] = useState<LatestRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ deviceId: string; name: string } | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (clientId) params.set('clientId', clientId);
      setRows(await apiFetch<LatestRow[]>(`/screenshots/latest?${params}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error.load', { message: '' }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const visibleRows = search.trim()
    ? rows.filter((r) => (r.hostname ?? r.deviceId).toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  return (
    <div>
      <PageHeader title={t('screenshots.title')} subtitle={t('screenshots.subtitle')} meta={t('common.refreshEvery', { seconds: 30 })} />

      <div className="mb-4 relative w-full sm:w-64">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder={t('devices.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ErrorBanner message={error} />

      {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
      {!loading && visibleRows.length === 0 && <p className="text-sm text-slate-400">{t('screenshots.empty')}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visibleRows.map((r) => (
          <DeviceCard
            key={r.deviceId}
            row={r}
            onOpen={() => r.imageBase64 && setOpen({ deviceId: r.deviceId, name: r.hostname ?? r.deviceId.slice(0, 8) })}
          />
        ))}
      </div>

      {open && <HistoryModal deviceId={open.deviceId} deviceName={open.name} onClose={() => setOpen(null)} />}
    </div>
  );
}
