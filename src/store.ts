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
import logger from './lib/logger';

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

function hasValidId(x: unknown): x is Record<string, unknown> & { id: string } {
  return x != null && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string';
}

function filterValidItems<T>(arr: unknown[]): T[] {
  return arr.filter(hasValidId) as T[];
}

// ─── Save-error event bus ────────────────────────────────────────────────────

function emitSaveError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Database save failed:', message);
  window.dispatchEvent(
    new CustomEvent('landlordpal:save-error', { detail: { message } })
  );
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

function requireElectronAPI(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error('LandLord Pal requires the Electron desktop environment.');
  }
  return window.electronAPI;
}

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

// ─── Incremental persistence via db:batch ────────────────────────────────────

function persistBatch(ops: DbOperation[]): void {
  requireElectronAPI().dbBatch(ops).then((ok) => {
    if (!ok) emitSaveError(new Error('db:batch returned false'));
  }).catch(emitSaveError);
}

function persistFullReplace(s: AppState): void {
  requireElectronAPI().dbSave(s).then((ok) => {
    if (!ok) emitSaveError(new Error('db:save returned false'));
  }).catch(emitSaveError);
}

// ─── In-memory state + pub/sub ───────────────────────────────────────────────

type Listener = () => void;
let state: AppState = defaultState;
const listeners: Set<Listener> = new Set();
let _initialized = false;

export async function initStore(): Promise<void> {
  if (_initialized) return;

  const api = requireElectronAPI();
  const data = await api.dbLoad();
  if (data) {
    state = parseStateData(data as unknown as Record<string, unknown>);
  }
  logger.info('Store initialized from SQLite');

  _initialized = true;
  listeners.forEach((l) => l());
}

export function isStoreReady(): boolean {
  return _initialized;
}

export function getState(): AppState {
  return state;
}

export function takeSnapshot(): AppState {
  return JSON.parse(JSON.stringify(state));
}

