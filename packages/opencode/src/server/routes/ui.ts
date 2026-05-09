import { Flag } from "@opencode-ai/core/flag/flag"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Effect, pipe, Stream } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Hono } from "hono"
import { proxy } from "hono/proxy"
import { getMimeType } from "hono/utils/mime"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { ProxyUtil } from "../proxy-util"

const embeddedUIPromise = Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI
  ? Promise.resolve(null)
  : // @ts-expect-error - generated file at build time
    import("opencode-web-ui.gen.ts").then((module) => module.default as Record<string, string>).catch(() => null)

const DEFAULT_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:"
const UI_UPSTREAM = new URL("https://app.opencode.ai")
const EMBED_META_NAME = "oc-embed-session"

function injectEmbedSessionMeta(input: string, embedSession: string | undefined) {
  if (!embedSession) return input
  const meta = `<meta name="${EMBED_META_NAME}" content="${embedSession}">`
  if (input.includes(meta)) return input
  if (/<head[^>]*>/i.test(input)) return input.replace(/<head[^>]*>/i, (head) => `${head}\n    ${meta}`)
  return meta + input
}

const csp = (hash = "") =>
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:`

function themePreloadHash(body: string) {
  return body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
}

function requestBody(request: HttpServerRequest.HttpServerRequest) {
  if (request.method === "GET" || request.method === "HEAD") return HttpBody.empty
  const len = request.headers["content-length"]
  return HttpBody.stream(request.stream, request.headers["content-type"], len === undefined ? undefined : Number(len))
}

function proxyResponseHeaders(headers: Record<string, string>) {
  const result = new Headers(headers)
  // FetchHttpClient exposes decoded response bodies, so forwarding upstream
  // transfer metadata makes browsers decode already-decoded assets again.
  result.delete("content-encoding")
  result.delete("content-length")
  return result
}

function upstreamURL(path: string) {
  return new URL(path, UI_UPSTREAM).toString()
}

function embeddedUI(override?: Record<string, string> | null) {
  if (override) return Promise.resolve(override)
  if (override === null) return Promise.resolve(null)
  if (Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI) return Promise.resolve(null)
  return embeddedUIPromise
}

export async function serveUI(request: Request, opts?: { embeddedWebUI?: Record<string, string> | null }) {
  const embeddedWebUI = await embeddedUI(opts?.embeddedWebUI)
  const url = new URL(request.url)
  const path = url.pathname
  const embedSession = request.headers.get("x-opencode-embed-session") ?? url.searchParams.get("embed_session") ?? undefined

  if (embeddedWebUI) {
    const match = embeddedWebUI[path.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
    if (!match) return Response.json({ error: "Not Found" }, { status: 404 })

    if (await fs.exists(match)) {
        const mime = getMimeType(match) ?? "text/plain"
        if (mime.startsWith("text/html")) {
          const html = injectEmbedSessionMeta(await fs.readFile(match, "utf8"), embedSession)
          const preload = themePreloadHash(html)
          const hash = preload ? createHash("sha256").update(preload[2]).digest("base64") : ""
          const headers = new Headers({ "content-type": mime, "content-security-policy": csp(hash) || DEFAULT_CSP })
          return new Response(html, { headers })
        }
      return new Response(new Uint8Array(await fs.readFile(match)), { headers: new Headers({ "content-type": mime }) })
    }

    return Response.json({ error: "Not Found" }, { status: 404 })
  }

  const response = await proxy(upstreamURL(path), {
    raw: request,
    headers: ProxyUtil.headers(request, { host: UI_UPSTREAM.host }),
  })
  response.headers.delete("alt-svc")
  if (response.headers.get("content-type")?.includes("text/html")) {
    const html = injectEmbedSessionMeta(await response.text(), embedSession)
    const match = themePreloadHash(html)
    const hash = match ? createHash("sha256").update(match[2]).digest("base64") : ""
    response.headers.set("Content-Security-Policy", csp(hash) || DEFAULT_CSP)
    response.headers.set("content-length", String(Buffer.byteLength(html)))
    return new Response(html, response)
  }
  response.headers.set("Content-Security-Policy", DEFAULT_CSP)
  return response
}

export function serveUIEffect(
  request: HttpServerRequest.HttpServerRequest,
  services: { fs: AppFileSystem.Interface; client: HttpClient.HttpClient },
  opts?: { embeddedWebUI?: Record<string, string> | null },
) {
  return Effect.gen(function* () {
    const embeddedWebUI = yield* Effect.promise(() => embeddedUI(opts?.embeddedWebUI))
    const path = new URL(request.url, "http://localhost").pathname
    const embedSession = request.headers["x-opencode-embed-session"] ?? new URL(request.url, "http://localhost").searchParams.get("embed_session") ?? undefined

    if (embeddedWebUI) {
      const match = embeddedWebUI[path.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
      if (!match) return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })

      if (yield* services.fs.existsSafe(match)) {
        const mime = getMimeType(match) ?? "text/plain"
        const headers = new Headers({ "content-type": mime })
        if (mime.startsWith("text/html")) {
          const html = injectEmbedSessionMeta(yield* services.fs.readFileString(match), embedSession)
          const preload = themePreloadHash(html)
          const hash = preload ? createHash("sha256").update(preload[2]).digest("base64") : ""
          headers.set("content-security-policy", csp(hash) || DEFAULT_CSP)
          return HttpServerResponse.text(html, { headers })
        }
        return HttpServerResponse.raw(yield* services.fs.readFile(match), { headers })
      }

      return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
    }

    const response = yield* services.client.execute(
      HttpClientRequest.make(request.method)(upstreamURL(path), {
        headers: ProxyUtil.headers(request.headers, { host: UI_UPSTREAM.host }),
        body: requestBody(request),
      }),
    )
    const headers = proxyResponseHeaders(response.headers)
    headers.delete("alt-svc")

    if (response.headers["content-type"]?.includes("text/html")) {
      const body = injectEmbedSessionMeta(yield* response.text, embedSession)
      const match = themePreloadHash(body)
      headers.set("Content-Security-Policy", csp(match ? createHash("sha256").update(match[2]).digest("base64") : "") || DEFAULT_CSP)
      headers.set("content-length", String(Buffer.byteLength(body)))
      return HttpServerResponse.text(body, { status: response.status, headers })
    }

    headers.set("Content-Security-Policy", DEFAULT_CSP)
    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      headers,
    })
  })
}

export const UIRoutes = (opts?: { embeddedWebUI?: Record<string, string> | null }): Hono =>
  new Hono().all("/*", (c) => serveUI(c.req.raw, opts))
