import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { BMADManifest } from "@opencode-ai/core/bmad/manifest"
import { tmpdir } from "./fixture/tmpdir"

test("detects ready manifest changes and force-reads identical stat metadata", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, ".opencode", "bmad-managed.json")
  const check = BMADManifest.watch(tmp.path)
  expect(await check()).toBe(false)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, '{"phase":"pending","commit":"aaa"}')
  expect(await check()).toBe(false)
  await fs.writeFile(file, '{"phase":"ready","commit":"aaa"}')
  expect(await check()).toBe(true)
  expect(await check()).toBe(false)
  const before = await fs.stat(file)
  await fs.writeFile(file, '{"phase":"ready","commit":"bbb"}')
  await fs.utimes(file, before.atime, before.mtime)
  expect(await check(true)).toBe(true)
})
