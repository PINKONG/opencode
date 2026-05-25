import { test, expect, describe, mock, afterEach, beforeEach } from "bun:test"
import { Effect, Exit, Layer, Option } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { Config } from "@/config/config"
import { ConfigManaged } from "@/config/managed"
import { ConfigParse } from "../../src/config/parse"
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"

import { InstanceRef } from "../../src/effect/instance-ref"
import type { InstanceContext } from "../../src/project/instance-context"
import { Auth } from "../../src/auth"
import { Account } from "../../src/account/account"
import { AccessToken, AccountID, OrgID } from "../../src/account/schema"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Env } from "../../src/env"
import {
  provideTestInstance,
  provideTmpdirInstance,
  TestInstance,
  tmpdir,
  tmpdirScoped,
  withTestInstance,
} from "../fixture/fixture"
import { InstanceRuntime } from "@/project/instance-runtime"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

/** Infra layer that provides FileSystem, Path, ChildProcessSpawner for test fixtures */
const infra = CrossSpawnSpawner.defaultLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
)
import path from "path"
import fs from "fs/promises"
import { pathToFileURL } from "url"
import { Global } from "@opencode-ai/core/global"
import { ProjectID } from "../../src/project/schema"
import { Filesystem } from "@/util/filesystem"
import { ConfigPlugin } from "@/config/plugin"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"

const testFlock = EffectFlock.defaultLayer

const unexpectedHttp = HttpClient.make((request) =>
  Effect.die(`unexpected http request: ${request.method} ${request.url}`),
)

const json = (request: Parameters<typeof HttpClientResponse.fromWeb>[0], body: unknown, status = 200) =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )

const wellKnownAuth = (url: string) =>
  Layer.mock(Auth.Service)({
    all: () =>
      Effect.succeed({
        [url]: new Auth.WellKnown({ type: "wellknown", key: "TEST_TOKEN", token: "test-token" }),
      }),
  })

function remoteConfigClient(input: {
  wellKnown: unknown
  remote?: unknown
  seen: { wellKnown?: string; remote?: string; authorization?: string }
}) {
  return HttpClient.make((request) => {
    if (request.url.includes(".well-known/opencode")) {
      input.seen.wellKnown = request.url
      return Effect.succeed(json(request, input.wellKnown))
    }
    if (input.remote !== undefined && request.url.includes("config.example.com")) {
      input.seen.remote = request.url
      input.seen.authorization = request.headers.authorization
      return Effect.succeed(json(request, input.remote))
    }
    return Effect.succeed(json(request, {}, 404))
  })
}

const configLayer = (
  options: {
    auth?: Layer.Layer<Auth.Service>
    account?: Layer.Layer<Account.Service>
    client?: HttpClient.HttpClient
  } = {},
) =>
  Config.layer.pipe(
    Layer.provide(testFlock),
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(Env.defaultLayer),
    Layer.provide(options.auth ?? AuthTest.empty),
    Layer.provide(options.account ?? AccountTest.empty),
    Layer.provideMerge(infra),
    Layer.provide(NpmTest.noop),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, options.client ?? unexpectedHttp)),
  )

const layer = configLayer()

const it = testEffect(layer)

const provideCurrentInstance = <A, E, R>(effect: Effect.Effect<A, E, R>, ctx: InstanceContext) =>
  effect.pipe(Effect.provideService(InstanceRef, ctx))

const load = (ctx: InstanceContext) =>
  Effect.runPromise(
    Config.Service.use((svc) => provideCurrentInstance(svc.get(), ctx)).pipe(Effect.scoped, Effect.provide(layer)),
  )
const save = (config: Config.Info, ctx: InstanceContext) =>
  Effect.runPromise(
    Config.Service.use((svc) => provideCurrentInstance(svc.update(config), ctx)).pipe(
      Effect.scoped,
      Effect.provide(layer),
    ),
  )
const saveGlobal = (config: Config.Info) =>
  Effect.runPromise(Config.Service.use((svc) => svc.updateGlobal(config)).pipe(Effect.scoped, Effect.provide(layer)))

const clear = async (wait = false) => {
  await Effect.runPromise(Config.Service.use((svc) => svc.invalidate()).pipe(Effect.scoped, Effect.provide(layer)))
  if (wait) await InstanceRuntime.disposeAllInstances()
}
const listDirs = (ctx: InstanceContext) =>
  Effect.runPromise(
    Config.Service.use((svc) => provideCurrentInstance(svc.directories(), ctx)).pipe(
      Effect.scoped,
      Effect.provide(layer),
    ),
  )
const ready = (ctx: InstanceContext) =>
  Effect.runPromise(
    Config.Service.use((svc) => provideCurrentInstance(svc.waitForDependencies(), ctx)).pipe(
      Effect.scoped,
      Effect.provide(layer),
    ),
  )

// Get managed config directory from environment (set in preload.ts)
const managedConfigDir = process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR!
const originalTestToken = process.env.TEST_TOKEN

beforeEach(async () => {
  await clear(true)
})

afterEach(async () => {
  await fs.rm(managedConfigDir, { force: true, recursive: true }).catch(() => {})
  if (originalTestToken === undefined) delete process.env.TEST_TOKEN
  else process.env.TEST_TOKEN = originalTestToken
  await clear(true)
})

async function writeManagedSettings(settings: object, filename = "opencode.json") {
  await fs.mkdir(managedConfigDir, { recursive: true })
  await Filesystem.write(path.join(managedConfigDir, filename), JSON.stringify(settings))
}

async function writeConfig(dir: string, config: object, name = "opencode.json") {
  await Filesystem.write(path.join(dir, name), JSON.stringify(config))
}

const writeConfigEffect = (dir: string, config: object, name = "opencode.json") =>
  Effect.promise(() => writeConfig(dir, config, name))
const mkdirEffect = (dir: string) => Effect.promise(() => fs.mkdir(dir, { recursive: true }))
const writeTextEffect = (file: string, content: string) => Effect.promise(() => Filesystem.write(file, content))

function withProcessEnv<A, E, R>(key: string, value: string | undefined, effect: Effect.Effect<A, E, R>) {
  return withProcessEnvs({ [key]: value }, effect)
}

function withProcessEnvs<A, E, R>(entries: Record<string, string | undefined>, effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const originals: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(entries)) {
        originals[key] = process.env[key]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      return originals
    }),
    () => effect,
    (originals) =>
      Effect.sync(() => {
        for (const [key, original] of Object.entries(originals)) {
          if (original !== undefined) process.env[key] = original
          else delete process.env[key]
        }
      }),
  )
}
async function check(map: (dir: string) => string) {
  if (process.platform !== "win32") return
  await using globalTmp = await tmpdir()
  await using tmp = await tmpdir({ git: true, config: { snapshot: true } })
  const prev = Global.Path.config
  ;(Global.Path as { config: string }).config = globalTmp.path
  await clear()
  try {
    await writeConfig(globalTmp.path, {
      $schema: "https://opencode.ai/config.json",
      snapshot: false,
    })
    await withTestInstance({
      directory: map(tmp.path),
      fn: async (ctx) => {
        const cfg = await load(ctx)
        expect(cfg.snapshot).toBe(true)
        expect(ctx.directory).toBe(Filesystem.resolve(tmp.path))
        expect(ctx.project.id).not.toBe(ProjectID.global)
      },
    })
  } finally {
    await InstanceRuntime.disposeAllInstances()
    ;(Global.Path as { config: string }).config = prev
    await clear()
  }
}

test("loads config with defaults when no files exist", async () => {
  await using tmp = await tmpdir()
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.username).toBeDefined()
    },
  })
})

