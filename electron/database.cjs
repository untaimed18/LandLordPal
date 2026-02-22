const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const log = require('./logger.cjs');

let db = null;
let dbFilePath = null;
let userDataDir = null;

const CURRENT_SCHEMA_VERSION = 5;

// ─── Encryption ──────────────────────────────────────────────────────────────

const ENC_ALGORITHM = 'aes-256-gcm';
const ENC_KEY_FILE = '.landlordpal-key';
let encryptionKey = null;
let encryptionKeyError = null;

function loadEncryptionKey() {
  const keyPath = path.join(userDataDir, ENC_KEY_FILE);
  try {
    if (fs.existsSync(keyPath)) {
      const buf = fs.readFileSync(keyPath);
      if (buf.length === 32) {
        encryptionKey = buf;
      } else {
        log.warn('Invalid encryption key length, regenerating');
        encryptionKey = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, encryptionKey, { mode: 0o600 });
      }
    } else {
      encryptionKey = crypto.randomBytes(32);
      fs.writeFileSync(keyPath, encryptionKey, { mode: 0o600 });
      log.info('Generated new encryption key');
    }
  } catch (err) {
    log.error('CRITICAL: Failed to manage encryption key:', err.message);
    log.error('PII fields will NOT be encrypted. Resolve the issue and restart the app.');
    encryptionKey = null;
    encryptionKeyError = err.message;
  }
}

function getEncryptionKeyError() {
  return encryptionKeyError;
}

function encrypt(text) {
  if (text == null || !encryptionKey) return text ?? null;
  if (typeof text !== 'string' || text.length === 0) return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENC_ALGORITHM, encryptionKey, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `ENC:${iv.toString('hex')}:${tag}:${enc}`;
  } catch {
    return text;
  }
}

