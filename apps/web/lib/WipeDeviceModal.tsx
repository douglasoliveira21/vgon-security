'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/lib/icons';

/**
 * WIPE_DEVICE is the one irreversible action in the whole product — it erases everything on the
 * device with no undo. This gets its own dedicated, harder-to-trigger flow instead of sitting in
 * the generic action dropdown next to things like "refresh policy": typing the exact hostname to
 * confirm, then a second native confirm() dialog as a last gate before the request ever fires.
 */
export function WipeDeviceModal({
  deviceId,
  deviceName,
  onClose,
  onWiped,
}: {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
  onWiped: () => void;
}) {
  const { t } = useI18n();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmText.trim() === deviceName;

  async function handleWipe() {
    if (!matches) return;
    if (!window.confirm(t('devices.wipe.finalConfirm', { device: deviceName }))) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/devices/${deviceId}/actions`, { method: 'POST', body: JSON.stringify({ type: 'WIPE_DEVICE' }) });
      onWiped();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('devices.wipe.error'));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-4 rounded-t-xl">
          <Icon name="alert" className="h-5 w-5 text-red-600" />
          <span className="font-semibold text-red-900">{t('devices.wipe.title')}</span>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-slate-700">{t('devices.wipe.warning', { device: deviceName })}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>{t('devices.wipe.bullet1')}</li>
            <li>{t('devices.wipe.bullet2')}</li>
            <li>{t('devices.wipe.bullet3')}</li>
          </ul>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {t('devices.wipe.typeToConfirm', { device: deviceName })}
            </label>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={deviceName}
              autoComplete="off"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button
            onClick={handleWipe}
            disabled={!matches || submitting}
            className="btn-primary bg-red-600 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('devices.wipe.submitting') : t('devices.wipe.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
