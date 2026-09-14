import { describe, expect, test } from "bun:test"

const appSource = Bun.file(new URL("./app.tsx", import.meta.url))

describe("app route registration", () => {
  test("keeps knowledge routes mounted under directory layout", async () => {
    const source = await appSource.text()

    expect(source).toContain('<Route path="/knowledge"')
    expect(source).toContain('<Route path="/knowledge/:dataset"')
    expect(source).toContain('<Route path="/knowledge/:dataset/:document"')
  })

  test("mounts new-layout knowledge routes outside the legacy directory layout", async () => {
    const source = await appSource.text()

    expect(source).toContain('<Route path="/knowledge/:dir" component={NewKnowledgeRoute} />')
    expect(source).toContain('<Route path="/knowledge/:dir/:dataset" component={NewKnowledgeRoute} />')
    expect(source).toContain('<Route path="/knowledge/:dir/:dataset/:document" component={NewKnowledgeRoute} />')
    expect(source).toContain("<NewKnowledgePage />")
  })
})
