import { expect, test } from "bun:test"
import { visibleSlashCommand } from "../../../src/cli/cmd/run/footer.prompt"

test("hides BMAD skills from ordinary slash completion", () => {
  expect(visibleSlashCommand({ name: "bmad", source: "skill" })).toBe(false)
  expect(visibleSlashCommand({ name: "bmad-agent-analyst", source: "skill" })).toBe(false)
  expect(visibleSlashCommand({ name: "bmad-init", source: "command" })).toBe(true)
  expect(visibleSlashCommand({ name: "other-skill", source: "skill" })).toBe(false)
  expect(visibleSlashCommand({ name: "bmadish", source: "skill" })).toBe(false)
})
