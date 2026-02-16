import type {
  Property,
  Unit,
  Tenant,
  Expense,
  Payment,
  MaintenanceRequest,
  ActivityLog,
  Vendor,
  CommunicationLog,
} from './types';
import { generateId, nowISO } from './lib/id';
import { STORAGE_KEY } from './lib/calculations';

export interface AppState {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  expenses: Expense[];
  payments: Payment[];
  maintenanceRequests: MaintenanceRequest[];
  activityLogs: ActivityLog[];
  vendors: Vendor[];
  communicationLogs: CommunicationLog[];
}

const defaultState: AppState = {
  properties: [],
  units: [],
  tenants: [],
  expenses: [],
  payments: [],
  maintenanceRequests: [],
  activityLogs: [],
  vendors: [],
  communicationLogs: [],
};

function isArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

/** Ensure item is a record with a string id (basic validation for imported/loaded data) */
function hasValidId(x: unknown): x is Record<string, unknown> & { id: string } {
  return x != null && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string';
}

function filterValidItems<T>(arr: unknown[]): T[] {
  return arr.filter(hasValidId) as T[];
}

// ─── Persistence helpers (SQLite via Electron IPC, fallback to localStorage) ─

/** Check if running inside Electron with the database bridge available */
function hasElectronDB(): boolean {
  return !!(window.electronAPI?.dbLoad && window.electronAPI?.dbSave);
}

/** Load state from localStorage (fallback for browser dev mode) */
function loadFromLocalStorage(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseStateData(parsed);
  } catch {
    return defaultState;
  }
}

/** Save state to localStorage (fallback for browser dev mode) */
function saveToLocalStorage(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.error('Failed to save state to localStorage', e);
  }
}

/** Parse raw data into a validated AppState (only keeps items with valid id to avoid runtime errors) */
function parseStateData(data: Record<string, unknown>): AppState {
  return {
    properties: isArray(data.properties) ? filterValidItems<Property>(data.properties) : [],
    units: isArray(data.units) ? filterValidItems<Unit>(data.units) : [],
    tenants: isArray(data.tenants) ? filterValidItems<Tenant>(data.tenants) : [],
    expenses: isArray(data.expenses) ? filterValidItems<Expense>(data.expenses) : [],
    payments: isArray(data.payments) ? filterValidItems<Payment>(data.payments) : [],
    maintenanceRequests: isArray(data.maintenanceRequests) ? filterValidItems<MaintenanceRequest>(data.maintenanceRequests) : [],
    activityLogs: isArray(data.activityLogs) ? filterValidItems<ActivityLog>(data.activityLogs) : [],
    vendors: isArray(data.vendors) ? filterValidItems<Vendor>(data.vendors) : [],
    communicationLogs: isArray(data.communicationLogs) ? filterValidItems<CommunicationLog>(data.communicationLogs) : [],
  };
}

function saveState(s: AppState): void {
  if (hasElectronDB()) {
    // Fire-and-forget save to SQLite via IPC
    window.electronAPI!.dbSave(s).catch((e) => {
      console.error('Failed to save state to SQLite', e);
    });
  } else {
    saveToLocalStorage(s);
  }
}

// ─── In-memory state + pub/sub ───────────────────────────────────────────────

type Listener = () => void;
let state: AppState = defaultState;
const listeners: Set<Listener> = new Set();
let _initialized = false;

/**
 * Initialize the store by loading data from the backend (SQLite or localStorage).
 * Must be called once before rendering the app. Returns a promise that resolves
 * when the state is ready.
 */
export async function initStore(): Promise<void> {
  if (_initialized) return;

  if (hasElectronDB()) {
    try {
      const data = await window.electronAPI!.dbLoad();
      if (data) {
        state = parseStateData(data as unknown as Record<string, unknown>);
      }
      console.log('Store initialized from SQLite');
    } catch (e) {
      console.error('Failed to load from SQLite, falling back to localStorage', e);
      state = loadFromLocalStorage();
    }
  } else {
    state = loadFromLocalStorage();
    console.log('Store initialized from localStorage (no Electron DB)');
  }

  _initialized = true;
  listeners.forEach((l) => l());
}

export function isStoreReady(): boolean {
  return _initialized;
}

export function getState(): AppState {
  return state;
}

/** Take a snapshot for undo operations */
export function takeSnapshot(): AppState {
  return JSON.parse(JSON.stringify(state));
}

