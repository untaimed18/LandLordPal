# LandLord Pal

A full-featured desktop property management app for landlords. Track properties, units, tenants, rent payments, expenses, maintenance, vendors, and more — with auto-calculated financial metrics, analytics, and a clean, modern UI.

All data is stored securely on your device using SQLite with AES-256-GCM encryption for sensitive fields. No server, no account, no subscription.

## Features

### Dashboard
- Portfolio overview: expected rent, collected this month, expenses, net cash flow, occupancy rate, YTD profit
- 6-month income vs. expense trend chart
- Financial forecast with projected annual NOI and collection pace tracking
- Quick action buttons for common tasks
- Late rent alerts with grace period and late fee tracking
- Lease expiration warnings (configurable lookahead)
- Open and scheduled maintenance notifications with direct links

### Properties & Units
- Add properties with address, state, ZIP, purchase price, down payment, closing costs, and notes
- Per-property detail page with units, tenants, payments, and activity logs
- Units with bedrooms, bathrooms, square footage, monthly rent, and deposit
- Property comparison analytics

### Tenants
- Assign tenants to units with lease dates, rent amount, and contact info
- Screening and application tracking (available during tenant creation and editing)
- Lease date validation and overlapping lease detection
- Lease renewal workflow with quick rent increase buttons (3%, 5%, custom)
- Move-out process with inspection checklist
- Rent increase history — automatically tracked when rent is changed
- Per-tenant payment history and statement PDF export
- Phone number auto-formatting

### Rent & Payments
- Monthly rent roll showing who has paid and who hasn't
- Record payments with amount, date, method, and period
- Duplicate payment detection with confirmation prompt
- Late fee tracking with configurable grace periods

### Expenses
- Track expenses by property, category, and vendor
- Recurring expense support with automatic generation for missed months
- Vendor linking — see which vendor each expense is associated with
- Sortable columns, pagination, and CSV export

### Maintenance
- Create requests with priority (low/medium/high/emergency), category, and status tracking
- Assign vendors to requests with category-based auto-suggestion
- **Detail page** with:
  - Visual status timeline (created, status changes, vendor assignments)
  - Status action buttons (Start Work, Mark Complete, Reopen)
  - Estimated vs. actual cost tracking
  - Inline photo attachments with thumbnail previews, captions, before/after labels, and a full-size lightbox
  - Document attachments
  - Work order PDF generation
  - Linked property, unit, tenant, and vendor information
- Filter by status, property, and vendor
- Pagination for large lists

### Vendors
- Manage contractors and service providers with specialty, contact info, and notes
- **Detail page** with:
  - Performance metrics: total/completed/open jobs, completion rate, average response and completion times, total spend, average cost per job
  - Performance rating (A–F letter grade)
  - Job history table with links to maintenance detail pages
  - Linked expenses table
- Performance rating badges on vendor cards

### Reports & Analytics
- Income vs. expense breakdown by month
- Rent roll report by month
- Tax summary with deductible expense categories
- Cash-on-Cash Return calculation using total cash invested (down payment + closing costs)
- Property comparison with occupancy rates and expected annual income
- CSV export for all report types
- Print / Save as PDF

### Calendar
- Monthly calendar view with color-coded events
- Rent due dates, lease start/end, maintenance, and recurring expenses
- Upcoming events list (next 30 days)

### Documents
- Attach documents to properties, tenants, and maintenance requests
- Supported formats: PDF, Word, Excel, CSV, images, and more
- Open files directly from the app

### Communication
- Communication log per tenant
- Email templates for common landlord communications

### Settings
- Light/dark theme toggle
- Configurable notification thresholds (lease warning, insurance warning, maintenance lookahead, grace period, rent reminder)
- Move-in requirements (security deposit, first/last month's rent, default deposit amount)
- Auto-backup on launch with 30-backup retention policy
- Anonymous error reporting toggle (opt-out)
- Manual backup, JSON export/import
- Data summary with record counts
- App version display with update checker

### Security & Reliability
- AES-256-GCM encryption for sensitive tenant and vendor PII (email, phone)
- Encryption key stored in Windows Credential Manager (via keytar) with file-based fallback
- Serialized save queue with automatic retry to prevent race conditions
- Process-level crash handlers with graceful database shutdown
- DevTools blocked in production builds
- Content Security Policy headers
- Navigation and new-window restrictions
- Sentry error reporting (opt-out via Settings)
- Error boundary with crash recovery UI

### Additional Features
- Global search (Ctrl+K) across properties, units, tenants, vendors, and maintenance
- Styled confirmation dialogs for all destructive actions
- Undo for deletions (via toast notification with undo button)
- Auto-update system via GitHub Releases
- Accessibility: ARIA labels, keyboard navigation, skip-to-content link, focus management

## Download

Download the latest Windows installer from the [Releases](https://github.com/untaimed18/LandLordPal/releases) page.

After installing, the app will automatically check for updates on launch.

## Development

Requires [Node.js](https://nodejs.org) 18+.

```bash
# Install dependencies
npm install

# Start dev server (browser only, no Electron APIs)
npm run dev

# Run in Electron (dev)
npm run electron:dev
```

## Build

```bash
# Windows installer (produces .exe in dist-electron/)
npm run electron:build
```

## Publishing an Update

1. Bump `version` in `package.json`
2. Run `npm run electron:build`
3. Create a new [GitHub Release](https://github.com/untaimed18/LandLordPal/releases/new) with a matching version tag (e.g. `v1.3.8`)
4. Upload the `.exe` installer and `latest.yml` from `dist-electron/`

Installed apps will detect the new release automatically on next launch.

## Tech Stack

- React 18 + TypeScript
- Vite
- React Router (HashRouter)
- Lucide React icons
- Zod (form validation)
- jsPDF + jspdf-autotable (PDF generation)
- Electron + electron-builder (Windows packaging)
- better-sqlite3 (SQLite with incremental saves, foreign keys, WAL mode)
- electron-updater (auto-updates via GitHub Releases)
- keytar (OS credential store for encryption keys)
- @sentry/electron (error reporting)
