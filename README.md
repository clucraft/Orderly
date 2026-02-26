<p align="center">
  <img src="client/public/favicon.svg" width="80" height="80" alt="Orderly">
</p>

<h1 align="center">Orderly</h1>

<p align="center">
  <code>═══════════════════════════════════════</code><br>
  <b>Unified E-Commerce Order Management</b><br>
  <code>═══════════════════════════════════════</code>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-18-06b6d4?style=flat-square&logo=react&logoColor=white" alt="React 18">
  <img src="https://img.shields.io/badge/express-4-06b6d4?style=flat-square&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/typescript-5-06b6d4?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/postgres-16-06b6d4?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/docker-ready-06b6d4?style=flat-square&logo=docker&logoColor=white" alt="Docker">
</p>

---

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   ░█▀█░█▀▄░█▀▄░█▀▀░█▀▄░█░░░█░█                     │
│   ░█░█░█▀▄░█░█░█▀▀░█▀▄░█░░░░█░                     │
│   ░▀▀▀░▀░▀░▀▀░░▀▀▀░▀░▀░▀▀▀░░▀░                     │
│                                                      │
│   Manage Shopify & Etsy from one dashboard.          │
│   Dark retro theme. Particle background.             │
│   Built for speed.                                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## `> FEATURES`

```
[■] Unified dashboard — all orders, one screen
[■] Multi-platform — Shopify + Etsy support
[■] Shipping labels & packing slips
[■] Retro dark UI with animated particle background
[ ] Store integrations (coming soon)
[ ] Batch shipping (coming soon)
[ ] Analytics (coming soon)
```

## `> QUICK START`

```bash
# Clone
git clone https://github.com/clucraft/Orderly.git
cd Orderly

# Run with Docker
cp .env.example .env
docker compose up --build

# ─── OR run locally ───

# Client (port 5173)
cd client && npm install && npm run dev

# Server (port 3001)
cd server && npm install && npm run dev
```

## `> PROJECT STRUCTURE`

```
Orderly/
├── client/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/     # Layout, ParticleBackground, ProtectedRoute
│   │   ├── contexts/       # AuthContext
│   │   ├── pages/          # Dashboard, Orders, Shipping, Settings, Login
│   │   ├── services/       # API client
│   │   └── types/          # TypeScript interfaces
│   ├── Dockerfile          # Multi-stage nginx build
│   └── nginx.conf          # SPA + API proxy
├── server/                 # Express + TypeScript
│   ├── src/
│   │   ├── routes/         # health, auth
│   │   └── middleware/     # auth guard
│   ├── Dockerfile          # Multi-stage node build
│   └── package.json
├── docker-compose.yml      # db + api + client
└── .env.example
```

## `> TECH STACK`

```
╔══════════════╦═══════════════════════════════╗
║  Frontend    ║  React 18 · Vite · Tailwind   ║
║  Backend     ║  Express · TypeScript · Zod    ║
║  Database    ║  PostgreSQL 16                 ║
║  Font        ║  JetBrains Mono               ║
║  Icons       ║  Lucide React                 ║
║  Deploy      ║  Docker · ghcr.io/clucraft    ║
╚══════════════╩═══════════════════════════════╝
```

## `> THEME`

Retro dark palette with cyan accents and animated floating particles.

```
  Surface 900  ██████  #121214   Main background
  Surface 800  ██████  #1a1a1e   Cards & panels
  Surface 700  ██████  #222226   Hover states
  Surface 600  ██████  #2a2a30   Borders
  Primary 500  ██████  #06b6d4   Cyan accent
  Primary 400  ██████  #22d3ee   Light cyan
  Primary 300  ██████  #67e8f9   Particle glow
```

Order status badges:

```
  ● Pending      ██  zinc
  ● Unfulfilled  ██  amber
  ● Shipped      ██  cyan
  ● Delivered    ██  green
  ● Cancelled    ██  red
```

## `> ENV VARIABLES`

```bash
POSTGRES_USER=orderly
POSTGRES_PASSWORD=changeme
POSTGRES_DB=orderly
DATABASE_URL=postgresql://orderly:changeme@db:5432/orderly
JWT_SECRET=change-this-to-a-random-secret
PORT=3001
```

---

<p align="center">
  <code>[ clucraft ] ── built with ░▒▓ pixel precision ▓▒░</code>
</p>
