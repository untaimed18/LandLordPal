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
  Document,
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
  documents: Document[];
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
  documents: [],
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

function emitSaveSuccess(): void {
  window.dispatchEvent(new CustomEvent('landlordpal:save-success'));
}

function emitSaveError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Database save failed:', message);
  window.dispatchEvent(
    new CustomEvent('landlordpal:save-error', { detail: { message } })
  );
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

function getElectronAPI(): ElectronAPI | null {
  return window.electronAPI || null;
}

function requireElectronAPI(): ElectronAPI {
  const api = getElectronAPI();
  if (!api) {
    // Return a mock API for browser/test environments to prevent crashes
    console.warn('Electron API missing, using mock implementation');
    return {
      dbLoad: async () => ({}),
      dbSave: async () => true,
      dbBatch: async () => true,
      docPickFile: async () => null,
      docDeleteFile: async () => true,
      docOpenFile: async () => true,
      onUpdateStatus: () => {},
      checkForUpdates: async () => {},
      startDownload: async () => {},
      quitAndInstall: async () => {},
      getEncryptionKeyError: async () => null,
    } as unknown as ElectronAPI;
  }
  return api;
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
    documents: isArray(data.documents) ? filterValidItems<Document>(data.documents) : [],
  };
}

// ─── Incremental persistence via db:batch ────────────────────────────────────

async function persistBatch(ops: DbOperation[]): Promise<boolean> {
  try {
    const ok = await requireElectronAPI().dbBatch(ops);
    if (!ok) {
      emitSaveError(new Error('db:batch returned false'));
      return false;
    }
    emitSaveSuccess();
    return true;
  } catch (err) {
    emitSaveError(err);
    return false;
  }
}

async function persistFullReplace(s: AppState): Promise<boolean> {
  try {
    const ok = await requireElectronAPI().dbSave(s);
    if (!ok) {
      emitSaveError(new Error('db:save returned false'));
      return false;
    }
    emitSaveSuccess();
    return true;
  } catch (err) {
    emitSaveError(err);
    return false;
  }
}

// ─── In-memory state + pub/sub ───────────────────────────────────────────────

type Listener = () => void;
let state: AppState = defaultState;
const listeners: Set<Listener> = new Set();
let _initialized = false;

let _lastProcessedMonth = '';

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function runMonthlyProcessors(): void {
  const month = currentMonthKey();
  if (month === _lastProcessedMonth) return;
  _lastProcessedMonth = month;
  processAutopayments();
  processRecurringExpenses();
  notify();
}

export async function initStore(): Promise<void> {
  if (_initialized) return;

  const api = requireElectronAPI();
  const data = await api.dbLoad();
  if (data) {
    state = parseStateData(data as unknown as Record<string, unknown>);
  }
  logger.info('Store initialized from SQLite');

  _initialized = true;
  runMonthlyProcessors();

  // Re-check every 30 minutes so the app picks up a new month without restarting
  setInterval(runMonthlyProcessors, 30 * 60 * 1000);
}

