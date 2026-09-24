# Firefly Ledger PWA

A **Progressive Web App** for registering, viewing, and managing transactions on **Firefly III** — entirely client-side, with full offline support and multi-currency capabilities.

> 🚀 **Try it live:** [https://mcardielo.github.io/fireflyiii-pwa/](https://mcardielo.github.io/fireflyiii-pwa/)

## What is this?

Firefly Ledger is a **PWA (Progressive Web App)** that runs entirely in your browser. Everything stays on your device:

- **Your data never leaves your control**: credentials, the transaction queue and caches are stored locally in your browser's **IndexedDB**, never uploaded to any third-party server.
- **Fully offline**: the app caches itself via Service Worker, so it works without internet. Transactions you create while offline are queued and automatically synced when connectivity is restored.
- **No backend needed**: the app communicates directly with your **own** Firefly III instance through its REST API. There is no intermediary server, no cloud, no middleman.
- **Quick Entry**: configure which fields are visible when recording expenses (withdrawals), so you can log transactions with just the essentials. Hidden fields are filled automatically with default values.

## Features

- **Transaction Recording** — withdrawals, deposits and transfers, with configurable fields (Quick Entry) for fast expense logging.
- **Multi-Currency** — real-time exchange rate display as you type (Frankfurter API).
- **Accounts & Balances** — browse your asset and liability accounts (loans, debts, mortgages) with current balances and direction.
- **Transaction History** — browse with filters by type, expense account and free-text search; edit, duplicate and delete transactions.
- **Stuck Queue** — review, edit or discard transactions that failed to sync (e.g. server down).
- **Security & Privacy** — optional **biometric authentication** (Face ID / fingerprint via WebAuthn) and **PIN code** to protect the Accounts, History and Config tabs.
- **GPS Location** — optional location capture on transactions, with a map preview in the transaction detail.
- **Offline-First** — Service Worker caches all static assets on first visit.
- **Background Sync** — queues transactions when offline or when the Firefly III server is unreachable.
- **Dark Mode** — light / dark / system theme with instant toggle.
- **Multi-Language** — English and Spanish built-in.
- **Calculator** — inline modal calculator for amounts.

## Requirements

- A **Firefly III** instance with REST API access.
- A **Personal Access Token (PAT)** generated from your Firefly III profile page.
- A modern browser (Chrome, Firefox, Safari, Edge).

> 🔒 The app uses the Web Crypto API for PIN hashing, so it must run in a **secure context** (HTTPS or `localhost`).

## Getting Started

1. **Open the app** — visit the live demo or serve the files locally.
2. **Configure** — enter your Firefly III URL and Personal Access Token.
3. **Select a default account** — pick an Asset account to pre-fill when recording transactions.
4. **Start transacting** — record withdrawals, deposits, and transfers. Everything works offline.
5. **Browse your history** — tap the History tab to see all transactions, or tap Accounts to explore per-account.

### Run Locally

```bash
npx http-server -o
```

Or open the project in VS Code and use "Open with Live Server".

## Privacy & Data

- **No third-party servers.** The app connects exclusively to your Firefly III instance.
- **All data stays local.** Credentials, transaction queue, and account cache are stored in your browser's **IndexedDB**.
- **No analytics, no tracking.** Zero telemetry. Zero cookies from the app itself.
- **Exchange rates** are fetched from the public Frankfurter API only when needed (no personal data sent).

## License

MIT
