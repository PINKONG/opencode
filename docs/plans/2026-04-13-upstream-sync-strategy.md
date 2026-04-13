# WisCode Upstream Sync Strategy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Safely sync new OpenCode releases into the WisCode fork without losing WisCode-specific branding and product changes.

**Architecture:** Treat OpenCode as the upstream source of truth and `wiscode` as the long-lived product branch. For shared/public history, prefer merging upstream release tags into a temporary sync branch created from `wiscode`, then validate brand boundaries and merge back. Use automated brand regression checks to catch accidental reversions or upstream reintroductions.

**Tech Stack:** Git, Bun tests, upstream GitHub remote (`upstream`), local regression tests in `packages/app/src/branding-surface.test.ts`

## Version Semantics

WisCode and OpenCode use two separate version systems:

- **WisCode product version**
  The public version shown to users, installers, and release notes, such as `1.0.0`

- **OpenCode upstream baseline**
  The upstream tag WisCode is currently based on, such as `v1.4.0`

These values must not be compared directly by size. For example:

- `WisCode 1.0.0`
- based on `OpenCode v1.4.0`

This does **not** mean WisCode is "behind by 0.4". It means the fork restarted product versioning while still tracking an upstream base.

Reference:
- `docs/wiscode-version-map.md`

### Task 1: Normalize the upstream source

**Files:**
- Reference: `.git/config`
- Reference: `docs/wiscode-version-map.md`

**Step 1: Keep a single canonical upstream remote**

Run:

```bash
git remote -v
```

Expected:
- `upstream` points to `https://github.com/anomalyco/opencode.git`

Note:
- This repo currently has both `upstream` and `opencode` pointing at the same repository.
- Standardize on `upstream` to avoid operator confusion.

**Step 2: Optionally remove duplicate remote**

Run:

```bash
git remote remove opencode
```

Expected:
- Only `upstream`, `origin`, and any internal remotes remain

**Step 3: Always fetch tags before planning a sync**

Run:

```bash
git fetch upstream --tags
```

Expected:
- New upstream tags such as `v1.4.1` become available locally

**Step 4: Check the current WisCode-to-OpenCode mapping**

Run:

```bash
sed -n '1,200p' docs/wiscode-version-map.md
```

Expected:
- current mapping shows the active WisCode product version and the current OpenCode baseline

### Task 2: Use the right sync model

**Files:**
- Reference: `docs/wiscode-upstream-dependencies.md`
- Reference: `packages/app/src/branding-surface.test.ts`

**Step 1: Default to merge-based syncing for public/shared `wiscode`**

Reason:
- `wiscode` is already a shared branch
- merge avoids force-pushing rewritten history
- merge keeps upstream release boundaries visible in history

**Step 2: Use rebase only in limited cases**

Use rebase only when all of the following are true:
- you are the only maintainer touching `wiscode`
- you explicitly accept force-pushing rewritten history
- you want a linear patch stack on top of each upstream tag

**Step 3: Recommended branch model**

- `upstream` remote: OpenCode source
- `wiscode`: long-lived product branch
- `sync/opencode-vX.Y.Z-into-wiscode`: temporary integration branch per upstream release

### Task 3: Sync `v1.4.1` into the current `wiscode` branch

**Files:**
- Reference: `packages/app/src/branding-surface.test.ts`
- Reference: `docs/wiscode-upstream-dependencies.md`
- Reference: `docs/wiscode-version-map.md`

**Step 1: Start from a clean working tree**

Run:

```bash
git status --short
```

Expected:
- no uncommitted changes

**Step 2: Fetch upstream release tags**

Run:

```bash
git fetch upstream --tags
```

Expected:
- `v1.4.1` exists locally

**Step 2.5: Decide the target version pair before merging**

Decide and write down:

- current WisCode product version: `1.0.0`
- current OpenCode baseline: `v1.4.0`
- target OpenCode baseline: `v1.4.1`
- target WisCode product version: for example `1.0.1` or `1.1.0`

Rule:
- upstream baseline tracks engineering source
- WisCode version tracks product release semantics

**Step 3: Create a sync branch from current WisCode**

Run:

```bash
git switch wiscode
git pull --ff-only origin wiscode
git switch -c sync/opencode-v1.4.1-into-wiscode
```

Expected:
- new branch is based on current WisCode tip

**Step 4: Merge upstream release tag**

Run:

```bash
git merge --no-ff v1.4.1
```

Expected:
- either clean merge
- or conflicts that must be resolved intentionally

**Step 5: Resolve conflicts with brand ownership in mind**

Rules:
- keep upstream product logic unless WisCode intentionally diverged
- keep WisCode identity changes for app name, package identifiers, config isolation, prompts, icons, visible brand copy
- keep upstream-dependent service identifiers like `opencode`, `opencode-go`, `OpenCode Zen`, `OpenCode Go`
- re-check `docs/wiscode-upstream-dependencies.md` whenever a conflict contains `opencode`