async function processAutopayments(): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const firstOfMonth = `${monthPrefix}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const lastOfMonth = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

  const autopayTenants = state.tenants.filter((t) => t.autopay);
  if (autopayTenants.length === 0) return;

  const newPayments: Payment[] = [];
  const ops: DbOperation[] = [];

  for (const tenant of autopayTenants) {
    const alreadyPaid = state.payments.some(
      (p) => p.tenantId === tenant.id && p.date.startsWith(monthPrefix)
    );
    if (alreadyPaid) continue;

    const payment: Payment = {
      id: generateId(),
      propertyId: tenant.propertyId,
      unitId: tenant.unitId,
      tenantId: tenant.id,
      amount: tenant.monthlyRent,
      date: firstOfMonth,
      periodStart: firstOfMonth,
      periodEnd: lastOfMonth,
      method: 'transfer',
      notes: 'Autopay',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    newPayments.push(payment);
    ops.push({ type: 'upsert', table: 'payments', data: payment });
  }

  if (newPayments.length === 0) return;

  const ok = await persistBatch(ops);
  if (ok) {
    state = { ...state, payments: [...state.payments, ...newPayments] };
    notify();
    logger.info(`Autopay: recorded ${newPayments.length} payment(s) for ${monthPrefix}`);
  }
}

async function processRecurringExpenses(): Promise<void> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentMonth = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
  const recurring = state.expenses.filter((e) => e.recurring);
  if (recurring.length === 0) return;

  const existingKeys = new Set(
    state.expenses.map((e) => `${e.propertyId}|${e.category}|${e.description}|${e.date.slice(0, 7)}`)
  );

  const newExpenses: Expense[] = [];
  const ops: DbOperation[] = [];

  for (const re of recurring) {
    const reYear = Number(re.date.slice(0, 4));
    const reMonthIdx = Number(re.date.slice(5, 7)) - 1;
    let y = reYear;
    let m = reMonthIdx + 1;
    if (m > 11) { m = 0; y++; }

    while (y < currentYear || (y === currentYear && m <= currentMonthIdx)) {
      const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (monthKey > currentMonth) break;
      const sigKey = `${re.propertyId}|${re.category}|${re.description}|${monthKey}`;
      if (!existingKeys.has(sigKey)) {
        const expense: Expense = {
          id: generateId(),
          propertyId: re.propertyId,
          unitId: re.unitId,
          category: re.category,
          amount: re.amount,
          date: `${monthKey}-01`,
          description: re.description,
          recurring: true,
          vendorId: re.vendorId,
          ...ts(),
        };
        newExpenses.push(expense);
        ops.push({ type: 'upsert', table: 'expenses', data: expense });
        existingKeys.add(sigKey);
      }
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }

  if (newExpenses.length === 0) return;
  
  const ok = await persistBatch(ops);
  if (ok) {
    state = { ...state, expenses: [...state.expenses, ...newExpenses] };
    notify();
    logger.info(`Recurring expenses: generated ${newExpenses.length} expense(s) for missed months`);
  }
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
  const api = requireElectronAPI();
  for (const doc of state.documents) {
    api.docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file during import:', doc.filename, err);
    });
  }
  state = parseStateData(data);
  persistFullReplace(state);
  notify();
}

const ts = () => ({ createdAt: nowISO(), updatedAt: nowISO() });

// ─── Generic CRUD factory ─────────────────────────────────────────────────────

type HasId = { id: string };
type HasTimestamps = { createdAt: string; updatedAt: string };

function createCrud<T extends HasId & HasTimestamps>(
  key: keyof AppState,
  table: string,
) {
  function getList(): T[] { return state[key] as unknown as T[]; }

  async function add(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const item = { ...input, id: generateId(), ...ts() } as T;
    const ok = await persistBatch([{ type: 'upsert', table, data: item }]);
    if (ok) {
      state = { ...state, [key]: [...getList(), item] };
      notify();
    } else {
      throw new Error(`Failed to add to ${key}`);
    }
    return item;
  }

  async function update(id: string, input: Partial<Omit<T, 'id'>>): Promise<void> {
    const list = getList();
    const existing = list.find((item) => item.id === id);
    if (!existing) return;
    
    const updated = { ...existing, ...input, updatedAt: nowISO() };
    const ok = await persistBatch([{ type: 'upsert', table, data: updated }]);
    if (ok) {
      state = { ...state, [key]: list.map((item) => item.id === id ? updated : item) };
      notify();
    } else {
      throw new Error(`Failed to update ${key}`);
    }
  }

  async function remove(id: string): Promise<void> {
    const ok = await persistBatch([{ type: 'delete', table, ids: [id] }]);
    if (ok) {
      state = { ...state, [key]: getList().filter((item) => item.id !== id) };
      notify();
    } else {
      throw new Error(`Failed to delete from ${key}`);
    }
  }

  return { add, update, remove };
}

type HasCreatedAt = { id: string; createdAt: string };

function createLogCrud<T extends HasCreatedAt>(
  key: keyof AppState,
  table: string,
) {
  function getList(): T[] { return state[key] as unknown as T[]; }

  async function add(input: Omit<T, 'id' | 'createdAt'>): Promise<T> {
    const item = { ...input, id: generateId(), createdAt: nowISO() } as T;
    const ok = await persistBatch([{ type: 'upsert', table, data: item }]);
    if (ok) {
      state = { ...state, [key]: [...getList(), item] };
      notify();
    } else {
      throw new Error(`Failed to add to ${key}`);
    }
    return item;
  }

  async function remove(id: string): Promise<void> {
    const ok = await persistBatch([{ type: 'delete', table, ids: [id] }]);
    if (ok) {
      state = { ...state, [key]: getList().filter((item) => item.id !== id) };
      notify();
    } else {
      throw new Error(`Failed to delete from ${key}`);
    }
  }

  return { add, remove };
}

// ─── Properties ──────────────────────────────────────────────────────────────

const propertyCrud = createCrud<Property>('properties', 'properties');
export const addProperty = propertyCrud.add;
export const updateProperty = propertyCrud.update;

export async function deleteProperty(id: string): Promise<void> {
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

  // Clean up documents for the property and all its children
  const deletedUnitIds = new Set(state.units.filter((u) => u.propertyId === id).map((u) => u.id));
  const deletedTenantIds2 = new Set(state.tenants.filter((t) => t.propertyId === id).map((t) => t.id));
  const orphanedDocs = state.documents.filter((d) => {
    if (d.entityType === 'property' && d.entityId === id) return true;
    if (d.entityType === 'unit' && deletedUnitIds.has(d.entityId)) return true;
    if (d.entityType === 'tenant' && deletedTenantIds2.has(d.entityId)) return true;
    return false;
  });
  for (const doc of orphanedDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  const orphanedDocIds = orphanedDocs.map((d) => d.id);
  const documents = state.documents.filter((d) => !orphanedDocIds.includes(d.id));

  const ops: DbOperation[] = [
    { type: 'delete', table: 'properties', ids: [id] },
    // FK CASCADE handles: units, tenants, expenses, payments, maintenance_requests, communication_logs
  ];
  if (orphanedLogIds.length > 0) {
    ops.push({ type: 'delete', table: 'activityLogs', ids: orphanedLogIds });
  }
  if (orphanedDocIds.length > 0) {
    ops.push({ type: 'delete', table: 'documents', ids: orphanedDocIds });
  }
  
  const ok = await persistBatch(ops);
  if (ok) {
    state = { ...state, properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs, communicationLogs, documents };
    notify();
  } else {
    throw new Error('Failed to delete property');
  }
}

// ─── Units ───────────────────────────────────────────────────────────────────

const unitCrud = createCrud<Unit>('units', 'units');
export const addUnit = unitCrud.add;
export const updateUnit = unitCrud.update;

export async function deleteUnit(id: string): Promise<void> {
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

  // Clean up documents for this unit and its tenants
  const orphanedDocs = state.documents.filter((d) => {
    if (d.entityType === 'unit' && d.entityId === id) return true;
    if (d.entityType === 'tenant' && deletedTenantIds.has(d.entityId)) return true;
    return false;
  });
  for (const doc of orphanedDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  const orphanedDocIds = orphanedDocs.map((d) => d.id);
  const documents = state.documents.filter((d) => !orphanedDocIds.includes(d.id));

  const ops: DbOperation[] = [
    { type: 'delete', table: 'units', ids: [id] },
    // FK CASCADE handles: tenants, payments; FK SET NULL handles: expenses.unitId, maintenance_requests.unitId
  ];
  if (orphanedLogIds.length > 0) {
    ops.push({ type: 'delete', table: 'activityLogs', ids: orphanedLogIds });
  }
  if (orphanedDocIds.length > 0) {
    ops.push({ type: 'delete', table: 'documents', ids: orphanedDocIds });
  }
  
  const ok = await persistBatch(ops);
  if (ok) {
    state = { ...state, units, tenants, payments, maintenanceRequests, expenses, activityLogs, documents };
    notify();
  } else {
    throw new Error('Failed to delete unit');
  }
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

const tenantCrud = createCrud<Tenant>('tenants', 'tenants');
export const addTenant = tenantCrud.add;

export async function updateTenant(id: string, input: Partial<Omit<Tenant, 'id'>>): Promise<void> {
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
  if (updated) {
    const ok = await persistBatch([{ type: 'upsert', table: 'tenants', data: updated }]);
    if (ok) {
      state = { ...state, tenants };
      notify();
    } else {
      throw new Error('Failed to update tenant');
    }
  }
}

export async function deleteTenant(id: string): Promise<void> {
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

  // Clean up documents for this tenant
  const tenantDocs = state.documents.filter((d) => d.entityType === 'tenant' && d.entityId === id);
  for (const doc of tenantDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  const tenantDocIds = tenantDocs.map((d) => d.id);
  if (tenantDocIds.length > 0) {
    ops.push({ type: 'delete', table: 'documents', ids: tenantDocIds });
  }
  const documents = state.documents.filter((d) => !tenantDocIds.includes(d.id));

  const ok = await persistBatch(ops);
  if (ok) {
    state = { ...state, tenants, payments, units, activityLogs, communicationLogs, documents };
    notify();
  } else {
    throw new Error('Failed to delete tenant');
  }
}

// ─── Expenses ────────────────────────────────────────────────────────────────

const expenseCrud = createCrud<Expense>('expenses', 'expenses');
export const addExpense = expenseCrud.add;
export const updateExpense = expenseCrud.update;

export async function deleteExpense(id: string): Promise<void> {
  const expenseDocs = state.documents.filter((d) => d.entityType === 'expense' && d.entityId === id);
  for (const doc of expenseDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  const expenseDocIds = expenseDocs.map((d) => d.id);
  const ops: DbOperation[] = [{ type: 'delete', table: 'expenses', ids: [id] }];
  if (expenseDocIds.length > 0) {
    ops.push({ type: 'delete', table: 'documents', ids: expenseDocIds });
  }
  
  const ok = await persistBatch(ops);
  if (ok) {
    state = {
      ...state,
      expenses: state.expenses.filter((e) => e.id !== id),
      documents: state.documents.filter((d) => !expenseDocIds.includes(d.id)),
    };
    notify();
  } else {
    throw new Error('Failed to delete expense');
  }
}

// ─── Payments ────────────────────────────────────────────────────────────────

const paymentCrud = createCrud<Payment>('payments', 'payments');
export const addPayment = paymentCrud.add;
export const updatePayment = paymentCrud.update;
export const deletePayment = paymentCrud.remove;

// ─── Maintenance Requests ────────────────────────────────────────────────────

const maintenanceCrud = createCrud<MaintenanceRequest>('maintenanceRequests', 'maintenanceRequests');
export const addMaintenanceRequest = maintenanceCrud.add;
export const updateMaintenanceRequest = maintenanceCrud.update;
export const deleteMaintenanceRequest = maintenanceCrud.remove;

// ─── Activity Logs ───────────────────────────────────────────────────────────

const activityCrud = createLogCrud<ActivityLog>('activityLogs', 'activityLogs');
export const addActivityLog = activityCrud.add;
export const deleteActivityLog = activityCrud.remove;

// ─── Vendors ─────────────────────────────────────────────────────────────────

const vendorCrud = createCrud<Vendor>('vendors', 'vendors');
export const addVendor = vendorCrud.add;
export const updateVendor = vendorCrud.update;

export async function deleteVendor(id: string): Promise<void> {
  const vendors = state.vendors.filter((v) => v.id !== id);
  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.vendorId === id ? { ...m, vendorId: undefined, updatedAt: nowISO() } : m
  );
  const expenses = state.expenses.map((e) =>
    e.vendorId === id ? { ...e, vendorId: undefined, updatedAt: nowISO() } : e
  );

  const vendorDocs = state.documents.filter((d) => d.entityType === 'vendor' && d.entityId === id);
  for (const doc of vendorDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  const vendorDocIds = vendorDocs.map((d) => d.id);
  const documents = state.documents.filter((d) => !vendorDocIds.includes(d.id));

  const ops: DbOperation[] = [
    { type: 'delete', table: 'vendors', ids: [id] },
    // FK SET NULL handles: maintenance_requests.vendorId, expenses.vendorId
  ];
  if (vendorDocIds.length > 0) {
    ops.push({ type: 'delete', table: 'documents', ids: vendorDocIds });
  }
  
  const ok = await persistBatch(ops);
  if (ok) {
    state = { ...state, vendors, maintenanceRequests, expenses, documents };
    notify();
  } else {
    throw new Error('Failed to delete vendor');
  }
}

// ─── Communication Logs ──────────────────────────────────────────────────────

const commCrud = createLogCrud<CommunicationLog>('communicationLogs', 'communicationLogs');
export const addCommunicationLog = commCrud.add;
export const deleteCommunicationLog = commCrud.remove;

// ─── Documents ────────────────────────────────────────────────────────────────

export async function addDocument(
  entityType: Document['entityType'],
  entityId: string,
): Promise<Document | null> {
  const result = await requireElectronAPI().docPickFile();
  if (!result) return null;
  const doc: Document = {
    id: generateId(),
    entityType,
    entityId,
    filename: result.filename,
    originalName: result.originalName,
    size: result.size,
    mimeType: result.mimeType,
    createdAt: nowISO(),
  };
  const ok = await persistBatch([{ type: 'upsert', table: 'documents', data: doc }]);
  if (ok) {
    state = { ...state, documents: [...state.documents, doc] };
    notify();
    return doc;
  } else {
    throw new Error('Failed to add document');
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = state.documents.find((d) => d.id === id);
  if (doc) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  const ok = await persistBatch([{ type: 'delete', table: 'documents', ids: [id] }]);
  if (ok) {
    state = { ...state, documents: state.documents.filter((d) => d.id !== id) };
    notify();
  } else {
    throw new Error('Failed to delete document');
  }
}

export function openDocument(id: string): void {
  const doc = state.documents.find((d) => d.id === id);
  if (doc) {
    requireElectronAPI().docOpenFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to open document file:', doc.filename, err);
      window.dispatchEvent(
        new CustomEvent('landlordpal:save-error', {
          detail: { message: `Could not open file "${doc.originalName}". It may have been moved or deleted.` },
        })
      );
    });
  }
}
