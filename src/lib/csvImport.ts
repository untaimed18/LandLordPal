import type { Property, Unit, Tenant, Expense, Payment, ExpenseCategory } from '../types';

// Simple CSV parser that handles quoted values
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (currentVal || currentRow.length > 0) {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
      if (char === '\r' && nextChar === '\n') i++;
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  
  return rows.filter(row => row.some(cell => cell.length > 0));
}

export type ImportType = 'properties' | 'units' | 'tenants' | 'expenses' | 'payments';

export interface ImportResult {
  properties: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>[];
  units: Omit<Unit, 'id' | 'createdAt' | 'updatedAt'>[];
  tenants: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>[];
  expenses: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>[];
  payments: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>[];
  errors: string[];
}

const VALID_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'mortgage', 'insurance', 'taxes', 'utilities', 'maintenance', 'repairs', 'management', 'legal', 'other',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function findProperty(name: string, list: Property[]): Property | undefined {
  return list.find(p => p.name.toLowerCase() === name.toLowerCase());
}

function findUnit(name: string, list: Unit[], propertyId?: string): Unit | undefined {
  if (propertyId) return list.find(u => u.name.toLowerCase() === name.toLowerCase() && u.propertyId === propertyId);
  return list.find(u => u.name.toLowerCase() === name.toLowerCase());
}

