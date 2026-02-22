import { Property, Unit, Tenant } from '../types';

// Simple CSV parser that handles quoted values
function parseCSV(text: string): string[][] {
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
        i++; // Skip escaped quote
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
      if (char === '\r' && nextChar === '\n') i++; // Skip \n after \r
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  
  // Filter empty rows
  return rows.filter(row => row.some(cell => cell.length > 0));
}

export interface ImportResult {
  properties: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>[];
  units: Omit<Unit, 'id' | 'createdAt' | 'updatedAt'>[];
  tenants: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>[];
  errors: string[];
}

export function parseImportCSV(
  type: 'properties' | 'units' | 'tenants',
  csvText: string,
  existingProperties: Property[],
  existingUnits: Unit[]
): ImportResult {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { properties: [], units: [], tenants: [], errors: ['CSV is empty or missing headers'] };

  const headers = rows[0].map(h => h.toLowerCase());
  const dataRows = rows.slice(1);
  const errors: string[] = [];
  
  const result: ImportResult = { properties: [], units: [], tenants: [], errors: [] };

  // Helper to get value by header name
  const getVal = (row: string[], header: string): string => {
    const idx = headers.indexOf(header.toLowerCase());
    return idx >= 0 ? row[idx] : '';
  };

  if (type === 'properties') {
    dataRows.forEach((row, i) => {
      const name = getVal(row, 'name');
      const address = getVal(row, 'address');
      const city = getVal(row, 'city');
      const state = getVal(row, 'state');
      const zip = getVal(row, 'zip');
      
      if (!name || !address) {
        errors.push(`Row ${i + 2}: Missing required fields (Name, Address)`);
        return;
      }

      result.properties.push({
        name,
        address,
        city,
        state,
        zip,
        propertyType: 'single_family', // Default
        notes: getVal(row, 'notes') || undefined,
      });
    });
  } else if (type === 'units') {
    dataRows.forEach((row, i) => {
      const propertyName = getVal(row, 'property');
      const name = getVal(row, 'name');
      const rent = parseFloat(getVal(row, 'rent'));
      
      if (!propertyName || !name || isNaN(rent)) {
        errors.push(`Row ${i + 2}: Missing required fields (Property, Name, Rent)`);
        return;
      }

      const property = existingProperties.find(p => p.name.toLowerCase() === propertyName.toLowerCase());
      if (!property) {
        errors.push(`Row ${i + 2}: Property "${propertyName}" not found`);
        return;
      }

      result.units.push({
        propertyId: property.id,
        name,
        bedrooms: parseInt(getVal(row, 'bedrooms')) || 0,
        bathrooms: parseFloat(getVal(row, 'bathrooms')) || 0,
        monthlyRent: rent,
        available: true,
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

      if (!unitName || !name || !leaseStart || !leaseEnd || isNaN(rent)) {
        errors.push(`Row ${i + 2}: Missing required fields (Unit, Name, Lease Start, Lease End, Rent)`);
        return;
      }

      // Find unit by name (and optionally property name if provided to disambiguate)
      // For simplicity, we match unit name. If duplicates exist, this might pick the wrong one.
      // Ideally, we'd require Property Name too.
      const propertyName = getVal(row, 'property');
      let unit: Unit | undefined;
      
      if (propertyName) {
        const prop = existingProperties.find(p => p.name.toLowerCase() === propertyName.toLowerCase());
        if (prop) {
          unit = existingUnits.find(u => u.name.toLowerCase() === unitName.toLowerCase() && u.propertyId === prop.id);
        }
      } else {
        unit = existingUnits.find(u => u.name.toLowerCase() === unitName.toLowerCase());
      }

      if (!unit) {
        errors.push(`Row ${i + 2}: Unit "${unitName}" not found${propertyName ? ` in property "${propertyName}"` : ''}`);
        return;
      }

      result.tenants.push({
        unitId: unit.id,
        propertyId: unit.propertyId,
        name,
        email: getVal(row, 'email') || undefined,
        phone: getVal(row, 'phone') || undefined,
        leaseStart, // Assuming YYYY-MM-DD
        leaseEnd,   // Assuming YYYY-MM-DD
        monthlyRent: rent,
        deposit: parseFloat(getVal(row, 'deposit')) || undefined,
      });
    });
  }

  result.errors = errors;
  return result;
}
