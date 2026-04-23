import { $ } from "bun"

import { copyBinaryToSidecarFolder, ensureBundledNodeBinary, getCurrentSidecar, windowsify } from "./utils"

const RUST_TARGET = Bun.env.TAURI_ENV_TARGET_TRIPLE

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

const binaryPath = windowsify(`../opencode/dist/${sidecarConfig.ocBinary}/bin/wiscode-cli`)

await (sidecarConfig.ocBinary.includes("-baseline")
  ? $`cd ../opencode && bun run build --single --baseline`
  : $`cd ../opencode && bun run build --single`)

await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)
await copyBinaryToSidecarFolder(await ensureBundledNodeBinary(RUST_TARGET), RUST_TARGET, "wiscode-node")
