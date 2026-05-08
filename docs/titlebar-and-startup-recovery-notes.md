# Titlebar And Startup Recovery Notes

## Summary

This incident had two separate root causes:

- Duplicate titlebar actions came from `SessionHeader` rendering titlebar content through cross-DOM portals.
- The startup splash hang came from using a LAN advertise address as the desktop WebView's internal sidecar URL.

Do not debug or patch these as one problem. Restore startup stability first, then fix titlebar duplication with a minimal UI-only change.

## Confirmed Startup Root Cause

- Desktop logs showed the sidecar process started successfully.
- The Rust health check succeeded against `127.0.0.1`.
- The frontend received a URL like `http://190.160.9.212:<port>`.
- That address came from route or network-interface detection and can point at a VPN or virtual NIC on Windows.
- After the frontend was given `http://127.0.0.1:<port>` for internal sidecar access, the startup splash hang disappeared.

Rule: desktop internal sidecar access should use loopback. LAN advertise addresses are for external display and copied access links, not for the local WebView bootstrap path.

## Correct Titlebar Dedup Strategy

- Keep the fix inside `packages/app/src/components/session/session-header.tsx`.
- Use instance ownership so only the latest mounted `SessionHeader` can render into titlebar portals.
- Keep `<Show>` keyed around portal mounts.
- Do not add a shared titlebar ref module unless there is a stronger architectural reason.
- Do not change Tauri startup, sidecar initialization, or `Titlebar` for this class of bug.

## What Went Wrong

- A global `MutationObserver(document.body)` was too broad and affected rendering timing.
- Clearing old titlebar DOM nodes was too destructive and caused missing toolbar states.
- Moving portal mount ownership into `Titlebar` increased coupling and made regressions harder to isolate.
- Startup and UI duplication were investigated together, which made it harder to identify the sidecar URL issue.

## Commit Hygiene Checklist

- Run `git diff --name-only` before committing.
- Exclude generated files such as `packages/opencode/src/provider/models-snapshot.js`.
- Do not include `bun.lock` or `Cargo.toml` if they only appear because of line-ending or index noise.
- Keep build-script changes limited to the actual build failure being fixed.
- Verify the final diff only contains files needed for the behavior change.

## Future Debug Order

1. Check logs first and decide whether the failure is startup-side or UI-side.
2. Restore a known-starting baseline before changing UI behavior.
3. For portal duplication, prefer owner/token gating over DOM scanning or cleanup.
4. For sidecar startup, distinguish internal connect URL from external advertise URL.
5. Before commit, remove generated artifacts and unrelated experiments.

