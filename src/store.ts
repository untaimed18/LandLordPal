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
  EmailTemplate,
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
  emailTemplates: EmailTemplate[];
}

interface BackupAssetEntry {
  filename: string;
  contentBase64: string;
}

interface BackupAssets {
  documents: BackupAssetEntry[];
  photos: BackupAssetEntry[];
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
  emailTemplates: [],
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
      dbBatch: async () => ({ success: true }),
      dbBackup: async () => ({ success: true }),
      docPickFile: async () => null,
      docDeleteFile: async () => true,
      docOpenFile: async () => true,
      photoPick: async () => null,
      photoDelete: async () => true,
      photoGetPath: async () => null,
      backupExportAssets: async () => ({ documents: [], photos: [] }),
      backupReplaceAssets: async () => ({ success: true }),
      settingsSave: async () => true,
      onUpdateStatus: () => {},
      checkForUpdates: async () => {},
      startDownload: async () => {},
      installUpdate: async () => {},
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
    emailTemplates: isArray(data.emailTemplates) ? filterValidItems<EmailTemplate>(data.emailTemplates) : [],
  };
}

function getMaintenancePhotoFilenames(requests: MaintenanceRequest[]): string[] {
  return [...new Set(requests.flatMap((request) => request.photos?.map((photo) => photo.filename) ?? []))];
}

function getStateAssetFilenames(appState: AppState): { documents: string[]; photos: string[] } {
  return {
    documents: [...new Set(appState.documents.map((doc) => doc.filename))],
    photos: getMaintenancePhotoFilenames(appState.maintenanceRequests),
  };
}

function emptyBackupAssets(): BackupAssets {
  return { documents: [], photos: [] };
}

// ─── Save queue to serialize db writes ───────────────────────────────────────

let saveQueueTail: Promise<unknown> = Promise.resolve();

function enqueueSave<T>(fn: () => Promise<T>): Promise<T> {
  const task = saveQueueTail.then(fn, fn);
  saveQueueTail = task.catch(() => {});
  return task;
}

// ─── Incremental persistence via db:batch ────────────────────────────────────

async function persistBatch(ops: DbOperation[]): Promise<boolean> {
  return enqueueSave(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await requireElectronAPI().dbBatch(ops);
        if (result.success) {
          emitSaveSuccess();
          return true;
        }
        if (attempt === 0) {
          logger.warn('db:batch failed, retrying...', result.error);
          continue;
        }
        emitSaveError(new Error(result.error || 'db:batch returned false'));
        return false;
      } catch (err) {
        if (attempt === 0) {
          logger.warn('db:batch threw, retrying...', err instanceof Error ? err.message : String(err));
          continue;
        }
        emitSaveError(err);
        return false;
      }
    }
    return false;
  });
}

