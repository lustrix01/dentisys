# Frontend Overview

The frontend is a React 19, TypeScript, Vite, React Router, and Tailwind application in `frontend/`. It uses context for client state and calls the PHP API through Vite's `/api` proxy.

Authentication routes include password login, authenticator 2FA verification at `/2fa/verify`, invitation activation, password reset, and recovery-code display. Public signup URLs redirect to login with an invitation-required notice. The removed `/mfa/select` email/authenticator choice no longer exists.

P03 keeps `/login` as the sole login implementation. `/login/dev` and `/dev-login` redirect to it. Student activation at `/activate-student` requires a Faculty-issued, class-scoped invitation and rechecks canonical identity and active enrollment; `/activate-faculty` accepts an Admin-issued invitation, which is the Faculty approval. Both pages require a DentiSys password and may optionally verify the invited institutional identity through Google. Development Student access, when explicitly enabled, calls the backend mock-session endpoint and consumes only server-issued credentials. Student browser prototypes additionally require the server-issued `authentication_source=development_mock`; password- and Google-authenticated Students follow real Student routing. When `GOOGLE_CLIENT_ID` is configured, the page dynamically loads Google's GIS client and renders the official popup button for login, linking, and invitation acceptance.

Role-specific pages remain available for admin, faculty, and secretary workflows. Preserve existing layouts, routes, mock-compatible storage keys, and role checks unless a task explicitly changes behavior.