test("uses wiscode global config directory", () => {
  expect(path.basename(Global.Path.config)).toBe("wiscode")
})

test("creates global jsonc config with schema when no global configs exist", async () => {
  await using tmp = await tmpdir()
  const prev = Global.Path.config
  ;(Global.Path as { config: string }).config = tmp.path
  await clear(true)

  try {
    await withTestInstance({
      directory: tmp.path,
      fn: async (ctx) => {
        await load(ctx)
      },
    })

    const content = await Filesystem.readText(path.join(tmp.path, "wiscode.jsonc"))
    expect(content).toContain('"$schema": "https://opencode.ai/config.json"')
  } finally {
    ;(Global.Path as { config: string }).config = prev
    await clear(true)
  }
})

test("updateGlobal writes to wiscode config even when legacy opencode config exists", async () => {
  await using tmp = await tmpdir()
  const prev = Global.Path.config
  ;(Global.Path as { config: string }).config = tmp.path
  await clear(true)

  try {
    await Filesystem.write(
      path.join(tmp.path, "opencode.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        shell: "/bin/legacy",
      }),
    )

    await withTestInstance({
      directory: tmp.path,
      fn: async () => {
        await saveGlobal({
          shell: "/bin/wiscode",
        })
      },
    })

    const wiscodeExists = await Filesystem.exists(path.join(tmp.path, "wiscode.jsonc"))
    expect(wiscodeExists).toBe(true)

    const legacy = JSON.parse(await Filesystem.readText(path.join(tmp.path, "opencode.json")))
    expect(legacy.shell).toBe("/bin/legacy")

    const next = await Filesystem.readText(path.join(tmp.path, "wiscode.jsonc"))
    expect(next).toContain("/bin/wiscode")
  } finally {
    ;(Global.Path as { config: string }).config = prev
    await clear(true)
  }
})

test("does not create global config when OPENCODE_CONFIG_DIR is set", async () => {
  await using tmp = await tmpdir()
  await using custom = await tmpdir()
  const prevConfig = Global.Path.config
  const prevEnv = process.env.OPENCODE_CONFIG_DIR
  ;(Global.Path as { config: string }).config = tmp.path
  process.env.OPENCODE_CONFIG_DIR = custom.path
  await clear(true)

  try {
    await withTestInstance({
      directory: tmp.path,
      fn: async (ctx) => {
        await load(ctx)
      },
    })

    expect(await Filesystem.exists(path.join(tmp.path, "wiscode.jsonc"))).toBe(false)
  } finally {
    ;(Global.Path as { config: string }).config = prevConfig
    if (prevEnv === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = prevEnv
    await clear(true)
  }
})

test("includes built-in MaxKB production MCP by default", async () => {
  await using tmp = await tmpdir()
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.["maxkb-prod"]).toEqual({
        type: "remote",
        url: "https://mcp.morewiscloud.com/mcp/",
        oauth: false,
        auth: {
          type: "maxkb-hmac",
          appKey: "mcp_58150a7290e04b0f85c6f0921939ded6",
          appSecret: "ms_535329d25faa408ac7d62d759bc8c64eb2b1a58799fddb1435f2fb55a6f8d3c5",
        },
      })
    },
  })
})

test("allows user config to disable built-in MaxKB production MCP", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          "maxkb-prod": {
            enabled: false,
          },
        },
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.["maxkb-prod"]).toEqual({
        type: "remote",
        url: "https://mcp.morewiscloud.com/mcp/",
        oauth: false,
        enabled: false,
        auth: {
          type: "maxkb-hmac",
          appKey: "mcp_58150a7290e04b0f85c6f0921939ded6",
          appSecret: "ms_535329d25faa408ac7d62d759bc8c64eb2b1a58799fddb1435f2fb55a6f8d3c5",
        },
      })
    },
  })
})

test("allows user config to override built-in MaxKB production MCP", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          "maxkb-prod": {
            type: "remote",
            url: "https://maxkb.example.com/mcp/",
            oauth: false,
            auth: {
              type: "maxkb-hmac",
              appKey: "custom",
              appSecret: "secret",
            },
          },
        },
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.["maxkb-prod"]).toEqual({
        type: "remote",
        url: "https://maxkb.example.com/mcp/",
        oauth: false,
        auth: {
          type: "maxkb-hmac",
          appKey: "custom",
          appSecret: "secret",
        },
      })
    },
  })
})

test("preserves built-in MaxKB when user adds another MCP client", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          "maxkb-local": {
            type: "remote",
            url: "http://127.0.0.1:8081/mcp/",
            oauth: false,
            auth: {
              type: "maxkb-hmac",
              appKey: "local",
              appSecret: "secret",
            },
          },
        },
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.["maxkb-prod"]).toBeDefined()
      expect(config.mcp?.["maxkb-local"]).toEqual({
        type: "remote",
        url: "http://127.0.0.1:8081/mcp/",
        oauth: false,
        auth: {
          type: "maxkb-hmac",
          appKey: "local",
          appSecret: "secret",
        },
      })
    },
  })
})

test("does not reuse mutable built-in MaxKB config between loads", async () => {
  await using tmp = await tmpdir()
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      if (config.mcp?.["maxkb-prod"]) {
        config.mcp["maxkb-prod"] = {
          ...config.mcp["maxkb-prod"],
          enabled: false,
        }
      }
    },
  })
  await clear(true)
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.["maxkb-prod"]?.enabled).toBeUndefined()
    },
  })
})

test("loads JSON config file", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(
        dir,
        {
          $schema: "https://opencode.ai/config.json",
          model: "test/model",
          username: "testuser",
        },
        "wiscode.json",
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("test/model")
      expect(config.username).toBe("testuser")
    },
  })
})

test("prefers wiscode.json over opencode.json in the same directory", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(
        dir,
        {
          $schema: "https://opencode.ai/config.json",
          model: "wis/model",
          username: "wis",
        },
        "wiscode.json",
      )
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        model: "open/model",
        username: "open",
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("wis/model")
      expect(config.username).toBe("wis")
    },
  })
})

test("loads shell config field", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        shell: "bash",
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.shell).toBe("bash")
    },
  })
})

test("updates config and preserves empty shell sentinel", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(
        dir,
        {
          $schema: "https://opencode.ai/config.json",
          shell: "bash",
        },
        "config.json",
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      await save({ shell: "" }, ctx)

      const writtenConfig = await Filesystem.readJson<{ shell?: string }>(path.join(tmp.path, "wiscode.json"))
      expect(writtenConfig.shell).toBe("")
    },
  })
})

test("updates global config and omits empty shell key in json", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        shell: "bash",
      })
    },
  })

  const prev = Global.Path.config
  ;(Global.Path as { config: string }).config = tmp.path
  await clear(true)

  try {
    const result = await saveGlobal({ shell: "" })

    const legacyConfig = await Filesystem.readJson<{ shell?: string }>(path.join(tmp.path, "opencode.json"))
    expect(legacyConfig.shell).toBe("bash")
    expect(result.info.shell).toBeUndefined()
  } finally {
    ;(Global.Path as { config: string }).config = prev
    await clear(true)
  }
})

test("updates global config and omits empty shell key in jsonc", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.jsonc"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          shell: "bash",
          model: "test/model",
        }),
      )
    },
  })

  const prev = Global.Path.config
  ;(Global.Path as { config: string }).config = tmp.path
  await clear(true)

  try {
    const result = await saveGlobal({ shell: "" })

    const legacyFile = path.join(tmp.path, "opencode.jsonc")
    const legacyConfig = await Filesystem.readText(legacyFile)
    expect(legacyConfig).toContain('"shell":"bash"')
    expect(result.info.shell).toBeUndefined()
  } finally {
    ;(Global.Path as { config: string }).config = prev
    await clear(true)
  }
})

