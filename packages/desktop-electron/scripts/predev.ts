import { $ } from "bun"
import { copyBundledNodeToResources, ensureBundledNodeBinary } from "./utils"

await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
await copyBundledNodeToResources(await ensureBundledNodeBinary())
