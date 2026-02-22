const SETTINGS_KEY = 'landlordpal-settings';

export interface AppSettings {
  leaseWarningDays: number;
  insuranceWarningDays: number;
  maintenanceLookaheadDays: number;
  defaultGracePeriodDays: number;
  rentReminderDays: number;
  requireSecurityDeposit: boolean;
  requireFirstMonth: boolean;
  requireLastMonth: boolean;
  defaultDepositAmount: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  leaseWarningDays: 90,
  insuranceWarningDays: 60,
  maintenanceLookaheadDays: 30,
  defaultGracePeriodDays: 5,
  rentReminderDays: 3,
  requireSecurityDeposit: true,
  requireFirstMonth: true,
  requireLastMonth: false,
  defaultDepositAmount: 0,
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
      requireSecurityDeposit: typeof parsed.requireSecurityDeposit === 'boolean' ? parsed.requireSecurityDeposit : DEFAULT_SETTINGS.requireSecurityDeposit,
      requireFirstMonth: typeof parsed.requireFirstMonth === 'boolean' ? parsed.requireFirstMonth : DEFAULT_SETTINGS.requireFirstMonth,
      requireLastMonth: typeof parsed.requireLastMonth === 'boolean' ? parsed.requireLastMonth : DEFAULT_SETTINGS.requireLastMonth,
      defaultDepositAmount: typeof parsed.defaultDepositAmount === 'number' ? parsed.defaultDepositAmount : DEFAULT_SETTINGS.defaultDepositAmount,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
