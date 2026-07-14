import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import type { OpencodeClient, Session, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { createDirSyncContext } from "./directory-sync"
import { createServerSession } from "./server-session"
import { ServerScope } from "@/utils/server-scope"

function session(id: string, directory: string): Session {
  return {
    id,
    slug: id,
    projectID: "project",
    directory,
    title: id,
    version: "1",
    time: { created: 1, updated: 1 },
  }
}

describe("DirectorySync.refreshStatus", () => {
  test("clears stale busy status only for sessions owned by the directory", async () => {
    const statuses: Record<string, SessionStatus> = {
      active: { type: "busy" },
    }
    const client = {
      session: {
        status: async () => ({ data: statuses }),
      },
    } as unknown as OpencodeClient
    const serverSession = createServerSession(client)
    serverSession.remember(session("active", "/repo"))
    serverSession.remember(session("stale", "/repo"))
    serverSession.remember(session("other", "/other"))
    serverSession.set("session_status", "stale", { type: "busy" })
    serverSession.set("session_status", "other", { type: "busy" })

    const context = createDirSyncContext(
      "/repo",
      {
        child: () => createStore({ path: { directory: "/repo" }, status: "complete", session: [] }),
        session: serverSession,
      } as unknown as Parameters<typeof createDirSyncContext>[1],
      {
        createClient: () => client,
        scope: ServerScope.local,
      } as unknown as Parameters<typeof createDirSyncContext>[2],
    )

    await context.session.refreshStatus()

    expect(serverSession.data.session_status.active).toEqual({ type: "busy" })
    expect(serverSession.data.session_status.stale).toBeUndefined()
    expect(serverSession.data.session_status.other).toEqual({ type: "busy" })
  })
})
