#!/usr/bin/env bash

set -euo pipefail

root="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  git rev-parse --show-toplevel
)"
envf="${root}/.env"
arch="$(uname -m)"

if [[ -f "${envf}" ]]; then
  echo "==> load env ${envf}"
  set -a
  source "${envf}"
  set +a
fi

if [[ "${arch}" == "x86_64" ]]; then
  triple="x86_64-apple-darwin"
  dir="wiscode-cli-darwin-x64-baseline"
  cmd=(bun run script/build.ts --single --baseline --skip-install)
elif [[ "${arch}" == "arm64" ]]; then
  triple="aarch64-apple-darwin"
  dir="wiscode-cli-darwin-arm64"
  cmd=(bun run script/build.ts --single --skip-install)
else
  echo "Unsupported macOS architecture: ${arch}" >&2
  exit 1
fi

echo "==> root: ${root}"
echo "==> arch: ${arch}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Missing cargo in PATH. Install the Rust toolchain first." >&2
  echo "Recommended: curl https://sh.rustup.rs -sSf | sh" >&2
  exit 1
fi

if ! command -v rustc >/dev/null 2>&1; then
  echo "Missing rustc in PATH. Install the Rust toolchain first." >&2
  echo "Recommended: curl https://sh.rustup.rs -sSf | sh" >&2
  exit 1
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  if [[ ! -f "${TAURI_SIGNING_PRIVATE_KEY_PATH}" ]]; then
    echo "Missing signing key file: ${TAURI_SIGNING_PRIVATE_KEY_PATH}" >&2
    exit 1
  fi
  echo "==> load updater signing key from path"
  export TAURI_SIGNING_PRIVATE_KEY="$(<"${TAURI_SIGNING_PRIVATE_KEY_PATH}")"
fi

cd "${root}"
echo "==> bun install"
bun install

cd "${root}/packages/opencode"
echo "==> build sidecar"
"${cmd[@]}"

bin="${root}/packages/opencode/dist/${dir}/bin/wiscode-cli"
if [[ ! -x "${bin}" ]]; then
  echo "Missing sidecar binary: ${bin}" >&2
  exit 1
fi

cd "${root}/packages/desktop"
echo "==> copy sidecar"
mkdir -p src-tauri/sidecars
cp "${bin}" "src-tauri/sidecars/wiscode-cli-${triple}"
chmod +x "src-tauri/sidecars/wiscode-cli-${triple}"

echo "==> typecheck"
bun run typecheck

echo "==> build frontend"
bun run build

echo "==> clean stale dmg artifacts"
macos_bundle="${root}/packages/desktop/src-tauri/target/release/bundle/macos"
if [[ -d "${macos_bundle}" ]]; then
  find "${macos_bundle}" -maxdepth 1 \
    \( -name 'WisCode*.dmg' -o -name 'rw.*.dmg' \) -delete
fi

echo "==> tauri prod build"
args=(build --config src-tauri/tauri.prod.conf.json)
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  echo "==> updater signing key missing, disabling updater artifacts"
  args+=(--config '{"bundle":{"createUpdaterArtifacts":false}}')
fi
bun run tauri "${args[@]}"

echo "==> artifacts"
find "${root}/packages/desktop/src-tauri/target/release/bundle" -maxdepth 3 \
  \( -name 'WisCode*' -o -name '*.app' -o -name '*.dmg' \) | sort
