import { expect, test } from "bun:test"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { buildHomeSessionRecords } from "./home-session-records"

const session = {
  id: "ses_123",
  projectID: "global",
  directory: "/Users/ammon/Sites",
  title: "Hello",
  time: { created: 1, updated: 2 },
} as Session

test("shows server sessions when browser project state is empty", () => {
  const records = buildHomeSessionRecords({
    sessions: () => [session],
    projectDirectories: () => [],
    projects: () => [],
    projectByID: () => new Map(),
  })

  expect(records).toHaveLength(1)
  expect(records[0]?.session.id).toBe("ses_123")
  expect(records[0]?.project.worktree).toBe("/Users/ammon/Sites")
  expect(records[0]?.projectName).toBe("Sites")
})

test("keeps filtering sessions when a project is selected", () => {
  const records = buildHomeSessionRecords({
    sessions: () => [session],
    projectDirectories: () => ["/Users/ammon/Other"],
    projects: () => [{ worktree: "/Users/ammon/Other", expanded: true }],
    projectByID: () => new Map(),
  })

  expect(records).toEqual([])
})
