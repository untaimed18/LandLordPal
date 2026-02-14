declare const __APP_VERSION__: string;

interface UpdateStatusEvent {
  event: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
}

interface ElectronAPI {
  platform: string;
  onUpdateStatus: (callback: (data: UpdateStatusEvent) => void) => () => void;
  startDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
