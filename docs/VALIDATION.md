# Export verification — 07/10/2026

- Live Sites v5 source SHA matches the imported Git history: `ed5cdc0a2b7e86b899f0810690a4de4033908d47`.
- Complete lesson payloads obtained through the authenticated learning-run API; bounded table previews alone were truncated and were not used as full lesson backups.
- Restored local D1 matches every exported cell: 5 lessons, 5 slots, 1 run, 1 workspace. Snapshot is ignored by Git.
- Existing SQLite policy tests: 2 passed, including Berlin DST, completion cutoff, separate tracks, stale retry protection and retained answers.
- TypeScript, ESLint and Vinext production build passed.
- Chrome desktop (1440px) and mobile (390px): 5 current cards render, lesson reader opens, gray/pink tokens match, no document horizontal overflow.
- No API calls or daily writes were made against production during verification; only read-only exports. Production deployment, domain and schedule unchanged.
- No automatic Docs sync, independent Cloudflare auth/deployment or Claude task has been configured in this export.

The snapshot is a point-in-time backup, not a live replica. Re-export at future migration cutover.
