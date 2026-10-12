import { describe, expect, test } from "bun:test"
import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

const encoder = new TextEncoder()

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(
  handler: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string } = () =>
    "",
) {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const result = handler(std?.command ?? "", std?.args ?? [])
    const output = typeof result === "string" ? { code: 0, stdout: result, stderr: "" } : result
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output.stdout ? Stream.make(encoder.encode(output.stdout)) : Stream.empty,
        stderr: output.stderr ? Stream.make(encoder.encode(output.stderr)) : Stream.empty,
        all: Stream.empty,
        getInputFd: () => ({ [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") }) as any,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function testLayer(
  httpHandler: (request: HttpClientRequest.HttpClientRequest) => Response,
  spawnHandler?: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string },
) {
  const spawnerNode = makeGlobalNode({
    service: ChildProcessSpawner.ChildProcessSpawner,
    layer: mockSpawner(spawnHandler),
    deps: [],
  })
  return LayerNode.compile(Installation.node, [
    [httpClient, mockHttpClient(httpHandler)],
    [CrossSpawnSpawner.node, spawnerNode],
  ])
}

describe("installation", () => {
  describe("method", () => {
    test("detects wiscode as an npm installation", async () => {
      const layer = testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          if (cmd === "npm" && args[0] === "list") return "wiscode-ai@1.0.0\n"
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.method()).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("npm")
    })

    test("does not detect upstream opencode brew formula as WisCode", async () => {
      const layer = testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          if (cmd === "brew" && args.includes("opencode")) return "opencode"
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.method()).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("unknown")
    })

    test("detects .wiscode/bin installs as curl installations", async () => {
      const prev = process.execPath
      Object.defineProperty(process, "execPath", {
        value: "/Users/test/.wiscode/bin/wiscode",
        configurable: true,
      })

      try {
        const layer = testLayer(() => jsonResponse({}))
        const result = await Effect.runPromise(
          Installation.Service.use((svc) => svc.method()).pipe(Effect.provide(layer)),
        )
        expect(result).toBe("curl")
      } finally {
        Object.defineProperty(process, "execPath", {
          value: prev,
          configurable: true,
        })
      }
    })
  })

  describe("latest", () => {
    test("reads release version from WisCode GitHub releases", async () => {
      let url = ""
      const layer = testLayer((request) => {
        url = request.url.toString()
        return jsonResponse({ tag_name: "v1.2.3" })
      })

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("unknown")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.2.3")
      expect(url).toBe("https://api.github.com/repos/PINKONG/opencode/releases/latest")
    })

    test("strips v prefix from GitHub release tag", async () => {
      const layer = testLayer(() => jsonResponse({ tag_name: "v4.0.0-beta.1" }))

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("curl")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("4.0.0-beta.1")
    })

    test("reads npm versions via registry", async () => {
      const calls: string[] = []
      const layer = testLayer((request) => {
        calls.push(request.url)
        return jsonResponse({ version: "1.5.0" })
      })

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("npm")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.5.0")
      expect(calls).toContain(`https://registry.npmjs.org/wiscode-ai/${InstallationChannel}`)
    })

    test("reads bun versions via registry", async () => {
      const calls: string[] = []
      const layer = testLayer((request) => {
        calls.push(request.url)
        return jsonResponse({ version: "1.6.0" })
      })

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("bun")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.6.0")
      expect(calls).toContain(`https://registry.npmjs.org/wiscode-ai/${InstallationChannel}`)
    })

    test("reads pnpm versions via registry", async () => {
      const calls: string[] = []
      const layer = testLayer((request) => {
        calls.push(request.url)
        return jsonResponse({ version: "1.7.0" })
      })

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("pnpm")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("1.7.0")
      expect(calls).toContain(`https://registry.npmjs.org/wiscode-ai/${InstallationChannel}`)
    })

    test("reads scoop manifest versions", async () => {
      let url = ""
      const layer = testLayer((request) => {
        url = request.url.toString()
        return jsonResponse({ version: "2.3.4" })
      })

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("scoop")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("2.3.4")
      expect(url).toBe("https://raw.githubusercontent.com/ScoopInstaller/Extras/master/bucket/wiscode.json")
    })

    test("reads chocolatey feed versions", async () => {
      let url = ""
      const layer = testLayer((request) => {
        url = request.url.toString()
        return jsonResponse({ d: { results: [{ Version: "3.4.5" }] } })
      })

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("choco")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("3.4.5")
      expect(url).toContain("Id%20eq%20%27wiscode%27")
    })

    test("reads brew formulae API versions", async () => {
      const layer = testLayer(
        () => jsonResponse({ versions: { stable: "2.0.0" } }),
        (cmd, args) => {
          if (cmd === "brew" && args.includes("--formula") && args.includes("PINKONG/tap/wiscode")) return ""
          if (cmd === "brew" && args.includes("--formula") && args.includes("wiscode")) return "wiscode"
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("brew")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("2.0.0")
    })

    test("reads brew tap info JSON via CLI", async () => {
      const brewInfoJson = JSON.stringify({
        formulae: [{ versions: { stable: "2.1.0" } }],
      })
      const layer = testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          if (cmd === "brew" && args.includes("PINKONG/tap/wiscode") && args.includes("--formula")) return "wiscode"
          if (cmd === "brew" && args.includes("--json=v2")) return brewInfoJson
          return ""
        },
      )

      const result = await Effect.runPromise(
        Installation.Service.use((svc) => svc.latest("brew")).pipe(Effect.provide(layer)),
      )
      expect(result).toBe("2.1.0")
    })
  })

  describe("upgrade", () => {
    test("upgrades npm installs via wiscode-ai package", async () => {
      const seen: string[] = []
      const layer = testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          seen.push([cmd, ...args].join(" "))
          return ""
        },
      )

      await Effect.runPromise(
        Installation.Service.use((svc) => svc.upgrade("npm", "1.0.3")).pipe(Effect.provide(layer)),
      )

      expect(seen).toContain("npm install -g wiscode-ai@1.0.3")
      expect(seen).toContain(`${process.execPath} --version`)
    })

    test("upgrades curl installs from the WisCode install source", async () => {
      let url = ""
      const prev = process.env.WISCODE_INSTALL_URL
      delete process.env.WISCODE_INSTALL_URL
      const layer = testLayer((request) => {
        url = request.url.toString()
        return new Response("#!/usr/bin/env bash\n", { status: 200 })
      })

      try {
        await Effect.runPromise(
          Installation.Service.use((svc) => svc.upgrade("curl", "1.0.3")).pipe(Effect.provide(layer)),
        )
      } finally {
        if (prev === undefined) delete process.env.WISCODE_INSTALL_URL
        else process.env.WISCODE_INSTALL_URL = prev
      }

      expect(url).toBe("https://raw.githubusercontent.com/PINKONG/opencode/refs/heads/wiscode/install")
    })
  })

  describe("upgrade", () => {
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => {
          if (cmd === "npm") return { code: 1, stderr: "token=secret command output" }
          return ""
        },
      ),
    ).effect("returns sanitized typed errors for failed package upgrades", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("npm", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe("Upgrade failed for npm (exit code 1).")
        expect(error.message).toBe(error.stderr)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("command output")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script with token=secret", { status: 200 }),
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return "GNU bash"
          if (cmd === "bash" || cmd === "sh") return { code: 1, stderr: "script output with token=secret" }
          return ""
        },
      ),
    ).effect("returns sanitized typed errors when the curl install script fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("curl", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe("Upgrade failed for curl (exit code 1).")
        expect(error.message).toBe(error.stderr)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("script output")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script", { status: 200 }),
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return { code: 1, stderr: "missing" }
          if (cmd === "bash") return { code: 1, stderr: "should not execute installer with bash" }
          if (cmd === "sh") return "ok"
          return ""
        },
      ),
    ).effect("falls back to sh when bash is unavailable during curl upgrade", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("curl", "9.9.9")
      }),
    )
  })

})