/** Restore a previous snapshot */
export function restoreSnapshot(snapshot: AppState): void {
  setState(snapshot);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: AppState): void {
  state = next;
  saveState(state);
  listeners.forEach((l) => l());
}

// Replace entire state (used for backup restore / data clear)
export function importState(data: Record<string, unknown>): void {
  const next = parseStateData(data);
  setState(next);
}

const ts = () => ({ createdAt: nowISO(), updatedAt: nowISO() });

// Properties
export function addProperty(input: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>): Property {
  const property: Property = { ...input, id: generateId(), ...ts() };
  setState({ ...state, properties: [...state.properties, property] });
  return property;
}

export function updateProperty(id: string, input: Partial<Omit<Property, 'id'>>): void {
  const properties = state.properties.map((p) =>
    p.id === id ? { ...p, ...input, updatedAt: nowISO() } : p
  );
  setState({ ...state, properties });
}

export function deleteProperty(id: string): void {
  const properties = state.properties.filter((p) => p.id !== id);
  const units = state.units.filter((u) => u.propertyId !== id);
  const tenants = state.tenants.filter((t) => t.propertyId !== id);
  const expenses = state.expenses.filter((e) => e.propertyId !== id);
  const payments = state.payments.filter((p) => p.propertyId !== id);
  const maintenanceRequests = state.maintenanceRequests.filter((m) => m.propertyId !== id);
  const activityLogs = state.activityLogs.filter((a) => {
    if (a.entityType === 'property' && a.entityId === id) return false;
    if (a.entityType === 'unit' && units.every((u) => u.id !== a.entityId)) return false;
    if (a.entityType === 'tenant' && tenants.every((t) => t.id !== a.entityId)) return false;
    return true;
  });
  const communicationLogs = state.communicationLogs.filter((c) => c.propertyId !== id);
  setState({ ...state, properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, communicationLogs });
}

// Units
export function addUnit(input: Omit<Unit, 'id' | 'createdAt' | 'updatedAt'>): Unit {
  const unit: Unit = { ...input, id: generateId(), ...ts() };
  setState({ ...state, units: [...state.units, unit] });
  return unit;
}

export function updateUnit(id: string, input: Partial<Omit<Unit, 'id'>>): void {
  const units = state.units.map((u) =>
    u.id === id ? { ...u, ...input, updatedAt: nowISO() } : u
  );
  setState({ ...state, units });
}

export function deleteUnit(id: string): void {
  const units = state.units.filter((u) => u.id !== id);
  const deletedTenantIds = new Set(state.tenants.filter((t) => t.unitId === id).map((t) => t.id));
  const tenants = state.tenants.filter((t) => t.unitId !== id);
  const payments = state.payments.filter((p) => p.unitId !== id);
  const maintenanceRequests = state.maintenanceRequests.filter((m) => m.unitId !== id);
  // Clear orphaned unitId on expenses (expense stays, just loses unit link)
  const expenses = state.expenses.map((e) =>
    e.unitId === id ? { ...e, unitId: undefined, updatedAt: nowISO() } : e
  );
  // Remove activity logs for this unit and its tenants
  const activityLogs = state.activityLogs.filter((a) => {
    if (a.entityType === 'unit' && a.entityId === id) return false;
    if (a.entityType === 'tenant' && deletedTenantIds.has(a.entityId)) return false;
    return true;
  });
  setState({ ...state, units, tenants, payments, maintenanceRequests, expenses, activityLogs });
}

