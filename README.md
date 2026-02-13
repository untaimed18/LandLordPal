# LandLord Pal

A full-featured landlord app to track properties, units, tenants, rent payments, and expenses—with **auto-calculated** metrics.

## Features

- **Dashboard** – Expected monthly rent, collected this month, expenses, net cash flow, occupancy, and YTD income/expenses (all auto-calculated).
- **Properties** – Add and manage properties with address and notes.
- **Property detail** – Per-property view with:
  - **Units** – Add units (beds, baths, monthly rent, availability).
  - **Tenants** – Assign tenants to units with lease dates and rent.
  - **Record payments** – Log rent payments (amount, date, method); amounts feed into “collected this month” and YTD income.
  - **Expenses** – View expenses for this property (added from the Expenses page).
- **Expenses** – Add expenses by property and category (mortgage, insurance, taxes, utilities, maintenance, repairs, management, legal, other). This month and YTD expense totals are auto-calculated.

All data is stored in your browser (localStorage). No server or account required.

## Run the app

Requires [Node.js](https://nodejs.org). Then:

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (e.g. http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

## Tech stack

- React 18 + TypeScript
- Vite
- React Router
- Local state + localStorage persistence
