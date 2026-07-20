# DentiSys Repository Rules

- Preserve existing React routes, pages, styling, assets, localStorage keys, mock users, role checks, and mock workflows unless a future prompt explicitly approves a behavior change.
- Do not add dependencies, Composer, PHP frameworks, frontend API integration, or test frameworks without approval.
- Do not create DentiSys business database tables without approval.
- Keep the PHP backend plain, small, and local-development focused.
- Do not add production infrastructure, deployment automation, registry publishing, Traefik, Watchtower, TLS, VPS, cloud, replicas, or CI/CD files.
- Avoid unrelated refactors and formatting churn.
- Keep secrets out of version control; use root `.env` for Docker and `backend/config/local.php` for XAMPP-only local overrides.
- Plan before implementing future broad changes.
- Run available validation before presenting results.