// Tenants
export function addTenant(input: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Tenant {
  const tenant: Tenant = { ...input, id: generateId(), ...ts() };
  setState({ ...state, tenants: [...state.tenants, tenant] });
  return tenant;
}

export function updateTenant(id: string, input: Partial<Omit<Tenant, 'id'>>): void {
  const tenants = state.tenants.map((t) => {
    if (t.id !== id) return t;
    const updated = { ...t, ...input, updatedAt: nowISO() };
    // Auto-track rent changes
    if (input.monthlyRent !== undefined && input.monthlyRent !== t.monthlyRent) {
      const history = [...(t.rentHistory ?? [])];
      history.push({ date: nowISO(), oldRent: t.monthlyRent, newRent: input.monthlyRent });
      updated.rentHistory = history;
    }
    return updated;
  });
  setState({ ...state, tenants });
}

export function deleteTenant(id: string): void {
  const tenant = state.tenants.find((t) => t.id === id);
  const tenants = state.tenants.filter((t) => t.id !== id);
  const payments = state.payments.filter((p) => p.tenantId !== id);
  let units = state.units;
  if (tenant) {
    units = state.units.map((u) =>
      u.id === tenant.unitId ? { ...u, available: true, updatedAt: nowISO() } : u
    );
  }
  // Remove activity logs for this tenant
  const activityLogs = state.activityLogs.filter((a) =>
    !(a.entityType === 'tenant' && a.entityId === id)
  );
  const communicationLogs = state.communicationLogs.filter((c) => c.tenantId !== id);
  setState({ ...state, tenants, payments, units, activityLogs, communicationLogs });
}

// Expenses
export function addExpense(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Expense {
  const expense: Expense = { ...input, id: generateId(), ...ts() };
  setState({ ...state, expenses: [...state.expenses, expense] });
  return expense;
}

export function updateExpense(id: string, input: Partial<Omit<Expense, 'id'>>): void {
  const expenses = state.expenses.map((e) =>
    e.id === id ? { ...e, ...input, updatedAt: nowISO() } : e
  );
  setState({ ...state, expenses });
}

export function deleteExpense(id: string): void {
  setState({ ...state, expenses: state.expenses.filter((e) => e.id !== id) });
}

// Payments
export function addPayment(input: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Payment {
  const payment: Payment = { ...input, id: generateId(), ...ts() };
  setState({ ...state, payments: [...state.payments, payment] });
  return payment;
}

export function updatePayment(id: string, input: Partial<Omit<Payment, 'id'>>): void {
  const payments = state.payments.map((p) =>
    p.id === id ? { ...p, ...input, updatedAt: nowISO() } : p
  );
  setState({ ...state, payments });
}

export function deletePayment(id: string): void {
  setState({ ...state, payments: state.payments.filter((p) => p.id !== id) });
}

// Maintenance Requests
export function addMaintenanceRequest(input: Omit<MaintenanceRequest, 'id' | 'createdAt' | 'updatedAt'>): MaintenanceRequest {
  const req: MaintenanceRequest = { ...input, id: generateId(), ...ts() };
  setState({ ...state, maintenanceRequests: [...state.maintenanceRequests, req] });
  return req;
}

export function updateMaintenanceRequest(id: string, input: Partial<Omit<MaintenanceRequest, 'id'>>): void {
  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.id === id ? { ...m, ...input, updatedAt: nowISO() } : m
  );
  setState({ ...state, maintenanceRequests });
}

export function deleteMaintenanceRequest(id: string): void {
  setState({ ...state, maintenanceRequests: state.maintenanceRequests.filter((m) => m.id !== id) });
}

// Activity Logs
export function addActivityLog(input: Omit<ActivityLog, 'id' | 'createdAt'>): ActivityLog {
  const log: ActivityLog = { ...input, id: generateId(), createdAt: nowISO() };
  setState({ ...state, activityLogs: [...state.activityLogs, log] });
  return log;
}

export function deleteActivityLog(id: string): void {
  setState({ ...state, activityLogs: state.activityLogs.filter((a) => a.id !== id) });
}

// Vendors
export function addVendor(input: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>): Vendor {
  const vendor: Vendor = { ...input, id: generateId(), ...ts() };
  setState({ ...state, vendors: [...state.vendors, vendor] });
  return vendor;
}

export function updateVendor(id: string, input: Partial<Omit<Vendor, 'id'>>): void {
  const vendors = state.vendors.map((v) =>
    v.id === id ? { ...v, ...input, updatedAt: nowISO() } : v
  );
  setState({ ...state, vendors });
}

export function deleteVendor(id: string): void {
  const vendors = state.vendors.filter((v) => v.id !== id);
  // Clear orphaned vendorId references
  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.vendorId === id ? { ...m, vendorId: undefined, updatedAt: nowISO() } : m
  );
  const expenses = state.expenses.map((e) =>
    e.vendorId === id ? { ...e, vendorId: undefined, updatedAt: nowISO() } : e
  );
  setState({ ...state, vendors, maintenanceRequests, expenses });
}

// Communication Logs
export function addCommunicationLog(input: Omit<CommunicationLog, 'id' | 'createdAt'>): CommunicationLog {
  const log: CommunicationLog = { ...input, id: generateId(), createdAt: nowISO() };
  setState({ ...state, communicationLogs: [...state.communicationLogs, log] });
  return log;
}

export function deleteCommunicationLog(id: string): void {
  setState({ ...state, communicationLogs: state.communicationLogs.filter((c) => c.id !== id) });
}