export function parseImportCSV(
  type: ImportType,
  csvText: string,
  existingProperties: Property[],
  existingUnits: Unit[],
  existingTenants?: Tenant[],
): ImportResult {
  const rows = parseCSV(csvText);
  const empty: ImportResult = { properties: [], units: [], tenants: [], expenses: [], payments: [], errors: [] };
  if (rows.length < 2) return { ...empty, errors: ['CSV is empty or missing headers'] };

  const headers = rows[0].map(h => h.toLowerCase());
  const dataRows = rows.slice(1);
  const errors: string[] = [];
  const result: ImportResult = { ...empty };

  const getVal = (row: string[], header: string): string => {
    const idx = headers.indexOf(header.toLowerCase());
    return idx >= 0 && idx < row.length ? row[idx] : '';
  };

  if (type === 'properties') {
    dataRows.forEach((row, i) => {
      const name = getVal(row, 'name');
      const address = getVal(row, 'address');
      if (!name || !address) { errors.push(`Row ${i + 2}: Missing required fields (Name, Address)`); return; }
      result.properties.push({
        name, address,
        city: getVal(row, 'city'),
        state: getVal(row, 'state'),
        zip: getVal(row, 'zip'),
        propertyType: 'single_family',
        notes: getVal(row, 'notes') || undefined,
      });
    });
  } else if (type === 'units') {
    dataRows.forEach((row, i) => {
      const propertyName = getVal(row, 'property');
      const name = getVal(row, 'name');
      const rent = parseFloat(getVal(row, 'rent'));
      if (!propertyName || !name || isNaN(rent)) { errors.push(`Row ${i + 2}: Missing required fields (Property, Name, Rent)`); return; }
      const property = findProperty(propertyName, existingProperties);
      if (!property) { errors.push(`Row ${i + 2}: Property "${propertyName}" not found`); return; }
      result.units.push({
        propertyId: property.id, name,
        bedrooms: parseInt(getVal(row, 'bedrooms')) || 0,
        bathrooms: parseFloat(getVal(row, 'bathrooms')) || 0,
        monthlyRent: rent, available: true,
        notes: getVal(row, 'notes') || undefined,
      });
    });
  } else if (type === 'tenants') {
    dataRows.forEach((row, i) => {
      const unitName = getVal(row, 'unit');
      const name = getVal(row, 'name');
      const leaseStart = getVal(row, 'lease start');
      const leaseEnd = getVal(row, 'lease end');
      const rent = parseFloat(getVal(row, 'rent'));
      if (!unitName || !name || !leaseStart || !leaseEnd || isNaN(rent)) { errors.push(`Row ${i + 2}: Missing required fields (Unit, Name, Lease Start, Lease End, Rent)`); return; }
      const propertyName = getVal(row, 'property');
      const prop = propertyName ? findProperty(propertyName, existingProperties) : undefined;
      const unit = findUnit(unitName, existingUnits, prop?.id);
      if (!unit) { errors.push(`Row ${i + 2}: Unit "${unitName}" not found${propertyName ? ` in property "${propertyName}"` : ''}`); return; }
      result.tenants.push({
        unitId: unit.id, propertyId: unit.propertyId, name,
        email: getVal(row, 'email') || undefined,
        phone: getVal(row, 'phone') || undefined,
        leaseStart, leaseEnd, monthlyRent: rent,
        deposit: parseFloat(getVal(row, 'deposit')) || undefined,
      });
    });
  } else if (type === 'expenses') {
    dataRows.forEach((row, i) => {
      const propertyName = getVal(row, 'property');
      const date = getVal(row, 'date');
      const amount = parseFloat(getVal(row, 'amount'));
      const description = getVal(row, 'description');
      const categoryRaw = getVal(row, 'category').toLowerCase() as ExpenseCategory;
      if (!propertyName || !date || isNaN(amount) || !description) { errors.push(`Row ${i + 2}: Missing required fields (Property, Date, Amount, Description)`); return; }
      if (!DATE_RE.test(date)) { errors.push(`Row ${i + 2}: Date must be YYYY-MM-DD format`); return; }
      const property = findProperty(propertyName, existingProperties);
      if (!property) { errors.push(`Row ${i + 2}: Property "${propertyName}" not found`); return; }
      const category: ExpenseCategory = VALID_EXPENSE_CATEGORIES.includes(categoryRaw) ? categoryRaw : 'other';
      const unitName = getVal(row, 'unit');
      const unit = unitName ? findUnit(unitName, existingUnits, property.id) : undefined;
      result.expenses.push({
        propertyId: property.id,
        unitId: unit?.id,
        category, amount, date, description,
        recurring: getVal(row, 'recurring').toLowerCase() === 'yes' || undefined,
      });
    });
  } else if (type === 'payments') {
    const tenantList = existingTenants ?? [];
    dataRows.forEach((row, i) => {
      const tenantName = getVal(row, 'tenant');
      const date = getVal(row, 'date');
      const amount = parseFloat(getVal(row, 'amount'));
      if (!tenantName || !date || isNaN(amount)) { errors.push(`Row ${i + 2}: Missing required fields (Tenant, Date, Amount)`); return; }
      if (!DATE_RE.test(date)) { errors.push(`Row ${i + 2}: Date must be YYYY-MM-DD format`); return; }
      const propertyName = getVal(row, 'property');
      const tenant = tenantList.find(t => {
        if (t.name.toLowerCase() !== tenantName.toLowerCase()) return false;
        if (propertyName) {
          const prop = findProperty(propertyName, existingProperties);
          return prop ? t.propertyId === prop.id : false;
        }
        return true;
      });
      if (!tenant) { errors.push(`Row ${i + 2}: Tenant "${tenantName}" not found${propertyName ? ` in property "${propertyName}"` : ''}`); return; }
      const [y, m] = date.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const periodStart = getVal(row, 'period start') || `${y}-${String(m).padStart(2, '0')}-01`;
      const periodEnd = getVal(row, 'period end') || `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const methodRaw = getVal(row, 'method').toLowerCase();
      const method = (['check', 'transfer', 'cash', 'other'] as const).includes(methodRaw as 'check') ? methodRaw as Payment['method'] : undefined;
      result.payments.push({
        tenantId: tenant.id, unitId: tenant.unitId, propertyId: tenant.propertyId,
        amount, date, periodStart, periodEnd, method,
        notes: getVal(row, 'notes') || undefined,
        lateFee: parseFloat(getVal(row, 'late fee')) || undefined,
      });
    });
  }

  result.errors = errors;
  return result;
}