test("loads formatter boolean config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        formatter: true,
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.formatter).toBe(true)
    },
  })
})

test("falls back to opencode.json when wiscode.json is absent", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        model: "open/model",
        username: "open",
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("open/model")
      expect(config.username).toBe("open")
    },
  })
})

test("loads lsp boolean config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        lsp: true,
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.lsp).toBe(true)
    },
  })
})

test("loads project config from Git Bash and MSYS2 paths on Windows", async () => {
  // Git Bash and MSYS2 both use /<drive>/... paths on Windows.
  await check((dir) => {
    const drive = dir[0].toLowerCase()
    const rest = dir.slice(2).replaceAll("\\", "/")
    return `/${drive}${rest}`
  })
})

test("loads project config from Cygwin paths on Windows", async () => {
  await check((dir) => {
    const drive = dir[0].toLowerCase()
    const rest = dir.slice(2).replaceAll("\\", "/")
    return `/cygdrive/${drive}${rest}`
  })
})

test("ignores legacy tui keys in opencode config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        model: "test/model",
        theme: "legacy",
        tui: { scroll_speed: 4 },
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("test/model")
      expect((config as Record<string, unknown>).theme).toBeUndefined()
      expect((config as Record<string, unknown>).tui).toBeUndefined()
    },
  })
})

test("loads JSONC config file", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.jsonc"),
        `{
        // This is a comment
        "$schema": "https://opencode.ai/config.json",
        "model": "test/model",
        "username": "testuser"
      }`,
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("test/model")
      expect(config.username).toBe("testuser")
    },
  })
})

test("jsonc overrides json in the same directory", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(
        dir,
        {
          $schema: "https://opencode.ai/config.json",
          model: "base",
          username: "base",
        },
        "opencode.jsonc",
      )
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        model: "override",
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("base")
      expect(config.username).toBe("base")
    },
  })
})

test("handles environment variable substitution", async () => {
  const originalEnv = process.env["TEST_VAR"]
  process.env["TEST_VAR"] = "test-user"

  try {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await writeConfig(dir, {
          $schema: "https://opencode.ai/config.json",
          username: "{env:TEST_VAR}",
        })
      },
    })
    await withTestInstance({
      directory: tmp.path,
      fn: async (ctx) => {
        const config = await load(ctx)
        expect(config.username).toBe("test-user")
      },
    })
  } finally {
    if (originalEnv !== undefined) {
      process.env["TEST_VAR"] = originalEnv
    } else {
      delete process.env["TEST_VAR"]
    }
  }
})

test("preserves env variables when adding $schema to config", async () => {
  const originalEnv = process.env["PRESERVE_VAR"]
  process.env["PRESERVE_VAR"] = "secret_value"

  try {
    await using tmp = await tmpdir({
      init: async (dir) => {
        // Config without $schema - should trigger auto-add
        await Filesystem.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            username: "{env:PRESERVE_VAR}",
          }),
        )
      },
    })
    await withTestInstance({
      directory: tmp.path,
      fn: async (ctx) => {
        const config = await load(ctx)
        expect(config.username).toBe("secret_value")

        // Read the file to verify the env variable was preserved
        const content = await Filesystem.readText(path.join(tmp.path, "opencode.json"))
        expect(content).toContain("{env:PRESERVE_VAR}")
        expect(content).not.toContain("secret_value")
        expect(content).toContain("$schema")
      },
    })
  } finally {
    if (originalEnv !== undefined) {
      process.env["PRESERVE_VAR"] = originalEnv
    } else {
      delete process.env["PRESERVE_VAR"]
    }
  }
})

test("resolves env templates in account config with account token", async () => {
  const originalControlToken = process.env["OPENCODE_CONSOLE_TOKEN"]

  const fakeAccount = Layer.mock(Account.Service)({
    active: () =>
      Effect.succeed(
        Option.some({
          id: AccountID.make("account-1"),
          email: "user@example.com",
          url: "https://control.example.com",
          active_org_id: OrgID.make("org-1"),
        }),
      ),
    activeOrg: () =>
      Effect.succeed(
        Option.some({
          account: {
            id: AccountID.make("account-1"),
            email: "user@example.com",
            url: "https://control.example.com",
            active_org_id: OrgID.make("org-1"),
          },
          org: {
            id: OrgID.make("org-1"),
            name: "Example Org",
          },
        }),
      ),
    config: () =>
      Effect.succeed(
        Option.some({
          provider: { opencode: { options: { apiKey: "{env:OPENCODE_CONSOLE_TOKEN}" } } },
        }),
      ),
    token: () => Effect.succeed(Option.some(AccessToken.make("st_test_token"))),
  })

  const layer = configLayer({ account: fakeAccount })

  try {
    await provideTmpdirInstance(() =>
      Config.Service.use((svc) =>
        Effect.gen(function* () {
          const config = yield* svc.get()
          expect(config.provider?.["opencode"]?.options?.apiKey).toBe("st_test_token")
        }),
      ),
    ).pipe(Effect.scoped, Effect.provide(layer), Effect.runPromise)
  } finally {
    if (originalControlToken !== undefined) {
      process.env["OPENCODE_CONSOLE_TOKEN"] = originalControlToken
    } else {
      delete process.env["OPENCODE_CONSOLE_TOKEN"]
    }
  }
})

test("handles file inclusion substitution", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(path.join(dir, "included.txt"), "test-user")
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        username: "{file:included.txt}",
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.username).toBe("test-user")
    },
  })
})

test("handles file inclusion with replacement tokens", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(path.join(dir, "included.md"), "const out = await Bun.$`echo hi`")
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        username: "{file:included.md}",
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.username).toBe("const out = await Bun.$`echo hi`")
    },
  })
})

test("validates config schema and throws on invalid fields", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        invalid_field: "should cause error",
      })
    },
  })
  await provideTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      // Strict schema should throw an error for invalid fields
      await expect(load(ctx)).rejects.toThrow()
    },
  })
})

test("throws error for invalid JSON", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(path.join(dir, "opencode.json"), "{ invalid json }")
    },
  })
  await provideTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      await expect(load(ctx)).rejects.toThrow()
    },
  })
})

test("handles agent configuration", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        agent: {
          test_agent: {
            model: "test/model",
            temperature: 0.7,
            description: "test agent",
          },
        },
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test_agent"]).toEqual(
        expect.objectContaining({
          model: "test/model",
          temperature: 0.7,
          description: "test agent",
        }),
      )
    },
  })
})

test("treats agent variant as model-scoped setting (not provider option)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        agent: {
          test_agent: {
            model: "openai/gpt-5.2",
            variant: "xhigh",
            max_tokens: 123,
          },
        },
      })
    },
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      const agent = config.agent?.["test_agent"]

      expect(agent?.variant).toBe("xhigh")
      expect(agent?.options).toMatchObject({
        max_tokens: 123,
      })
      expect(agent?.options).not.toHaveProperty("variant")
    },
  })
})

test("handles command configuration", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        command: {
          test_command: {
            template: "test template",
            description: "test command",
            agent: "test_agent",
          },
        },
      })
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.command?.["test_command"]).toEqual({
        template: "test template",
        description: "test command",
        agent: "test_agent",
      })
    },
  })
})

test("migrates autoshare to share field", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          autoshare: true,
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.share).toBe("auto")
      expect(config.autoshare).toBe(true)
    },
  })
})

