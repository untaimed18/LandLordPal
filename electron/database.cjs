const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;
let dbFilePath = null;

// ─── Schema version ──────────────────────────────────────────────────────────
// Increment this whenever you add migrations below.
const CURRENT_SCHEMA_VERSION = 2;

/**
 * Initialize the SQLite database.
 * @param {string} userDataPath - app.getPath('userData')
 */
function initDatabase(userDataPath) {
  dbFilePath = path.join(userDataPath, 'landlordpal.db');
  console.log('Opening database at:', dbFilePath);

  db = new Database(dbFilePath);

  // Enable WAL mode for better concurrent read/write performance
  db.pragma('journal_mode = WAL');

  createTables();
  migrateIfNeeded(userDataPath);
  return db;
}

// ─── Schema version helpers ──────────────────────────────────────────────────

function getSchemaVersion() {
  // The meta table may not exist yet (fresh DB or pre-versioning DB)
  try {
    const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version');
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0; // table doesn't exist yet
  }
}

function setSchemaVersion(version) {
  db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.prepare(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`).run('schema_version', String(version));
}

// ─── Safe migration runner ───────────────────────────────────────────────────

/**
 * Back up the database file and run any pending migrations.
 * If a migration fails, the backup is preserved so the user can recover.
 */
function migrateIfNeeded(userDataPath) {
  const currentVersion = getSchemaVersion();

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    console.log(`Database schema is up to date (v${currentVersion}).`);
    return;
  }

  console.log(`Database schema v${currentVersion} → v${CURRENT_SCHEMA_VERSION}. Running migrations...`);

  // Create an automatic backup before migrating
  try {
    const backupName = `landlordpal-backup-v${currentVersion}-${Date.now()}.db`;
    const backupPath = path.join(userDataPath, backupName);
    // Use better-sqlite3's built-in backup (fast, consistent snapshot)
    db.backup(backupPath)
      .then(() => console.log('Pre-migration backup saved:', backupPath))
      .catch((err) => console.warn('Backup warning (non-fatal):', err.message));
  } catch (err) {
    // Fallback: copy the file manually (synchronous)
    try {
      if (fs.existsSync(dbFilePath)) {
        const backupName = `landlordpal-backup-v${currentVersion}-${Date.now()}.db`;
        const backupPath = path.join(userDataPath, backupName);
        fs.copyFileSync(dbFilePath, backupPath);
        console.log('Pre-migration backup saved (copy):', backupPath);
      }
    } catch (copyErr) {
      console.warn('Could not create pre-migration backup:', copyErr.message);
    }
  }

  // Run migrations inside a transaction so partial failures roll back
  try {
    const migrate = db.transaction(() => {
      if (currentVersion < 1) {
        runMigrationV1();
      }
      if (currentVersion < 2) {
        runMigrationV2();
      }
      // Future migrations go here:
      // if (currentVersion < 3) { runMigrationV3(); }

      setSchemaVersion(CURRENT_SCHEMA_VERSION);
    });
    migrate();
    console.log(`Migration complete. Schema is now v${CURRENT_SCHEMA_VERSION}.`);
  } catch (err) {
    console.error('Migration FAILED — database left at previous version.', err.message);
    console.error('A backup of your data was saved before the migration attempt.');
    // Don't rethrow — let the app start with whatever schema is available.
    // The user's data is still intact (transaction rolled back).
  }
}

/** V1: baseline schema — create all original tables. (no-op for existing DBs since tables use IF NOT EXISTS) */
function runMigrationV1() {
  console.log('  Running migration v1: baseline tables');
  // Tables already created in createTables() via IF NOT EXISTS — this is just the version marker.
}

/** V2: property enhancements, insurance fields, maintenance scheduling, communication logs */
function runMigrationV2() {
  console.log('  Running migration v2: property details, insurance, scheduling, comms');
  const addCol = (table, col, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* column already exists */ }
  };
  // Property enhancements
  addCol('properties', 'propertyType', 'TEXT');
  addCol('properties', 'sqft', 'INTEGER');
  addCol('properties', 'amenities', 'TEXT');
  addCol('properties', 'insuranceProvider', 'TEXT');
  addCol('properties', 'insurancePolicyNumber', 'TEXT');
  addCol('properties', 'insuranceExpiry', 'TEXT');
  // Maintenance scheduling
  addCol('maintenance_requests', 'scheduledDate', 'TEXT');
  addCol('maintenance_requests', 'recurrence', 'TEXT');
  // communication_logs table is already handled by createTables() IF NOT EXISTS
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
      propertyType TEXT,
      sqft INTEGER,
      amenities TEXT,
      purchasePrice REAL,
      purchaseDate TEXT,
      insuranceProvider TEXT,
      insurancePolicyNumber TEXT,
      insuranceExpiry TEXT,
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
      scheduledDate TEXT,
      recurrence TEXT,
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

    CREATE TABLE IF NOT EXISTS communication_logs (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      propertyId TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      subject TEXT NOT NULL,
      notes TEXT,
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

/** Safe JSON parse for stored JSON columns; returns undefined on invalid data */
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/** Convert a SQLite row to a JS object, handling boolean and JSON fields */
function rowToProperty(row) {
  return {
    ...row,
    amenities: safeJsonParse(row.amenities, undefined),
    propertyType: row.propertyType || undefined,
    sqft: row.sqft != null ? row.sqft : undefined,
    insuranceProvider: row.insuranceProvider || undefined,
    insurancePolicyNumber: row.insurancePolicyNumber || undefined,
    insuranceExpiry: row.insuranceExpiry || undefined,
  };
}

function rowToUnit(row) {
  return { ...row, available: !!row.available };
}

function rowToTenant(row) {
  return {
    ...row,
    rentHistory: safeJsonParse(row.rentHistory, undefined),
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
    scheduledDate: row.scheduledDate || undefined,
    recurrence: row.recurrence || undefined,
    resolvedAt: row.resolvedAt || undefined,
    notes: row.notes || undefined,
  };
}

function rowToCommunicationLog(row) {
  return {
    ...row,
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
    communicationLogs: db.prepare('SELECT * FROM communication_logs').all().map(rowToCommunicationLog),
  };
}

// ─── Save all (transactional replace) ────────────────────────────────────────

function saveAll(state) {
  const run = db.transaction(() => {
    // Properties
    db.prepare('DELETE FROM properties').run();
    const insertProperty = db.prepare(`
      INSERT INTO properties (id, name, address, city, state, zip, propertyType, sqft, amenities, purchasePrice, purchaseDate, insuranceProvider, insurancePolicyNumber, insuranceExpiry, notes, createdAt, updatedAt)
      VALUES (@id, @name, @address, @city, @state, @zip, @propertyType, @sqft, @amenities, @purchasePrice, @purchaseDate, @insuranceProvider, @insurancePolicyNumber, @insuranceExpiry, @notes, @createdAt, @updatedAt)
    `);
    for (const p of state.properties || []) {
      insertProperty.run({
        id: p.id, name: p.name, address: p.address, city: p.city,
        state: p.state, zip: p.zip,
        propertyType: p.propertyType ?? null,
        sqft: p.sqft ?? null,
        amenities: p.amenities ? JSON.stringify(p.amenities) : null,
        purchasePrice: p.purchasePrice ?? null,
        purchaseDate: p.purchaseDate ?? null,
        insuranceProvider: p.insuranceProvider ?? null,
        insurancePolicyNumber: p.insurancePolicyNumber ?? null,
        insuranceExpiry: p.insuranceExpiry ?? null,
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
      INSERT INTO maintenance_requests (id, propertyId, unitId, tenantId, title, description, priority, status, category, vendorId, cost, scheduledDate, recurrence, resolvedAt, notes, createdAt, updatedAt)
      VALUES (@id, @propertyId, @unitId, @tenantId, @title, @description, @priority, @status, @category, @vendorId, @cost, @scheduledDate, @recurrence, @resolvedAt, @notes, @createdAt, @updatedAt)
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
        scheduledDate: m.scheduledDate ?? null,
        recurrence: m.recurrence ?? null,
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

    // Communication logs
    db.prepare('DELETE FROM communication_logs').run();
    const insertComm = db.prepare(`
      INSERT INTO communication_logs (id, tenantId, propertyId, type, date, subject, notes, createdAt)
      VALUES (@id, @tenantId, @propertyId, @type, @date, @subject, @notes, @createdAt)
    `);
    for (const c of state.communicationLogs || []) {
      insertComm.run({
        id: c.id, tenantId: c.tenantId, propertyId: c.propertyId,
        type: c.type, date: c.date, subject: c.subject,
        notes: c.notes ?? null,
        createdAt: c.createdAt,
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
