# Firefly Ledger PWA

A **Progressive Web App** for registering, viewing, and managing transactions on **Firefly III** — entirely client-side, with full offline support and multi-currency capabilities.

> 🚀 **Try it live:** [https://mcardielo.github.io/fireflyiii-pwa/](https://mcardielo.github.io/fireflyiii-pwa/)

## What is this?

Firefly Ledger is a **PWA (Progressive Web App)** that runs entirely in your browser. Everything stays on your device:

- **Your data never leaves your control**: all credentials and transactions are stored locally in your browser's `localStorage`, never uploaded to any third-party server.
- **Fully offline**: the app caches itself via Service Worker, so it works without internet. Transactions you create while offline are queued and automatically synced when connectivity is restored.
- **No backend needed**: the app communicates directly with your **own** Firefly III instance through its REST API. There is no intermediary server, no cloud, no middleman.
- **Quick Entry**: configure which fields are visible when recording expenses (withdrawals), so you can log transactions with just the essentials. Hidden fields are filled automatically with default values.

## Features

- Transaction Recording (withdrawal, deposit and transfers): configurable fields in order to allow a quick record of withdrawals.
- Multi-Currency: Real-time exchange rate display as you type.
- Accounts & Balances: Browse your accounts with current balances.
- Transactions History: Edit unreconciled single transactions directly from the history list.
- Security & Privacy: Optional **biometric authentication** (Face ID / fingerprint via WebAuthn) and **PIN code** to protect the Accounts and History tabs.
- Offline-First: Service Worker caches all static assets on first visit.
- Background Sync: queues transactions when offline or when the Firefly III server is unreachable.
- Multi-Language: English and Spanish built-in.

## Requirements

- A **Firefly III** instance with REST API access.
- A **Personal Access Token (PAT)** generated from your Firefly III profile page.
- A modern browser (Chrome, Firefox, Safari, Edge).

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
- **All data stays local.** Credentials, transaction queue, and account cache are stored in your browser's `localStorage`.
- **No analytics, no tracking.** Zero telemetry. Zero cookies from the app itself.
- **Exchange rates** are fetched from the public Frankfurter API only when needed (no personal data sent).

## License

MIT
