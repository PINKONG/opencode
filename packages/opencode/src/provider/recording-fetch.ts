type WireRequest = { url: string; method: string; headers: Record<string, string>; body: string }
type WireResponse = { status?: number; headers?: Record<string, string>; body?: string; error?: string }

export function createWireCapture() {
  const pending: Array<Promise<{ request: WireRequest; response: WireResponse }>> = []
  return {
    wrap(base: typeof fetch): typeof fetch {
      return Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init)
          const copy = request.clone()
          const requestBody = copy.text()
          const snapshot = (body: string): WireRequest => ({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers),
            body,
          })
          let response: Response
          try {
            response = await base(request)
          } catch (error) {
            pending.push(requestBody.then((body) => ({ request: snapshot(body), response: { error: String(error) } })))
            throw error
          }
          const responseCopy = response.clone()
          pending.push(
            Promise.all([requestBody, responseCopy.text()])
              .then(([body, responseBody]) => ({
                request: snapshot(body),
                response: {
                  status: response.status,
                  headers: Object.fromEntries(response.headers),
                  body: responseBody,
                },
              }))
              .catch((error) => ({
                request: snapshot(""),
                response: {
                  status: response.status,
                  headers: Object.fromEntries(response.headers),
                  error: String(error),
                },
              })),
          )
          return response
        },
        { preconnect: base.preconnect?.bind(base) ?? (() => {}) },
      )
    },
    exchanges: (timeoutMs = 10_000) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      return Promise.race([
        Promise.all(pending),
        new Promise<[]>((resolve) => {
          timer = setTimeout(() => resolve([]), timeoutMs)
        }),
      ]).finally(() => {
        if (timer) clearTimeout(timer)
      })
    },
  }
}