test("migrates mode field to agent field", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mode: {
            test_mode: {
              model: "test/model",
              temperature: 0.5,
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test_mode"]).toEqual({
        model: "test/model",
        temperature: 0.5,
        mode: "primary",
        options: {},
        permission: {},
      })
    },
  })
})

test("loads config from .wiscode directory", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const wiscodeDir = path.join(dir, ".wiscode")
      await fs.mkdir(wiscodeDir, { recursive: true })
      const agentDir = path.join(wiscodeDir, "agent")
      await fs.mkdir(agentDir, { recursive: true })

      await Filesystem.write(
        path.join(agentDir, "test.md"),
        `---
model: test/model
---
Test agent prompt`,
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]).toEqual(
        expect.objectContaining({
          name: "test",
          model: "test/model",
          prompt: "Test agent prompt",
        }),
      )
    },
  })
})

test("agent markdown permission config preserves user key order", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const agentDir = path.join(dir, ".opencode", "agent")
      await fs.mkdir(agentDir, { recursive: true })

      await Filesystem.write(
        path.join(agentDir, "ordered.md"),
        `---
permission:
  bash: allow
  "*": deny
  edit: ask
---
Ordered permissions`,
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(Object.keys(config.agent?.ordered?.permission ?? {})).toEqual(["bash", "*", "edit"])
    },
  })
})

test("loads agents from .opencode/agents (plural)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const opencodeDir = path.join(dir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      const agentsDir = path.join(opencodeDir, "agents")
      await fs.mkdir(path.join(agentsDir, "nested"), { recursive: true })

      await Filesystem.write(
        path.join(agentsDir, "helper.md"),
        `---
model: test/model
mode: subagent
---
Helper agent prompt`,
      )

      await Filesystem.write(
        path.join(agentsDir, "nested", "child.md"),
        `---
model: test/model
mode: subagent
---
Nested agent prompt`,
      )
    },
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)

      expect(config.agent?.["helper"]).toMatchObject({
        name: "helper",
        model: "test/model",
        mode: "subagent",
        prompt: "Helper agent prompt",
      })

      expect(config.agent?.["nested/child"]).toMatchObject({
        name: "nested/child",
        model: "test/model",
        mode: "subagent",
        prompt: "Nested agent prompt",
      })
    },
  })
})

test("loads commands from .opencode/command (singular)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const opencodeDir = path.join(dir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      const commandDir = path.join(opencodeDir, "command")
      await fs.mkdir(path.join(commandDir, "nested"), { recursive: true })

      await Filesystem.write(
        path.join(commandDir, "hello.md"),
        `---
description: Test command
---
Hello from singular command`,
      )

      await Filesystem.write(
        path.join(commandDir, "nested", "child.md"),
        `---
description: Nested command
---
Nested command template`,
      )
    },
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)

      expect(config.command?.["hello"]).toEqual({
        description: "Test command",
        template: "Hello from singular command",
      })

      expect(config.command?.["nested/child"]).toEqual({
        description: "Nested command",
        template: "Nested command template",
      })
    },
  })
})

test("loads commands from .opencode/commands (plural)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const opencodeDir = path.join(dir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      const commandsDir = path.join(opencodeDir, "commands")
      await fs.mkdir(path.join(commandsDir, "nested"), { recursive: true })

      await Filesystem.write(
        path.join(commandsDir, "hello.md"),
        `---
description: Test command
---
Hello from plural commands`,
      )

      await Filesystem.write(
        path.join(commandsDir, "nested", "child.md"),
        `---
description: Nested command
---
Nested command template`,
      )
    },
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)

      expect(config.command?.["hello"]).toEqual({
        description: "Test command",
        template: "Hello from plural commands",
      })

      expect(config.command?.["nested/child"]).toEqual({
        description: "Nested command",
        template: "Nested command template",
      })
    },
  })
})

test("updates config and writes to file", async () => {
  await using tmp = await tmpdir()
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const newConfig = { model: "updated/model" }
      await save(newConfig as any, ctx)

      const writtenConfig = await Filesystem.readJson<{ model: string }>(path.join(tmp.path, "wiscode.json"))
      expect(writtenConfig.model).toBe("updated/model")
    },
  })
})

test("gets config directories", async () => {
  await using tmp = await tmpdir()
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const dirs = await listDirs(ctx)
      expect(dirs.length).toBeGreaterThanOrEqual(1)
    },
  })
})

test("does not try to install dependencies in read-only OPENCODE_CONFIG_DIR", async () => {
  if (process.platform === "win32") return

  await using tmp = await tmpdir<string>({
    init: async (dir) => {
      const ro = path.join(dir, "readonly")
      await fs.mkdir(ro, { recursive: true })
      await fs.chmod(ro, 0o555)
      return ro
    },
    dispose: async (dir) => {
      const ro = path.join(dir, "readonly")
      await fs.chmod(ro, 0o755).catch(() => {})
      return ro
    },
  })

  const prev = process.env.OPENCODE_CONFIG_DIR
  process.env.OPENCODE_CONFIG_DIR = tmp.extra

  try {
    await withTestInstance({
      directory: tmp.path,
      fn: async (ctx) => {
        await load(ctx)
      },
    })
  } finally {
    if (prev === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = prev
  }
})

test("installs dependencies in writable OPENCODE_CONFIG_DIR", async () => {
  await using tmp = await tmpdir<string>({
    init: async (dir) => {
      const cfg = path.join(dir, "configdir")
      await fs.mkdir(cfg, { recursive: true })
      return cfg
    },
  })

  const prev = process.env.OPENCODE_CONFIG_DIR
  process.env.OPENCODE_CONFIG_DIR = tmp.extra

  const testLayer = configLayer()

  try {
    await withTestInstance({
      directory: tmp.path,
      fn: async (ctx) => {
        await Effect.runPromise(
          Config.Service.use((svc) => svc.get().pipe(Effect.provideService(InstanceRef, ctx))).pipe(
            Effect.scoped,
            Effect.provide(testLayer),
          ),
        )
        await Effect.runPromise(
          Config.Service.use((svc) => svc.waitForDependencies().pipe(Effect.provideService(InstanceRef, ctx))).pipe(
            Effect.scoped,
            Effect.provide(testLayer),
          ),
        )
      },
    })

    expect(await Filesystem.exists(path.join(tmp.extra, ".gitignore"))).toBe(true)
    expect(await Filesystem.readText(path.join(tmp.extra, ".gitignore"))).toContain("package-lock.json")
  } finally {
    if (prev === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = prev
  }
})

// Note: deduplication and serialization of npm installs is now handled by the
// core Npm.Service (via EffectFlock). Those behaviors are tested in the core
// package's npm tests, not here.

test("resolves scoped npm plugins in config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const pluginDir = path.join(dir, "node_modules", "@scope", "plugin")
      await fs.mkdir(pluginDir, { recursive: true })

      await Filesystem.write(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "config-fixture", version: "1.0.0", type: "module" }, null, 2),
      )

      await Filesystem.write(
        path.join(pluginDir, "package.json"),
        JSON.stringify(
          {
            name: "@scope/plugin",
            version: "1.0.0",
            type: "module",
            main: "./index.js",
          },
          null,
          2,
        ),
      )

      await Filesystem.write(path.join(pluginDir, "index.js"), "export default {}\n")

      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: ["@scope/plugin"] }, null, 2),
      )
    },
  })

  await provideTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      const pluginEntries = config.plugin ?? []
      expect(pluginEntries).toContain("@scope/plugin")
    },
  })
})