function decrypt(text) {
  if (text == null || typeof text !== 'string' || !text.startsWith('ENC:') || !encryptionKey) return text;
  try {
    const parts = text.split(':');
    if (parts.length !== 4) return text;
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ENC_ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(parts[3], 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    return text;
  }
}

// ─── Table configuration ─────────────────────────────────────────────────────

const TABLE_NAME_MAP = {
  properties: 'properties',
  units: 'units',
  tenants: 'tenants',
  expenses: 'expenses',
  payments: 'payments',
  maintenanceRequests: 'maintenance_requests',
  activityLogs: 'activity_logs',
  vendors: 'vendors',
  communicationLogs: 'communication_logs',
  documents: 'documents',
  emailTemplates: 'email_templates',
};

const TABLE_COLUMNS = {
  properties: ['id', 'name', 'address', 'city', 'state', 'zip', 'propertyType', 'sqft', 'amenities', 'purchasePrice', 'purchaseDate', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceExpiry', 'notes', 'createdAt', 'updatedAt'],
  units: ['id', 'propertyId', 'name', 'bedrooms', 'bathrooms', 'sqft', 'monthlyRent', 'deposit', 'available', 'notes', 'createdAt', 'updatedAt'],
  tenants: ['id', 'unitId', 'propertyId', 'name', 'email', 'phone', 'leaseStart', 'leaseEnd', 'monthlyRent', 'deposit', 'depositReturned', 'depositDeductions', 'gracePeriodDays', 'lateFeeAmount', 'autopay', 'moveInDate', 'moveOutDate', 'moveInNotes', 'moveOutNotes', 'notes', 'rentHistory', 'leaseHistory', 'createdAt', 'updatedAt'],
  expenses: ['id', 'propertyId', 'unitId', 'category', 'amount', 'date', 'description', 'recurring', 'vendorId', 'createdAt', 'updatedAt'],
  payments: ['id', 'tenantId', 'unitId', 'propertyId', 'amount', 'date', 'periodStart', 'periodEnd', 'method', 'notes', 'lateFee', 'createdAt', 'updatedAt'],
  maintenance_requests: ['id', 'propertyId', 'unitId', 'tenantId', 'title', 'description', 'priority', 'status', 'category', 'vendorId', 'cost', 'scheduledDate', 'recurrence', 'resolvedAt', 'notes', 'createdAt', 'updatedAt'],
  activity_logs: ['id', 'entityType', 'entityId', 'note', 'date', 'createdAt'],
  vendors: ['id', 'name', 'phone', 'email', 'specialty', 'notes', 'createdAt', 'updatedAt'],
  communication_logs: ['id', 'tenantId', 'propertyId', 'type', 'date', 'subject', 'notes', 'createdAt'],
  documents: ['id', 'entityType', 'entityId', 'filename', 'originalName', 'size', 'mimeType', 'createdAt'],
  email_templates: ['id', 'name', 'subject', 'body', 'createdAt', 'updatedAt'],
};

// JS object -> DB row serializers
const serializers = {
  properties: (p) => ({
    id: p.id, name: p.name, address: p.address, city: p.city, state: p.state, zip: p.zip,
    propertyType: p.propertyType ?? null, sqft: p.sqft ?? null,
    amenities: p.amenities ? JSON.stringify(p.amenities) : null,
    purchasePrice: p.purchasePrice ?? null, purchaseDate: p.purchaseDate ?? null,
    insuranceProvider: p.insuranceProvider ?? null,
    insurancePolicyNumber: p.insurancePolicyNumber ?? null,
    insuranceExpiry: p.insuranceExpiry ?? null,
    notes: p.notes ?? null, createdAt: p.createdAt, updatedAt: p.updatedAt,
  }),
  units: (u) => ({
    id: u.id, propertyId: u.propertyId, name: u.name,
    bedrooms: u.bedrooms, bathrooms: u.bathrooms,
    sqft: u.sqft ?? null, monthlyRent: u.monthlyRent,
    deposit: u.deposit ?? null, available: u.available ? 1 : 0,
    notes: u.notes ?? null, createdAt: u.createdAt, updatedAt: u.updatedAt,
  }),
  tenants: (t) => ({
    id: t.id, unitId: t.unitId, propertyId: t.propertyId, name: t.name,
    email: encrypt(t.email) ?? null, phone: encrypt(t.phone) ?? null,
    leaseStart: t.leaseStart, leaseEnd: t.leaseEnd, monthlyRent: t.monthlyRent,
    deposit: t.deposit ?? null, depositReturned: t.depositReturned ?? null,
    depositDeductions: t.depositDeductions ?? null,
    gracePeriodDays: t.gracePeriodDays ?? null, lateFeeAmount: t.lateFeeAmount ?? null,
    autopay: t.autopay ? 1 : 0,
    moveInDate: t.moveInDate ?? null, moveOutDate: t.moveOutDate ?? null,
    moveInNotes: t.moveInNotes ?? null, moveOutNotes: t.moveOutNotes ?? null,
    notes: t.notes ?? null,
    rentHistory: t.rentHistory ? JSON.stringify(t.rentHistory) : null,
    leaseHistory: t.leaseHistory ? JSON.stringify(t.leaseHistory) : null,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  }),
  expenses: (e) => ({
    id: e.id, propertyId: e.propertyId, unitId: e.unitId ?? null,
    category: e.category, amount: e.amount, date: e.date, description: e.description,
    recurring: e.recurring ? 1 : 0, vendorId: e.vendorId ?? null,
    createdAt: e.createdAt, updatedAt: e.updatedAt,
  }),
  payments: (p) => ({
    id: p.id, tenantId: p.tenantId, unitId: p.unitId, propertyId: p.propertyId,
    amount: p.amount, date: p.date, periodStart: p.periodStart, periodEnd: p.periodEnd,
    method: p.method ?? null, notes: p.notes ?? null, lateFee: p.lateFee ?? null,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  }),
  maintenance_requests: (m) => ({
    id: m.id, propertyId: m.propertyId, unitId: m.unitId ?? null,
    tenantId: m.tenantId ?? null, title: m.title, description: m.description,
    priority: m.priority, status: m.status, category: m.category,
    vendorId: m.vendorId ?? null, cost: m.cost ?? null,
    scheduledDate: m.scheduledDate ?? null, recurrence: m.recurrence ?? null,
    resolvedAt: m.resolvedAt ?? null, notes: m.notes ?? null,
    createdAt: m.createdAt, updatedAt: m.updatedAt,
  }),
  activity_logs: (a) => ({
    id: a.id, entityType: a.entityType, entityId: a.entityId,
    note: a.note, date: a.date, createdAt: a.createdAt,
  }),
  vendors: (v) => ({
    id: v.id, name: v.name,
    phone: encrypt(v.phone) ?? null, email: encrypt(v.email) ?? null,
    specialty: v.specialty ?? null, notes: v.notes ?? null,
    createdAt: v.createdAt, updatedAt: v.updatedAt,
  }),
  communication_logs: (c) => ({
    id: c.id, tenantId: c.tenantId, propertyId: c.propertyId,
    type: c.type, date: c.date, subject: c.subject,
    notes: c.notes ?? null, createdAt: c.createdAt,
  }),
  documents: (d) => ({
    id: d.id, entityType: d.entityType, entityId: d.entityId,
    filename: d.filename, originalName: d.originalName,
    size: d.size, mimeType: d.mimeType, createdAt: d.createdAt,
  }),
  email_templates: (t) => ({
    id: t.id, name: t.name, subject: t.subject, body: t.body,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  }),
};

// ─── Prepared statement cache ────────────────────────────────────────────────

const _stmts = {};

function prepareStatements() {
  for (const [sqlTable, columns] of Object.entries(TABLE_COLUMNS)) {
    const cols = columns.join(', ');
    const params = columns.map((c) => `@${c}`).join(', ');
    _stmts[`upsert_${sqlTable}`] = db.prepare(
      `INSERT OR REPLACE INTO ${sqlTable} (${cols}) VALUES (${params})`
    );
    _stmts[`delete_${sqlTable}`] = db.prepare(
      `DELETE FROM ${sqlTable} WHERE id = @id`
    );
  }
}

// ─── Schema version helpers ──────────────────────────────────────────────────

function getSchemaVersion() {
  try {
    const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version');
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(version) {
  db.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.prepare(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`).run('schema_version', String(version));
}

// ─── Initialize ──────────────────────────────────────────────────────────────

async function initDatabase(userDataPath) {
  userDataDir = userDataPath;
  dbFilePath = path.join(userDataPath, 'landlordpal.db');
  log.info('Opening database at:', dbFilePath);

  db = new Database(dbFilePath);
  db.pragma('journal_mode = WAL');

  loadEncryptionKey();
  createTables();
  await migrateIfNeeded(userDataPath);

  db.pragma('foreign_keys = ON');
  prepareStatements();

  return db;
}

// ─── Migration runner ────────────────────────────────────────────────────────

const MAX_BACKUPS = 5;

function cleanupOldBackups(userDataPath) {
  try {
    const files = fs.readdirSync(userDataPath)
      .filter((f) => f.startsWith('landlordpal-backup-') && f.endsWith('.db'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(userDataPath, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    for (const file of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(userDataPath, file.name));
      log.info('Removed old backup:', file.name);
    }
  } catch (err) {
    log.warn('Backup cleanup failed (non-fatal):', err.message);
  }
}

async function migrateIfNeeded(userDataPath) {
  const currentVersion = getSchemaVersion();

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    log.info(`Database schema is up to date (v${currentVersion}).`);
    cleanupOldBackups(userDataPath);
    return;
  }

  log.info(`Database schema v${currentVersion} → v${CURRENT_SCHEMA_VERSION}. Running migrations...`);

  try {
    const backupName = `landlordpal-backup-v${currentVersion}-${Date.now()}.db`;
    const backupPath = path.join(userDataPath, backupName);
    try {
      await db.backup(backupPath);
      log.info('Pre-migration backup saved:', backupPath);
    } catch (backupErr) {
      log.warn('Async backup failed, falling back to sync copy:', backupErr.message);
      if (fs.existsSync(dbFilePath)) {
        fs.copyFileSync(dbFilePath, backupPath);
        log.info('Pre-migration backup saved (copy):', backupPath);
      }
    }
  } catch (err) {
    log.warn('Could not create pre-migration backup:', err.message);
  }

  try {
    const migrate = db.transaction(() => {
      if (currentVersion < 1) runMigrationV1();
      if (currentVersion < 2) runMigrationV2();
      if (currentVersion < 3) runMigrationV3();
      if (currentVersion < 4) runMigrationV4();
      if (currentVersion < 5) runMigrationV5();
      setSchemaVersion(CURRENT_SCHEMA_VERSION);
    });
    migrate();
    log.info(`Migration complete. Schema is now v${CURRENT_SCHEMA_VERSION}.`);
  } catch (err) {
    log.error('Migration FAILED — database left at previous version.', err.message);
    log.error('A backup of your data was saved before the migration attempt.');
  }

  cleanupOldBackups(userDataPath);
}

function runMigrationV1() {
  log.info('  Running migration v1: baseline tables');
}

function runMigrationV2() {
  log.info('  Running migration v2: property details, insurance, scheduling, comms');
  const addCol = (table, col, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* already exists */ }
  };
  addCol('properties', 'propertyType', 'TEXT');
  addCol('properties', 'sqft', 'INTEGER');
  addCol('properties', 'amenities', 'TEXT');
  addCol('properties', 'insuranceProvider', 'TEXT');
  addCol('properties', 'insurancePolicyNumber', 'TEXT');
  addCol('properties', 'insuranceExpiry', 'TEXT');
  addCol('maintenance_requests', 'scheduledDate', 'TEXT');
  addCol('maintenance_requests', 'recurrence', 'TEXT');
}

function runMigrationV3() {
  log.info('  Running migration v3: foreign keys + PII encryption');

  // Step 1: Clean orphaned records before adding FK constraints
  db.exec(`DELETE FROM units WHERE propertyId NOT IN (SELECT id FROM properties)`);
  db.exec(`DELETE FROM tenants WHERE unitId NOT IN (SELECT id FROM units)`);
  db.exec(`DELETE FROM tenants WHERE propertyId NOT IN (SELECT id FROM properties)`);
  db.exec(`DELETE FROM payments WHERE tenantId NOT IN (SELECT id FROM tenants)`);
  db.exec(`DELETE FROM payments WHERE unitId NOT IN (SELECT id FROM units)`);
  db.exec(`DELETE FROM payments WHERE propertyId NOT IN (SELECT id FROM properties)`);
  db.exec(`DELETE FROM communication_logs WHERE tenantId NOT IN (SELECT id FROM tenants)`);
  db.exec(`DELETE FROM communication_logs WHERE propertyId NOT IN (SELECT id FROM properties)`);
  db.exec(`UPDATE expenses SET unitId = NULL WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units)`);
  db.exec(`UPDATE expenses SET vendorId = NULL WHERE vendorId IS NOT NULL AND vendorId NOT IN (SELECT id FROM vendors)`);
  db.exec(`DELETE FROM expenses WHERE propertyId NOT IN (SELECT id FROM properties)`);
  db.exec(`UPDATE maintenance_requests SET unitId = NULL WHERE unitId IS NOT NULL AND unitId NOT IN (SELECT id FROM units)`);
  db.exec(`UPDATE maintenance_requests SET tenantId = NULL WHERE tenantId IS NOT NULL AND tenantId NOT IN (SELECT id FROM tenants)`);
  db.exec(`UPDATE maintenance_requests SET vendorId = NULL WHERE vendorId IS NOT NULL AND vendorId NOT IN (SELECT id FROM vendors)`);
  db.exec(`DELETE FROM maintenance_requests WHERE propertyId NOT IN (SELECT id FROM properties)`);

  // Step 2: Recreate tables with FK constraints (SQLite requires table recreation)
  db.pragma('foreign_keys = OFF');

  // Units
  db.exec(`
    CREATE TABLE units_new (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL, bedrooms INTEGER NOT NULL DEFAULT 0, bathrooms INTEGER NOT NULL DEFAULT 0,
      sqft INTEGER, monthlyRent REAL NOT NULL DEFAULT 0, deposit REAL,
      available INTEGER NOT NULL DEFAULT 1, notes TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    INSERT INTO units_new SELECT * FROM units;
    DROP TABLE units;
    ALTER TABLE units_new RENAME TO units;
  `);

  // Tenants
  db.exec(`
    CREATE TABLE tenants_new (
      id TEXT PRIMARY KEY,
      unitId TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT, phone TEXT,
      leaseStart TEXT NOT NULL, leaseEnd TEXT NOT NULL,
      monthlyRent REAL NOT NULL DEFAULT 0, deposit REAL,
      depositReturned REAL, depositDeductions TEXT,
      gracePeriodDays INTEGER, lateFeeAmount REAL,
      moveInDate TEXT, moveOutDate TEXT, moveInNotes TEXT, moveOutNotes TEXT,
      notes TEXT, rentHistory TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    INSERT INTO tenants_new SELECT * FROM tenants;
    DROP TABLE tenants;
    ALTER TABLE tenants_new RENAME TO tenants;
  `);

  // Expenses
  db.exec(`
    CREATE TABLE expenses_new (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unitId TEXT REFERENCES units(id) ON DELETE SET NULL,
      category TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL,
      description TEXT NOT NULL, recurring INTEGER DEFAULT 0,
      vendorId TEXT REFERENCES vendors(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    INSERT INTO expenses_new SELECT * FROM expenses;
    DROP TABLE expenses;
    ALTER TABLE expenses_new RENAME TO expenses;
  `);

  // Payments
  db.exec(`
    CREATE TABLE payments_new (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      unitId TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      amount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL,
      periodStart TEXT NOT NULL, periodEnd TEXT NOT NULL,
      method TEXT, notes TEXT, lateFee REAL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    INSERT INTO payments_new SELECT * FROM payments;
    DROP TABLE payments;
    ALTER TABLE payments_new RENAME TO payments;
  `);

  // Maintenance requests
  db.exec(`
    CREATE TABLE maintenance_requests_new (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unitId TEXT REFERENCES units(id) ON DELETE SET NULL,
      tenantId TEXT REFERENCES tenants(id) ON DELETE SET NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open',
      category TEXT NOT NULL DEFAULT 'other',
      vendorId TEXT REFERENCES vendors(id) ON DELETE SET NULL,
      cost REAL, scheduledDate TEXT, recurrence TEXT, resolvedAt TEXT, notes TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    INSERT INTO maintenance_requests_new SELECT * FROM maintenance_requests;
    DROP TABLE maintenance_requests;
    ALTER TABLE maintenance_requests_new RENAME TO maintenance_requests;
  `);

  // Communication logs
  db.exec(`
    CREATE TABLE communication_logs_new (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      type TEXT NOT NULL, date TEXT NOT NULL, subject TEXT NOT NULL, notes TEXT,
      createdAt TEXT NOT NULL
    );
    INSERT INTO communication_logs_new SELECT * FROM communication_logs;
    DROP TABLE communication_logs;
    ALTER TABLE communication_logs_new RENAME TO communication_logs;
  `);

  // Step 3: Encrypt existing PII fields
  if (encryptionKey) {
    const tenants = db.prepare('SELECT id, email, phone FROM tenants').all();
    const encTenant = db.prepare('UPDATE tenants SET email = ?, phone = ? WHERE id = ?');
    for (const t of tenants) {
      if ((t.email && !t.email.startsWith('ENC:')) || (t.phone && !t.phone.startsWith('ENC:'))) {
        encTenant.run(encrypt(t.email), encrypt(t.phone), t.id);
      }
    }

    const vendors = db.prepare('SELECT id, email, phone FROM vendors').all();
    const encVendor = db.prepare('UPDATE vendors SET email = ?, phone = ? WHERE id = ?');
    for (const v of vendors) {
      if ((v.email && !v.email.startsWith('ENC:')) || (v.phone && !v.phone.startsWith('ENC:'))) {
        encVendor.run(encrypt(v.email), encrypt(v.phone), v.id);
      }
    }
    log.info('  PII fields encrypted');
  }
}

function runMigrationV4() {
  log.info('  Running migration v4: documents table + tenant autopay');
  const addCol = (table, col, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* already exists */ }
  };
  addCol('tenants', 'autopay', 'INTEGER DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

function runMigrationV5() {
  log.info('  Running migration v5: email templates + lease history');
  const addCol = (table, col, type) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* already exists */ }
  };
  addCol('tenants', 'leaseHistory', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

// ─── File management for document attachments ─────────────────────────────────

function getDocumentsDir() {
  const dir = path.join(userDataDir, 'documents');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyFileToDocuments(sourcePath) {
  const ext = path.extname(sourcePath);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const destPath = path.join(getDocumentsDir(), filename);
  fs.copyFileSync(sourcePath, destPath);
  const stats = fs.statSync(destPath);
  return { filename, size: stats.size };
}

function isSafeFilename(filename) {
  return typeof filename === 'string'
    && filename.length > 0
    && !filename.includes('/')
    && !filename.includes('\\')
    && !filename.includes('..');
}

function deleteDocumentFile(filename) {
  if (!isSafeFilename(filename)) {
    log.warn('Rejected unsafe document filename:', filename);
    return;
  }
  
  const documentsDir = getDocumentsDir();
  const filePath = path.join(documentsDir, filename);
  
  // Extra safety check against path traversal
  if (!filePath.startsWith(documentsDir)) {
    log.warn('Path traversal detected:', filename);
    return;
  }

  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    log.warn('Failed to delete document file:', err.message);
  }
}

function getDocumentPath(filename) {
  if (!isSafeFilename(filename)) {
    log.warn('Rejected unsafe document filename:', filename);
    return null;
  }
  return path.join(getDocumentsDir(), filename);
}

// ─── Create tables (fresh DB only — IF NOT EXISTS) ───────────────────────────

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, zip TEXT NOT NULL,
      propertyType TEXT, sqft INTEGER, amenities TEXT,
      purchasePrice REAL, purchaseDate TEXT,
      insuranceProvider TEXT, insurancePolicyNumber TEXT, insuranceExpiry TEXT,
      notes TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL, bedrooms INTEGER NOT NULL DEFAULT 0, bathrooms INTEGER NOT NULL DEFAULT 0,
      sqft INTEGER, monthlyRent REAL NOT NULL DEFAULT 0, deposit REAL,
      available INTEGER NOT NULL DEFAULT 1, notes TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      unitId TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL, email TEXT, phone TEXT,
      leaseStart TEXT NOT NULL, leaseEnd TEXT NOT NULL,
      monthlyRent REAL NOT NULL DEFAULT 0, deposit REAL,
      depositReturned REAL, depositDeductions TEXT,
      gracePeriodDays INTEGER, lateFeeAmount REAL,
      autopay INTEGER DEFAULT 0,
      moveInDate TEXT, moveOutDate TEXT, moveInNotes TEXT, moveOutNotes TEXT,
      notes TEXT, rentHistory TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unitId TEXT REFERENCES units(id) ON DELETE SET NULL,
      category TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL,
      description TEXT NOT NULL, recurring INTEGER DEFAULT 0,
      vendorId TEXT REFERENCES vendors(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      unitId TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      amount REAL NOT NULL DEFAULT 0, date TEXT NOT NULL,
      periodStart TEXT NOT NULL, periodEnd TEXT NOT NULL,
      method TEXT, notes TEXT, lateFee REAL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id TEXT PRIMARY KEY,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unitId TEXT REFERENCES units(id) ON DELETE SET NULL,
      tenantId TEXT REFERENCES tenants(id) ON DELETE SET NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open',
      category TEXT NOT NULL DEFAULT 'other',
      vendorId TEXT REFERENCES vendors(id) ON DELETE SET NULL,
      cost REAL, scheduledDate TEXT, recurrence TEXT, resolvedAt TEXT, notes TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL, entityId TEXT NOT NULL,
      note TEXT NOT NULL, date TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS communication_logs (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      propertyId TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      type TEXT NOT NULL, date TEXT NOT NULL, subject TEXT NOT NULL, notes TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, phone TEXT, email TEXT, specialty TEXT, notes TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

// ─── Row -> Object helpers (deserialization with decryption) ─────────────────

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

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
    email: decrypt(row.email) || undefined,
    phone: decrypt(row.phone) || undefined,
    autopay: !!row.autopay,
    rentHistory: safeJsonParse(row.rentHistory, undefined),
    leaseHistory: safeJsonParse(row.leaseHistory, undefined),
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
  return { ...row, notes: row.notes || undefined };
}

function rowToActivityLog(row) { return row; }

function rowToDocument(row) { return row; }

function rowToVendor(row) {
  return {
    ...row,
    phone: decrypt(row.phone) || undefined,
    email: decrypt(row.email) || undefined,
    specialty: row.specialty || undefined,
    notes: row.notes || undefined,
  };
}

const ROW_CONVERTERS = {
  properties: rowToProperty,
  units: rowToUnit,
  tenants: rowToTenant,
  expenses: rowToExpense,
  payments: rowToPayment,
  maintenance_requests: rowToMaintenanceRequest,
  activity_logs: rowToActivityLog,
  vendors: rowToVendor,
  communication_logs: rowToCommunicationLog,
  documents: rowToDocument,
  email_templates: (row) => row,
};

// JS key -> serializer key uses the SQL table name for maintenance_requests, activity_logs, communication_logs
function getSerializerKey(jsTable) {
  return TABLE_NAME_MAP[jsTable] || jsTable;
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
    documents: db.prepare('SELECT * FROM documents').all().map(rowToDocument),
    emailTemplates: db.prepare('SELECT * FROM email_templates').all(),
  };
}

// ─── Save all (full replace — used only for import/restore) ──────────────────

function replaceAll(state) {
  if (!state || typeof state !== 'object') {
    log.error('replaceAll: refusing to write — state is null or not an object');
    return;
  }

  const tableKeyMap = {
    properties: 'properties', units: 'units', tenants: 'tenants',
    expenses: 'expenses', payments: 'payments',
    maintenance_requests: 'maintenanceRequests',
    activity_logs: 'activityLogs', vendors: 'vendors',
    communication_logs: 'communicationLogs',
    documents: 'documents',
    email_templates: 'emailTemplates',
  };

  // Safety check: count total incoming records to prevent writing an empty/corrupt state
  // over a non-empty database (which would wipe all data)
  let incomingCount = 0;
  for (const jsKey of Object.values(tableKeyMap)) {
    const items = state[jsKey];
    if (Array.isArray(items)) incomingCount += items.length;
  }

  let existingCount = 0;
  for (const sqlTable of Object.keys(TABLE_COLUMNS)) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${sqlTable}`).get();
      existingCount += row.cnt;
    } catch { /* table may not exist yet */ }
  }

  if (incomingCount === 0 && existingCount > 0) {
    log.error(`replaceAll: refusing to write — incoming state is empty but database has ${existingCount} records. This would wipe all data.`);
    return;
  }

  const run = db.transaction(() => {
    db.pragma('foreign_keys = OFF');

    for (const sqlTable of Object.keys(TABLE_COLUMNS)) {
      db.prepare(`DELETE FROM ${sqlTable}`).run();
    }

    for (const [sqlTable, jsKey] of Object.entries(tableKeyMap)) {
      const items = state[jsKey] || [];
      const serialize = serializers[sqlTable] || serializers[jsKey];
      const stmt = _stmts[`upsert_${sqlTable}`];
      if (!serialize || !stmt) continue;
      for (const item of items) {
        stmt.run(serialize(item));
      }
    }

    db.pragma('foreign_keys = ON');
  });

  run();
}

// ─── Granular operations (incremental saves) ─────────────────────────────────

function executeBatch(operations) {
  const batch = db.transaction(() => {
    for (const op of operations) {
      const sqlTable = TABLE_NAME_MAP[op.table] || op.table;

      switch (op.type) {
        case 'upsert': {
          const serKey = getSerializerKey(op.table);
          const serialize = serializers[serKey] || serializers[op.table];
          const stmt = _stmts[`upsert_${sqlTable}`];
          if (serialize && stmt) {
            const items = Array.isArray(op.data) ? op.data : [op.data];
            for (const item of items) {
              stmt.run(serialize(item));
            }
          }
          break;
        }
        case 'delete': {
          const ids = Array.isArray(op.ids) ? op.ids : [op.ids];
          for (const id of ids) {
            _stmts[`delete_${sqlTable}`].run({ id });
          }
          break;
        }
        case 'deleteWhere': {
          const cols = TABLE_COLUMNS[sqlTable];
          if (!cols || !cols.includes(op.column)) {
            log.warn(`deleteWhere: invalid column "${op.column}" for table ${sqlTable}`);
            break;
          }
          db.prepare(`DELETE FROM ${sqlTable} WHERE "${op.column}" = ?`).run(op.value);
          break;
        }
        case 'clearField': {
          const tableCols = TABLE_COLUMNS[sqlTable];
          if (!tableCols || !tableCols.includes(op.field) || !tableCols.includes(op.where.column)) {
            log.warn(`clearField: invalid column for table ${sqlTable}`);
            break;
          }
          const hasUpdatedAt = tableCols.includes('updatedAt');
          if (hasUpdatedAt) {
            const now = new Date().toISOString().slice(0, 10);
            db.prepare(`UPDATE ${sqlTable} SET "${op.field}" = NULL, updatedAt = ? WHERE "${op.where.column}" = ?`).run(now, op.where.value);
          } else {
            db.prepare(`UPDATE ${sqlTable} SET "${op.field}" = NULL WHERE "${op.where.column}" = ?`).run(op.where.value);
          }
          break;
        }
      }
    }
  });

  batch();
}

// ─── Close ───────────────────────────────────────────────────────────────────

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, loadAll, replaceAll, executeBatch, closeDatabase, copyFileToDocuments, deleteDocumentFile, getDocumentPath, getEncryptionKeyError };