export function restoreSnapshot(snapshot: AppState): void {
  state = snapshot;
  persistFullReplace(state);
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

// Full state replace (used for backup restore / data clear)
export function importState(data: Record<string, unknown>): void {
  state = parseStateData(data);
  persistFullReplace(state);
  notify();
}

const ts = () => ({ createdAt: nowISO(), updatedAt: nowISO() });

// ─── Properties ──────────────────────────────────────────────────────────────

export function addProperty(input: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>): Property {
  const property: Property = { ...input, id: generateId(), ...ts() };
  state = { ...state, properties: [...state.properties, property] };
  persistBatch([{ type: 'upsert', table: 'properties', data: property }]);
  notify();
  return property;
}

export function updateProperty(id: string, input: Partial<Omit<Property, 'id'>>): void {
  const properties = state.properties.map((p) =>
    p.id === id ? { ...p, ...input, updatedAt: nowISO() } : p
  );
  const updated = properties.find((p) => p.id === id);
  state = { ...state, properties };
  if (updated) persistBatch([{ type: 'upsert', table: 'properties', data: updated }]);
  notify();
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

  // Compute orphaned activity log IDs (not handled by FK cascade since activity_logs is polymorphic)
  const keptUnitIds = new Set(units.map((u) => u.id));
  const keptTenantIds = new Set(tenants.map((t) => t.id));
  const orphanedLogIds = state.activityLogs
    .filter((a) => {
      if (a.entityType === 'property' && a.entityId === id) return true;
      if (a.entityType === 'unit' && !keptUnitIds.has(a.entityId)) return true;
      if (a.entityType === 'tenant' && !keptTenantIds.has(a.entityId)) return true;
      return false;
    })
    .map((a) => a.id);

  state = { ...state, properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, communicationLogs };

  const ops: DbOperation[] = [
    { type: 'delete', table: 'properties', ids: [id] },
    // FK CASCADE handles: units, tenants, expenses, payments, maintenance_requests, communication_logs
  ];
  if (orphanedLogIds.length > 0) {
    ops.push({ type: 'delete', table: 'activityLogs', ids: orphanedLogIds });
  }
  persistBatch(ops);
  notify();
}

// ─── Units ───────────────────────────────────────────────────────────────────

export function addUnit(input: Omit<Unit, 'id' | 'createdAt' | 'updatedAt'>): Unit {
  const unit: Unit = { ...input, id: generateId(), ...ts() };
  state = { ...state, units: [...state.units, unit] };
  persistBatch([{ type: 'upsert', table: 'units', data: unit }]);
  notify();
  return unit;
}

export function updateUnit(id: string, input: Partial<Omit<Unit, 'id'>>): void {
  const units = state.units.map((u) =>
    u.id === id ? { ...u, ...input, updatedAt: nowISO() } : u
  );
  const updated = units.find((u) => u.id === id);
  state = { ...state, units };
  if (updated) persistBatch([{ type: 'upsert', table: 'units', data: updated }]);
  notify();
}

export function deleteUnit(id: string): void {
  const units = state.units.filter((u) => u.id !== id);
  const deletedTenantIds = new Set(state.tenants.filter((t) => t.unitId === id).map((t) => t.id));
  const tenants = state.tenants.filter((t) => t.unitId !== id);
  const payments = state.payments.filter((p) => p.unitId !== id);
  const maintenanceRequests = state.maintenanceRequests.filter((m) => m.unitId !== id);
  const expenses = state.expenses.map((e) =>
    e.unitId === id ? { ...e, unitId: undefined, updatedAt: nowISO() } : e
  );
  const activityLogs = state.activityLogs.filter((a) => {
    if (a.entityType === 'unit' && a.entityId === id) return false;
    if (a.entityType === 'tenant' && deletedTenantIds.has(a.entityId)) return false;
    return true;
  });

  const orphanedLogIds = state.activityLogs
    .filter((a) => {
      if (a.entityType === 'unit' && a.entityId === id) return true;
      if (a.entityType === 'tenant' && deletedTenantIds.has(a.entityId)) return true;
      return false;
    })
    .map((a) => a.id);

  state = { ...state, units, tenants, payments, maintenanceRequests, expenses, activityLogs };

  const ops: DbOperation[] = [
    { type: 'delete', table: 'units', ids: [id] },
    // FK CASCADE handles: tenants, payments; FK SET NULL handles: expenses.unitId, maintenance_requests.unitId
  ];
  if (orphanedLogIds.length > 0) {
    ops.push({ type: 'delete', table: 'activityLogs', ids: orphanedLogIds });
  }
  persistBatch(ops);
  notify();
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export function addTenant(input: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Tenant {
  const tenant: Tenant = { ...input, id: generateId(), ...ts() };
  state = { ...state, tenants: [...state.tenants, tenant] };
  persistBatch([{ type: 'upsert', table: 'tenants', data: tenant }]);
  notify();
  return tenant;
}

export function updateTenant(id: string, input: Partial<Omit<Tenant, 'id'>>): void {
  const tenants = state.tenants.map((t) => {
    if (t.id !== id) return t;
    const updated = { ...t, ...input, updatedAt: nowISO() };
    if (input.monthlyRent !== undefined && input.monthlyRent !== t.monthlyRent) {
      const history = [...(t.rentHistory ?? [])];
      history.push({ date: nowISO(), oldRent: t.monthlyRent, newRent: input.monthlyRent });
      updated.rentHistory = history;
    }
    return updated;
  });
  const updated = tenants.find((t) => t.id === id);
  state = { ...state, tenants };
  if (updated) persistBatch([{ type: 'upsert', table: 'tenants', data: updated }]);
  notify();
}

export function deleteTenant(id: string): void {
  const tenant = state.tenants.find((t) => t.id === id);
  const tenants = state.tenants.filter((t) => t.id !== id);
  const payments = state.payments.filter((p) => p.tenantId !== id);
  let units = state.units;
  const ops: DbOperation[] = [
    { type: 'delete', table: 'tenants', ids: [id] },
    // FK CASCADE handles: payments, communication_logs; FK SET NULL handles: maintenance_requests.tenantId
  ];
  if (tenant) {
    units = state.units.map((u) =>
      u.id === tenant.unitId ? { ...u, available: true, updatedAt: nowISO() } : u
    );
    const updatedUnit = units.find((u) => u.id === tenant.unitId);
    if (updatedUnit) ops.push({ type: 'upsert', table: 'units', data: updatedUnit });
  }
  const activityLogs = state.activityLogs.filter((a) =>
    !(a.entityType === 'tenant' && a.entityId === id)
  );
  const orphanedLogIds = state.activityLogs
    .filter((a) => a.entityType === 'tenant' && a.entityId === id)
    .map((a) => a.id);
  if (orphanedLogIds.length > 0) {
    ops.push({ type: 'delete', table: 'activityLogs', ids: orphanedLogIds });
  }
  const communicationLogs = state.communicationLogs.filter((c) => c.tenantId !== id);
  state = { ...state, tenants, payments, units, activityLogs, communicationLogs };
  persistBatch(ops);
  notify();
}

// ─── Expenses ────────────────────────────────────────────────────────────────

export function addExpense(input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Expense {
  const expense: Expense = { ...input, id: generateId(), ...ts() };
  state = { ...state, expenses: [...state.expenses, expense] };
  persistBatch([{ type: 'upsert', table: 'expenses', data: expense }]);
  notify();
  return expense;
}

export function updateExpense(id: string, input: Partial<Omit<Expense, 'id'>>): void {
  const expenses = state.expenses.map((e) =>
    e.id === id ? { ...e, ...input, updatedAt: nowISO() } : e
  );
  const updated = expenses.find((e) => e.id === id);
  state = { ...state, expenses };
  if (updated) persistBatch([{ type: 'upsert', table: 'expenses', data: updated }]);
  notify();
}

export function deleteExpense(id: string): void {
  state = { ...state, expenses: state.expenses.filter((e) => e.id !== id) };
  persistBatch([{ type: 'delete', table: 'expenses', ids: [id] }]);
  notify();
}

// ─── Payments ────────────────────────────────────────────────────────────────

export function addPayment(input: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Payment {
  const payment: Payment = { ...input, id: generateId(), ...ts() };
  state = { ...state, payments: [...state.payments, payment] };
  persistBatch([{ type: 'upsert', table: 'payments', data: payment }]);
  notify();
  return payment;
}

export function updatePayment(id: string, input: Partial<Omit<Payment, 'id'>>): void {
  const payments = state.payments.map((p) =>
    p.id === id ? { ...p, ...input, updatedAt: nowISO() } : p
  );
  const updated = payments.find((p) => p.id === id);
  state = { ...state, payments };
  if (updated) persistBatch([{ type: 'upsert', table: 'payments', data: updated }]);
  notify();
}

export function deletePayment(id: string): void {
  state = { ...state, payments: state.payments.filter((p) => p.id !== id) };
  persistBatch([{ type: 'delete', table: 'payments', ids: [id] }]);
  notify();
}

// ─── Maintenance Requests ────────────────────────────────────────────────────

export function addMaintenanceRequest(input: Omit<MaintenanceRequest, 'id' | 'createdAt' | 'updatedAt'>): MaintenanceRequest {
  const req: MaintenanceRequest = { ...input, id: generateId(), ...ts() };
  state = { ...state, maintenanceRequests: [...state.maintenanceRequests, req] };
  persistBatch([{ type: 'upsert', table: 'maintenanceRequests', data: req }]);
  notify();
  return req;
}

export function updateMaintenanceRequest(id: string, input: Partial<Omit<MaintenanceRequest, 'id'>>): void {
  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.id === id ? { ...m, ...input, updatedAt: nowISO() } : m
  );
  const updated = maintenanceRequests.find((m) => m.id === id);
  state = { ...state, maintenanceRequests };
  if (updated) persistBatch([{ type: 'upsert', table: 'maintenanceRequests', data: updated }]);
  notify();
}

export function deleteMaintenanceRequest(id: string): void {
  state = { ...state, maintenanceRequests: state.maintenanceRequests.filter((m) => m.id !== id) };
  persistBatch([{ type: 'delete', table: 'maintenanceRequests', ids: [id] }]);
  notify();
}

// ─── Activity Logs ───────────────────────────────────────────────────────────

export function addActivityLog(input: Omit<ActivityLog, 'id' | 'createdAt'>): ActivityLog {
  const log: ActivityLog = { ...input, id: generateId(), createdAt: nowISO() };
  state = { ...state, activityLogs: [...state.activityLogs, log] };
  persistBatch([{ type: 'upsert', table: 'activityLogs', data: log }]);
  notify();
  return log;
}

export function deleteActivityLog(id: string): void {
  state = { ...state, activityLogs: state.activityLogs.filter((a) => a.id !== id) };
  persistBatch([{ type: 'delete', table: 'activityLogs', ids: [id] }]);
  notify();
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export function addVendor(input: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>): Vendor {
  const vendor: Vendor = { ...input, id: generateId(), ...ts() };
  state = { ...state, vendors: [...state.vendors, vendor] };
  persistBatch([{ type: 'upsert', table: 'vendors', data: vendor }]);
  notify();
  return vendor;
}

export function updateVendor(id: string, input: Partial<Omit<Vendor, 'id'>>): void {
  const vendors = state.vendors.map((v) =>
    v.id === id ? { ...v, ...input, updatedAt: nowISO() } : v
  );
  const updated = vendors.find((v) => v.id === id);
  state = { ...state, vendors };
  if (updated) persistBatch([{ type: 'upsert', table: 'vendors', data: updated }]);
  notify();
}

export function deleteVendor(id: string): void {
  const vendors = state.vendors.filter((v) => v.id !== id);
  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.vendorId === id ? { ...m, vendorId: undefined, updatedAt: nowISO() } : m
  );
  const expenses = state.expenses.map((e) =>
    e.vendorId === id ? { ...e, vendorId: undefined, updatedAt: nowISO() } : e
  );
  state = { ...state, vendors, maintenanceRequests, expenses };

  persistBatch([
    { type: 'delete', table: 'vendors', ids: [id] },
    // FK SET NULL handles: maintenance_requests.vendorId, expenses.vendorId
  ]);
  notify();
}

// ─── Communication Logs ──────────────────────────────────────────────────────

export function addCommunicationLog(input: Omit<CommunicationLog, 'id' | 'createdAt'>): CommunicationLog {
  const log: CommunicationLog = { ...input, id: generateId(), createdAt: nowISO() };
  state = { ...state, communicationLogs: [...state.communicationLogs, log] };
  persistBatch([{ type: 'upsert', table: 'communicationLogs', data: log }]);
  notify();
  return log;
}

export function deleteCommunicationLog(id: string): void {
  state = { ...state, communicationLogs: state.communicationLogs.filter((c) => c.id !== id) };
  persistBatch([{ type: 'delete', table: 'communicationLogs', ids: [id] }]);
  notify();
}
