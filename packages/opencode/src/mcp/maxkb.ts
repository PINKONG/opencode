import { createHash, createHmac, randomBytes } from "crypto"

type MaxkbAuth = {
  appKey: string
  appSecret: string
}

type SignedHeadersInput = {
  method: string
  path: string
  rawQuery: string
  body: Uint8Array
  headers?: HeadersInit
}

type SignOpts = {
  timestamp?: string
  nonce?: string
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Warn = (message: string, data: Record<string, unknown>) => void

export function createMaxkbNonce() {
  return randomBytes(16).toString("hex")
}

export async function normalizeMaxkbBody(body: BodyInit | Uint8Array | ArrayBuffer | undefined) {
  if (body === undefined) return new Uint8Array()
  if (typeof body === "string") return new TextEncoder().encode(body)
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (
    body instanceof ReadableStream ||
    (typeof body === "object" && body !== null && "getReader" in body && typeof body.getReader === "function")
  ) {
    throw new Error("ReadableStream bodies are not supported")
  }
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  throw new Error(`Unsupported MaxKB body type: ${Object.prototype.toString.call(body)}`)
}

export async function sha256Hex(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex")
}

export function buildMaxkbCanonical(input: {
  method: string
  path: string
  rawQuery: string
  bodySha256Hex: string
  timestamp: string
  nonce: string
}) {
  return [
    input.method.toUpperCase(),
    input.path,
    input.rawQuery,
    input.bodySha256Hex,
    input.timestamp,
    input.nonce,
  ].join("\n")
}

export function signMaxkbCanonical(appSecret: string, canonical: string) {
  return createHmac("sha256", appSecret).update(canonical).digest("hex")
}

export async function createMaxkbSignedHeaders(auth: MaxkbAuth, input: SignedHeadersInput, opts: SignOpts = {}) {
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000))
  const nonce = opts.nonce ?? createMaxkbNonce()
  const headers = new Headers(input.headers)
  const bodySha256Hex = await sha256Hex(input.body)
  const canonical = buildMaxkbCanonical({
    method: input.method,
    path: input.path,
    rawQuery: input.rawQuery,
    bodySha256Hex,
    timestamp,
    nonce,
  })

  headers.set("X-MCP-App-Key", auth.appKey)
  headers.set("X-MCP-Timestamp", timestamp)
  headers.set("X-MCP-Nonce", nonce)
  headers.set("X-MCP-Signature", signMaxkbCanonical(auth.appSecret, canonical))
  return headers
}

async function requestBytes(input: Request | URL | string, init?: RequestInit) {
  if (input instanceof Request) {
    const method = input.method.toUpperCase()
    const body = method === "GET" || method === "HEAD" ? new Uint8Array() : new Uint8Array(await input.clone().arrayBuffer())
    return {
      url: new URL(input.url),
      method,
      body,
      headers: new Headers(init?.headers ?? input.headers),
    }
  }

  const body = await normalizeMaxkbBody(init?.body as BodyInit | Uint8Array | ArrayBuffer | undefined)
  return {
    url: new URL(input instanceof URL ? input.toString() : input),
    method: (init?.method ?? "GET").toUpperCase(),
    body,
    headers: new Headers(init?.headers),
  }
}

function rebuildRequest(
  url: URL,
  init: RequestInit | undefined,
  headers: Headers,
  body: Uint8Array,
  method: string,
) {
  const { method: _m, headers: _h, body: _b, ...rest } = init ?? {}
  return new Request(url, {
    ...rest,
    method,
    headers,
    ...(method === "GET" || method === "HEAD" ? {} : { body: body.slice().buffer }),
  })
}

export function createMaxkbSignedFetch(auth: MaxkbAuth, next: FetchLike = fetch, warn: Warn = console.warn): FetchLike {
  return async (input, init) => {
    const resolved = await requestBytes(input as Request | URL | string, init)
    const headers = await createMaxkbSignedHeaders(
      auth,
      {
        method: resolved.method,
        path: resolved.url.pathname,
        rawQuery: resolved.url.search.replace(/^\?/, ""),
        body: resolved.body,
        headers: resolved.headers,
      },
    )
    const req = rebuildRequest(resolved.url, init, headers, resolved.body, resolved.method)
    const res = await next(req)

    if (res.status >= 400 && res.status < 500) {
      const text = await res.clone().text()
      let errorCode = ""
      let requestId = ""
      try {
        const json = JSON.parse(text)
        errorCode = json?.error_code ?? json?.code ?? ""
        requestId = json?.request_id ?? ""
      } catch {}
      if (errorCode || requestId) {
        warn("maxkb auth request failed", {
          status: res.status,
          method: resolved.method,
          path: resolved.url.pathname,
          errorCode,
          requestId,
        })
      }
    }

    return res
  }
}
