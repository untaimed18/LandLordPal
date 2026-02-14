# LandLord Pal

A full-featured property management app for landlords. Track properties, units, tenants, rent payments, expenses, maintenance, and more -- with auto-calculated financial metrics and a clean, modern UI.

All data is stored locally on your device. No server, no account, no subscription.

## Features

### Dashboard
- Portfolio overview with expected rent, collected this month, expenses, net cash flow, occupancy rate, and YTD profit
- Quick action buttons for common tasks
- Late rent alerts with grace period and late fee tracking
- Lease expiration warnings (90-day lookahead)
- Open maintenance request summary

### Properties & Units
- Add properties with address, state (dropdown), ZIP (validated), purchase price (auto-formatted), and notes
- Per-property detail page with units, tenants, payments, and activity logs
- Units with bedrooms, bathrooms, square footage, monthly rent, and deposit

### Tenants
- Assign tenants to units with lease dates, rent amount, and contact info
- Lease date validation (end must be after start)
- Overlapping lease detection -- prevents double-booking a unit
- Phone number auto-formatting
- Rent increase history -- automatically tracked when rent is changed
- Per-tenant payment history modal

### Rent & Payments
- Monthly rent roll showing who has paid and who hasn't
- Record payments with amount, date, method, and period
- Duplicate payment detection with confirmation prompt
- Late fee tracking with configurable grace periods

### Expenses
- Track expenses by property and category (mortgage, insurance, taxes, utilities, maintenance, repairs, management, legal, other)
- Recurring expense support with automatic generation for missed months
- Sortable table columns
- Pagination for large lists
- CSV export

### Maintenance
- Create requests with priority (low/medium/high/emergency), category, and status tracking
- Assign vendors to requests
- Track resolution and cost
- Pagination for large lists

### Reports
- Income vs. expense breakdown by month
- Rent roll report
- Tax summary with deductible expense categories
- CSV export for all report types
- Print / Save as PDF

### Calendar
- Monthly calendar view with color-coded events
- Rent due dates, lease start/end, maintenance, and recurring expenses
- Upcoming events list (next 30 days)

### Vendors
- Manage contractors and service providers
- Track specialty, contact info, job count, and total spend

### Settings
- Light/dark theme toggle
- Data summary with record counts
- JSON backup and restore
- App version display

### Additional Features
- Global search (Ctrl+K) across properties, units, tenants, vendors, and maintenance
- Styled confirmation dialogs for all destructive actions
- Undo for deletions (via toast notification with undo button)
- Error boundary with crash recovery
- Auto-update system via GitHub Releases

## Download

Download the latest Windows installer from the [Releases](https://github.com/untaimed18/LandLordPal/releases) page.

After installing, the app will automatically check for updates on launch.

## Development

Requires [Node.js](https://nodejs.org) 18+.

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run in Electron (dev)
npm run electron:dev
```

## Build

```bash
# Web production build
npm run build

# Windows installer (produces .exe in dist-electron/)
npm run electron:build
```

## Publishing an Update

1. Bump `version` in `package.json`
2. Run `npm run electron:build`
3. Create a new [GitHub Release](https://github.com/untaimed18/LandLordPal/releases/new) with a matching version tag (e.g. `v1.2.0`)
4. Upload the `.exe` installer and `latest.yml` from `dist-electron/`

Installed apps will detect the new release automatically on next launch.

## Tech Stack

- React 18 + TypeScript
- Vite
- React Router (HashRouter)
- Lucide React icons
- Local state with localStorage persistence
- Electron + electron-builder (Windows packaging)
- electron-updater (auto-updates via GitHub Releases)
