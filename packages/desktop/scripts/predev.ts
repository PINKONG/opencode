import { $ } from "bun"
import { copyBundledRipgrepToResources, ensureBundledRipgrepBinary } from "./utils"

await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
await copyBundledRipgrepToResources(await ensureBundledRipgrepBinary())