test("merges plugin arrays from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Create a nested project structure with local .opencode config
      const projectDir = path.join(dir, "project")
      const opencodeDir = path.join(projectDir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      // Global config with plugins
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugin: ["global-plugin-1", "global-plugin-2"],
        }),
      )

      // Local .opencode config with different plugins
      await Filesystem.write(
        path.join(opencodeDir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugin: ["local-plugin-1"],
        }),
      )
    },
  })

  await provideTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async (ctx) => {
      const config = await load(ctx)
      const plugins = config.plugin ?? []

      // Should contain both global and local plugins
      expect(plugins.some((p) => p.includes("global-plugin-1"))).toBe(true)
      expect(plugins.some((p) => p.includes("global-plugin-2"))).toBe(true)
      expect(plugins.some((p) => p.includes("local-plugin-1"))).toBe(true)

      // Should have all 3 plugins (not replaced, but merged)
      const pluginNames = plugins.filter((p) => p.includes("global-plugin") || p.includes("local-plugin"))
      expect(pluginNames.length).toBeGreaterThanOrEqual(3)
    },
  })
})

test("does not error when only custom agent is a subagent", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const opencodeDir = path.join(dir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })
      const agentDir = path.join(opencodeDir, "agent")
      await fs.mkdir(agentDir, { recursive: true })

      await Filesystem.write(
        path.join(agentDir, "helper.md"),
        `---
model: test/model
mode: subagent
---
Helper subagent prompt`,
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["helper"]).toMatchObject({
        name: "helper",
        model: "test/model",
        mode: "subagent",
        prompt: "Helper subagent prompt",
      })
    },
  })
})

test("merges instructions arrays from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const projectDir = path.join(dir, "project")
      const opencodeDir = path.join(projectDir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          instructions: ["global-instructions.md", "shared-rules.md"],
        }),
      )

      await Filesystem.write(
        path.join(opencodeDir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          instructions: ["local-instructions.md"],
        }),
      )
    },
  })

  await withTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async (ctx) => {
      const config = await load(ctx)
      const instructions = config.instructions ?? []

      expect(instructions).toContain("global-instructions.md")
      expect(instructions).toContain("shared-rules.md")
      expect(instructions).toContain("local-instructions.md")
      expect(instructions.length).toBe(3)
    },
  })
})

test("deduplicates duplicate instructions from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const projectDir = path.join(dir, "project")
      const opencodeDir = path.join(projectDir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          instructions: ["duplicate.md", "global-only.md"],
        }),
      )

      await Filesystem.write(
        path.join(opencodeDir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          instructions: ["duplicate.md", "local-only.md"],
        }),
      )
    },
  })

  await withTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async (ctx) => {
      const config = await load(ctx)
      const instructions = config.instructions ?? []

      expect(instructions).toContain("global-only.md")
      expect(instructions).toContain("local-only.md")
      expect(instructions).toContain("duplicate.md")

      const duplicates = instructions.filter((i) => i === "duplicate.md")
      expect(duplicates.length).toBe(1)
      expect(instructions.length).toBe(3)
    },
  })
})

test("deduplicates duplicate plugins from global and local configs", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Create a nested project structure with local .opencode config
      const projectDir = path.join(dir, "project")
      const opencodeDir = path.join(projectDir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })

      // Global config with plugins
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugin: ["duplicate-plugin", "global-plugin-1"],
        }),
      )

      // Local .opencode config with some overlapping plugins
      await Filesystem.write(
        path.join(opencodeDir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugin: ["duplicate-plugin", "local-plugin-1"],
        }),
      )
    },
  })

  await provideTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async (ctx) => {
      const config = await load(ctx)
      const plugins = config.plugin ?? []

      // Should contain all unique plugins
      expect(plugins.some((p) => p.includes("global-plugin-1"))).toBe(true)
      expect(plugins.some((p) => p.includes("local-plugin-1"))).toBe(true)
      expect(plugins.some((p) => p.includes("duplicate-plugin"))).toBe(true)

      // Should deduplicate the duplicate plugin
      const duplicatePlugins = plugins.filter((p) => p.includes("duplicate-plugin"))
      expect(duplicatePlugins.length).toBe(1)

      // Should have exactly 3 unique plugins
      const pluginNames = plugins.filter(
        (p) => p.includes("global-plugin") || p.includes("local-plugin") || p.includes("duplicate-plugin"),
      )
      expect(pluginNames.length).toBe(3)
    },
  })
})

test("keeps plugin origins aligned with merged plugin list", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const project = path.join(dir, "project")
      const local = path.join(project, ".opencode")
      await fs.mkdir(local, { recursive: true })

      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugin: [["shared-plugin@1.0.0", { source: "global" }], "global-only@1.0.0"],
        }),
      )

      await Filesystem.write(
        path.join(local, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          plugin: [["shared-plugin@2.0.0", { source: "local" }], "local-only@1.0.0"],
        }),
      )
    },
  })

  await provideTestInstance({
    directory: path.join(tmp.path, "project"),
    fn: async (ctx) => {
      const cfg = await load(ctx)
      const plugins = cfg.plugin ?? []
      const origins = cfg.plugin_origins ?? []
      const names = plugins.map((item) => ConfigPlugin.pluginSpecifier(item))

      expect(names).toContain("shared-plugin@2.0.0")
      expect(names).not.toContain("shared-plugin@1.0.0")
      expect(names).toContain("global-only@1.0.0")
      expect(names).toContain("local-only@1.0.0")

      expect(origins.map((item) => item.spec)).toEqual(plugins)
      const hit = origins.find((item) => ConfigPlugin.pluginSpecifier(item.spec) === "shared-plugin@2.0.0")
      expect(hit?.scope).toBe("local")
    },
  })
})

// Legacy tools migration tests

test("migrates legacy tools config to permissions - allow", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              tools: {
                bash: true,
                read: true,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        bash: "allow",
        read: "allow",
      })
    },
  })
})

test("migrates legacy tools config to permissions - deny", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              tools: {
                bash: false,
                webfetch: false,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        bash: "deny",
        webfetch: "deny",
      })
    },
  })
})

test("migrates legacy write tool to edit permission", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              tools: {
                write: true,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        edit: "allow",
      })
    },
  })
})

// Managed settings tests
// Note: preload.ts sets OPENCODE_TEST_MANAGED_CONFIG which Global.Path.managedConfig uses

test("managed settings override user settings", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        model: "user/model",
        share: "auto",
        username: "testuser",
      })
    },
  })

  await writeManagedSettings({
    $schema: "https://opencode.ai/config.json",
    model: "managed/model",
    share: "disabled",
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("managed/model")
      expect(config.share).toBe("disabled")
      expect(config.username).toBe("testuser")
    },
  })
})

test("managed settings override project settings", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        autoupdate: true,
        disabled_providers: [],
      })
    },
  })

  await writeManagedSettings({
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    disabled_providers: ["openai"],
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.autoupdate).toBe(false)
      expect(config.disabled_providers).toEqual(["openai"])
    },
  })
})

test("missing managed settings file is not an error", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await writeConfig(dir, {
        $schema: "https://opencode.ai/config.json",
        model: "user/model",
      })
    },
  })

  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.model).toBe("user/model")
    },
  })
})

test("migrates legacy edit tool to edit permission", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              tools: {
                edit: false,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        edit: "deny",
      })
    },
  })
})

test("migrates legacy patch tool to edit permission", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              tools: {
                patch: true,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        edit: "allow",
      })
    },
  })
})

