import { ReleaseChannel, RemoteActionType } from './enums';

// What GET /agents/updates/latest returns (section 24).
export interface LatestReleaseInfo {
  version: string;
  channel: ReleaseChannel;
  downloadUrl: string;
  sha256: string;
  mandatory: boolean;
  releaseNotes?: string;
}

// What GET /agents/actions/pending returns per action (section 26/Phase 7).
export interface PendingRemoteAction {
  id: string;
  type: RemoteActionType;
  requestedAt: string;
}
