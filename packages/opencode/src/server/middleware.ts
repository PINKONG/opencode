import { Provider } from "@/provider/provider"
import { NamedError } from "@opencode-ai/core/util/error"
import { NotFoundError } from "@/storage/storage"
import { Session } from "@/session/session"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { ErrorHandler, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import * as Log from "@opencode-ai/core/util/log"
import { Flag } from "@opencode-ai/core/flag/flag"
import { basicAuth } from "hono/basic-auth"
import { getCookie, setCookie } from "hono/cookie"
import { cors } from "hono/cors"
import { compress } from "hono/compress"
import * as ServerBackend from "./backend"
import { issueEmbedSession, resolveEmbedSession } from "./embed-session"

const log = Log.create({ service: "server" })
const EMBED_QUERY = "embed_session"
const EMBED_HEADER = "x-opencode-embed-session"
const STATIC_UI_PATHS = [
  /^\/assets\//,
  /^\/favicon(?:-[^/]+)?\.(?:ico|png|svg)$/,
  /^\/apple-touch-icon(?:-[^/]+)?\.png$/,
  /^\/web-app-manifest-[^/]+\.png$/,
  /^\/site\.webmanifest$/,
  /^\/oc-theme-preload\.js$/,
]

function isPublicStaticUIAsset(path: string, method: string) {
  if (method !== "GET" && method !== "HEAD") return
  return STATIC_UI_PATHS.some((pattern) => pattern.test(path))
}

function shouldRedirectToEmbedSession(path: string, method: string, accept: string | undefined) {
  if (method !== "GET") return false
  if (path !== "/") return false
  return !!accept?.includes("text/html")
}

function isCrossSite(c: Parameters<MiddlewareHandler>[0]) {
  return c.req.raw.headers.get("sec-fetch-site") === "cross-site"
}

export const ErrorMiddleware: ErrorHandler = (err, c) => {
  log.error("failed", {
    error: err,
  })
  if (err instanceof NamedError) {
    let status: ContentfulStatusCode
    if (err instanceof NotFoundError) status = 404
    else if (err instanceof Provider.ModelNotFoundError) status = 400
    else if (err.name === "ProviderAuthValidationFailed") status = 400
    else if (err.name.startsWith("Worktree")) status = 400
    else status = 500
    return c.json(err.toObject(), { status })
  }
  if (err instanceof Session.BusyError) {
    return c.json(new NamedError.Unknown({ message: err.message }).toObject(), { status: 400 })
  }
  if (err instanceof HTTPException) return err.getResponse()
  const message = err instanceof Error && err.stack ? err.stack : err.toString()
  return c.json(new NamedError.Unknown({ message }).toObject(), {
    status: 500,
  })
}

export const AuthMiddleware: MiddlewareHandler = async (c, next) => {
  // Allow CORS preflight requests to succeed without auth.
  // Browser clients sending Authorization headers will preflight with OPTIONS.
  if (c.req.method === "OPTIONS") return next()
  if (isPublicStaticUIAsset(c.req.path, c.req.method)) return next()
  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return next()
  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  const existingAuth = c.req.raw.headers.get("authorization")
  const queryToken = c.req.query("auth_token")
  const embedSession = c.req.query(EMBED_QUERY) ?? c.req.raw.headers.get(EMBED_HEADER) ?? undefined
  const embedToken = existingAuth ? undefined : resolveEmbedSession(embedSession)
  const cookieToken = getCookie(c, "wiscode_auth_token")
  const token = existingAuth ? undefined : (embedToken ?? queryToken ?? cookieToken)
  if (token) c.req.raw.headers.set("authorization", `Basic ${token}`)

  return basicAuth({ username, password })(c, async () => {
    const mintedEmbedSession = queryToken ? issueEmbedSession(queryToken) : embedSession
    if (mintedEmbedSession) c.req.raw.headers.set(EMBED_HEADER, mintedEmbedSession)
    const redirectUrl =
      queryToken && shouldRedirectToEmbedSession(c.req.path, c.req.method, c.req.header("accept"))
        ? (() => {
            const next = new URL(c.req.url)
            next.searchParams.delete("auth_token")
            next.searchParams.set(EMBED_QUERY, mintedEmbedSession!)
            return next.toString()
          })()
        : undefined
    if (queryToken && !isCrossSite(c)) {
      setCookie(c, "wiscode_auth_token", queryToken, {
        path: "/",
        sameSite: "Lax",
        httpOnly: true,
        maxAge: 60 * 60 * 8,
      })
    }
    await next()
    if (redirectUrl) c.res = c.redirect(redirectUrl, 302)
  })
}

export function LoggerMiddleware(backendAttributes: ServerBackend.Attributes): MiddlewareHandler {
  return async (c, next) => {
    const skip = c.req.path === "/log"
    if (skip) return next()
    const attributes = {
      method: c.req.method,
      path: c.req.path,
      ...backendAttributes,
    }
    log.info("request", attributes)
    const timer = log.time("request", attributes)
    await next()
    timer.stop()
  }
}

export function CorsMiddleware(opts?: { cors?: string[] }): MiddlewareHandler {
  return cors({
    maxAge: 86_400,
    origin(input) {
      if (!input) return

      if (input.startsWith("http://localhost:")) return input
      if (input.startsWith("http://127.0.0.1:")) return input
      if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
        return input

      if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) return input
      if (opts?.cors?.includes(input)) return input
    },
  })
}

const zipped = compress()
export const CompressionMiddleware: MiddlewareHandler = (c, next) => {
  const path = c.req.path
  const method = c.req.method
  if (path === "/event" || path === "/global/event") return next()
  if (method === "POST" && /\/session\/[^/]+\/(message|prompt_async)$/.test(path)) return next()
  return zipped(c, next)
}
