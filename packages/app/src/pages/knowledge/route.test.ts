import { describe, expect, test } from "bun:test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import {
  knowledgeActive,
  knowledgeDirectory,
  knowledgeExitHref,
  knowledgeHref,
  knowledgeParentHref,
  knowledgeRootOnClientChange,
  knowledgeV2ExitHref,
  knowledgeV2Href,
  knowledgeV2ParentHref,
  knowledgeVisible,
} from "./route"

describe("knowledge route helpers", () => {
  test("uses the first project directory for the home rail entry", () => {
    expect(
      knowledgeDirectory({
        directory: undefined,
        projects: [{ worktree: "/workspace/first" }, { worktree: "/workspace/second" }],
      }),
    ).toBe("/workspace/first")
  })

  test("keeps the current directory ahead of the home project fallback", () => {
    expect(
      knowledgeDirectory({
        directory: " /workspace/current ",
        projects: [{ worktree: "/workspace/first" }],
      }),
    ).toBe("/workspace/current")
  })

  test("builds dataset and document knowledge hrefs from directory", () => {
    const dir = "/tmp/demo"
    const slug = base64Encode(dir)

    expect(knowledgeHref(dir)).toBe(`/${slug}/knowledge`)
    expect(knowledgeHref(dir, "dataset-1")).toBe(`/${slug}/knowledge/dataset-1`)
    expect(knowledgeHref(dir, "dataset-1", "document-1")).toBe(`/${slug}/knowledge/dataset-1/document-1`)
  })

  test("builds new-layout knowledge hrefs outside the legacy directory route", () => {
    const dir = "/tmp/demo"
    const slug = base64Encode(dir)

    expect(knowledgeV2Href(dir)).toBe(`/knowledge/${slug}`)
    expect(knowledgeV2Href(dir, "dataset-1")).toBe(`/knowledge/${slug}/dataset-1`)
    expect(knowledgeV2Href(dir, "dataset-1", "document-1", "maxkb-prod")).toBe(
      `/knowledge/${slug}/dataset-1/document-1?client=maxkb-prod`,
    )
    expect(knowledgeV2ParentHref(dir, "dataset-1", "document-1")).toBe(`/knowledge/${slug}/dataset-1`)
    expect(knowledgeV2ExitHref()).toBe("/")
  })

  test("preserves selected client in knowledge hrefs", () => {
    const dir = "/tmp/demo"
    const slug = base64Encode(dir)

    expect(knowledgeHref(dir, "dataset-1", undefined, "maxkb-prod")).toBe(
      `/${slug}/knowledge/dataset-1?client=maxkb-prod`,
    )
    expect(knowledgeHref(dir, "dataset-1", "document-1", "maxkb-prod")).toBe(
      `/${slug}/knowledge/dataset-1/document-1?client=maxkb-prod`,
    )
  })

  test("preserves selected client when returning to dataset document list", () => {
    const dir = "/tmp/demo"
    const slug = base64Encode(dir)

    expect(knowledgeHref(dir, "dataset-1", undefined, "maxkb-prod")).toBe(
      `/${slug}/knowledge/dataset-1?client=maxkb-prod`,
    )
  })

  test("marks knowledge paths as active", () => {
    expect(knowledgeActive("/abc/knowledge")).toBe(true)
    expect(knowledgeActive("/abc/knowledge/dataset-1")).toBe(true)
    expect(knowledgeActive("/abc/knowledge/dataset-1/document-1")).toBe(true)
  })

  test("ignores non-knowledge paths", () => {
    expect(knowledgeActive("/abc/session")).toBe(false)
    expect(knowledgeActive("/abc")).toBe(false)
    expect(knowledgeActive("/")).toBe(false)
  })

  test("shows rail entry only when availability resolved with clients", () => {
    expect(knowledgeVisible({ loading: true, clients: [] })).toBe(false)
    expect(knowledgeVisible({ loading: false, clients: [] })).toBe(false)
    expect(knowledgeVisible({ loading: false, clients: ["alpha"] })).toBe(true)
  })

  test("resets to knowledge root when client changes", () => {
    const dir = "/tmp/demo"
    expect(knowledgeRootOnClientChange(dir)).toBe(knowledgeHref(dir))
  })

  test("builds deterministic parent hrefs with selected client", () => {
    const dir = "/tmp/demo"
    const slug = base64Encode(dir)

    expect(knowledgeParentHref(dir, "dataset-1", undefined, "maxkb-prod")).toBe(
      `/${slug}/knowledge?client=maxkb-prod`,
    )
    expect(knowledgeParentHref(dir, "dataset-1", "document-1", "maxkb-prod")).toBe(
      `/${slug}/knowledge/dataset-1?client=maxkb-prod`,
    )
  })

  test("builds exit href back to the directory session route", () => {
    const dir = "/tmp/demo"
    const slug = base64Encode(dir)

    expect(knowledgeExitHref(dir)).toBe(`/${slug}/session`)
  })
})