test("migrates mixed legacy tools config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              tools: {
                bash: true,
                write: true,
                read: false,
                webfetch: true,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        bash: "allow",
        edit: "allow",
        read: "deny",
        webfetch: "allow",
      })
    },
  })
})

test("merges legacy tools with existing permission config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          agent: {
            test: {
              permission: {
                glob: "allow",
              },
              tools: {
                bash: true,
              },
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.agent?.["test"]?.permission).toEqual({
        glob: "allow",
        bash: "allow",
      })
    },
  })
})

test("permission config preserves user key order", async () => {
  // Permission precedence follows the order users write in config, so parsing
  // must not canonicalise known keys ahead of wildcard or custom keys.
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          permission: {
            "*": "deny",
            edit: "ask",
            write: "ask",
            external_directory: "ask",
            read: "allow",
            todowrite: "allow",
            "thoughts_*": "allow",
            "reasoning_model_*": "allow",
            "tools_*": "allow",
            "pr_comments_*": "allow",
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(Object.keys(config.permission!)).toEqual([
        "*",
        "edit",
        "write",
        "external_directory",
        "read",
        "todowrite",
        "thoughts_*",
        "reasoning_model_*",
        "tools_*",
        "pr_comments_*",
      ])
    },
  })
})

test("config parser preserves permission order while rejecting unknown top-level keys", () => {
  const config = ConfigParse.schema(
    Config.Info,
    {
      permission: {
        bash: "allow",
        "*": "deny",
        edit: "ask",
      },
    },
    "test",
  )

  expect(Object.keys(config.permission!)).toEqual(["bash", "*", "edit"])
  try {
    ConfigParse.schema(Config.Info, { invalid_field: true }, "test")
    throw new Error("expected config parse to fail")
  } catch (err) {
    const error = err as { data?: { issues?: Array<{ code?: string; keys?: string[]; path?: string[] }> } }
    expect(error.data?.issues?.[0]).toMatchObject({ code: "unrecognized_keys", keys: ["invalid_field"], path: [] })
  }
})

// MCP config merging tests

test("project config can override MCP server enabled status", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Simulates a base config (like from remote .well-known) with disabled MCP
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            jira: {
              type: "remote",
              url: "https://jira.example.com/mcp",
              enabled: false,
            },
            wiki: {
              type: "remote",
              url: "https://wiki.example.com/mcp",
              enabled: false,
            },
          },
        }),
      )
      // Project config enables just jira
      await Filesystem.write(
        path.join(dir, "opencode.jsonc"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            jira: {
              type: "remote",
              url: "https://jira.example.com/mcp",
              enabled: true,
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      // jira should be enabled (overridden by project config)
      expect(config.mcp?.jira).toEqual({
        type: "remote",
        url: "https://jira.example.com/mcp",
        enabled: true,
      })
      // wiki should still be disabled (not overridden)
      expect(config.mcp?.wiki).toEqual({
        type: "remote",
        url: "https://wiki.example.com/mcp",
        enabled: false,
      })
    },
  })
})

test("MCP config deep merges preserving base config properties", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Base config with full MCP definition
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            myserver: {
              type: "remote",
              url: "https://myserver.example.com/mcp",
              enabled: false,
              headers: {
                "X-Custom-Header": "value",
              },
            },
          },
        }),
      )
      // Override just enables it, should preserve other properties
      await Filesystem.write(
        path.join(dir, "opencode.jsonc"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            myserver: {
              type: "remote",
              url: "https://myserver.example.com/mcp",
              enabled: true,
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.myserver).toEqual({
        type: "remote",
        url: "https://myserver.example.com/mcp",
        enabled: true,
        headers: {
          "X-Custom-Header": "value",
        },
      })
    },
  })
})

test("local .opencode config can override MCP from project config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      // Project config with disabled MCP
      await Filesystem.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            docs: {
              type: "remote",
              url: "https://docs.example.com/mcp",
              enabled: false,
            },
          },
        }),
      )
      // Local .opencode directory config enables it
      const opencodeDir = path.join(dir, ".opencode")
      await fs.mkdir(opencodeDir, { recursive: true })
      await Filesystem.write(
        path.join(opencodeDir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: {
            docs: {
              type: "remote",
              url: "https://docs.example.com/mcp",
              enabled: true,
            },
          },
        }),
      )
    },
  })
  await withTestInstance({
    directory: tmp.path,
    fn: async (ctx) => {
      const config = await load(ctx)
      expect(config.mcp?.docs?.enabled).toBe(true)
    },
  })
})

test("project config overrides remote well-known config", async () => {
  const seen: { wellKnown?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: {
      config: {
        mcp: { jira: { type: "remote", url: "https://jira.example.com/mcp", enabled: false } },
      },
    },
  })

  await provideTmpdirInstance(
    () =>
      Config.Service.use((svc) =>
        Effect.gen(function* () {
          const config = yield* svc.get()
          expect(seen.wellKnown).toBe("https://example.com/.well-known/opencode")
          expect(config.mcp?.jira?.enabled).toBe(true)
        }),
      ),
    {
      git: true,
      config: { mcp: { jira: { type: "remote", url: "https://jira.example.com/mcp", enabled: true } } },
    },
  ).pipe(
    Effect.scoped,
    Effect.provide(configLayer({ auth: wellKnownAuth("https://example.com"), client })),
    Effect.runPromise,
  )
})

test("wellknown URL with trailing slash is normalized", async () => {
  const seen: { wellKnown?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: {
      config: {
        mcp: { slack: { type: "remote", url: "https://slack.example.com/mcp", enabled: true } },
      },
    },
  })

  await provideTmpdirInstance(
    () =>
      Config.Service.use((svc) =>
        Effect.gen(function* () {
          yield* svc.get()
          expect(seen.wellKnown).toBe("https://example.com/.well-known/opencode")
        }),
      ),
    { git: true },
  ).pipe(
    Effect.scoped,
    Effect.provide(configLayer({ auth: wellKnownAuth("https://example.com/"), client })),
    Effect.runPromise,
  )
})

