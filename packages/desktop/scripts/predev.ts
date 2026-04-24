import { $ } from "bun"

import { copyBinaryToSidecarFolder, ensureBundledNodeBinary, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE
const skipOpencodeBuild = process.env.WISCODE_SKIP_OPENCODE_BUILD === "1"

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binaryPath = windowsify(`../opencode/dist/${sidecarConfig.ocBinary}/bin/wiscode-cli`)

if (!skipOpencodeBuild) {
  await (sidecarConfig.ocBinary.includes("-baseline")
    ? $`cd ../opencode && bun run build --single --baseline`
    : $`cd ../opencode && bun run build --single`)
}

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
await copyBinaryToSidecarFolder(await ensureBundledNodeBinary(RUST_TARGET), RUST_TARGET, "wiscode-node")
