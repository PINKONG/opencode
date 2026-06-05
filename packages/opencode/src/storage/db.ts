import nodePath from "path"
import { Database as CoreDatabase } from "@opencode-ai/core/database/database"
import { Global } from "@opencode-ai/core/global"
import { Flag } from "@opencode-ai/core/flag/flag"
import { InstallationChannel } from "@opencode-ai/core/installation/version"

export * from "drizzle-orm"

function disableChannelDb() {
  return process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" || process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
}

export function getChannelPath(input: { disableChannelDb?: boolean } = {}) {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || input.disableChannelDb || disableChannelDb()) {
    return nodePath.join(Global.Path.data, "wiscode.db")
  }
  return nodePath.join(Global.Path.data, `wiscode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export function getPath(input?: { disableChannelDb?: boolean }) {
  if (Flag.OPENCODE_DB) {
    if (Flag.OPENCODE_DB === ":memory:" || nodePath.isAbsolute(Flag.OPENCODE_DB)) return Flag.OPENCODE_DB
    return nodePath.join(Global.Path.data, Flag.OPENCODE_DB)
  }
  return getChannelPath(input)
}

export function pathForWisCode() {
  return getPath()
}

export const path = pathForWisCode

export function layerFromPath(filename: string) {
  return CoreDatabase.layerFromPath(filename)
}

export const layer = CoreDatabase.layer

export const defaultLayer = layerFromPath(path())

export const Service = CoreDatabase.Service

export const Database = {
  ...CoreDatabase,
  Service,
  layer,
  layerFromPath,
  defaultLayer,
  path,
  getPath,
  getChannelPath,
}
