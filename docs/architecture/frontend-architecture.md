# Frontend Architecture

The frontend SPA (`apps/web`) is built with React 18, TypeScript, Vite, Tailwind CSS, React Router v6, TanStack Query, and Zustand.

---

## 1. Directory & Module Organization

```text
apps/web/src/
├── App.tsx                 # Route table, React.lazy code splitting, ErrorBoundary & auth bootstrap
├── assets/                 # DataSense wordmark and squircle mark images
├── components/
│   ├── ai/                 # ConversationSidebar, MessageBubble, SqlDraftCard, PrivacyDisclosureModal
│   ├── agents/             # AgentWorkflowGraph (SVG DAG), AgentTimeline, ApprovalPanel, ReportViewer, VisualizationGallery
│   ├── analytics/          # DataExplorerPanel, SqlEditorPanel (CodeMirror), QueryResultsTable, QueryChartViewer
│   ├── auth/               # ProtectedRoute, LoginWorkspaceIllustration
│   ├── common/             # BrandLogo, EmptyState, ErrorBoundary, HelpModal, OnboardingGuide
│   ├── datasets/           # UploadDatasetModal, UploadVersionModal
│   └── ui/                 # Design-system Button, Modal, Drawer, StatCard, StatusBadge, Table, Tabs, Toast
├── layouts/AppLayout.tsx   # Collapsible sidebar navigation, breadcrumbs, workspace switcher, health pill
├── pages/                  # Domain route containers
├── services/api.ts         # Centralized fetch wrapper with automatic token refresh & CSRF headers
├── stores/authStore.ts     # Zustand store keeping JWT access_token strictly in memory
└── styles/                 # tokens.css (--ds-* palette/spacing) & globals.css
```

---

## 2. Authentication & State Management

- **In-Memory JWT Security**: `useAuthStore` stores `access_token` solely in memory—never persisting JWTs to `localStorage` or `sessionStorage`.
- **Silent Session Bootstrap**: `App.tsx` executes `initAuth()` on load, posting to `/api/v1/auth/refresh` (with HttpOnly cookie) to recover user state cleanly after browser reloads.
- **Request Queue on 401**: `services/api.ts` intercepts expired `401` responses, shares a single in-flight `/auth/refresh` promise to avoid stampedes, and redirects cleanly to `/login?expired=1` if the refresh session is invalid.

---

## 3. Performance & Bundle Splitting

Configured in [`apps/web/vite.config.ts`](../../apps/web/vite.config.ts):
- All page routes use `React.lazy()` + `<Suspense>`.
- Rollup `manualChunks` isolate `vendor-react`, `vendor-query`, `vendor-codemirror`, and `vendor-charts` (`recharts`), preventing heavy editor and charting libraries from loading on `/login` or initial entry navigation.

---

## 4. Enterprise Light Design System (`tokens.css`)

- Palette anchored on `#F5F7FA` app background, `#FFFFFF` primary card surfaces, `#172033` charcoal text, `#356AE6` cobalt primary accent, and `#159A95` analytical teal accent.
- Specialized `#0F172A` dark slate surfaces reserved cleanly for SQL editors and code viewers.
- Respects `prefers-reduced-motion` and provides `@media print` rules hiding chrome when printing BI reports.
