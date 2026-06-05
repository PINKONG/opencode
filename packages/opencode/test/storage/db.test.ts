import { describe, expect, test } from "bun:test"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { Database } from "@/storage/db"

describe("Database.getChannelPath", () => {
  test("returns WisCode database path for the current channel", () => {
    const expected = ["latest", "beta", "prod"].includes(InstallationChannel)
      ? path.join(Global.Path.data, "wiscode.db")
      : path.join(Global.Path.data, `wiscode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)

    expect(Database.getChannelPath()).toBe(expected)
  })

  test("uses the shared database path when channel databases are disabled explicitly", () => {
    expect(Database.getChannelPath({ disableChannelDb: true })).toBe(path.join(Global.Path.data, "wiscode.db"))
  })

  test("uses the shared database path when OPENCODE_DISABLE_CHANNEL_DB is set", () => {
    const previous = process.env.OPENCODE_DISABLE_CHANNEL_DB
    process.env.OPENCODE_DISABLE_CHANNEL_DB = "true"
    try {
      expect(Database.getChannelPath()).toBe(path.join(Global.Path.data, "wiscode.db"))
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_DISABLE_CHANNEL_DB
      else process.env.OPENCODE_DISABLE_CHANNEL_DB = previous
    }
  })
})
