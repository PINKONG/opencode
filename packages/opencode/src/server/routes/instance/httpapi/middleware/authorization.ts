import { ServerAuth } from "@/server/auth"
import { issueEmbedSession, resolveEmbedSession } from "@/server/embed-session"
import { Effect, Encoding, Layer, Redacted } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi"
import { hasPtyConnectTicketURL } from "@/server/shared/pty-ticket"
import { isPublicUIPath } from "@/server/shared/public-ui"
export {
  Authorization as ServerAuthorization,
  authorizationLayer as serverAuthorizationLayer,
} from "@opencode-ai/server/middleware/authorization"

const AUTH_TOKEN_QUERY = "auth_token"
const AUTH_COOKIE = "wiscode_auth_token"
const EMBED_QUERY = "embed_session"
const EMBED_HEADER = "x-opencode-embed-session"
const UNAUTHORIZED = 401
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'

// Avoid HttpApiSecurity alternatives here: Effect security middleware wraps the
// full handler, so a downstream failure can make the next auth alternative run
// and remap an authorized NotFound into Unauthorized.
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "@opencode/ExperimentalHttpApiAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

export class PtyConnectAuthorization extends HttpApiMiddleware.Service<PtyConnectAuthorization>()(
  "@opencode/ExperimentalHttpApiPtyConnectAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

function emptyCredential() {
  return {
    username: "",
    password: Redacted.make(""),
  }
}

function validateCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
) {
  return Effect.gen(function* () {
    if (!ServerAuth.required(config)) return yield* effect
    if (!ServerAuth.authorized(credential, config)) {
      yield* HttpEffect.appendPreResponseHandler((_request, response) =>
        Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
      )
      return yield* new HttpApiError.Unauthorized({})
    }
    return yield* effect
  })
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return {
          username: header.slice(0, separator),
          password: Redacted.make(header.slice(separator + 1)),
        }
      },
    }),
  )
}

function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  return credentialFromURL(new URL(request.url, "http://localhost"), request)
}

function credentialFromURL(url: URL, request: HttpServerRequest.HttpServerRequest) {
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const embedSession = url.searchParams.get(EMBED_QUERY) ?? request.headers[EMBED_HEADER] ?? undefined
  const embedToken = resolveEmbedSession(embedSession)
  if (embedToken) return decodeCredential(embedToken)
  const cookieToken = getCookie(request.headers.cookie, AUTH_COOKIE)
  if (cookieToken) return decodeCredential(cookieToken)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

function credentialFromToken(
  token: string | undefined,
  embedToken: string | undefined,
  request: HttpServerRequest.HttpServerRequest,
) {
  if (token) return decodeCredential(token)
  if (embedToken) return decodeCredential(embedToken)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

function validateRawCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
) {
  if (!ServerAuth.required(config)) return effect
  if (!ServerAuth.authorized(credential, config))
    return Effect.succeed(
      HttpServerResponse.empty({
        status: UNAUTHORIZED,
        headers: { "www-authenticate": WWW_AUTHENTICATE },
      }),
    )
  return effect
}

export const authorizationRouterMiddleware = HttpRouter.middleware()(
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return (effect) => effect

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (isPublicUIPath(request.method, url.pathname)) return yield* effect
        if (hasPtyConnectTicketURL(url)) return yield* effect
        const existingAuth = request.headers.authorization
        const queryToken = url.searchParams.get(AUTH_TOKEN_QUERY)
        const embedSession = url.searchParams.get(EMBED_QUERY) ?? request.headers[EMBED_HEADER] ?? undefined
        const embedToken = existingAuth ? undefined : resolveEmbedSession(embedSession)
        const cookieToken = existingAuth ? undefined : getCookie(request.headers.cookie, AUTH_COOKIE)
        const token = existingAuth ? undefined : (embedToken ?? queryToken ?? cookieToken)
        const mintedEmbedSession = queryToken ? issueEmbedSession(queryToken) : embedSession
        const mintedEmbedToken = queryToken ?? embedToken
        const redirectURL = shouldRedirectToEmbedSession(url, request) ? embedRedirectURL(url, mintedEmbedSession) : undefined
        const shouldSetCookie = !!queryToken
        const withCookie = (next: HttpServerResponse.HttpServerResponse) => {
          if (!shouldSetCookie || !queryToken) return next
          return HttpServerResponse.setHeader(
            next,
            "set-cookie",
            `${AUTH_COOKIE}=${queryToken}; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax`,
          )
        }
        if (redirectURL && queryToken) {
          const gate = yield* credentialFromToken(queryToken, undefined, request).pipe(
            Effect.flatMap((credential) => validateRawCredential(Effect.succeed(HttpServerResponse.empty()), credential, config)),
          )
          if (gate.status === UNAUTHORIZED) return gate
          return withCookie(HttpServerResponse.empty({ status: 302, headers: { location: redirectURL } }))
        }
        const response = yield* credentialFromToken(token, mintedEmbedToken, request).pipe(
          Effect.flatMap((credential) => validateRawCredential(effect, credential, config)),
        )
        return withCookie(response)
      })
  }),
)

function getCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return
  for (const pair of cookieHeader.split(";")) {
    const token = pair.trim()
    if (!token.startsWith(`${name}=`)) continue
    return token.slice(name.length + 1)
  }
}

function shouldRedirectToEmbedSession(url: URL, request: HttpServerRequest.HttpServerRequest) {
  if (!url.searchParams.get(AUTH_TOKEN_QUERY)) return false
  if (request.method !== "GET") return false
  return !!request.headers.accept?.includes("text/html")
}

function embedRedirectURL(url: URL, embedSession: string | undefined) {
  const next = new URL(url.toString())
  next.searchParams.delete(AUTH_TOKEN_QUERY)
  if (embedSession) next.searchParams.set(EMBED_QUERY, embedSession)
  return next.pathname + next.search + next.hash
}

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        return yield* credentialFromRequest(request).pipe(
          Effect.flatMap((credential) => validateCredential(effect, credential, config)),
        )
      }),
    )
  }),
)

export const ptyConnectAuthorizationLayer = Layer.effect(
  PtyConnectAuthorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return PtyConnectAuthorization.of((effect) => effect)
    return PtyConnectAuthorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        return yield* credentialFromURL(url, request).pipe(
          Effect.flatMap((credential) => validateCredential(effect, credential, config)),
        )
      }),
    )
  }),
)
