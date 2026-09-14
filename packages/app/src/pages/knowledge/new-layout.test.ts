import { expect, test } from "bun:test"

test("uses a wide flexible workspace for the new knowledge page", async () => {
  const source = await Bun.file(new URL("./new-layout.tsx", import.meta.url)).text()

  expect(source).toContain("max-w-[1440px]")
  expect(source).not.toContain("lg:grid-cols-[280px_minmax(0,720px)]")
})

test("keeps the knowledge page independent from home project navigation", async () => {
  const source = await Bun.file(new URL("./new-layout.tsx", import.meta.url)).text()

  expect(source).not.toContain("HomeProjects")
  expect(source).not.toContain("HomeUtilityNav")
  expect(source).not.toContain("createHomeProjectsController")
})
