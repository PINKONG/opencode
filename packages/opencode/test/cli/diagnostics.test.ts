import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

test("diagnostics status prints an absolute local log directory", async () => {
  const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "status"], {
    cwd: new URL("../../", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  const status = JSON.parse(output.trim()) as { root: string; enabled: boolean }
  expect(status.root).toMatch(/^\//)
  expect(typeof status.enabled).toBe("boolean")
}, 30_000)

test("diagnostics cleanup requires an explicit yes flag", async () => {
  const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "cleanup"], {
    cwd: new URL("../../", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(await child.exited).not.toBe(0)
}, 30_000)

test("diagnostics clear requires --yes and removes today's files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-clear-"))
  try {
    const file = path.join(root, "data", "wiscode", "log", "diagnostics", new Date().toISOString().slice(0, 10), "ses_cli.jsonl")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "current\n")
    const env = {
      ...process.env,
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    }
    const run = (args: string[]) =>
      Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "clear", ...args], {
        cwd: new URL("../../", import.meta.url).pathname,
        env,
        stdout: "pipe",
        stderr: "pipe",
      })
    const refused = run([])
    expect(await refused.exited).not.toBe(0)
    expect(await new Response(refused.stderr).text()).toContain("requires --yes")
    expect(await fs.readFile(file, "utf8")).toBe("current\n")

    const cleared = run(["--yes"])
    expect(await cleared.exited).toBe(0)
    expect(JSON.parse(await new Response(cleared.stdout).text())).toMatchObject({ deleted: 1, skipped: 0 })
    await expect(fs.stat(file)).rejects.toThrow()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("diagnostics tail selects a named session and distinguishes absent scope", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-tail-"))
  try {
    const dir = path.join(root, "data", "wiscode", "log", "diagnostics", "2026-10-20")
    await fs.mkdir(dir, { recursive: true })
    const event = (id: string, sessionId: string) => JSON.stringify({
      schema: "wiscode.diagnostic", schemaVersion: 1, seq: 0, eventId: id,
      event: "task.started", status: "started", timestamp: "2026-10-20T10:00:00.000Z",
      monotonicMs: 1, sessionId, payload: { summary: { agent: "build" } },
    }) + "\n"
    await fs.writeFile(path.join(dir, "ses_one.jsonl"), event("evt_one", "ses_one"))
    await fs.writeFile(path.join(dir, "ses_two.jsonl"), event("evt_two", "ses_two"))
    const run = (session: string) => Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "tail", "--session", session, "--ids"], {
      cwd: new URL("../../", import.meta.url).pathname,
      env: { ...process.env, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state") },
      stdout: "pipe", stderr: "pipe",
    })
    const present = run("ses_one")
    expect(await present.exited).toBe(0)
    const output = await new Response(present.stdout).text()
    expect(output).toContain("evt_one")
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3} [+-]\d{2}:\d{2}/)
    const absent = run("ses_absent")
    expect(await absent.exited).not.toBe(0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("diagnostics tail rejects normalized invalid calendar dates", async () => {
  const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "tail", "--since", "2026-02-30T00:00:00Z"], {
    cwd: new URL("../../", import.meta.url).pathname,
    stdout: "pipe", stderr: "pipe",
  })
  expect(await child.exited).not.toBe(0)
  expect(await new Response(child.stderr).text()).toContain("invalid --since timestamp")
}, 30_000)

