# Changelog

All notable changes to Orderly will be documented in this file.

## [0.2.0] — 2026-02-26

### Added
- Mobile-friendly responsive UI across all pages
- Collapsible sidebar with hamburger menu on mobile (<768px)
- Fixed top bar with "Orderly" branding on mobile
- Backdrop overlay when mobile sidebar is open

### Changed
- Sidebar slides in/out as overlay on mobile; unchanged on desktop
- Orders table hides Platform and Date columns on small screens
- Dashboard recent-orders table hides Date column on small screens
- Order detail panel uses tighter padding on mobile
- Settings connection-status cards stack vertically on mobile
- Nav links auto-close the sidebar on mobile

## [0.1.0] — 2026-02-26

### Added
- Initial project scaffold
- React 18 + Vite + Tailwind frontend with retro dark theme
- Express + TypeScript backend with PostgreSQL
- Animated particle background (cyan, three-layer depth effect)
- Sidebar layout with navigation: Dashboard, Orders, Shipping, Settings
- Login page with auth context and protected routes
- Placeholder pages for all sections
- Order status badge system (pending, unfulfilled, shipped, delivered, cancelled)
- Retro pixel-art clipboard favicon (SVG)
- API client service with token-based auth
- Health check endpoint
- Auth route stubs with Zod validation
- Docker setup: multi-stage builds for client (nginx) and server (node)
- `docker-compose.yml` with PostgreSQL 16, API, and client services
- GitHub Actions workflow for building and publishing images to ghcr.io
- JetBrains Mono font throughout
- Glow effects, pixel borders, and custom scrollbar styling
