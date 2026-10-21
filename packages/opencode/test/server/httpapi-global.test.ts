import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Context, Effect, Layer, Option } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Diagnostic } from "@opencode-ai/schema"
import { Installation } from "../../src/installation"
import { MoveSession } from "@opencode-ai/core/control-plane/move-session"
import { ServerAuth } from "../../src/server/auth"
import { RootHttpApi } from "../../src/server/routes/instance/httpapi/api"
import { GlobalPaths } from "../../src/server/routes/instance/httpapi/groups/global"
import { controlHandlers } from "../../src/server/routes/instance/httpapi/handlers/control"
import { controlPlaneHandlers } from "../../src/server/routes/instance/httpapi/handlers/control-plane"
import { globalHandlers, shouldDisposeInstances } from "../../src/server/routes/instance/httpapi/handlers/global"
import { authorizationLayer } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { schemaErrorLayer } from "../../src/server/routes/instance/httpapi/middleware/schema-error"
import { testEffect } from "../lib/effect"

const diagnostic = {
  configure: () => Effect.void,
  config: () => ({ enabled: false, rawPayloads: false, streaming: false, retentionDays: 14, maxTotalBytes: 0 }),
  startTask: () => ({}),
  startTurn: (context: DiagnosticTrace.TraceContext) => ({
    ...context,
    turnId: Diagnostic.TurnID.create(),
    attempt: 1,
  }),
  emit: () => Effect.void,
  complete: () => Effect.void,
  flush: () => Effect.void,
  close: () => Effect.void,
  closeAll: () => Effect.void,
  root: () => "/tmp/wiscode-diagnostics",
  cleanup: () => Effect.void,
  clear: () => Effect.succeed({ deleted: 2, skipped: 0 }),
}

const apiLayer = HttpRouter.serve(
  HttpApiBuilder.layer(RootHttpApi).pipe(
    Layer.provide([controlHandlers, controlPlaneHandlers, globalHandlers]),
    Layer.provide([authorizationLayer, schemaErrorLayer]),
    // Raw HttpApi routes expose an opaque handler context at the request boundary.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    HttpRouter.provideRequest(Layer.succeedContext(Context.empty() as Context.Context<unknown>)),
  ),
  { disableListenLog: true, disableLogger: true },
).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(Layer.mock(Auth.Service)({})),
  Layer.provide(Layer.mock(Config.Service)({ getGlobal: () => Effect.succeed({}) })),
  Layer.provide(Layer.mock(DiagnosticTrace.Service)(diagnostic)),
  Layer.provide(Layer.mock(MoveSession.Service)({})),
  Layer.provide(
    Layer.mock(Installation.Service)({
      method: () => Effect.succeed("npm"),
      latest: () => Effect.succeed("9.9.9"),
      upgrade: () => Effect.void,
    }),
  ),
  Layer.provide(ServerAuth.Config.configLayer({ password: Option.none(), username: "opencode" })),
)
const it = testEffect(apiLayer)

describe("global HttpApi", () => {
  it.live("keeps active instances when only diagnostics change", () =>
    Effect.sync(() => {
      expect(
        shouldDisposeInstances(
          { username: "a", diagnostics: { enabled: false } },
          { username: "a", diagnostics: { enabled: true } },
        ),
      ).toBe(false)
      expect(
        shouldDisposeInstances(
          { username: "a", theme: "light", diagnostics: { enabled: false } },
          { theme: "light", username: "a", diagnostics: { enabled: true } },
        ),
      ).toBe(false)
      expect(
        shouldDisposeInstances(
          { username: "a", diagnostics: { enabled: true } },
          { username: "b", diagnostics: { enabled: true } },
        ),
      ).toBe(true)
    }),
  )
  it.live("reports the local diagnostic directory", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.get(GlobalPaths.diagnostics).pipe(HttpClient.execute)
      expect(response.status).toBe(200)
      expect(yield* response.json).toMatchObject({ root: "/tmp/wiscode-diagnostics", enabled: false })
    }),
  )

  it.live("clears current diagnostic files on explicit request", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.diagnosticsCleanup).pipe(HttpClient.execute)
      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual({ root: "/tmp/wiscode-diagnostics", deleted: 2, skipped: 0 })
    }),
  )

  it.live("upgrades to the requested version", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: "9.9.9" }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual({ success: true, version: "9.9.9" })
    }),
  )

  it.live("rejects invalid upgrade payloads", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: 1 }),
        HttpClient.execute,
      )

      expect(response.status).toBe(400)
    }),
  )

  it.live("rejects invalid upgrade target versions", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: "latest" }),
        HttpClient.execute,
      )

      expect(response.status).toBe(400)
    }),
  )

  it.live("rejects unsupported upgrade content types", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.setBody(HttpBody.text('{"target":"1.0.0"}', "text/plain")),
        HttpClient.execute,
      )

      expect(response.status).toBe(415)
    }),
  )
})
