const SETTINGS_KEY = 'landlordpal-settings';

export interface AppSettings {
  leaseWarningDays: number;
  insuranceWarningDays: number;
  maintenanceLookaheadDays: number;
  defaultGracePeriodDays: number;
  rentReminderDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  leaseWarningDays: 90,
  insuranceWarningDays: 60,
  maintenanceLookaheadDays: 30,
  defaultGracePeriodDays: 5,
  rentReminderDays: 3,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      leaseWarningDays: typeof parsed.leaseWarningDays === 'number' ? parsed.leaseWarningDays : DEFAULT_SETTINGS.leaseWarningDays,
      insuranceWarningDays: typeof parsed.insuranceWarningDays === 'number' ? parsed.insuranceWarningDays : DEFAULT_SETTINGS.insuranceWarningDays,
      maintenanceLookaheadDays: typeof parsed.maintenanceLookaheadDays === 'number' ? parsed.maintenanceLookaheadDays : DEFAULT_SETTINGS.maintenanceLookaheadDays,
      defaultGracePeriodDays: typeof parsed.defaultGracePeriodDays === 'number' ? parsed.defaultGracePeriodDays : DEFAULT_SETTINGS.defaultGracePeriodDays,
      rentReminderDays: typeof parsed.rentReminderDays === 'number' ? parsed.rentReminderDays : DEFAULT_SETTINGS.rentReminderDays,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
