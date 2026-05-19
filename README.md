# Firefly Ledger PWA

A **Progressive Web App** for registering, viewing, and managing transactions on **Firefly III** — entirely client-side, with full offline support and multi-currency capabilities.

> 🚀 **Try it live:** [https://mcardielo.github.io/fireflyiii-pwa/](https://mcardielo.github.io/fireflyiii-pwa/)

## What is this?

Firefly Ledger is a **PWA (Progressive Web App)** that runs entirely in your browser. Everything stays on your device:

- **Your data never leaves your control** — all credentials and transactions are stored locally in your browser's `localStorage`, never uploaded to any third-party server.
- **Fully offline** — the app caches itself via Service Worker, so it works without internet. Transactions you create while offline are queued and automatically synced when connectivity is restored.
- **No backend needed** — the app communicates directly with your **own** Firefly III instance through its REST API. There is no intermediary server, no cloud, no middleman.

## Features

### Transaction Recording
- Supports all three Firefly III transaction types: **Withdrawal**, **Deposit**, and **Transfer**.
- Smart contextual autocomplete — filters accounts based on transaction type (Asset for withdrawals/transfers, Revenue for deposits, Expense for withdrawals).
- Create new non-Asset accounts on the fly directly from the form.

### Multi-Currency
- Automatic exchange rate conversion using the Frankfurter API.
- Transfers between accounts with different currencies calculate the destination amount automatically.
- Real-time exchange rate display as you type.

### Accounts & Balances
- Browse all your **Asset accounts** with current balances, currency codes, and colored role badges (Checking, Savings, Credit Card, Cash, Shared).
- **Transaction history** per account — tap any account to see its last 50 transactions.
- Pagination: "Load 50 more" to scroll through older entries.
- Filters out future-dated transactions automatically.

### Offline-First
- Service Worker caches all static assets on first visit — the app loads instantly even without internet.
- Background Sync queues transactions when offline or when the Firefly III server is unreachable.
- Automatic health checks re-sync pending transactions as soon as the server is back.

### Multi-Language
- English and Spanish built-in.
- Switch languages on the fly with the EN/ES button in the nav bar — no reload needed.

### iOS-Style Design
- Native-feeling iOS interface with blurred nav bars, segmented controls, sticky footers, and a bottom tab bar.
- Installable on your home screen (iOS / Android / Desktop) like a native app.

## Requirements

- A **Firefly III** instance with REST API access.
- A **Personal Access Token (PAT)** generated from your Firefly III profile page.
- A modern browser (Chrome, Firefox, Safari, Edge).

## Getting Started

1. **Open the app** — visit the live demo or serve the files locally.
2. **Configure** — enter your Firefly III URL and Personal Access Token.
3. **Select a default account** — pick an Asset account to pre-fill when recording transactions.
4. **Start transacting** — record withdrawals, deposits, and transfers. Everything works offline.

### Run Locally

```bash
npx http-server -o
```

Or open the project in VS Code and use "Open with Live Server".

## Privacy & Data

- **No third-party servers.** The app connects exclusively to your Firefly III instance.
- **All data stays local.** Credentials, transaction queue, and account cache are stored in your browser's `localStorage`.
- **No analytics, no tracking.** Zero telemetry. Zero cookies from the app itself.
- **Exchange rates** are fetched from the public Frankfurter API only when needed (no personal data sent).

## License

MIT
