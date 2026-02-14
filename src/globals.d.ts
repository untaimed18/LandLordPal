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

interface AppStateData {
  properties: import('./types').Property[];
  units: import('./types').Unit[];
  tenants: import('./types').Tenant[];
  expenses: import('./types').Expense[];
  payments: import('./types').Payment[];
  maintenanceRequests: import('./types').MaintenanceRequest[];
  activityLogs: import('./types').ActivityLog[];
  vendors: import('./types').Vendor[];
  communicationLogs: import('./types').CommunicationLog[];
}

interface ElectronAPI {
  platform: string;
  // Database
  dbLoad: () => Promise<AppStateData | null>;
  dbSave: (state: AppStateData) => Promise<boolean>;
  // Auto-update
  onUpdateStatus: (callback: (data: UpdateStatusEvent) => void) => () => void;
  startDownload: () => Promise<void>;
  installUpdate: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
