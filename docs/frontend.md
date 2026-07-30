# Frontend Overview

The frontend is a React 19, TypeScript, Vite, React Router, and Tailwind application in `frontend/`. It uses context for client state and calls the PHP API through Vite's `/api` proxy.

Authentication routes include password login, authenticator 2FA verification at `/2fa/verify`, account registration, invitation activation, password reset, and recovery-code display. The removed `/mfa/select` email/authenticator choice no longer exists.

Role-specific pages remain available for admin, faculty, and secretary workflows. Preserve existing layouts, routes, mock-compatible storage keys, and role checks unless a task explicitly changes behavior.
