#!/usr/bin/env bun
import { $ } from "bun"

import {
  copyBundledNodeToResources,
  copyBundledRipgrepToResources,
  ensureBundledNodeBinary,
  ensureBundledRipgrepBinary,
  resolveChannel,
} from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../opencode && bun script/build-node.ts`
await copyBundledNodeToResources(await ensureBundledNodeBinary())
await copyBundledRipgrepToResources(await ensureBundledRipgrepBinary())
