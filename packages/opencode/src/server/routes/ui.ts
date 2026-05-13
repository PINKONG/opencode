import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Effect, Stream } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Hono } from "hono"
import { proxy } from "hono/proxy"
import fs from "node:fs/promises"
import path from "node:path"
import { ProxyUtil } from "../proxy-util"
import { UI_UPSTREAM, csp, cspForHtml, embeddedUI, upstreamURL } from "../shared/ui"

const EMBED_META_NAME = "oc-embed-session"

function injectEmbedSessionMeta(input: string, embedSession: string | undefined) {
  if (!embedSession) return input
  const meta = `<meta name="${EMBED_META_NAME}" content="${embedSession}">`
  if (input.includes(meta)) return input
  if (/<head[^>]*>/i.test(input)) return input.replace(/<head[^>]*>/i, (head) => `${head}\n    ${meta}`)
  return meta + input
}

function resolveEmbeddedAssetPath(match: string) {
  if (!match.startsWith(".")) return match
  return path.resolve(import.meta.dirname, match)
}

function requestBody(request: HttpServerRequest.HttpServerRequest) {
  if (request.method === "GET" || request.method === "HEAD") return HttpBody.empty
  const len = request.headers["content-length"]
  return HttpBody.stream(request.stream, request.headers["content-type"], len === undefined ? undefined : Number(len))
}

function proxyResponseHeaders(headers: Record<string, string>) {
  const result = new Headers(headers)
  result.delete("content-encoding")
  result.delete("content-length")
  result.delete("transfer-encoding")
  return result
}

export async function serveUI(request: Request, opts?: { embeddedWebUI?: Record<string, string> | null }) {
  const embeddedWebUI = opts?.embeddedWebUI === undefined ? await embeddedUI() : opts.embeddedWebUI
  const url = new URL(request.url)
  const requestPath = url.pathname
  const embedSession = request.headers.get("x-opencode-embed-session") ?? url.searchParams.get("embed_session") ?? undefined

  if (embeddedWebUI) {
    const match = embeddedWebUI[requestPath.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
    if (!match) return Response.json({ error: "Not Found" }, { status: 404 })
    const assetPath = resolveEmbeddedAssetPath(match)

    try {
      const mime = AppFileSystem.mimeType(assetPath)
      if (mime.startsWith("text/html")) {
        const html = injectEmbedSessionMeta(await fs.readFile(assetPath, "utf8"), embedSession)
        const headers = new Headers({
          "content-type": mime,
          "content-security-policy": cspForHtml(html),
        })
        return new Response(html, { headers })
      }
      return new Response(new Uint8Array(await fs.readFile(assetPath)), {
        headers: new Headers({ "content-type": mime }),
      })
    } catch {
      return Response.json({ error: "Not Found" }, { status: 404 })
    }
  }

  const response = await proxy(upstreamURL(requestPath), {
    raw: request,
    headers: ProxyUtil.headers(request, { host: UI_UPSTREAM.host }),
  })
  response.headers.delete("alt-svc")
  if (response.headers.get("content-type")?.includes("text/html")) {
    const html = injectEmbedSessionMeta(await response.text(), embedSession)
    response.headers.set("Content-Security-Policy", cspForHtml(html))
    response.headers.set("content-length", String(Buffer.byteLength(html)))
    return new Response(html, response)
  }
  response.headers.set("Content-Security-Policy", csp())
  return response
}

export function serveUIEffect(
  request: HttpServerRequest.HttpServerRequest,
  services: { fs: AppFileSystem.Interface; client: HttpClient.HttpClient },
  opts?: { embeddedWebUI?: Record<string, string> | null },
) {
  return Effect.gen(function* () {
    const embeddedWebUI = opts?.embeddedWebUI === undefined ? yield* Effect.promise(() => embeddedUI()) : opts.embeddedWebUI
    const url = new URL(request.url, "http://localhost")
    const requestPath = url.pathname
    const embedSession = request.headers["x-opencode-embed-session"] ?? url.searchParams.get("embed_session") ?? undefined

    if (embeddedWebUI) {
      const match = embeddedWebUI[requestPath.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
      if (!match) return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
      const assetPath = resolveEmbeddedAssetPath(match)
      const mime = AppFileSystem.mimeType(assetPath)

      return yield* services.fs.readFile(assetPath).pipe(
        Effect.map((body) => {
          if (!mime.startsWith("text/html")) {
            return HttpServerResponse.raw(body, { headers: new Headers({ "content-type": mime }) })
          }

          const html = injectEmbedSessionMeta(new TextDecoder().decode(body), embedSession)
          return HttpServerResponse.text(html, {
            headers: new Headers({
              "content-type": mime,
              "content-security-policy": cspForHtml(html),
            }),
          })
        }),
        Effect.catchReason("PlatformError", "NotFound", () =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })),
        ),
      )
    }

    const response = yield* services.client.execute(
      HttpClientRequest.make(request.method)(upstreamURL(requestPath), {
        headers: ProxyUtil.headers(request.headers, { host: UI_UPSTREAM.host }),
        body: requestBody(request),
      }),
    )
    const headers = proxyResponseHeaders(response.headers)
    headers.delete("alt-svc")

    if (response.headers["content-type"]?.includes("text/html")) {
      const body = injectEmbedSessionMeta(yield* response.text, embedSession)
      headers.set("Content-Security-Policy", cspForHtml(body))
      headers.set("content-length", String(Buffer.byteLength(body)))
      return HttpServerResponse.text(body, { status: response.status, headers })
    }

    headers.set("Content-Security-Policy", csp())
    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      headers,
    })
  })
}

export const UIRoutes = (opts?: { embeddedWebUI?: Record<string, string> | null }): Hono =>
  new Hono().all("/*", (c) => serveUI(c.req.raw, opts))
