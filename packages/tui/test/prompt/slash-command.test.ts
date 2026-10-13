import { describe, expect, test } from "bun:test"
import { visibleSlashCommand } from "../../src/component/prompt/autocomplete"

describe("slash command visibility", () => {
  test("shows BMAD skills while leaving other skills in the skills menu", () => {
    expect(visibleSlashCommand({ name: "bmad", source: "skill" })).toBe(true)
    expect(visibleSlashCommand({ name: "bmad-agent-analyst", source: "skill" })).toBe(true)
    expect(visibleSlashCommand({ name: "review", source: "skill" })).toBe(false)
    expect(visibleSlashCommand({ name: "my-command", source: "command" })).toBe(true)
    expect(visibleSlashCommand({ name: "bmad-init", source: "command" })).toBe(true)
  })
})
