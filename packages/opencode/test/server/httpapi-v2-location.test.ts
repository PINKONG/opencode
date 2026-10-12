import { afterEach, describe, expect, test } from "bun:test"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { Context, Schema } from "effect"
import path from "path"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>

function request(route: string, directory: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-opencode-directory", directory)
  return HttpApiApp.webHandler().handler(
    new Request(`http://localhost${route}`, {
      ...init,
      headers,
    }),
    context,
  )
}

const Event = Schema.Struct({
  id: EventV2.ID,
  type: Schema.String,
  location: Schema.optional(Location.Ref),
  data: Schema.Unknown,
})

async function* eventStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const boundary = buffer.match(/(?:\r\n|\r|\n){2}/)
      if (!boundary || boundary.index === undefined) {
        const value = await reader.read()
        if (value.done) return
        buffer += decoder.decode(value.value, { stream: true })
        continue
      }

      const record = buffer.slice(0, boundary.index)
      buffer = buffer.slice(boundary.index + boundary[0].length)
      const data = record
        .split(/\r\n|\r|\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
      if (data.length) yield Schema.decodeUnknownSync(Event)(JSON.parse(data.join("\n")))
    }
  } finally {
    try {
      await reader.cancel()
    } finally {
      reader.releaseLock()
    }
  }
}

async function readEvent(reader: AsyncIterator<typeof Event.Type>) {
  const value = await reader.next()
  if (value.done) throw new Error("event stream closed")
  return value.value
}