**Step 6: Enable Git conflict memory**

Run once on the machine:

```bash
git config rerere.enabled true
```

Expected:
- repeated sync conflicts become easier over time

### Task 4: Verify that the merge did not break WisCode branding

**Files:**
- Test: `packages/app/src/branding-surface.test.ts`
- Reference: `packages/app/src/i18n/*.ts`
- Reference: `packages/web/src/content/docs/**/*.mdx`

**Step 1: Run the brand regression suite**

Run:

```bash
cd packages/app
bun test --preload ./happydom.ts ./src/branding-surface.test.ts
```

Expected:
- `5 pass`
- `0 fail`

**Step 2: Run a focused search for accidental upstream regressions**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode
rg -n "WisCode Zen|WisCode Go|opencode.json|\\.opencode" packages/app packages/web README*.md
```

Expected:
- matches only where they are intentionally allowed

Interpretation:
- `OpenCode Zen` / `OpenCode Go` are valid upstream provider/service names
- `WisCode Zen` / `WisCode Go` should not reappear
- `opencode.json` / `.opencode` should only remain in explicit backward-compatibility or upstream-protocol contexts

**Step 3: Run the desktop build or smoke tests if the release touched desktop files**

Run as needed:

```bash
./script/build-desktop-prod-mac.sh
```

Expected:
- build completes
- app identity remains `WisCode`

### Task 5: Merge the validated sync branch back to `wiscode`

**Files:**
- Reference: Git history only
- Modify: `docs/wiscode-version-map.md`

**Step 1: Commit conflict resolutions and validation fixes**

Run:

```bash
git status --short
git add .
git commit -m "merge: 同步 OpenCode v1.4.1"
```

Expected:
- one integration commit on the sync branch

**Step 1.5: Update the version mapping document**

Example:

```md
| `1.0.1` | `v1.4.1` | 同步 OpenCode v1.4.1，保持产品语义不变 |
```

Expected:
- `docs/wiscode-version-map.md` reflects the new upstream baseline
- if product version is not bumped yet, document that explicitly before release

**Step 2: Fast-forward `wiscode` to the validated sync result**

Run:

```bash
git switch wiscode
git merge --ff-only sync/opencode-v1.4.1-into-wiscode
```

Expected:
- `wiscode` now includes the validated upstream sync

**Step 3: Push WisCode**

Run:

```bash
git push origin wiscode
```

Expected:
- remote `wiscode` updated without force push

### Task 6: Prepare the fork for future upstream releases

**Files:**
- Modify: `packages/app/src/branding-surface.test.ts`
- Reference: `docs/wiscode-upstream-dependencies.md`

**Step 1: Keep fork-only changes grouped**

Rules for future work:
- keep branding changes in small, obvious commits
- separate product identity changes from feature work
- do not mix upstream bugfixes with WisCode branding edits in one commit

**Step 2: Expand regression coverage whenever a new boundary appears**

Examples:
- if a new installer page shows product name, add it to `branding-surface.test.ts`
- if a new provider-specific document is added, add it to the same test scope or a sibling test

**Step 3: Maintain a short allowlist of upstream-owned concepts**

Current examples:
- `opencode` provider ID
- `opencode-go` provider ID
- `OpenCode Zen`
- `OpenCode Go`
- upstream service URLs where WisCode has no replacement yet

### Task 7: Alternative rebase workflow for one-person maintenance only

**Files:**
- Reference: Git history only

**Step 1: Create a disposable rebase branch**

Run:

```bash
git switch -c rebase/wiscode-v1.4.1 wiscode
git rebase --onto v1.4.1 v1.4.0
```

Expected:
- all WisCode commits are replayed from `v1.4.0` onto `v1.4.1`

**Step 2: Resolve conflicts and re-run the same validations**

Run:

```bash
cd packages/app
bun test --preload ./happydom.ts ./src/branding-surface.test.ts
```

Expected:
- same `5 pass`

**Step 3: Only use this path if you are okay force-updating `wiscode`**

Run:

```bash
git switch wiscode
git reset --hard rebase/wiscode-v1.4.1
git push --force-with-lease origin wiscode
```

Expected:
- rewritten history on remote

Warning:
- avoid this in team workflows unless everyone agrees

### Task 8: Recommended decision for the current repository

**Files:**
- Reference: current branch layout

**Current context:**
- `wiscode` is the active fork branch
- it is already ahead of `origin/wiscode`
- current tree is based on `v1.4.0` plus fork commits
- current public WisCode version is `1.0.0`
- upstream remotes are already configured

**Recommendation:**
- use the merge-based sync flow for `v1.4.1`
- keep `wiscode` public history stable
- rely on the existing branding regression tests to protect the fork identity
- avoid a rebase of `wiscode` unless you intentionally want to rewrite branch history
- after syncing to `v1.4.1`, decide separately whether the next public release should be `1.0.1` or `1.1.0`