async function persistFullReplace(s: AppState): Promise<boolean> {
  return enqueueSave(async () => {
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
  });
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

async function runMonthlyProcessors(): Promise<void> {
  const month = currentMonthKey();
  if (month === _lastProcessedMonth) return;
  _lastProcessedMonth = month;
  try {
    await processAutopayments();
    await processRecurringExpenses();
  } catch (err) {
    _lastProcessedMonth = '';
    logger.error('Monthly processors failed:', err);
  }
  notify();
}

import { loadSettings } from './lib/settings';

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

  // Auto-backup on launch
  const settings = loadSettings();
  if (settings.autoBackup) {
    // Run in background, don't await
    api.dbBackup().then((res) => {
      if (res.success) logger.info('Auto-backup completed:', res.path);
      else logger.warn('Auto-backup failed:', res.error);
    });
  }

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

export async function restoreSnapshot(snapshot: AppState): Promise<void> {
  const previous = state;
  state = snapshot;
  const ok = await persistFullReplace(state);
  if (!ok) {
    state = previous;
    throw new Error('Failed to restore snapshot');
  }
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
export async function importState(data: Record<string, unknown>, assets?: BackupAssets): Promise<void> {
  const api = requireElectronAPI();
  const previous = state;
  const previousAssets = await api.backupExportAssets(getStateAssetFilenames(previous));
  const nextState = parseStateData(data);

  state = nextState;
  const ok = await persistFullReplace(state);
  if (!ok) {
    state = previous;
    throw new Error('Failed to import data');
  }

  const nextAssetFilenames = getStateAssetFilenames(nextState);
  const shouldReplaceAssets = Boolean(assets) || (nextAssetFilenames.documents.length === 0 && nextAssetFilenames.photos.length === 0);
  if (shouldReplaceAssets) {
    const replaceResult = await api.backupReplaceAssets(assets ?? emptyBackupAssets());
    if (!replaceResult.success) {
      state = previous;
      const restored = await persistFullReplace(previous);
      const rollbackAssets = await api.backupReplaceAssets(previousAssets);
      if (!restored || !rollbackAssets.success) {
        emitSaveError(new Error(replaceResult.error || 'Failed to restore backup assets'));
      }
      throw new Error(replaceResult.error || 'Failed to import backup assets');
    }
  }

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

  const deletedExpenseIds = new Set(state.expenses.filter((e) => e.propertyId === id).map((e) => e.id));
  const deletedMaintenance = state.maintenanceRequests.filter((m) => m.propertyId === id);
  const deletedMaintenanceIds = new Set(deletedMaintenance.map((m) => m.id));

  // Clean up documents for the property and all its children
  const deletedUnitIds = new Set(state.units.filter((u) => u.propertyId === id).map((u) => u.id));
  const deletedTenantIds2 = new Set(state.tenants.filter((t) => t.propertyId === id).map((t) => t.id));
  const orphanedDocs = state.documents.filter((d) => {
    if (d.entityType === 'property' && d.entityId === id) return true;
    if (d.entityType === 'unit' && deletedUnitIds.has(d.entityId)) return true;
    if (d.entityType === 'tenant' && deletedTenantIds2.has(d.entityId)) return true;
    if (d.entityType === 'expense' && deletedExpenseIds.has(d.entityId)) return true;
    if (d.entityType === 'maintenance' && deletedMaintenanceIds.has(d.entityId)) return true;
    return false;
  });
  for (const doc of orphanedDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete document file:', doc.filename, err);
    });
  }
  for (const filename of getMaintenancePhotoFilenames(deletedMaintenance)) {
    requireElectronAPI().photoDelete(filename).catch((err: unknown) => {
      logger.warn('Failed to delete maintenance photo file:', filename, err);
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
  
  // Preserve payments by unlinking them from the deleted unit
  const payments = state.payments.map((p) => 
    p.unitId === id ? { ...p, unitId: undefined, updatedAt: nowISO() } : p
  );

  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.unitId === id ? { ...m, unitId: undefined, updatedAt: nowISO() } : m
  );
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
    // FK CASCADE handles: tenants; FK SET NULL handles: payments, expenses.unitId, maintenance_requests.unitId
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
    // If lease dates changed significantly, we might want to track that too, but usually that's done via "Renew Lease"
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
  
  // Preserve payments by unlinking them from the deleted tenant
  const payments = state.payments.map((p) => 
    p.tenantId === id ? { ...p, tenantId: undefined, updatedAt: nowISO() } : p
  );
  
  let units = state.units;
  const maintenanceRequests = state.maintenanceRequests.map((m) =>
    m.tenantId === id ? { ...m, tenantId: undefined, updatedAt: nowISO() } : m
  );
  const ops: DbOperation[] = [
    { type: 'delete', table: 'tenants', ids: [id] },
    // FK SET NULL handles: payments, maintenance_requests.tenantId
    // FK CASCADE handles: communication_logs
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
    state = { ...state, tenants, payments, units, maintenanceRequests, activityLogs, communicationLogs, documents };
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

export async function deletePayment(id: string): Promise<void> {
  const payment = state.payments.find((p) => p.id === id);
  if (!payment) return;

  let tenants = state.tenants;
  const tenant = payment.tenantId ? state.tenants.find((t) => t.id === payment.tenantId) : undefined;
  const ops: DbOperation[] = [{ type: 'delete', table: 'payments', ids: [id] }];

  if (tenant && payment.category === 'deposit') {
    const remainingDepositPayments = state.payments.filter((p) => p.id !== id && p.tenantId === tenant.id && p.category === 'deposit');
    const totalPaid = remainingDepositPayments.reduce((sum, p) => sum + p.amount, 0);
    const latestDepositDate = [...remainingDepositPayments].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    const depositOwed = tenant.deposit ?? 0;
    const updatedTenant: Tenant = {
      ...tenant,
      depositPaidAmount: totalPaid > 0 ? totalPaid : undefined,
      depositPaidDate: latestDepositDate,
      depositStatus: totalPaid <= 0 ? (depositOwed > 0 ? 'pending' : undefined) : totalPaid >= depositOwed ? 'paid' : 'partial',
      updatedAt: nowISO(),
    };
    tenants = state.tenants.map((t) => (t.id === tenant.id ? updatedTenant : t));
    ops.push({ type: 'upsert', table: 'tenants', data: updatedTenant });
  }

  if (tenant && payment.category === 'last_month') {
    const hasRemainingLastMonthPayment = state.payments.some((p) => p.id !== id && p.tenantId === tenant.id && p.category === 'last_month');
    const updatedTenant: Tenant = {
      ...tenant,
      lastMonthPaid: hasRemainingLastMonthPayment || undefined,
      updatedAt: nowISO(),
    };
    tenants = state.tenants.map((t) => (t.id === tenant.id ? updatedTenant : t));
    ops.push({ type: 'upsert', table: 'tenants', data: updatedTenant });
  }

  const ok = await persistBatch(ops);
  if (ok) {
    state = {
      ...state,
      payments: state.payments.filter((p) => p.id !== id),
      tenants,
    };
    notify();
  } else {
    throw new Error('Failed to delete payment');
  }
}

// ─── Maintenance Requests ────────────────────────────────────────────────────

const maintenanceCrud = createCrud<MaintenanceRequest>('maintenanceRequests', 'maintenanceRequests');
export const addMaintenanceRequest = maintenanceCrud.add;
export const updateMaintenanceRequest = maintenanceCrud.update;

export async function deleteMaintenanceRequest(id: string): Promise<void> {
  const request = state.maintenanceRequests.find((item) => item.id === id);
  if (!request) return;

  const maintenanceDocs = state.documents.filter((d) => d.entityType === 'maintenance' && d.entityId === id);
  for (const doc of maintenanceDocs) {
    requireElectronAPI().docDeleteFile(doc.filename).catch((err: unknown) => {
      logger.warn('Failed to delete maintenance document file:', doc.filename, err);
    });
  }
  for (const photo of request.photos ?? []) {
    requireElectronAPI().photoDelete(photo.filename).catch((err: unknown) => {
      logger.warn('Failed to delete maintenance photo file:', photo.filename, err);
    });
  }

  const maintenanceDocIds = maintenanceDocs.map((d) => d.id);
  const ops: DbOperation[] = [{ type: 'delete', table: 'maintenanceRequests', ids: [id] }];
  if (maintenanceDocIds.length > 0) {
    ops.push({ type: 'delete', table: 'documents', ids: maintenanceDocIds });
  }

  const ok = await persistBatch(ops);
  if (ok) {
    state = {
      ...state,
      maintenanceRequests: state.maintenanceRequests.filter((item) => item.id !== id),
      documents: state.documents.filter((d) => !maintenanceDocIds.includes(d.id)),
    };
    notify();
  } else {
    throw new Error('Failed to delete maintenance request');
  }
}

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
    requireElectronAPI().docOpenFile(doc.filename)
      .then((opened) => {
        if (opened) return;
        window.dispatchEvent(
          new CustomEvent('landlordpal:save-error', {
            detail: { message: `Could not open file "${doc.originalName}". It may have been moved or deleted.` },
          })
        );
      })
      .catch((err: unknown) => {
        logger.warn('Failed to open document file:', doc.filename, err);
        window.dispatchEvent(
          new CustomEvent('landlordpal:save-error', {
            detail: { message: `Could not open file "${doc.originalName}". It may have been moved or deleted.` },
          })
        );
      });
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

const emailTemplateCrud = createCrud<EmailTemplate>('emailTemplates', 'email_templates');
export const addEmailTemplate = emailTemplateCrud.add;
export const updateEmailTemplate = emailTemplateCrud.update;
export const deleteEmailTemplate = emailTemplateCrud.remove;