test("diagnostics show exposes raw only with --raw", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-show-"))
  try {
    const dir = path.join(root, "data", "wiscode", "log", "diagnostics", "2026-10-20")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, "instance.jsonl"), JSON.stringify({
      schema: "wiscode.diagnostic", schemaVersion: 1, seq: 0, eventId: "evt_secret",
      event: "plugin.loaded", status: "succeeded", timestamp: "2026-10-20T10:00:00.000Z",
      monotonicMs: 1, payload: { summary: { name: "demo" }, raw: { providerResponse: {
        headers: { "content-type": "text/event-stream" },
        body: "data: {\"private\":\"private-body\"}\n\ndata: [DONE]\n\n",
      } } },
    }) + "\n")
    const run = (args: string[]) => Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "show", "evt_secret", ...args], {
      cwd: new URL("../../", import.meta.url).pathname,
      env: { ...process.env, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state") },
      stdout: "pipe", stderr: "pipe",
    })
    const ordinary = run([])
    expect(await ordinary.exited).toBe(0)
    expect(await new Response(ordinary.stdout).text()).not.toContain("private-body")
    const raw = run(["--raw"])
    expect(await raw.exited).toBe(0)
    const output = await new Response(raw.stdout).text()
    expect(output).toContain("private-body")
    expect(output).toContain("sseFrames")
    expect(output).toContain("[DONE]")
    expect(await new Response(raw.stderr).text()).toContain("unredacted")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("diagnostics show keeps large raw output intact through a pipe", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-show-large-"))
  try {
    const dir = path.join(root, "data", "wiscode", "log", "diagnostics", "2026-10-20")
    await fs.mkdir(dir, { recursive: true })
    const body = "x".repeat(2 * 1024 * 1024)
    await fs.writeFile(path.join(dir, "instance.jsonl"), JSON.stringify({
      schema: "wiscode.diagnostic", schemaVersion: 1, seq: 0, eventId: "evt_large",
      event: "llm.request.completed", status: "succeeded", timestamp: "2026-10-20T10:00:00.000Z",
      monotonicMs: 1, payload: { summary: { name: "demo" }, raw: { providerResponse: { body } } },
    }) + "\n")
    const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "show", "evt_large", "--raw"], {
      cwd: new URL("../../", import.meta.url).pathname,
      env: { ...process.env, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state") },
      stdout: "pipe", stderr: "pipe",
    })
    const output = await new Response(child.stdout).text()
    expect(await child.exited).toBe(0)
    expect(JSON.parse(output).raw.providerResponse.body).toHaveLength(body.length)

    const redirectedPath = path.join(root, "raw.json")
    const redirectedFile = await fs.open(redirectedPath, "w")
    const redirected = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "show", "evt_large", "--raw"], {
      cwd: new URL("../../", import.meta.url).pathname,
      env: { ...process.env, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state") },
      stdout: redirectedFile.fd, stderr: "ignore",
    })
    expect(await redirected.exited).toBe(0)
    await redirectedFile.close()
    expect(JSON.parse(await fs.readFile(redirectedPath, "utf8")).raw.providerResponse.body).toHaveLength(body.length)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("diagnostics tail --follow prints initial and appended complete lines once", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-follow-"))
  try {
    const dir = path.join(root, "data", "wiscode", "log", "diagnostics", "2026-10-20")
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, "ses_live.jsonl")
    const event = (id: string, seq: number) => JSON.stringify({
      schema: "wiscode.diagnostic", schemaVersion: 1, seq, eventId: id,
      event: "task.started", status: "started", timestamp: `2026-10-20T10:00:0${seq}.000Z`,
      monotonicMs: 1, sessionId: "ses_live", payload: { summary: { agent: "build" } },
    })
    await fs.writeFile(file, event("evt_first", 0) + "\n")
    const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "tail", "--session", "ses_live", "--follow", "--ids"], {
      cwd: new URL("../../", import.meta.url).pathname,
      env: { ...process.env, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state") },
      stdout: "pipe", stderr: "pipe",
    })
    try {
      await Bun.sleep(3000)
      const second = event("evt_second", 1)
      await fs.appendFile(file, second.slice(0, 25))
      await Bun.sleep(1200)
      await fs.appendFile(file, second.slice(25) + "\n")
      await Bun.sleep(1500)
      await fs.writeFile(file, event("evt_reset", 0) + "\n")
      await Bun.sleep(1500)
    } finally {
      child.kill()
    }
    const output = await new Response(child.stdout).text()
    expect(output.match(/eventId=evt_first/g)).toHaveLength(1)
    expect(output.match(/eventId=evt_second/g)).toHaveLength(1)
    expect(output.match(/eventId=evt_reset/g)).toHaveLength(1)
    expect(await new Response(child.stderr).text()).toContain("Diagnostic stream reset:")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("trace follow backfills child records when their link appears later", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-trace-follow-"))
  try {
    const dir = path.join(root, "data", "wiscode", "log", "diagnostics", "2026-10-20")
    await fs.mkdir(dir, { recursive: true })
    const event = (id: string, traceId: string, summary: Record<string, unknown> = {}) => JSON.stringify({
      schema: "wiscode.diagnostic", schemaVersion: 1, seq: 0, eventId: id,
      event: id === "evt_link" ? "task.child.started" : "task.started", status: "started",
      timestamp: "2026-10-20T10:00:00.000Z", monotonicMs: 1, traceId,
      sessionId: traceId === "trace_parent" ? "ses_parent" : "ses_child", payload: { summary },
    }) + "\n"
    const parent = path.join(dir, "ses_parent.jsonl")
    await fs.writeFile(parent, event("evt_parent", "trace_parent"))
    await fs.writeFile(path.join(dir, "ses_child.jsonl"), event("evt_child", "trace_child"))
    const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "tail", "--trace", "trace_parent", "--follow", "--ids"], {
      cwd: new URL("../../", import.meta.url).pathname,
      env: { ...process.env, XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state") },
      stdout: "pipe", stderr: "pipe",
    })
    let output = ""
    let ready: () => void = () => {}
    const started = new Promise<void>((resolve) => { ready = resolve })
    const reading = (async () => {
      const reader = child.stdout.getReader()
      while (true) {
        const next = await reader.read()
        if (next.done) break
        output += Buffer.from(next.value).toString("utf8")
        if (output.includes("eventId=evt_parent")) ready()
      }
    })()
    try {
      await Promise.race([started, Bun.sleep(12_000).then(() => { throw new Error("trace follow did not start") })])
      expect(output).not.toContain("eventId=evt_child")
      await fs.appendFile(parent, event("evt_link", "trace_parent", { childTraceId: "trace_child" }))
      await Bun.sleep(1800)
    } finally {
      child.kill()
    }
    await reading
    expect(output).toContain("eventId=evt_child")
    expect(output.match(/eventId=evt_child/g)).toHaveLength(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)