async function readEventType(reader: AsyncIterator<typeof Event.Type>, type: string) {
  for (let index = 0; index < 20; index++) {
    const event = await readEvent(reader)
    if (event.type === type) return event
  }
  throw new Error(`timed out waiting for ${type}`)
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("v2 location HttpApi", () => {
  test("rejects a BMAD command denied by the selected agent", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(
      path.join(tmp.path, "wiscode.json"),
      JSON.stringify({ agents: { build: { permissions: [{ action: "skill", resource: "bmad", effect: "deny" }] } } }),
    )
    await Bun.write(
      path.join(tmp.path, ".agents", "skills", "bmad", "SKILL.md"),
      "---\nname: bmad\ndescription: BMAD help\n---\n# Help",
    )
    const created = await request("/api/session", tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { directory: tmp.path } }),
    })
    expect(created.status).toBe(200)
    const session = (await created.json()) as { data: { id: string } }
    const result = await request(`/api/session/${session.data.id}/command`, tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "bmad", agent: "build", resume: false }),
    })
    expect(result.status).toBe(400)
    expect(JSON.stringify(await result.json())).toContain("Skill unavailable for agent: bmad")
  })

  test("refreshes BMAD commands after a ready manifest is written", async () => {
    await using tmp = await tmpdir({ git: true })
    const first = await request("/api/command", tmp.path)
    expect(first.status).toBe(200)
    expect(((await first.json()) as { data: { name: string }[] }).data.some((item) => item.name === "bmad")).toBe(false)
    await Bun.write(
      path.join(tmp.path, ".agents", "skills", "bmad", "SKILL.md"),
      "---\nname: bmad\ndescription: BMAD help\n---\n# Help",
    )
    await Bun.write(path.join(tmp.path, ".opencode", "bmad-managed.json"), '{"phase":"ready","commit":"one"}')
    const second = await request("/api/command", tmp.path)
    expect(second.status).toBe(200)
    expect(((await second.json()) as { data: { name: string; source?: string }[] }).data).toContainEqual(
      expect.objectContaining({ name: "bmad", source: "skill" }),
    )
  })

  test("does not expose one project's BMAD commands in another project", async () => {
    await using first = await tmpdir({ git: true })
    await using second = await tmpdir({ git: true })
    await Bun.write(
      path.join(first.path, ".agents", "skills", "bmad", "SKILL.md"),
      "---\nname: bmad\ndescription: BMAD help\n---\n# Help",
    )
    await Bun.write(path.join(first.path, ".opencode", "bmad-managed.json"), '{"phase":"ready","commit":"one"}')

    const installed = await request("/api/command", first.path)
    const untouched = await request("/api/command", second.path)
    expect(installed.status).toBe(200)
    expect(untouched.status).toBe(200)
    expect(((await installed.json()) as { data: { name: string }[] }).data.some((item) => item.name === "bmad")).toBe(
      true,
    )
    expect(((await untouched.json()) as { data: { name: string }[] }).data.some((item) => item.name === "bmad")).toBe(
      false,
    )
  })

  test("admits a discovered BMAD command through the V2 session endpoint", async () => {
    await using tmp = await tmpdir({ git: true })
    const skill = path.join(tmp.path, ".agents", "skills", "bmad")
    await Bun.write(path.join(skill, "SKILL.md"), "---\nname: bmad\ndescription: BMAD help\n---\n# Help\n")
    const created = await request("/api/session", tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { directory: tmp.path } }),
    })
    expect(created.status).toBe(200)
    const session = (await created.json()) as { data: { id: string } }
    const response = await request(`/api/session/${session.data.id}/command`, tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "bmad", arguments: "next steps", resume: false }),
    })
    expect(response.status).toBe(200)
    const admitted = (await response.json()) as { data: { prompt: { text: string } } }
    expect(admitted.data.prompt.text).toContain("# Help")
    expect(admitted.data.prompt.text).toContain(`Base directory for this skill: ${skill}`)
    expect(admitted.data.prompt.text).toContain("next steps")
    const missing = await request(`/api/session/${session.data.id}/command`, tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "bmad-missing", resume: false }),
    })
    expect(missing.status).toBe(400)
  })

  test("preserves command attachments and selected agent and model", async () => {
    await using tmp = await tmpdir({ git: true })
    await Bun.write(
      path.join(tmp.path, ".agents", "skills", "bmad", "SKILL.md"),
      "---\nname: bmad\ndescription: BMAD help\n---\n# Help\n",
    )
    const created = await request("/api/session", tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ location: { directory: tmp.path } }),
    })
    const session = (await created.json()) as { data: { id: string } }
    const response = await request(`/api/session/${session.data.id}/command`, tmp.path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: "bmad",
        agent: "build",
        model: { providerID: "test", id: "model", variant: "fast" },
        files: [{ uri: "data:text/plain;base64,aGVsbG8=", name: "notes.txt" }],
        resume: false,
      }),
    })
    expect(response.status).toBe(200)
    const admitted = (await response.json()) as { data: { prompt: { files: unknown[] } } }
    expect(admitted.data.prompt.files).toEqual([
      { uri: "data:text/plain;base64,aGVsbG8=", name: "notes.txt", mime: "text/plain" },
    ])
    const current = await request(`/api/session/${session.data.id}`, tmp.path)
    expect(current.status).toBe(200)
    expect((await current.json()) as unknown).toMatchObject({
      data: { agent: "build", model: { providerID: "test", id: "model", variant: "fast" } },
    })
  })

  test("decodes EventV2 location refs without resolved project metadata", () => {
    expect(
      Schema.decodeUnknownSync(Event)({
        id: "evt_test",
        type: "file.watcher.updated",
        location: { directory: "/tmp/project" },
        data: {},
      }),
    ).toMatchObject({ location: { directory: "/tmp/project" } })
  })

  test("returns command and skill snapshots with resolved locations", async () => {
    await using tmp = await tmpdir({ git: true })

    for (const route of ["/api/command", "/api/skill"]) {
      const response = await request(route, tmp.path)
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        location: { directory: string; project: { id: string } }
        data: unknown
      }
      expect(body.data).toBeArray()
      expect(body.location.directory).toBe(tmp.path)
      expect(body.location.project.id).toBeTruthy()
    }
  })

  test("streams native EventV2 payloads across locations", async () => {
    await using subscriber = await tmpdir({ git: true })
    await using publisher = await tmpdir({ git: true })
    const response = await request("/api/event", subscriber.path)
    const reader = eventStream(response.body!)
    const connected = await readEvent(reader)
    expect(connected.type).toBe("server.connected")
    expect(connected.location).toBeUndefined()

    const created = await request("/session", publisher.path, { method: "POST" })
    expect(created.status).toBe(200)
    expect(await readEventType(reader, "session.created")).toMatchObject({
      type: "session.created",
      location: { directory: publisher.path },
      data: { sessionID: expect.any(String) },
    })
    await reader.return(undefined)
  })
})