test("remote well-known config can use FetchHttpClient layer", async () => {
  let fetchedUrl: string | undefined
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      fetchedUrl = request.url
      return new Response(
        JSON.stringify({
          config: {
            mcp: { jira: { type: "remote", url: "https://jira.example.com/mcp", enabled: true } },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  })

  try {
    await provideTmpdirInstance(
      () =>
        Config.Service.use((svc) =>
          Effect.gen(function* () {
            const config = yield* svc.get()
            expect(fetchedUrl).toBe(`${server.url.origin}/.well-known/opencode`)
            expect(config.mcp?.jira?.enabled).toBe(true)
          }),
        ),
      { git: true },
    ).pipe(
      Effect.scoped,
      Effect.provide(
        Config.layer.pipe(
          Layer.provide(testFlock),
          Layer.provide(AppFileSystem.defaultLayer),
          Layer.provide(Env.defaultLayer),
          Layer.provide(wellKnownAuth(server.url.origin)),
          Layer.provide(AccountTest.empty),
          Layer.provideMerge(infra),
          Layer.provide(NpmTest.noop),
          Layer.provide(FetchHttpClient.layer),
        ),
      ),
      Effect.runPromise,
    )
  } finally {
    await server.stop(true)
  }
})

test("wellknown remote_config supports templated env vars in headers", async () => {
  const originalToken = process.env.TEST_TOKEN
  const seen: { wellKnown?: string; remote?: string; authorization?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: {
      remote_config: {
        url: "https://config.example.com/opencode.json",
        headers: {
          Authorization: "Bearer {env:TEST_TOKEN}",
        },
      },
    },
    remote: {
      mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
    },
  })

  try {
    await provideTmpdirInstance(
      () =>
        Config.Service.use((svc) =>
          Effect.gen(function* () {
            const config = yield* svc.get()
            expect(seen.wellKnown).toBe("https://example.com/.well-known/opencode")
            expect(seen.remote).toBe("https://config.example.com/opencode.json")
            expect(seen.authorization).toBe("Bearer test-token")
            expect(config.mcp?.confluence?.enabled).toBe(true)
          }),
        ),
      { git: true },
    ).pipe(
      Effect.scoped,
      Effect.provide(configLayer({ auth: wellKnownAuth("https://example.com"), client })),
      Effect.runPromise,
    )
  } finally {
    if (originalToken === undefined) delete process.env.TEST_TOKEN
    else process.env.TEST_TOKEN = originalToken
  }
})

test("wellknown token env substitution does not mutate process env", async () => {
  const originalToken = process.env.TEST_TOKEN
  process.env.TEST_TOKEN = "preexisting-token"
  const seen: { wellKnown?: string; remote?: string; authorization?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: {
      remote_config: {
        url: "https://config.example.com/opencode.json",
        headers: {
          Authorization: "Bearer {env:TEST_TOKEN}",
        },
      },
    },
    remote: {
      mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
    },
  })

  try {
    const config = await provideTmpdirInstance(() => Config.Service.use((svc) => svc.get()), {
      git: true,
      config: { username: "{env:TEST_TOKEN}" },
    }).pipe(
      Effect.scoped,
      Effect.provide(configLayer({ auth: wellKnownAuth("https://example.com"), client })),
      Effect.runPromise,
    )

    expect(seen.authorization).toBe("Bearer test-token")
    expect(config.username).toBe("test-token")
    expect(process.env.TEST_TOKEN).toBe("preexisting-token")
  } finally {
    if (originalToken === undefined) delete process.env.TEST_TOKEN
    else process.env.TEST_TOKEN = originalToken
  }
})

test("wellknown config null is treated as absent", async () => {
  const seen: { wellKnown?: string; remote?: string; authorization?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: {
      config: null,
      remote_config: {
        url: "https://config.example.com/opencode.json",
      },
    },
    remote: {
      mcp: { confluence: { type: "remote", url: "https://confluence.example.com/mcp", enabled: true } },
    },
  })

  await provideTmpdirInstance(
    () =>
      Config.Service.use((svc) =>
        Effect.gen(function* () {
          const config = yield* svc.get()
          expect(seen.remote).toBe("https://config.example.com/opencode.json")
          expect(config.mcp?.confluence?.enabled).toBe(true)
        }),
      ),
    { git: true },
  ).pipe(
    Effect.scoped,
    Effect.provide(configLayer({ auth: wellKnownAuth("https://example.com"), client })),
    Effect.runPromise,
  )
})

test("wellknown remote_config rejects non-object config responses", async () => {
  const seen: { wellKnown?: string; remote?: string; authorization?: string } = {}
  const client = remoteConfigClient({
    seen,
    wellKnown: {
      remote_config: {
        url: "https://config.example.com/opencode.json",
      },
    },
    remote: "not an object",
  })

  const exit = await provideTmpdirInstance(() => Config.Service.use((svc) => svc.get()).pipe(Effect.exit), {
    git: true,
  }).pipe(
    Effect.scoped,
    Effect.provide(configLayer({ auth: wellKnownAuth("https://example.com"), client })),
    Effect.runPromise,
  )

  expect(seen.remote).toBe("https://config.example.com/opencode.json")
  expect(Exit.isFailure(exit)).toBe(true)
})

describe("resolvePluginSpec", () => {
  test("keeps package specs unchanged", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "opencode.json")
    expect(await ConfigPlugin.resolvePluginSpec("oh-my-opencode@2.4.3", file)).toBe("oh-my-opencode@2.4.3")
    expect(await ConfigPlugin.resolvePluginSpec("@scope/pkg", file)).toBe("@scope/pkg")
  })

  test("resolves windows-style relative plugin directory specs", async () => {
    if (process.platform !== "win32") return

    await using tmp = await tmpdir({
      init: async (dir) => {
        const plugin = path.join(dir, "plugin")
        await fs.mkdir(plugin, { recursive: true })
        await Filesystem.write(path.join(plugin, "index.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "opencode.json")
    const hit = await ConfigPlugin.resolvePluginSpec(".\\plugin", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin", "index.ts")).href)
  })

  test("resolves relative file plugin paths to file urls", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Filesystem.write(path.join(dir, "plugin.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "opencode.json")
    const hit = await ConfigPlugin.resolvePluginSpec("./plugin.ts", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin.ts")).href)
  })

  test("resolves plugin directory paths to directory urls", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const plugin = path.join(dir, "plugin")
        await fs.mkdir(plugin, { recursive: true })
        await Filesystem.writeJson(path.join(plugin, "package.json"), {
          name: "demo-plugin",
          type: "module",
          main: "./index.ts",
        })
        await Filesystem.write(path.join(plugin, "index.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "opencode.json")
    const hit = await ConfigPlugin.resolvePluginSpec("./plugin", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin")).href)
  })

  test("resolves plugin directories without package.json to index.ts", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const plugin = path.join(dir, "plugin")
        await fs.mkdir(plugin, { recursive: true })
        await Filesystem.write(path.join(plugin, "index.ts"), "export default {}")
      },
    })

    const file = path.join(tmp.path, "opencode.json")
    const hit = await ConfigPlugin.resolvePluginSpec("./plugin", file)
    expect(ConfigPlugin.pluginSpecifier(hit)).toBe(pathToFileURL(path.join(tmp.path, "plugin", "index.ts")).href)
  })
})

describe("deduplicatePluginOrigins", () => {
  const dedupe = (plugins: ConfigPlugin.Spec[]) =>
    ConfigPlugin.deduplicatePluginOrigins(
      plugins.map((spec) => ({
        spec,
        source: "",
        scope: "global" as const,
      })),
    ).map((item) => item.spec)

  test("removes duplicates keeping higher priority (later entries)", () => {
    const plugins = ["global-plugin@1.0.0", "shared-plugin@1.0.0", "local-plugin@2.0.0", "shared-plugin@2.0.0"]

    const result = dedupe(plugins)

    expect(result).toContain("global-plugin@1.0.0")
    expect(result).toContain("local-plugin@2.0.0")
    expect(result).toContain("shared-plugin@2.0.0")
    expect(result).not.toContain("shared-plugin@1.0.0")
    expect(result.length).toBe(3)
  })

  test("keeps path plugins separate from package plugins", () => {
    const plugins = ["oh-my-opencode@2.4.3", "file:///project/.opencode/plugin/oh-my-opencode.js"]

    const result = dedupe(plugins)

    expect(result).toEqual(plugins)
  })

  test("deduplicates direct path plugins by exact spec", () => {
    const plugins = ["file:///project/.opencode/plugin/demo.ts", "file:///project/.opencode/plugin/demo.ts"]

    const result = dedupe(plugins)

    expect(result).toEqual(["file:///project/.opencode/plugin/demo.ts"])
  })

  test("preserves order of remaining plugins", () => {
    const plugins = ["a-plugin@1.0.0", "b-plugin@1.0.0", "c-plugin@1.0.0"]

    const result = dedupe(plugins)

    expect(result).toEqual(["a-plugin@1.0.0", "b-plugin@1.0.0", "c-plugin@1.0.0"])
  })

  test("loads auto-discovered local plugins as file urls", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const projectDir = path.join(dir, "project")
        const opencodeDir = path.join(projectDir, ".opencode")
        const pluginDir = path.join(opencodeDir, "plugin")
        await fs.mkdir(pluginDir, { recursive: true })

        await Filesystem.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            plugin: ["my-plugin@1.0.0"],
          }),
        )

        await Filesystem.write(path.join(pluginDir, "my-plugin.js"), "export default {}")
      },
    })

    await provideTestInstance({
      directory: path.join(tmp.path, "project"),
      fn: async (ctx) => {
        const config = await load(ctx)
        const plugins = config.plugin ?? []

        expect(plugins.some((p) => ConfigPlugin.pluginSpecifier(p) === "my-plugin@1.0.0")).toBe(true)
        expect(plugins.some((p) => ConfigPlugin.pluginSpecifier(p).startsWith("file://"))).toBe(true)
      },
    })
  })
})

