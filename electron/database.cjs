const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Initialize the SQLite database.
 * @param {string} userDataPath - app.getPath('userData')
 */
function initDatabase(userDataPath) {
  const dbPath = path.join(userDataPath, 'landlordpal.db');
  console.log('Opening database at:', dbPath);

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');

  createTables();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,
      purchasePrice REAL,
      purchaseDate TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL,
      name TEXT NOT NULL,
      bedrooms INTEGER NOT NULL DEFAULT 0,
      bathrooms INTEGER NOT NULL DEFAULT 0,
      sqft INTEGER,
      monthlyRent REAL NOT NULL DEFAULT 0,
      deposit REAL,
      available INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      unitId TEXT NOT NULL,
      propertyId TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      leaseStart TEXT NOT NULL,
      leaseEnd TEXT NOT NULL,
      monthlyRent REAL NOT NULL DEFAULT 0,
      deposit REAL,
      depositReturned REAL,
      depositDeductions TEXT,
      gracePeriodDays INTEGER,
      lateFeeAmount REAL,
      moveInDate TEXT,
      moveOutDate TEXT,
      moveInNotes TEXT,
      moveOutNotes TEXT,
      notes TEXT,
      rentHistory TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL,
      unitId TEXT,
      category TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      recurring INTEGER DEFAULT 0,
      vendorId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      unitId TEXT NOT NULL,
      propertyId TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      periodStart TEXT NOT NULL,
      periodEnd TEXT NOT NULL,
      method TEXT,
      notes TEXT,
      lateFee REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL,
      unitId TEXT,
      tenantId TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      category TEXT NOT NULL DEFAULT 'other',
      vendorId TEXT,
      cost REAL,
      resolvedAt TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      note TEXT NOT NULL,
      date TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      specialty TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

// ─── Row <-> Object helpers ──────────────────────────────────────────────────

/** Convert a SQLite row to a JS object, handling boolean and JSON fields */
function rowToProperty(row) {
  return row; // all TEXT/REAL columns map directly
}

function rowToUnit(row) {
  return { ...row, available: !!row.available };
}

function rowToTenant(row) {
  return {
    ...row,
    rentHistory: row.rentHistory ? JSON.parse(row.rentHistory) : undefined,
  };
}

function rowToExpense(row) {
  return {
    ...row,
    recurring: row.recurring ? true : undefined,
    unitId: row.unitId || undefined,
    vendorId: row.vendorId || undefined,
  };
}

function rowToPayment(row) {
  return {
    ...row,
    method: row.method || undefined,
    notes: row.notes || undefined,
    lateFee: row.lateFee != null ? row.lateFee : undefined,
  };
}

function rowToMaintenanceRequest(row) {
  return {
    ...row,
    unitId: row.unitId || undefined,
    tenantId: row.tenantId || undefined,
    vendorId: row.vendorId || undefined,
    cost: row.cost != null ? row.cost : undefined,
    resolvedAt: row.resolvedAt || undefined,
    notes: row.notes || undefined,
  };
}

function rowToActivityLog(row) {
  return row;
}

function rowToVendor(row) {
  return {
    ...row,
    phone: row.phone || undefined,
    email: row.email || undefined,
    specialty: row.specialty || undefined,
    notes: row.notes || undefined,
  };
}

// ─── Load all ────────────────────────────────────────────────────────────────

function loadAll() {
  return {
    properties: db.prepare('SELECT * FROM properties').all().map(rowToProperty),
    units: db.prepare('SELECT * FROM units').all().map(rowToUnit),
    tenants: db.prepare('SELECT * FROM tenants').all().map(rowToTenant),
    expenses: db.prepare('SELECT * FROM expenses').all().map(rowToExpense),
    payments: db.prepare('SELECT * FROM payments').all().map(rowToPayment),
    maintenanceRequests: db.prepare('SELECT * FROM maintenance_requests').all().map(rowToMaintenanceRequest),
    activityLogs: db.prepare('SELECT * FROM activity_logs').all().map(rowToActivityLog),
    vendors: db.prepare('SELECT * FROM vendors').all().map(rowToVendor),
  };
}

// ─── Save all (transactional replace) ────────────────────────────────────────

function saveAll(state) {
  const run = db.transaction(() => {
    // Properties
    db.prepare('DELETE FROM properties').run();
    const insertProperty = db.prepare(`
      INSERT INTO properties (id, name, address, city, state, zip, purchasePrice, purchaseDate, notes, createdAt, updatedAt)
      VALUES (@id, @name, @address, @city, @state, @zip, @purchasePrice, @purchaseDate, @notes, @createdAt, @updatedAt)
    `);
    for (const p of state.properties || []) {
      insertProperty.run({
        id: p.id, name: p.name, address: p.address, city: p.city,
        state: p.state, zip: p.zip,
        purchasePrice: p.purchasePrice ?? null,
        purchaseDate: p.purchaseDate ?? null,
        notes: p.notes ?? null,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      });
    }

    // Units
    db.prepare('DELETE FROM units').run();
    const insertUnit = db.prepare(`
      INSERT INTO units (id, propertyId, name, bedrooms, bathrooms, sqft, monthlyRent, deposit, available, notes, createdAt, updatedAt)
      VALUES (@id, @propertyId, @name, @bedrooms, @bathrooms, @sqft, @monthlyRent, @deposit, @available, @notes, @createdAt, @updatedAt)
    `);
    for (const u of state.units || []) {
      insertUnit.run({
        id: u.id, propertyId: u.propertyId, name: u.name,
        bedrooms: u.bedrooms, bathrooms: u.bathrooms,
        sqft: u.sqft ?? null, monthlyRent: u.monthlyRent,
        deposit: u.deposit ?? null,
        available: u.available ? 1 : 0,
        notes: u.notes ?? null,
        createdAt: u.createdAt, updatedAt: u.updatedAt,
      });
    }

    // Tenants
    db.prepare('DELETE FROM tenants').run();
    const insertTenant = db.prepare(`
      INSERT INTO tenants (id, unitId, propertyId, name, email, phone, leaseStart, leaseEnd, monthlyRent, deposit, depositReturned, depositDeductions, gracePeriodDays, lateFeeAmount, moveInDate, moveOutDate, moveInNotes, moveOutNotes, notes, rentHistory, createdAt, updatedAt)
      VALUES (@id, @unitId, @propertyId, @name, @email, @phone, @leaseStart, @leaseEnd, @monthlyRent, @deposit, @depositReturned, @depositDeductions, @gracePeriodDays, @lateFeeAmount, @moveInDate, @moveOutDate, @moveInNotes, @moveOutNotes, @notes, @rentHistory, @createdAt, @updatedAt)
    `);
    for (const t of state.tenants || []) {
      insertTenant.run({
        id: t.id, unitId: t.unitId, propertyId: t.propertyId, name: t.name,
        email: t.email ?? null, phone: t.phone ?? null,
        leaseStart: t.leaseStart, leaseEnd: t.leaseEnd,
        monthlyRent: t.monthlyRent,
        deposit: t.deposit ?? null,
        depositReturned: t.depositReturned ?? null,
        depositDeductions: t.depositDeductions ?? null,
        gracePeriodDays: t.gracePeriodDays ?? null,
        lateFeeAmount: t.lateFeeAmount ?? null,
        moveInDate: t.moveInDate ?? null,
        moveOutDate: t.moveOutDate ?? null,
        moveInNotes: t.moveInNotes ?? null,
        moveOutNotes: t.moveOutNotes ?? null,
        notes: t.notes ?? null,
        rentHistory: t.rentHistory ? JSON.stringify(t.rentHistory) : null,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      });
    }

    // Expenses
    db.prepare('DELETE FROM expenses').run();
    const insertExpense = db.prepare(`
      INSERT INTO expenses (id, propertyId, unitId, category, amount, date, description, recurring, vendorId, createdAt, updatedAt)
      VALUES (@id, @propertyId, @unitId, @category, @amount, @date, @description, @recurring, @vendorId, @createdAt, @updatedAt)
    `);
    for (const e of state.expenses || []) {
      insertExpense.run({
        id: e.id, propertyId: e.propertyId,
        unitId: e.unitId ?? null,
        category: e.category, amount: e.amount,
        date: e.date, description: e.description,
        recurring: e.recurring ? 1 : 0,
        vendorId: e.vendorId ?? null,
        createdAt: e.createdAt, updatedAt: e.updatedAt,
      });
    }

    // Payments
    db.prepare('DELETE FROM payments').run();
    const insertPayment = db.prepare(`
      INSERT INTO payments (id, tenantId, unitId, propertyId, amount, date, periodStart, periodEnd, method, notes, lateFee, createdAt, updatedAt)
      VALUES (@id, @tenantId, @unitId, @propertyId, @amount, @date, @periodStart, @periodEnd, @method, @notes, @lateFee, @createdAt, @updatedAt)
    `);
    for (const p of state.payments || []) {
      insertPayment.run({
        id: p.id, tenantId: p.tenantId, unitId: p.unitId, propertyId: p.propertyId,
        amount: p.amount, date: p.date,
        periodStart: p.periodStart, periodEnd: p.periodEnd,
        method: p.method ?? null,
        notes: p.notes ?? null,
        lateFee: p.lateFee ?? null,
        createdAt: p.createdAt, updatedAt: p.updatedAt,
      });
    }

    // Maintenance requests
    db.prepare('DELETE FROM maintenance_requests').run();
    const insertMaintenance = db.prepare(`
      INSERT INTO maintenance_requests (id, propertyId, unitId, tenantId, title, description, priority, status, category, vendorId, cost, resolvedAt, notes, createdAt, updatedAt)
      VALUES (@id, @propertyId, @unitId, @tenantId, @title, @description, @priority, @status, @category, @vendorId, @cost, @resolvedAt, @notes, @createdAt, @updatedAt)
    `);
    for (const m of state.maintenanceRequests || []) {
      insertMaintenance.run({
        id: m.id, propertyId: m.propertyId,
        unitId: m.unitId ?? null,
        tenantId: m.tenantId ?? null,
        title: m.title, description: m.description,
        priority: m.priority, status: m.status, category: m.category,
        vendorId: m.vendorId ?? null,
        cost: m.cost ?? null,
        resolvedAt: m.resolvedAt ?? null,
        notes: m.notes ?? null,
        createdAt: m.createdAt, updatedAt: m.updatedAt,
      });
    }

    // Activity logs
    db.prepare('DELETE FROM activity_logs').run();
    const insertLog = db.prepare(`
      INSERT INTO activity_logs (id, entityType, entityId, note, date, createdAt)
      VALUES (@id, @entityType, @entityId, @note, @date, @createdAt)
    `);
    for (const a of state.activityLogs || []) {
      insertLog.run({
        id: a.id, entityType: a.entityType, entityId: a.entityId,
        note: a.note, date: a.date, createdAt: a.createdAt,
      });
    }

    // Vendors
    db.prepare('DELETE FROM vendors').run();
    const insertVendor = db.prepare(`
      INSERT INTO vendors (id, name, phone, email, specialty, notes, createdAt, updatedAt)
      VALUES (@id, @name, @phone, @email, @specialty, @notes, @createdAt, @updatedAt)
    `);
    for (const v of state.vendors || []) {
      insertVendor.run({
        id: v.id, name: v.name,
        phone: v.phone ?? null,
        email: v.email ?? null,
        specialty: v.specialty ?? null,
        notes: v.notes ?? null,
        createdAt: v.createdAt, updatedAt: v.updatedAt,
      });
    }
  });

  run();
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, loadAll, saveAll, closeDatabase };
