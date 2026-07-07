#!/usr/bin/env bun

import path from "node:path"

const root = process.cwd()
const args = Bun.argv.slice(2)

const argValue = (name: string) => {
  const index = args.findIndex((item) => item === name)
  if (index === -1) return undefined
  return args[index + 1]
}

const readJson = async (file: string) => Bun.file(path.join(root, file)).json()

const fallbackVersion = ((await readJson("packages/opencode/package.json")) as { version: string }).version
const version = argValue("--version") ?? fallbackVersion

const segments = version.split(".")
const previousPatch = Number(segments[2] ?? "0") - 1
const previousVersion = previousPatch >= 0 ? `${segments[0]}.${segments[1]}.${previousPatch}` : undefined
const previousUpstreamVersion = previousPatch >= 0 ? `1.14.${previousPatch}` : undefined

const versionFiles = [
  "packages/opencode/package.json",
  "packages/core/package.json",
  "packages/app/package.json",
  "packages/cli/package.json",
  "packages/codemode/package.json",
  "packages/desktop/package.json",
  "packages/web/package.json",
  "packages/plugin/package.json",
  "packages/function/package.json",
  "packages/slack/package.json",
  "packages/ui/package.json",
  "packages/tui/package.json",
  "packages/server/package.json",
  "packages/effect-drizzle-sqlite/package.json",
  "packages/effect-sqlite-node/package.json",
  "packages/enterprise/package.json",
  "packages/console/app/package.json",
  "packages/console/core/package.json",
  "packages/console/function/package.json",
  "packages/console/mail/package.json",
  "packages/console/support/package.json",
  "packages/stats/app/package.json",
  "packages/stats/core/package.json",
  "packages/stats/server/package.json",
  "packages/sdk/js/package.json",
  "sdks/vscode/package.json",
  "packages/llm/package.json",
  "packages/http-recorder/package.json",
  "packages/session-ui/package.json",
]

const failures: string[] = []

for (const file of versionFiles) {
  const content = (await readJson(file)) as { version?: string }
  if (content.version === version) continue
  failures.push(`${file} version=${content.version ?? "<missing>"} expected=${version}`)
}

const extensionTomlPath = path.join(root, "packages/extensions/zed/extension.toml")
const extensionToml = await Bun.file(extensionTomlPath).text()
const extensionVersion = extensionToml.match(/^version = "([^"]+)"$/m)?.[1]
if (extensionVersion !== version) {
  failures.push(`packages/extensions/zed/extension.toml version=${extensionVersion ?? "<missing>"} expected=${version}`)
}

const releaseVersions = Array.from(extensionToml.matchAll(/releases\/download\/v([^/]+)\//g)).map((item) => item[1])
const badReleaseVersions = releaseVersions.filter((item) => item !== version)
if (badReleaseVersions.length) {
  failures.push(
    `packages/extensions/zed/extension.toml release urls contain stale versions: ${Array.from(new Set(badReleaseVersions)).join(", ")}`,
  )
}

const residualPatterns = [
  previousVersion ? `"version": "${previousVersion}"` : "",
  previousUpstreamVersion ? `"version": "${previousUpstreamVersion}"` : "",
  previousVersion ? `version = "${previousVersion}"` : "",
  previousVersion ? `download/v${previousVersion}/` : "",
].filter(Boolean)

for (const pattern of residualPatterns) {
  const result = Bun.spawnSync(
    ["rg", "-n", "--hidden", "--glob", "!**/node_modules/**", "--glob", "!**/.git/**", pattern, "packages", "sdks"],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  if (result.exitCode === 0) {
    failures.push(`residual grep hit for pattern: ${pattern}\n${new TextDecoder().decode(result.stdout).trim()}`)
  }

  if (result.exitCode > 1) {
    failures.push(`residual grep command failed for pattern: ${pattern}\n${new TextDecoder().decode(result.stderr).trim()}`)
  }
}

if (failures.length) {
  console.error("upstream merge version gate failed")
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`upstream merge version gate passed for ${version}`)