describe("OPENCODE_DISABLE_PROJECT_CONFIG", () => {
  it.instance(
    "skips project config files when flag is set",
    () =>
      withProcessEnv(
        "OPENCODE_DISABLE_PROJECT_CONFIG",
        "true",
        Effect.gen(function* () {
          const config = yield* Config.use.get()
          expect(config.model).not.toBe("project/model")
          expect(config.username).not.toBe("project-user")
        }),
      ),
    { config: { model: "project/model", username: "project-user" } },
  )

  it.instance("skips project .opencode/ directories when flag is set", () =>
    withProcessEnv(
      "OPENCODE_DISABLE_PROJECT_CONFIG",
      "true",
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* mkdirEffect(path.join(test.directory, ".opencode", "command"))
        yield* writeTextEffect(
          path.join(test.directory, ".opencode", "command", "test-cmd.md"),
          "# Test Command\nThis is a test command.",
        )
        const directories = yield* Config.use.directories()
        expect(directories.some((d) => d.startsWith(test.directory))).toBe(false)
      }),
    ),
  )

  it.instance("still loads global config when flag is set", () =>
    withProcessEnv(
      "OPENCODE_DISABLE_PROJECT_CONFIG",
      "true",
      Effect.gen(function* () {
        const config = yield* Config.use.get()
        expect(config).toBeDefined()
        expect(config.username).toBeDefined()
      }),
    ),
  )

  it.instance(
    "skips relative instructions with warning when flag is set but no config dir",
    () =>
      withProcessEnvs(
        { OPENCODE_CONFIG_DIR: undefined, OPENCODE_DISABLE_PROJECT_CONFIG: "true" },
        Effect.gen(function* () {
          const test = yield* TestInstance
          yield* writeTextEffect(path.join(test.directory, "CUSTOM.md"), "# Custom Instructions")
          // The relative instruction should be skipped without error
          const config = yield* Config.use.get()
          expect(config).toBeDefined()
        }),
      ),
    { config: { instructions: ["./CUSTOM.md"] } },
  )

  it.instance(
    "OPENCODE_CONFIG_DIR still works when flag is set",
    () =>
      Effect.gen(function* () {
        const configDir = yield* tmpdirScoped({ config: { model: "configdir/model" } })
        yield* withProcessEnvs(
          { OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_CONFIG_DIR: configDir },
          Effect.gen(function* () {
            const config = yield* Config.use.get()
            expect(config.model).toBe("configdir/model")
          }),
        )
      }),
    { config: { model: "project/model" } },
  )
})

// Regression for #28206: malformed OPENCODE_PERMISSION JSON used to crash
// the app on startup with an unhandled SyntaxError. Loading the config with
// an invalid JSON value in this env var should not throw.
describe("OPENCODE_PERMISSION env var", () => {
  it.instance("does not crash when OPENCODE_PERMISSION contains invalid JSON", () =>
    withProcessEnv(
      "OPENCODE_PERMISSION",
      "{invalid",
      Effect.gen(function* () {
        const config = yield* Config.use.get()
        // Regression: load() used to throw before returning anything.
        expect(config).toBeDefined()
      }),
    ),
  )
})
describe("OPENCODE_CONFIG_CONTENT token substitution", () => {
  it.instance("substitutes {env:} tokens in OPENCODE_CONFIG_CONTENT", () =>
    withProcessEnv(
      "TEST_CONFIG_VAR",
      "test_api_key_12345",
      withProcessEnv(
        "OPENCODE_CONFIG_CONTENT",
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          username: "{env:TEST_CONFIG_VAR}",
        }),
        Effect.gen(function* () {
          const config = yield* Config.use.get()
          expect(config.username).toBe("test_api_key_12345")
        }),
      ),
    ),
  )

  it.instance("substitutes {file:} tokens in OPENCODE_CONFIG_CONTENT", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* writeTextEffect(path.join(test.directory, "api_key.txt"), "secret_key_from_file")
      yield* withProcessEnv(
        "OPENCODE_CONFIG_CONTENT",
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          username: "{file:./api_key.txt}",
        }),
        Effect.gen(function* () {
          const config = yield* Config.use.get()
          expect(config.username).toBe("secret_key_from_file")
        }),
      )
    }),
  )
})

// parseManagedPlist unit tests — pure function, no OS interaction

test("parseManagedPlist strips MDM metadata keys", async () => {
  const config = ConfigParse.schema(
    Config.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          PayloadDisplayName: "OpenCode Managed",
          PayloadIdentifier: "ai.opencode.managed.test",
          PayloadType: "ai.opencode.managed",
          PayloadUUID: "AAAA-BBBB-CCCC",
          PayloadVersion: 1,
          _manualProfile: true,
          share: "disabled",
          model: "mdm/model",
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.share).toBe("disabled")
  expect(config.model).toBe("mdm/model")
  // MDM keys must not leak into the parsed config
  expect((config as any).PayloadUUID).toBeUndefined()
  expect((config as any).PayloadType).toBeUndefined()
  expect((config as any)._manualProfile).toBeUndefined()
})

test("parseManagedPlist parses server settings", async () => {
  const config = ConfigParse.schema(
    Config.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          server: { hostname: "127.0.0.1", mdns: false },
          autoupdate: true,
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.server?.hostname).toBe("127.0.0.1")
  expect(config.server?.mdns).toBe(false)
  expect(config.autoupdate).toBe(true)
})

test("parseManagedPlist parses permission rules", async () => {
  const config = ConfigParse.schema(
    Config.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          permission: {
            "*": "ask",
            bash: { "*": "ask", "rm -rf *": "deny", "curl *": "deny" },
            grep: "allow",
            glob: "allow",
            webfetch: "ask",
            "~/.ssh/*": "deny",
          },
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.permission?.["*"]).toBe("ask")
  expect(config.permission?.grep).toBe("allow")
  expect(config.permission?.webfetch).toBe("ask")
  expect(config.permission?.["~/.ssh/*"]).toBe("deny")
  const bash = config.permission?.bash as Record<string, string>
  expect(bash?.["rm -rf *"]).toBe("deny")
  expect(bash?.["curl *"]).toBe("deny")
})

test("parseManagedPlist parses enabled_providers", async () => {
  const config = ConfigParse.schema(
    Config.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          enabled_providers: ["anthropic", "google"],
        }),
      ),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.enabled_providers).toEqual(["anthropic", "google"])
})

test("parseManagedPlist handles empty config", async () => {
  const config = ConfigParse.schema(
    Config.Info,
    ConfigParse.jsonc(
      await ConfigManaged.parseManagedPlist(JSON.stringify({ $schema: "https://opencode.ai/config.json" })),
      "test:mobileconfig",
    ),
    "test:mobileconfig",
  )
  expect(config.$schema).toBe("https://opencode.ai/config.json")
})
