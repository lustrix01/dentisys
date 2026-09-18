# Frontend Overview

The frontend is a React 19, TypeScript, Vite, React Router, and Tailwind application in `frontend/`. It uses context for client state and calls the PHP API through Vite's `/api` proxy.

Authentication routes include password login, authenticator 2FA verification at `/2fa/verify`, account registration, invitation activation, password reset, and recovery-code display. The removed `/mfa/select` email/authenticator choice no longer exists.

P03 keeps `/login` as the sole login implementation. `/login/dev` and `/dev-login` redirect to it. Real Student signup and activation are isolated at `/signup/student` and `/activate-student`; they are feature-gated by server runtime configuration and never create a browser-side user, JWT, refresh token, or Student role. Development Student access, when explicitly enabled, calls the backend mock-session endpoint and consumes only server-issued credentials. Student browser prototypes additionally require the server-issued `authentication_source=development_mock`; a real password-authenticated Student cannot enter those development surfaces. Google Sign-In is approved product direction but is not implemented or exposed by this phase.

Role-specific pages remain available for admin, faculty, and secretary workflows. Preserve existing layouts, routes, mock-compatible storage keys, and role checks unless a task explicitly changes behavior.
