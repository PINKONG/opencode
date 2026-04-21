import { describe, expect, test } from "bun:test"
import { knowledgeIcon, knowledgeVariant } from "./sidebar-shell-view"

describe("sidebar shell view", () => {
  test("uses maxkb icon for the knowledge entry", () => {
    expect(knowledgeIcon()).toBe("maxkb")
  })

  test("keeps the knowledge entry borderless in the rail", () => {
    expect(knowledgeVariant()).toBe("ghost")
  })
})
