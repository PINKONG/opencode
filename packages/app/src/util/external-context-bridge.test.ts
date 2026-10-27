import { beforeEach, expect, spyOn, test } from "bun:test"
import {
  currentExternalContext,
  installExternalContextBridge,
  subscribeExternalContext,
} from "./external-context-bridge"

type MessageHandler = (event: MessageEvent) => void

const parent = {}
let handler: MessageHandler | undefined

beforeEach(() => {
  handler = undefined
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      parent,
      addEventListener: (_type: string, next: MessageHandler) => {
        handler = next
      },
      removeEventListener: (_type: string, next: MessageHandler) => {
        if (handler === next) handler = undefined
      },
    },
  })
})

test("does not install the bridge outside an embedded window", () => {
  const self = {
    parent: undefined as unknown,
    addEventListener: () => {
      throw new Error("bridge should not be installed")
    },
    removeEventListener: () => {},
  }
  self.parent = self
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: self,
  })

  expect(installExternalContextBridge()).toEqual(expect.any(Function))
  expect(handler).toBeUndefined()
})

test("reports rejected host data without logging its contents", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {})
  const dispose = installExternalContextBridge()
  handler?.({ source: parent, origin: "https://host.example", data: { type: "wiscode.context.update", data: ["secret"] } } as MessageEvent)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(warn.mock.calls)).not.toContain("secret")
  dispose()
  warn.mockRestore()
})

test("accepts valid parent messages and rejects invalid sources, origins, and payloads", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {})
  const received: Record<string, unknown>[] = []
  const unsubscribe = subscribeExternalContext((data) => received.push(data))
  const dispose = installExternalContextBridge()

  handler?.({ source: {}, origin: "https://host.example", data: { type: "wiscode.context.update", data: { ignored: true } } } as MessageEvent)
  handler?.({ source: parent, origin: "null", data: { type: "wiscode.context.update", data: { ignored: true } } } as MessageEvent)
  handler?.({ source: parent, origin: "https://host.example", data: { type: "wiscode.context.update", data: [] } } as MessageEvent)
  expect(received).toEqual([])

  const data = { pageId: "page-1", eventInfo: { name: "onChange" } }
  handler?.({ source: parent, origin: "https://host.example", data: { type: "wiscode.context.update", data } } as MessageEvent)
  expect(received).toEqual([data])
  expect(currentExternalContext()).toEqual(data)

  handler?.({ source: parent, origin: "https://other.example", data: { type: "wiscode.context.update", data: { pageId: "other" } } } as MessageEvent)
  expect(currentExternalContext()).toEqual(data)

  const empty = {}
  handler?.({ source: parent, origin: "https://host.example", data: { type: "wiscode.context.update", data: empty } } as MessageEvent)
  expect(received).toEqual([data, empty])
  expect(currentExternalContext()).toEqual(empty)

  unsubscribe()
  dispose()
  warn.mockRestore()
})
