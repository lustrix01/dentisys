# DentiSys — Dental Academic Management System

> **A web-based academic management platform for the Bicol University College of Dental Medicine (BU-CDM)**

[![Status](https://img.shields.io/badge/Status-Frontend%20Complete-brightgreen)](#11-project-status)
[![React](https://img.shields.io/badge/React-19-blue)](#3-technology-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)](#3-technology-stack)
[![Vite](https://img.shields.io/badge/Vite-8-purple)](#3-technology-stack)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-teal)](#3-technology-stack)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Objectives](#2-system-objectives)
3. [Technology Stack](#3-technology-stack)
4. [Features Implemented (Frontend)](#4-features-implemented-frontend)
5. [User Roles & Functionalities](#5-user-roles--functionalities)
6. [Project Structure](#6-project-structure)
7. [Installation & Setup](#7-installation--setup)
8. [Running the Project Locally](#8-running-the-project-locally)
9. [Environment Requirements](#9-environment-requirements)
10. [Demo Credentials](#10-demo-credentials)
11. [Project Status](#11-project-status)
12. [Features Requiring Backend Integration](#12-features-requiring-backend-integration)
13. [Planned Backend Architecture](#13-planned-backend-architecture)
14. [Security Features to Implement](#14-security-features-to-implement)
15. [Coding Conventions & Best Practices](#15-coding-conventions--best-practices)
16. [Known Limitations](#16-known-limitations)
17. [Future Improvements](#17-future-improvements)
18. [Dependencies & Useful Commands](#18-dependencies--useful-commands)
19. [Notes for Developers](#19-notes-for-developers)

---

## 1. Project Overview

**DentiSys** is a role-based academic management system built specifically for the **Bicol University College of Dental Medicine (BU-CDM)**. It centralizes academic operations such as grade management, student monitoring, attendance tracking (including facial-recognition-ready workflows), retention status evaluation, and reporting — all under a single, intuitive web interface.

The frontend is built as a **Single Page Application (SPA)** using React + TypeScript + Vite, and currently runs entirely on mock/in-memory data managed through React Context. The system is designed to be connected to a real REST or GraphQL backend once it is developed.

---

## 2. System Objectives

- Provide a **unified digital platform** for managing dental student records, grades, and attendance.
- Support the **retention policy** of BU-CDM by automatically flagging students whose academic performance falls below defined thresholds.
- Enable **role-based access control** so that the Dean, Faculty, and Class Secretary each see only the tools relevant to their role.
- Lay the groundwork for **facial recognition–assisted attendance** tracking in clinical environments.
- Generate **printable academic reports** for administrative and accreditation purposes.
- Implement the Philippine **1.0–5.0 GWA grading scale** with proper weighted average computation.

---

## 3. Technology Stack

| Category | Technology | Version |
|---|---|---|
| UI Framework | React | ^19.2.6 |
| Language | TypeScript | ~6.0.2 |
| Build Tool | Vite | ^8.0.12 |
| Styling | TailwindCSS | ^3.4.19 |
| Routing | React Router DOM | ^7.18.0 |
| Charts | Recharts | ^3.8.1 |
| Icons | Lucide React | ^1.21.0 |
| Animations | canvas-confetti | ^1.9.4 |
| Fonts | Google Fonts (Inter, Outfit) | — |
| Linting | ESLint + typescript-eslint | ^10.x / ^8.x |
| CSS Processing | PostCSS + Autoprefixer | ^8.x / ^10.x |

### Design System

The color palette is derived from the **BU-CDM logo**:

| Token | Hex | Usage |
|---|---|---|
| `clinical` | `#43A047` (Bright Green) | Primary brand color, faculty UI |
| `accent` | `#9B72CF` (Lavender/Purple) | Dean/admin UI accents |
| `sage` | `#7CB518` (Sage Green) | Secondary accents |

Typography: **Inter** for body text, **Outfit** for headings. Dark mode is supported via the `class` strategy in Tailwind.

---

## 4. Features Implemented (Frontend)

### Authentication
- [x] Login page with role-based credential validation (mock)
- [x] Forgot Password page (UI only — email flow not wired to backend)
- [x] Reset Password page (UI only — token flow not wired to backend)
- [x] Route protection: unauthenticated users redirected to `/login`
- [x] Role-based route guarding (Faculty routes inaccessible to Admin/Secretary and vice versa)

### Faculty Features
- [x] Faculty Dashboard with KPI cards (total students, avg GWA, attendance rate, critical count)
- [x] Student Management — full CRUD (add, edit, delete), search, and filter
- [x] Face enrollment workflow UI (scaffolded for facial recognition integration)
- [x] Grade Computation — per-subject grade entry with configurable weights (Quizzes, Exams, Practicum, Attendance)
- [x] Assessment management — create, edit, archive, delete assessments; enter scores per student
- [x] Remedial Exam tracking — schedule, record scores, auto-compute capped remedial grade
- [x] Retention Monitoring — automatic status flagging: Active / Warning / Critical / Remedial
- [x] Attendance Monitoring — per-subject per-date records; audit trail for every override
- [x] Reports — printable summaries of students, grades, and attendance

### Dean / Admin Features
- [x] Dean Dashboard with institution-wide statistics and Recharts visualizations
- [x] Retention Criteria configuration (threshold, grade weight distribution)
- [x] System-wide Reports (student list, academic summary, retention overview, attendance summary) with print support

### Class Secretary Features
- [x] Secretary Dashboard with quick stats for assigned class
- [x] Attendance List — view attendance for assigned class by date
- [x] Manual Attendance Override — change status with mandatory reason; full audit trail
- [x] CCTV Feed placeholder — mock UI for camera monitoring integration

### Shared Features
- [x] Profile page — view and edit user profile info
- [x] Settings page — dark/light mode toggle; grade weights and retention threshold configuration
- [x] Responsive sidebar navigation with collapsible behavior and mobile hamburger menu
- [x] Dark mode (class-based, persisted via `localStorage`)
- [x] Notification bell (UI shell — no live data yet)

---

## 5. User Roles & Functionalities

### 5.1 Faculty (`role: 'faculty'`)

Intended for dental instructors and clinical supervisors.

| Route | Page |
|---|---|
| `/` | Faculty Dashboard |
| `/students` | Student Management |
| `/grades` | Grade Computation |
| `/retention` | Retention Monitoring |
| `/attendance` | Attendance Monitoring |
| `/reports` | Faculty Reports |
| `/profile` | User Profile |
| `/settings` | System Settings |

**Key Capabilities:**
- Manage student records for assigned classes and subjects.
- Input grade components — the system auto-computes GWA on the Philippine 1.0–5.0 scale.
- Create assessments and enter per-student scores.
- Schedule and record remedial exams for at-risk students.
- View and filter attendance; all overrides are logged in an audit trail.
- Generate printable reports per class or subject.

---

### 5.2 Dean / Admin (`role: 'admin'`)

Intended for the Office of the Dean and administrative staff.

| Route | Page |
|---|---|
| `/` | Dean Dashboard |
| `/admin/retention-criteria` | Retention Criteria Settings |
| `/admin/reports` | System-Wide Reports |
| `/profile` | User Profile |
| `/settings` | System Settings |

**Key Capabilities:**
- View institution-wide academic performance statistics with charts.
- Configure the retention threshold (default: 2.5 GWA) and grading weight distribution.
- Access and print consolidated reports covering all students, subjects, retention flags, and attendance.

---

### 5.3 Class Secretary (`role: 'secretary'`)

Intended for students appointed as class representatives responsible for logging attendance.

| Route | Page |
|---|---|
| `/` | Secretary Dashboard |
| `/secretary/attendance` | Attendance List |
| `/secretary/override` | Manual Attendance Override |
| `/secretary/cctv` | CCTV Feed (Placeholder) |
| `/profile` | User Profile |
| `/settings` | System Settings |

**Key Capabilities:**
- View attendance list for their assigned class for any given date.
- Submit manual attendance override requests with a mandatory reason.
- Access a CCTV camera feed placeholder (pending real integration).

---

## 6. Project Structure

```
dentisys_front/
├── public/
│   └── bu-cdm-logo.png             # BU-CDM logo (favicon + login page)
├── src/
│   ├── assets/                     # Static assets (images, SVGs)
│   ├── components/                 # Reusable UI components
│   │   ├── Card.tsx                # Card container (CardHeader, CardTitle, CardContent)
│   │   ├── Layout.tsx              # App shell — sidebar, topbar, navigation
│   │   └── Modal.tsx               # Generic modal/dialog component
│   ├── context/
│   │   └── AppContext.tsx          # Global state (students, attendance, grades, settings)
│   ├── pages/
│   │   ├── admin/                  # Dean-specific pages
│   │   │   ├── Dashboard.tsx
│   │   │   ├── RetentionCriteria.tsx
│   │   │   └── SystemAudit.tsx     # Exported as DeanReports
│   │   ├── auth/                   # Authentication pages
│   │   │   ├── Login.tsx
│   │   │   ├── ForgotPassword.tsx
│   │   │   └── ResetPassword.tsx
│   │   ├── faculty/                # Faculty-specific pages
│   │   │   ├── Dashboard.tsx
│   │   │   ├── StudentManagement.tsx
│   │   │   ├── GradeComputation.tsx
│   │   │   ├── RetentionMonitoring.tsx
│   │   │   ├── AttendanceMonitoring.tsx
│   │   │   └── Reports.tsx
│   │   ├── secretary/              # Class Secretary pages
│   │   │   ├── Dashboard.tsx
│   │   │   ├── AttendanceList.tsx
│   │   │   ├── ManualAttendanceOverride.tsx
│   │   │   ├── CCTVFeed.tsx
│   │   │   └── utils.ts
│   │   └── shared/                 # Accessible by all roles
│   │       ├── Profile.tsx
│   │       └── Settings.tsx
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces and types
│   ├── utils/
│   │   └── gradeHelper.ts          # GWA scale conversion, weighted average computation
│   ├── App.tsx                     # Root component — routing & role-based guards
│   ├── App.css
│   ├── index.css                   # Tailwind directives + global CSS
│   └── main.tsx                    # React DOM entry point
├── index.html                      # HTML shell (Google Fonts, meta, root div)
├── tailwind.config.js              # Custom color tokens and font config
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── postcss.config.js
├── eslint.config.js
└── package.json
```

---

## 7. Installation & Setup

### Prerequisites

| Tool | Minimum Version | Download |
|---|---|---|
| Node.js | 18.x LTS | https://nodejs.org |
| npm | 9.x (bundled with Node) | — |
| Git | Any recent version | https://git-scm.com |

### Steps

```bash
# 1. Clone the repository
git clone <your-repository-url>
cd dentisys_front

# 2. Install dependencies
npm install

# 3. (Optional) Set up environment variables when backend is available
cp .env.example .env
# Fill in values as described in Section 9
```

> There is currently no `.env.example` because the frontend uses no real environment variables. This will be required once backend integration begins.

---

## 8. Running the Project Locally

```bash
# Start the Vite dev server (with Hot Module Replacement)
npm run dev
```

Open your browser at: **http://localhost:5173**

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production (`dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint on all source files |

---

## 9. Environment Requirements

Currently, **no environment variables are required** — all data is mocked via React Context.

Once backend integration begins, create a `.env` file in the project root:

```env
# Backend API base URL
VITE_API_BASE_URL=http://localhost:8000/api

# Auth token storage key
VITE_AUTH_TOKEN_KEY=dentisys_token

# WebSocket URL for real-time features
VITE_WS_URL=ws://localhost:8000/ws
```

> **Important:** All Vite env vars must be prefixed with `VITE_` to be accessible in the browser. Never commit secrets (private keys, DB passwords) to version control.

---

## 10. Demo Credentials

These are hardcoded in `src/pages/auth/Login.tsx` for frontend testing only.  
**Remove all hardcoded credentials before any production deployment.**

| Role | Email | Password |
|---|---|---|
| Faculty | `faculty@bicol-u.edu.ph` | `faculty123` |
| Dean (Admin) | `admin@bicol-u.edu.ph` | `admin123` |
| Class Secretary | `secretary@bicol-u.edu.ph` | `secretary123` |

---

## 11. Project Status

```
╔══════════════════════════════════════════════════╗
║              CURRENT PROJECT STATUS              ║
╠══════════════════════════════════════════════════╣
║  ✅  Frontend:   COMPLETE                        ║
║  ⏳  Backend:    NOT STARTED                     ║
║  ⏳  Database:   NOT STARTED                     ║
║  ⏳  Auth:       MOCK ONLY (not production-ready)║
╚══════════════════════════════════════════════════╝
```

All UI, navigation, and state management logic are complete. The app runs fully in-browser using in-memory mock data. No network requests are made to any backend server at this time.

---

## 12. Features Requiring Backend Integration

### Authentication & Authorization
- [ ] Real credential validation against a database (hashed passwords)
- [ ] JWT/session token issuance and refresh
- [ ] Email-based password reset (token generation, delivery, validation)
- [ ] Server-side role enforcement

### Data Persistence
- [ ] Student records (CRUD) stored in a database
- [ ] Grade entries and assessment scores persisted per subject per student
- [ ] Attendance records stored and retrieved from the server
- [ ] Remedial exam records persisted and updated
- [ ] Retention status changes logged to a server-side audit table
- [ ] System settings (weights, threshold) persisted per institution

### Real-Time Features
- [ ] CCTV feed integration (WebSocket or RTSP-to-browser via media server)
- [ ] Facial recognition attendance marking (computer vision service)
- [ ] Live push notifications (retention alerts, override requests)

### Reporting & Exports
- [ ] Server-side PDF generation for official documents
- [ ] Excel/CSV export of grade sheets and attendance logs
- [ ] Email delivery of reports to faculty or dean

---

## 13. Planned Backend Architecture

### Recommended Stack

| Layer | Technology Options |
|---|---|
| API Server | Node.js (Express / Fastify) or Python (Django REST / FastAPI) |
| Database | PostgreSQL |
| ORM | Prisma (Node.js) or Django ORM (Python) |
| Authentication | JWT (access + refresh token pattern) |
| Real-Time | Socket.io (Node.js) or Django Channels (Python) |
| File Storage | AWS S3 / Cloudinary (for face enrollment images) |
| Computer Vision | Python + OpenCV + face_recognition or AWS Rekognition |
| Email | SendGrid / Nodemailer |

### Suggested API Endpoints

```
# Auth
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/me

# Students
GET    /api/students
POST   /api/students
GET    /api/students/:id
PUT    /api/students/:id
DELETE /api/students/:id

# Grades
GET    /api/students/:id/grades
PUT    /api/students/:id/grades/:subjectCode

# Assessments
GET    /api/assessments
POST   /api/assessments
PUT    /api/assessments/:id
DELETE /api/assessments/:id
POST   /api/assessments/:id/scores

# Attendance
GET    /api/attendance
POST   /api/attendance
PUT    /api/attendance/:id/override

# Remedial Exams
GET    /api/remedial-exams
POST   /api/remedial-exams
PUT    /api/remedial-exams/:id

# Settings
GET    /api/settings
PUT    /api/settings

# Reports (server-generated PDFs)
GET    /api/reports/academic
GET    /api/reports/attendance
GET    /api/reports/retention
```

### Database Schema (Conceptual)

```
Users            (id, name, email, passwordHash, role, assignedSubjects[], assignedClasses[])
Students         (id, studentId, name, email, yearLevel, status, classId, faceEnrolled)
Subjects         (id, code, name, units, isClinical)
StudentSubjects  (studentId, subjectCode, grade, components)
Assessments      (id, title, type, subjectCode, classId, gradingPeriod, maxScore, ...)
AssessmentScores (id, assessmentId, studentId, score, submittedAt)
AttendanceRecords(id, studentId, date, subjectCode, status, overrideReason, ...)
AttendanceAudit  (id, recordId, previousStatus, newStatus, reason, changedBy, changedAt)
RemedialExams    (id, studentId, subjectCode, originalGrade, remedialScore, remedialGrade, status)
RetentionLogs    (id, studentId, previousStatus, newStatus, remarks, changedBy, changedAt)
SystemSettings   (id, retentionThreshold, weights, updatedAt)
```

---

## 14. Security Features to Implement

> The current frontend has **zero production security**. All of the following are required before any real deployment.

### Authentication & Session Management
- [ ] Password hashing with `bcrypt` or `argon2` — never store plaintext passwords
- [ ] JWT with short-lived access tokens (e.g., 15 min) + refresh tokens in HttpOnly cookies
- [ ] Token rotation on every refresh to prevent replay attacks
- [ ] Account lockout after N consecutive failed login attempts
- [ ] Time-limited, single-use tokens for password reset
- [ ] **Remove all hardcoded demo credentials from `Login.tsx`**

### Authorization
- [ ] Server-side role enforcement on every API endpoint — do not trust frontend route guards alone
- [ ] Resource-level authorization — Faculty can only access their assigned students/classes

### Input Validation & Sanitization
- [ ] Validate all API request bodies server-side (Zod / Joi / Pydantic)
- [ ] Sanitize string inputs to prevent XSS and SQL injection
- [ ] Validate file uploads (type, size, content) before processing face images

### Data Encryption
- [ ] Enforce TLS/HTTPS in production — no HTTP
- [ ] Encrypt sensitive data at rest (face images, medical records) — AES-256 or DB-level encryption
- [ ] Prefer storing face embeddings (feature vectors) over raw images

### Audit Logging
- [ ] Persist `AttendanceOverrideAudit` and `RetentionLog` objects server-side to a tamper-evident audit table
- [ ] Log all destructive actions: deletions, grade overrides, status changes, account modifications
- [ ] Include `changedBy`, `changedAt`, IP address, and user agent in every log entry

### API Security
- [ ] Rate limiting on all public endpoints (especially `/api/auth/login`)
- [ ] CORS configuration — restrict to your frontend domain only
- [ ] HTTP security headers (`helmet` for Node.js): `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`

### Frontend Hardening
- [ ] Replace `localStorage` session with HttpOnly cookie-based sessions — the current `dentisys_user` key in `localStorage` is readable by JavaScript
- [ ] Add a Content Security Policy (CSP) header

---

## 15. Coding Conventions & Best Practices

### TypeScript
- All data structures are declared in `src/types/index.ts` — **add new types there, not inline**.
- Use `interface` for object shapes, `type` for unions/aliases.
- Avoid `any`. Use `unknown` and narrow properly.
- Strict mode is enabled in `tsconfig.app.json` — keep it enabled.

### React
- Use **functional components with hooks** exclusively — no class components.
- Prefer **named exports**: `export const MyPage: React.FC = ...`
- Use `useMemo` for expensive computations, `useCallback` for callbacks passed to children.
- Never define a component inside another component function.

### State Management
- All global state lives in `src/context/AppContext.tsx` — the **single source of truth**.
- When adding new state: add the type to `AppContextProps`, the state in `AppProvider`, and the action functions.
- When integrating the backend, replace mock logic inside context actions with API calls — consumers via `useApp()` will not need changes.

### Styling (TailwindCSS)
- Use custom tokens (`clinical-*`, `accent-*`, `sage-*`) — avoid raw palette colors like `green-500`.
- Always pair dark mode classes: `text-slate-700 dark:text-slate-200`.
- Avoid inline `style` props — use Tailwind utilities.

### File Organization
- Pages → `src/pages/<role>/` (one file per page)
- Shared utilities → `src/utils/`
- Reusable UI primitives → `src/components/`
- Business logic stays in context actions or utility files, not in components.

### Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Components / Pages | PascalCase | `StudentManagement` |
| Hooks | `use` prefix | `useApp` |
| Utility functions | camelCase | `computeOverallGWA` |
| Interfaces | PascalCase | `Student`, `AttendanceRecord` |
| Component files | PascalCase | `GradeComputation.tsx` |
| Utility files | camelCase | `gradeHelper.ts` |
| Route paths | kebab-case | `/admin/retention-criteria` |

### Git Practices
- Imperative commit messages: `Add remedial exam score entry form`, `Fix GWA computation bug`
- Feature branches: `feature/backend-auth`, `fix/attendance-override-bug`
- Do not push directly to `main` — use Pull Requests.

---

## 16. Known Limitations

1. **No data persistence** — all data resets on page refresh (lives in RAM only).
2. **Mock authentication only** — credentials are hardcoded; no session expiry, no server validation.
3. **No email functionality** — Forgot/Reset Password pages show UI only; no actual emails are sent.
4. **No facial recognition** — the face enrollment UI is scaffolded but not connected to any CV service.
5. **No CCTV streaming** — `CCTVFeed.tsx` shows a placeholder; no real video stream is connected.
6. **No real-time updates** — changes by one user are not pushed to other open sessions.
7. **Notification bell is decorative** — no real notification data.
8. **Reports are browser-print only** — uses `window.print()`; no server-side PDF or file download.
9. **No multi-tenancy** — designed for a single institution; multi-school support needs architectural changes.
10. **Insecure session storage** — user role and session are stored as plaintext JSON in `localStorage`.

---

## 17. Future Improvements

### Short-Term (Backend Integration Phase)
- Connect all `AppContext` actions to real REST API endpoints.
- Replace mock auth with JWT-based authentication.
- Implement functional email-based password reset.
- Persist audit logs and retention history to the database.

### Medium-Term
- Integrate a facial recognition service for automatic attendance marking.
- Connect a live CCTV/RTSP stream via a media server (e.g., MediaMTX, NGINX RTMP).
- WebSocket support for real-time notifications and attendance updates.
- Server-side PDF generation for official printable documents.
- CSV/Excel export for grade sheets and attendance logs.

### Long-Term
- Progressive Web App (PWA) or mobile app for faculty attendance marking on mobile devices.
- SMS/email alerts to students when retention status changes to Critical.
- Analytics with semester-over-semester GWA and attendance trend analysis.
- Integration with the university's Student Information System (SIS).
- Two-factor authentication (2FA) for Dean and Faculty accounts.

---

## 18. Dependencies & Useful Commands

### Runtime Dependencies

| Package | Purpose |
|---|---|
| `react` + `react-dom` | Core UI framework |
| `react-router-dom` | Client-side routing |
| `recharts` | Chart visualizations on dashboards |
| `lucide-react` | Icon library |
| `canvas-confetti` | Celebratory animation on grade save |

### Dev Dependencies

| Package | Purpose |
|---|---|
| `vite` + `@vitejs/plugin-react` | Build tool and dev server |
| `typescript` | Static typing |
| `tailwindcss` + `postcss` + `autoprefixer` | Utility-first CSS framework |
| `eslint` + `typescript-eslint` | Code linting |
| `@types/*` | TypeScript type declarations |

### Useful Commands

```bash
npm install           # Install all dependencies
npm run dev           # Start dev server at localhost:5173
npm run build         # Type-check + production build (output: dist/)
npm run preview       # Preview production build locally
npm run lint          # Run ESLint
npx tsc --noEmit      # Type-check without building
npm list --depth=0    # List installed package versions
```

---

## 19. Notes for Developers

### For Backend Developer(s)

1. **Read `src/types/index.ts` first.** All data interfaces are there. Your DB schema should match these types as closely as possible to minimize API transformation work.

2. **Read `src/context/AppContext.tsx`.** It contains all mock data and state mutations. When building API endpoints, replace the in-memory arrays with `fetch`/`axios` calls — UI components will automatically pick up the changes.

3. **Grading logic is in `src/utils/gradeHelper.ts`.** If you reimplement grade computation server-side, use the same Philippine 1.0–5.0 scale thresholds to ensure parity between frontend and backend calculations.

4. **Default retention threshold is `2.5` GWA.** Students with GWA above 2.5 (on the 1.0–5.0 scale where 1.0 = Excellent) are flagged. Configurable via System Settings.

5. **Default grade weights:** Quizzes 20%, Exams 30%, Practicum 40%, Attendance 10%. Configurable per institution.

6. **Attendance override is audited.** Every override appends an entry to `AttendanceRecord.auditTrail`. Ensure this trail is persisted in the database, not just in memory.

### For Frontend Developer(s) Continuing This Work

1. **Always use `useApp()` to access global state.** Do not read/write app data directly through `localStorage` — only the session/user object should be in `localStorage`.

2. **`assignedSubjects` and `assignedClasses`** on the Faculty user object are the keys for data filtering. New pages must respect these arrays to prevent Faculty from seeing other classes' data.

3. **Adding a new role:** Add route guards in `App.tsx`, navigation items in `Layout.tsx` under the correct role block, and new pages in a new `src/pages/<role>/` directory.

4. **Adding a new page:** Create the file in `src/pages/<role>/`, import and register the route in `App.tsx`, and add the nav item to `Layout.tsx`.

5. **Test both dark and light modes** before every commit — ensure all color utilities include their `dark:` counterpart.

6. **Recharts usage examples** are in `src/pages/admin/Dashboard.tsx` — reference it for chart configuration with the custom color palette.

---

*DentiSys — Bicol University College of Dental Medicine*  
*Built by the DentiSys Development Team*
