import type {
  Property,
  Unit,
  Tenant,
  Expense,
  Payment,
  MaintenanceRequest,
  ActivityLog,
  Vendor,
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
};

function isArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      properties: isArray(parsed.properties) ? parsed.properties : [],
      units: isArray(parsed.units) ? parsed.units : [],
      tenants: isArray(parsed.tenants) ? parsed.tenants : [],
      expenses: isArray(parsed.expenses) ? parsed.expenses : [],
      payments: isArray(parsed.payments) ? parsed.payments : [],
      maintenanceRequests: isArray(parsed.maintenanceRequests) ? parsed.maintenanceRequests : [],
      activityLogs: isArray(parsed.activityLogs) ? parsed.activityLogs : [],
      vendors: isArray(parsed.vendors) ? parsed.vendors : [],
    } as AppState;
  } catch {
    return defaultState;
  }
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}

// Simple pub/sub for React
type Listener = () => void;
let state = loadState();
const listeners: Set<Listener> = new Set();

export function getState(): AppState {
  return state;
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
  const next: AppState = {
    properties: isArray(data.properties) ? data.properties : [],
    units: isArray(data.units) ? data.units : [],
    tenants: isArray(data.tenants) ? data.tenants : [],
    expenses: isArray(data.expenses) ? data.expenses : [],
    payments: isArray(data.payments) ? data.payments : [],
    maintenanceRequests: isArray(data.maintenanceRequests) ? data.maintenanceRequests : [],
    activityLogs: isArray(data.activityLogs) ? data.activityLogs : [],
    vendors: isArray(data.vendors) ? data.vendors : [],
  } as AppState;
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
  setState({ ...state, properties, units, tenants, expenses, payments, maintenanceRequests, activityLogs });
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
  const tenants = state.tenants.map((t) =>
    t.id === id ? { ...t, ...input, updatedAt: nowISO() } : t
  );
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
  setState({ ...state, tenants, payments, units, activityLogs });
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
