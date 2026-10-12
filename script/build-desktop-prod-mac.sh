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

cd "${root}"
export OPENCODE_CHANNEL=prod
export OPENCODE_VERSION="$(bun --print 'require("./packages/opencode/package.json").version')"
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

rg_archive_dir="${root}/third_party/ripgrep/v15.1.0"
if [[ "${arch}" == "x86_64" ]]; then
  rg_archive="${rg_archive_dir}/ripgrep-15.1.0-x86_64-apple-darwin.tar.gz"
else
  rg_archive="${rg_archive_dir}/ripgrep-15.1.0-aarch64-apple-darwin.tar.gz"
fi
if [[ ! -f "${rg_archive}" ]]; then
  echo "Missing ripgrep archive: ${rg_archive}" >&2
  exit 1
fi
rg_tmp="$(mktemp -d)"
tar -xzf "${rg_archive}" -C "${rg_tmp}"
rg="$(find "${rg_tmp}" -type f -name rg | head -n 1)"
if [[ -z "${rg}" || ! -x "${rg}" ]]; then
  echo "Missing ripgrep binary in archive: ${rg_archive}" >&2
  exit 1
fi

cd "${root}/packages/desktop"
echo "==> copy sidecar"
mkdir -p resources
cp "${bin}" "resources/wiscode-cli"
chmod +x "resources/wiscode-cli"
cp "$(dirname "${bin}")/uv" "resources/uv"
chmod +x "resources/uv"
cp "$(dirname "${bin}")/uv-LICENSE-MIT" "resources/uv-LICENSE-MIT"
mkdir -p resources/bmad
cp -R "$(dirname "${bin}")/bmad/." "resources/bmad/"
cp "${rg}" "resources/rg"
chmod +x "resources/rg"
mkdir -p native

# Force known-good mirror endpoints to avoid inherited env pollution.
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://cdn.npmmirror.com/binaries/electron-builder-binaries/"
export NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR}"
export npm_config_electron_builder_binaries_mirror="${ELECTRON_BUILDER_BINARIES_MIRROR}"
unset ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL
unset NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
unset npm_config_electron_builder_binaries_custom_dir
unset NPM_PACKAGE_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR
unset npm_package_config_electron_builder_binaries_custom_dir
unset npm_package_config_electron_builder_binaries_mirror
unset NPM_PACKAGE_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR
export ELECTRON_CACHE="${ELECTRON_CACHE:-${root}/.cache/electron}"
export ELECTRON_BUILDER_CACHE="${ELECTRON_BUILDER_CACHE:-${root}/.cache/electron-builder}"
mkdir -p "${ELECTRON_CACHE}" "${ELECTRON_BUILDER_CACHE}"
echo "==> electron mirror: ${ELECTRON_MIRROR}"
echo "==> electron-builder mirror: ${NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR}"
echo "==> electron-builder env"
env | rg -i 'electron_builder_binaries|electron_mirror|npm_config_electron_builder|npm_package_config_electron_builder' || true

# electron-builder's dmg-builder download path is affected by ELECTRON_MIRROR.
# Preload dmgbuild bundle and force CUSTOM_DMGBUILD_PATH to avoid mirror path collisions.
if [[ "${arch}" == "arm64" ]]; then
  dmgbuild_arch="arm64"
else
  dmgbuild_arch="x86_64"
fi
dmgbuild_ver="75c8a6c"
dmgbuild_name="dmgbuild-bundle-${dmgbuild_arch}-${dmgbuild_ver}.tar.gz"
dmgbuild_url="https://cdn.npmmirror.com/binaries/electron-builder-binaries/dmg-builder@1.2.0/${dmgbuild_name}"
dmgbuild_root="${ELECTRON_BUILDER_CACHE}/dmg-builder-1.2.0-${dmgbuild_arch}"
dmgbuild_bin="${dmgbuild_root}/dmgbuild"
if [[ ! -x "${dmgbuild_bin}" ]]; then
  echo "==> preload dmgbuild bundle: ${dmgbuild_name}"
  tmp_tgz="${ELECTRON_BUILDER_CACHE}/${dmgbuild_name}"
  curl -fL --retry 3 --connect-timeout 15 --max-time 300 "${dmgbuild_url}" -o "${tmp_tgz}"
  rm -rf "${dmgbuild_root}"
  mkdir -p "${dmgbuild_root}"
  tar -xzf "${tmp_tgz}" -C "${dmgbuild_root}" --strip-components=1
  chmod +x "${dmgbuild_bin}" || true
fi
export CUSTOM_DMGBUILD_PATH="${dmgbuild_bin}"
echo "==> custom dmgbuild: ${CUSTOM_DMGBUILD_PATH}"

echo "==> typecheck"
bun run typecheck

echo "==> build frontend"
bun run build

echo "==> package mac (electron-builder)"
./node_modules/.bin/electron-builder --mac --config electron-builder.config.ts

echo "==> artifacts"
find "${root}/packages/desktop/dist" -maxdepth 3 \
  \( -name 'WisCode*' -o -name '*.app' -o -name '*.dmg' -o -name '*.zip' \) | sort
