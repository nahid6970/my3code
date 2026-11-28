# Markdown files: where information belongs

Start at [`../dev.md`](../dev.md) for the maintainer overview. Use [`../recent.md`](../recent.md) only for the latest implementation handoff and next step. Put durable guidance in the closest existing guide and link it from the relevant index; avoid duplicating the same instructions across files.

```text
t3code/
├── dev.md                         Main maintainer entry point and project handoff
├── recent.md                      Latest change, critical context, next task
├── README.md                      Project introduction and user-facing overview
├── CONTRIBUTING.md                Contribution and pull request process
├── AGENTS.md                      Instructions for coding agents in this repository
├── docs/
│   ├── README.md                  Documentation index and links by audience
│   ├── markdown-map.md             This guide: document placement and ownership
│   ├── user/                      Product usage, setup, and troubleshooting
│   │   ├── README.md              User guide and feature index
│   │   └── t3-backend-guide.md    Installing and operating the headless backend
│   ├── operations/                Maintainer setup, builds, releases, debugging
│   │   ├── 00_development.md      General development environment and commands
│   │   ├── 03_release.md          Release process and artifact validation
│   │   └── t3code-windows-build.md Windows-specific build record and workarounds
└── internals/                     Durable architecture, constraints, and hard-to-see traps
```

## Placement rules

- Put repository-wide maintainer orientation and common workflows in [`../dev.md`](../dev.md). Keep it as an index and overview, not a copy of every guide.
- Put the current implementation handoff in [`../recent.md`](../recent.md). Replace stale details when the active work changes; do not treat it as a permanent changelog.
- Put user setup and product usage in `docs/user/`, then add the guide to `docs/user/README.md` and the relevant section of `docs/README.md`.
- Put contributor setup, local builds, releases, and debugging runbooks in `docs/operations/`, then link them from `docs/README.md` and `dev.md` when useful.
- Put durable cross-cutting architecture decisions and implementation constraints in `docs/internals/`. Avoid feature inventories, copied code details, or notes that will drift as the implementation changes.
- Keep repository policies in their existing root files (`AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `TRADEMARK.md`). Do not duplicate policy text in `dev.md`.
- Keep package-specific instructions beside the package they describe when they only apply there (for example, a package `README.md`).
- When adding a guide, prefer updating an existing relevant page over creating another file. Add links to the audience's index so the guide can be found.
