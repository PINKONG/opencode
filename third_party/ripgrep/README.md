## Bundled ripgrep archives

Desktop packaging expects vendored ripgrep release archives under:

`third_party/ripgrep/v15.1.0/`

Place the upstream release archives from BurntSushi/ripgrep there with these exact filenames:

- `ripgrep-15.1.0-aarch64-apple-darwin.tar.gz`
- `ripgrep-15.1.0-x86_64-apple-darwin.tar.gz`
- `ripgrep-15.1.0-aarch64-pc-windows-msvc.zip`
- `ripgrep-15.1.0-x86_64-pc-windows-msvc.zip`
- `ripgrep-15.1.0-aarch64-unknown-linux-gnu.tar.gz`
- `ripgrep-15.1.0-x86_64-unknown-linux-musl.tar.gz`

Used by:

- `packages/desktop/scripts/utils.ts`
- `script/build-desktop-prod-mac.sh`
- `script/build-desktop-prod-windows.ps1`

Behavior:

- `packages/desktop` prebuild/predev will copy `rg` from these archives into `packages/desktop/resources/`.
- Packaged desktop app syncs bundled `rg` into the local WisCode cache bin before sidecar startup.
- If these archives are missing during offline packaging, desktop packaging will fail fast.
