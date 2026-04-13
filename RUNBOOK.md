# MP Stock Platform Runbook (Operational Hardening)

## 1. Deployment Checklist (Phase-F)
- [ ] Circular dependency check: `npm run check:circular`
- [ ] Strict Lint check: `npm run lint`
- [ ] Build: `npm run build`
- [ ] Asset verification: `dist/assets/` must NOT contain `.map` files.

## 2. Backup Procedure
Before any major deployment or synchronization:
- **Signals Data**: Backup `signals.json` to `signals.json.bak` before any manual edits.
- **Database**: Standard PostgreSQL snapshot for `signals` and `users` tables.
- **Frontend**: Keep at least one previous `dist/` directory as `dist.old` during deployment transition.

## 3. Rollback Strategy (Critical)
If "ReferenceError" or "TDZ 감지" occurs on production:
1. **Frontend Transition**: Switch back to the previous `dist.old` assets immediately.
2. **Maintenance Route**: If the error persists, redirect `/performance` to `MaintenancePage` in `App.jsx`.
3. **Backend State**: 
   - `pm2 reload all` to clear any stale module state.
   - `redis-cli FLUSHDB` if cache corruption is suspected (Caution: will clear live signals).
4. **Log Analysis**: Check browser console for `[GlobalError][TDZ 감지]` prefix and specific file/line info.

## 4. System Maintenance
- **ESLint**: Continuous enforcement via `prebuild` script.
- **Security**: Sourcemaps must remain disabled in `vite.config.js`.
- **Audit**: Monthly check of `signals.json` archive integrity (Max 5,000 signals).

---
*Verified: 2026-04-13 | Version: v9.4.23 | MetaPrompt Studio*
