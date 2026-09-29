'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, apiFetch, ApiError, getToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/lib/icons';

interface StartSessionResponse {
  sessionId: string;
  maxDurationSeconds: number;
}

type Phase = 'starting' | 'waiting' | 'live' | 'ended' | 'error';

// Frames arrive over one long-lived HTTP response as
// [1-byte type][4-byte big-endian length][payload] — type 1 = JPEG frame, 2 = heartbeat, 3 = end.
// See apps/api/src/screen/screen-sessions.controller.ts's writeFrame() for the producing side.
function createFrameParser(onFrame: (type: number, payload: Uint8Array) => void) {
  let buffer = new Uint8Array(0);
  return function feed(chunk: Uint8Array) {
    const merged = new Uint8Array(buffer.length + chunk.length);
    merged.set(buffer);
    merged.set(chunk, buffer.length);
    buffer = merged;

    while (buffer.length >= 5) {
      const type = buffer[0];
      const length = new DataView(buffer.buffer, buffer.byteOffset + 1, 4).getUint32(0, false);
      if (buffer.length < 5 + length) break;
      onFrame(type, buffer.slice(5, 5 + length));
      buffer = buffer.slice(5 + length);
    }
  };
}

export function LiveScreenViewer({ deviceId, deviceName, onClose }: { deviceId: string; deviceName: string; onClose: () => void }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const sessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastObjectUrl = useRef<string | null>(null);
  const stoppingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let tickInterval: ReturnType<typeof setInterval> | undefined;

    async function run() {
      try {
        const session = await apiFetch<StartSessionResponse>(`/devices/${deviceId}/screen-sessions`, { method: 'POST' });
        if (cancelled) return;
        sessionRef.current = session.sessionId;
        setPhase('waiting');

        tickInterval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

        const controller = new AbortController();
        abortRef.current = controller;
        const res = await fetch(`${API_URL}/devices/${deviceId}/screen-sessions/${session.sessionId}/stream`, {
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);

        const reader = res.body.getReader();
        const feed = createFrameParser((type, payload) => {
          if (cancelled) return;
          if (type === 1) {
            // payload always comes from .slice() above, so its underlying buffer is already
            // exactly its own length — safe to hand to Blob directly as an ArrayBuffer.
            const blob = new Blob([payload.buffer as ArrayBuffer], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
            lastObjectUrl.current = url;
            setFrameSrc(url);
            setPhase('live');
          } else if (type === 3) {
            setPhase('ended');
          }
        });

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          feed(value);
        }
        if (!cancelled) setPhase((p) => (p === 'live' || p === 'waiting' ? 'ended' : p));
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof ApiError ? err.message : 'Failed to start the screen view session');
        setPhase('error');
      }
    }

    run();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (tickInterval) clearInterval(tickInterval);
      if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
      // Best-effort: tell the server to stop even if the viewer was just closed, not "Stop"-clicked.
      if (sessionRef.current && !stoppingRef.current) {
        apiFetch(`/devices/${deviceId}/screen-sessions/${sessionRef.current}/stop`, { method: 'POST' }).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  async function handleStop() {
    stoppingRef.current = true;
    abortRef.current?.abort();
    if (sessionRef.current) {
      try {
        await apiFetch(`/devices/${deviceId}/screen-sessions/${sessionRef.current}/stop`, { method: 'POST' });
      } catch {
        /* the viewer is closing regardless */
      }
    }
    onClose();
  }

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Icon name="activity" className="h-4 w-4 text-red-400" />
            <span className="font-medium">{t('liveScreen.title', { device: deviceName })}</span>
            {phase === 'live' && <span className="font-mono text-xs text-slate-400">{mm}:{ss}</span>}
          </div>
          <button onClick={handleStop} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label={t('common.close')}>
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-[50vh] flex-1 items-center justify-center bg-black">
          {phase === 'starting' && <p className="text-sm text-slate-400">{t('liveScreen.starting')}</p>}
          {phase === 'waiting' && <p className="px-8 text-center text-sm text-slate-400">{t('liveScreen.waiting')}</p>}
          {phase === 'error' && <p className="px-8 text-center text-sm text-red-400">{errorMessage ?? t('liveScreen.error')}</p>}
          {phase === 'ended' && <p className="text-sm text-slate-400">{t('liveScreen.ended')}</p>}
          {frameSrc && (phase === 'live' || phase === 'ended') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frameSrc} alt="" className="max-h-[70vh] w-full object-contain" />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <p className="text-xs text-slate-400">{t('liveScreen.notice')}</p>
          <button onClick={handleStop} className="btn-primary bg-red-600 hover:bg-red-700">
            {t('liveScreen.stop')}
          </button>
        </div>
      </div>
    </div>
  );
}
