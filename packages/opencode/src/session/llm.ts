import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { llmClient } from "@opencode-ai/core/effect/app-node-platform"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Provider } from "@/provider/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Cause, Context, Effect, Exit, Layer } from "effect"
import * as Stream from "effect/Stream"
import { asSchema, streamText, wrapLanguageModel, type ModelMessage, type Tool } from "ai"
import type { LLMEvent } from "@opencode-ai/llm"
import { LLMClient } from "@opencode-ai/llm/route"
import type { LLMClientService } from "@opencode-ai/llm/route"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "./message-v2"
import { Plugin } from "@/plugin"
import { Permission } from "@/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@opencode-ai/core/event"
import { Wildcard } from "@/util/wildcard"
import { SessionID } from "@/session/schema"
import { Auth } from "@/auth"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { LLMAISDK } from "./llm/ai-sdk"
import { LLMNativeRuntime } from "./llm/native-runtime"
import { LLMRequestPrep } from "./llm/request"
import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Diagnostic } from "@opencode-ai/schema"
import { createWireCapture } from "@/provider/recording-fetch"
import { Session } from "./session"

export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

export type StreamInput = {
  user: SessionV1.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: PermissionV1.Ruleset
  system: string[]
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
  toolChoice?: "auto" | "required" | "none"
  diagnostic?: DiagnosticTrace.TraceContext
  diagnosticService?: DiagnosticTrace.Interface
  onTurn?: (context: DiagnosticTrace.TraceContext) => void
  querySource?: Diagnostic.QuerySource
  attempt?: number
  assistantMessageID?: string
}

export type StreamRequest = StreamInput & {
  abort: AbortSignal
  wire?: ReturnType<typeof createWireCapture>
  onPrepared?: (prepared: LLMRequestPrep.Prepared) => Effect.Effect<void>
}

export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}

export const use = serviceUse(Service)

const live: Layer.Layer<
  Service,
  never,
  | Auth.Service
  | Config.Service
  | Provider.Service
  | Plugin.Service
  | Permission.Service
  | EventV2Bridge.Service
  | LLMClientService
  | RuntimeFlags.Service
  | DiagnosticTrace.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service
    const perm = yield* Permission.Service
    const events = yield* EventV2Bridge.Service
    const llmClient = yield* LLMClient.Service
    const flags = yield* RuntimeFlags.Service
    const defaultDiagnostics = yield* DiagnosticTrace.Service

    const run = Effect.fn("LLM.run")(function* (input: StreamRequest) {
      yield* Effect.logInfo("stream", {
        providerID: input.model.providerID,
        modelID: input.model.id,
        "session.id": input.sessionID,
        small: (input.small ?? false).toString(),
        agent: input.agent.name,
        mode: input.agent.mode,
      })

      const [language, cfg, item, info] = yield* Effect.all(
        [
          provider.getLanguage(input.model, input.wire ? { wrapFetch: input.wire.wrap } : undefined),
          config.get(),
          provider.getProvider(input.model.providerID),
          auth.get(input.model.providerID),
        ],
        { concurrency: "unbounded" },
      )

      const isWorkflow = language instanceof GitLabWorkflowLanguageModel
      const prepared = yield* LLMRequestPrep.prepare({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow,
      })
      if (input.onPrepared) yield* input.onPrepared(prepared)

      // Wire up toolExecutor for DWS workflow models so that tool calls
      // from the workflow service are executed via opencode's tool system
      // and results sent back over the WebSocket.
      const bridge = yield* EffectBridge.make()
      if (language instanceof GitLabWorkflowLanguageModel) {
        const workflowModel = language as GitLabWorkflowLanguageModel & {
          sessionID?: string
          sessionPreapprovedTools?: string[]
          approvalHandler?: (approvalTools: { name: string; args: string }[]) => Promise<{ approved: boolean }>
        }
        workflowModel.sessionID = input.sessionID
        workflowModel.systemPrompt = prepared.system.join("\n")
        workflowModel.toolExecutor = async (toolName, argsJson, _requestID) => {
          const t = prepared.tools[toolName]
          if (!t || !t.execute) {
            return { result: "", error: `Unknown tool: ${toolName}` }
          }
          try {
            const result = await t.execute!(JSON.parse(argsJson), {
              toolCallId: _requestID,
              messages: input.messages,
              abortSignal: input.abort,
            })
            const output = typeof result === "string" ? result : (result?.output ?? JSON.stringify(result))
            return {
              result: output,
              metadata: typeof result === "object" ? result?.metadata : undefined,
              title: typeof result === "object" ? result?.title : undefined,
            }
          } catch (e: any) {
            return { result: "", error: e.message ?? String(e) }
          }
        }

        const ruleset = Permission.merge(input.agent.permission ?? [], input.permission ?? [])
        workflowModel.sessionPreapprovedTools = Object.keys(prepared.tools).filter((name) => {
          const match = ruleset.findLast((rule) => Wildcard.match(name, rule.permission))
          return !match || match.action !== "ask"
        })

        const approvedToolsForSession = new Set<string>()
        workflowModel.approvalHandler = bridge.bind(async (approvalTools) => {
          const uniqueNames = [...new Set(approvalTools.map((t: { name: string }) => t.name))] as string[]
          // Auto-approve tools that were already approved in this session
          // (prevents infinite approval loops for server-side MCP tools)
          if (uniqueNames.every((name) => approvedToolsForSession.has(name))) {
            return { approved: true }
          }

          const id = PermissionV1.ID.ascending()
          let unsub: EventV2.Unsubscribe | undefined
          try {
            unsub = await bridge.promise(
              events.listen((event) => {
                if (event.type !== Permission.Event.Replied.type) return Effect.void
                const data = event.data as EventV2.Data<typeof Permission.Event.Replied>
                if (data.requestID !== id) return Effect.void
                void data.reply
                return Effect.void
              }),
            )
            const toolPatterns = approvalTools.map((t: { name: string; args: string }) => {
              try {
                const parsed = JSON.parse(t.args) as Record<string, unknown>
                const title = (parsed?.title ?? parsed?.name ?? "") as string
                return title ? `${t.name}: ${title}` : t.name
              } catch {
                return t.name
              }
            })
            const uniquePatterns = [...new Set(toolPatterns)] as string[]
            await bridge.promise(
              perm.ask({
                id,
                sessionID: SessionID.make(input.sessionID),
                permission: "workflow_tool_approval",
                patterns: uniquePatterns,
                metadata: { tools: approvalTools },
                always: uniquePatterns,
                ruleset: [],
              }),
            )
            for (const name of uniqueNames) approvedToolsForSession.add(name)
            workflowModel.sessionPreapprovedTools = [...(workflowModel.sessionPreapprovedTools ?? []), ...uniqueNames]
            return { approved: true }
          } catch {
            return { approved: false }
          } finally {
            if (unsub) await bridge.promise(unsub)
          }
        })
      }

      const tracer = cfg.experimental?.openTelemetry
        ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
        : undefined
      const telemetryTracer = tracer
        ? new Proxy(tracer, {
            get(target, prop, receiver) {
              if (prop !== "startSpan") return Reflect.get(target, prop, receiver)
              return (...args: Parameters<typeof target.startSpan>) => {
                const span = target.startSpan(...args)
                span.setAttribute("session.id", input.sessionID)
                return span
              }
            },
          })
        : undefined

      // Runtime seam: native is an opt-in adapter over @opencode-ai/llm. It
      // either returns a ready LLMEvent stream or a concrete fallback reason.
      if (flags.experimentalNativeLlm) {
        const native = LLMNativeRuntime.stream({
          model: input.model,
          provider: item,
          auth: info,
          llmClient,
          messages: prepared.messages,
          tools: prepared.tools,
          toolChoice: input.toolChoice,
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          maxOutputTokens: prepared.params.maxOutputTokens,
          providerOptions: prepared.params.options,
          headers: prepared.headers,
          abort: input.abort,
          wire: input.wire,
        })
        if (native.type === "supported") {
          yield* Effect.logInfo("llm runtime selected", {
            "llm.runtime": "native",
            "llm.provider": input.model.providerID,
            "llm.model": input.model.id,
          })
          return {
            type: "native" as const,
            stream: native.stream,
          }
        }
        yield* Effect.logInfo("llm runtime selected", {
          "llm.runtime": "ai-sdk",
          "llm.provider": input.model.providerID,
          "llm.model": input.model.id,
          "llm.native_unsupported_reason": native.reason,
        })
        yield* Effect.logInfo("native runtime unavailable; falling back to ai-sdk", {
          providerID: input.model.providerID,
          modelID: input.model.id,
          "session.id": input.sessionID,
          small: (input.small ?? false).toString(),
          agent: input.agent.name,
          mode: input.agent.mode,
          reason: native.reason,
        })
      }

      yield* Effect.logInfo("llm runtime selected", {
        "llm.runtime": "ai-sdk",
        "llm.provider": input.model.providerID,
        "llm.model": input.model.id,
      })
      // Default runtime path: AI SDK owns provider execution and tool dispatch;
      // LLMAISDK.toLLMEvents below normalizes fullStream parts for the processor.
      return {
        type: "ai-sdk" as const,
        result: streamText({
          onError(error) {
            bridge.fork(
              Effect.logError("stream error", {
                providerID: input.model.providerID,
                modelID: input.model.id,
                "session.id": input.sessionID,
                small: (input.small ?? false).toString(),
                agent: input.agent.name,
                mode: input.agent.mode,
                error,
              }),
            )
          },
          // Copilot returns the authoritative billed amount only in provider-specific response fields.
          includeRawChunks: input.model.providerID.includes("github-copilot"),
          async experimental_repairToolCall(failed) {
            const lower = failed.toolCall.toolName.toLowerCase()
            if (lower !== failed.toolCall.toolName && prepared.tools[lower]) {
              return {
                ...failed.toolCall,
                toolName: lower,
              }
            }
            return {
              ...failed.toolCall,
              input: JSON.stringify({
                tool: failed.toolCall.toolName,
                error: failed.error.message,
              }),
              toolName: "invalid",
            }
          },
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          providerOptions: ProviderTransform.providerOptions(input.model, prepared.params.options),
          activeTools: Object.keys(prepared.tools).filter((x) => x !== "invalid"),
          tools: prepared.tools,
          toolChoice: input.toolChoice,
          maxOutputTokens: prepared.params.maxOutputTokens,
          abortSignal: input.abort,
          headers: prepared.headers,
          maxRetries: input.retries ?? 0,
          messages: prepared.messages,
          model: wrapLanguageModel({
            model: language,
            middleware: [
              {
                specificationVersion: "v3" as const,
                async transformParams(args) {
                  if (args.type === "stream") {
                    // @ts-expect-error
                    args.params.prompt = ProviderTransform.message(
                      args.params.prompt,
                      input.model,
                      prepared.messageTransformOptions,
                    )
                  }
                  return args.params
                },
              },
            ],
          }),
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            functionId: "session.llm",
            tracer: telemetryTracer,
            metadata: {
              userId: cfg.username ?? "unknown",
              sessionId: input.sessionID,
            },
          },
        }),
      }
    })

    const stream: Interface["stream"] = (input) =>
      Stream.scoped(
        Stream.unwrap(
          Effect.gen(function* () {
            const diagnostics = input.diagnosticService ?? defaultDiagnostics
            const context = input.diagnostic
              ? diagnostics.startTurn(input.diagnostic, { attempt: input.attempt })
              : undefined
            if (context) input.onTurn?.(context)
            const started = performance.now()
            const diagnosticConfig = diagnostics.config()
            const wire =
              context && diagnosticConfig.enabled && diagnosticConfig.rawPayloads
                ? createWireCapture()
                : undefined
            let terminal = false
            const ctrl = yield* Effect.acquireRelease(
              Effect.sync(() => new AbortController()),
              (ctrl) =>
                Effect.sync(() => {
                  ctrl.abort()
                }),
            )
            let chunk = 0
            let firstTokenMs: number | undefined
            let textBytes = 0
            let reasoningBytes = 0
            let toolCallCount = 0
            const textParts: string[] = []
            const reasoningParts: string[] = []
            const toolCalls: Array<{ id: string; name: string; input: unknown }> = []

            let admitted = false
            const requestStarted = (prepared?: LLMRequestPrep.Prepared) => Effect.gen(function* () {
              if (!context || admitted) return
              admitted = true
              yield* diagnostics.emit(context, "llm.request.started", {
                summary: {
                  provider: input.model.providerID,
                  model: input.model.id,
                  querySource: input.querySource ?? (input.parentSessionID ? "subagent" : "main"),
                  messageCount: input.messages.length,
                  toolCount: Object.keys(input.tools).length,
                  attempt: context.attempt,
                  messageId: input.assistantMessageID,
                  userMessageId: input.user.id,
                },
                ...(prepared && diagnosticConfig.llmContent ? { content: diagnosticRequestContent(prepared) } : {}),
                raw: () => ({
                  wiscodeRequest: { system: input.system, messages: input.messages, tools: Object.keys(input.tools) },
                }),
              })
            }).pipe(Effect.catchCause((cause) => Effect.logWarning("Diagnostic request content failed", cause)))
            const failed = (cause: Cause.Cause<unknown>) => {
              if (!context || terminal) return Effect.void
              terminal = true
              const outcome = diagnosticStreamExit(Exit.failCause(cause))
              return requestStarted().pipe(Effect.andThen(diagnostics.complete(
                context,
                outcome.event,
                {
                  summary: {
                    provider: input.model.providerID,
                    model: input.model.id,
                    error: DiagnosticTrace.errorInfo(Cause.squash(cause), "provider"),
                    attempt: context.attempt,
                  },
                  ...(diagnosticConfig.llmContent
                    ? {
                        content: {
                          kind: "response",
                          text: textParts.join(""),
                          reasoning: reasoningParts.join(""),
                          toolCalls,
                          complete: false,
                        },
                      }
                    : {}),
                  ...(wire
                    ? {
                        raw: async () => {
                          const exchanges = await wire.exchanges()
                          return {
                            providerRequest: exchanges.at(-1)?.request,
                            providerResponse: exchanges.at(-1)?.response,
                            providerExchanges: exchanges,
                          }
                        },
                      }
                    : {}),
                },
                { status: outcome.status, durationMs: performance.now() - started },
              )))
            }
            const result = yield* run({ ...input, abort: ctrl.signal, wire, onPrepared: requestStarted }).pipe(Effect.tapCause(failed))

            const observe = (source: Stream.Stream<LLMEvent, unknown>) =>
              source.pipe(
                Stream.tap((event) => {
                  if (!context) return Effect.void
                  if (terminal) return Effect.void
                  if (
                    event.type === "text-delta" ||
                    event.type === "reasoning-delta" ||
                    event.type === "tool-input-delta"
                  ) {
                    firstTokenMs ??= performance.now() - started
                    if (event.type === "text-delta") {
                      textBytes += Buffer.byteLength(event.text, "utf8")
                      if (wire || diagnosticConfig.llmContent) textParts.push(event.text)
                    }
                    if (event.type === "reasoning-delta") {
                      reasoningBytes += Buffer.byteLength(event.text, "utf8")
                      if (wire || diagnosticConfig.llmContent) reasoningParts.push(event.text)
                    }
                  }
                  if (event.type === "tool-call") {
                    toolCallCount++
                    if (wire || diagnosticConfig.llmContent) toolCalls.push({ id: event.id, name: event.name, input: event.input })
                  }
                  const record = diagnosticLLMEvent(event, chunk++)
                  if (!record) return Effect.void
                  const terminalEvent =
                    record.event === "llm.request.completed" || record.event === "llm.request.failed"
                  if (terminalEvent) terminal = true
                  const billed =
                    (event.type === "finish" || event.type === "step-finish") && event.usage && input.model.cost
                      ? Session.getUsage({ model: input.model, usage: event.usage, metadata: event.providerMetadata })
                          .cost
                      : undefined
                  const payload = {
                    summary: {
                      ...record.summary,
                      ...(billed === undefined || (event.type !== "finish" && event.type !== "step-finish")
                        ? {}
                        : {
                            usage: { ...event.usage, cost: { amount: billed, currency: "USD", estimated: true } },
                          }),
                      querySource: input.querySource ?? (input.parentSessionID ? "subagent" : "main"),
                      attempt: context.attempt,
                      messageId: input.assistantMessageID,
                      userMessageId: input.user.id,
                      ...(terminalEvent
                        ? {
                            normalizedResponse: { textBytes, reasoningBytes, toolCallCount },
                            timing: {
                              ...(firstTokenMs === undefined ? {} : { timeToFirstTokenMs: firstTokenMs }),
                              streamMs: performance.now() - started,
                            },
                            genAi: {
                              system: input.model.providerID,
                              requestModel: input.model.id,
                              operationName: "chat",
                            },
                          }
                        : {}),
                    },
                    ...(terminalEvent && diagnosticConfig.llmContent
                      ? {
                          content: {
                            kind: "response",
                            text: textParts.join(""),
                            reasoning: reasoningParts.join(""),
                            toolCalls,
                            finishReason: event.type === "finish" ? event.reason : undefined,
                            complete: record.status === "succeeded",
                          },
                        }
                      : {}),
                    ...(terminalEvent && wire
                      ? {
                          raw: async () => {
                            const exchanges = await wire.exchanges()
                            return {
                              wiscodeRequest: {
                                system: input.system,
                                messages: input.messages,
                                tools: Object.keys(input.tools),
                              },
                              providerRequest: exchanges.at(-1)?.request,
                              providerResponse: exchanges.at(-1)?.response,
                              providerExchanges: exchanges,
                              providerMetadata: event.type === "finish" ? event.providerMetadata : undefined,
                              normalizedResponse: {
                                text: textParts.join(""),
                                reasoning: reasoningParts.join(""),
                                toolCalls,
                              },
                            }
                          },
                        }
                      : record.raw
                        ? { raw: record.raw }
                        : {}),
                  }
                  if (record.status === "succeeded" || record.status === "failed")
                    return diagnostics.complete(context, record.event, payload, {
                      status: record.status,
                      durationMs: performance.now() - started,
                    })
                  return diagnostics.emit(context, record.event, payload)
                }),
                Stream.catchCause((cause) =>
                  Stream.fromEffect(
                    (terminal ? Effect.void : failed(cause)).pipe(Effect.andThen(Effect.failCause(cause))),
                  ),
                ),
              )

            const finish = (source: Stream.Stream<LLMEvent, unknown>) =>
              observe(source).pipe(
                Stream.onExit((exit) => {
                  if (!context || terminal) return Effect.void
                  terminal = true
                  const outcome = diagnosticStreamExit(exit)
                  return diagnostics.complete(
                    context,
                    outcome.event,
                    {
                      summary: {
                        provider: input.model.providerID,
                        model: input.model.id,
                        attempt: context.attempt,
                        error: DiagnosticTrace.errorInfo(outcome.error, "provider"),
                      },
                      ...(diagnosticConfig.llmContent ? {
                        content: { kind: "response", text: textParts.join(""), reasoning: reasoningParts.join(""), toolCalls, complete: false },
                      } : {}),
                    },
                    { status: outcome.status, durationMs: performance.now() - started },
                  )
                }),
              )
            if (result.type === "native") return finish(result.stream)
            const state = LLMAISDK.adapterState()
            const ai = Stream.fromAsyncIterable(result.result.fullStream, (e) =>
              e instanceof Error ? e : new Error(String(e)),
            ).pipe(
              Stream.mapEffect((event) => LLMAISDK.toLLMEvents(state, event)),
              Stream.flatMap((events) => Stream.fromIterable(events)),
            )
            return finish(ai)
          }),
        ),
      )

    return Service.of({ stream })
  }),
)

export const hasToolCalls = LLMRequestPrep.hasToolCalls

export function diagnosticRequestContent(prepared: Pick<LLMRequestPrep.Prepared, "system" | "messages" | "tools">) {
  return {
    kind: "request",
    system: prepared.system,
    messages: prepared.messages,
    tools: Object.entries(prepared.tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: asSchema(tool.inputSchema).jsonSchema,
    })),
  }
}

export const node = LayerNode.make({
  service: Service,
  layer: live,
  deps: [
    DiagnosticTrace.node,
    Auth.node,
    Config.node,
    Provider.node,
    Plugin.node,
    Permission.node,
    EventV2Bridge.node,
    llmClient,
    RuntimeFlags.node,
  ],
})

export function diagnosticLLMEvent(event: LLMEvent, index: number) {
  if (event.type === "finish")
    return {
      event: "llm.request.completed",
      status: "succeeded" as const,
      summary: {
        reason: event.reason,
        usageRole: "request-total",
        usage: event.usage ? { ...event.usage } : undefined,
      },
      raw: () => ({ providerMetadata: event.providerMetadata }),
    }
  if (event.type === "provider-error")
    return {
      event: "llm.request.failed",
      status: "failed" as const,
      summary: {
        error: {
          ...DiagnosticTrace.errorInfo(
            { name: "ProviderError", message: event.message, retryable: event.retryable },
            "provider",
          ),
          classification: event.classification,
        },
      },
    }
  if (event.type === "text-delta" || event.type === "reasoning-delta" || event.type === "tool-input-delta")
    return {
      event: "llm.stream.chunk",
      summary: { index, kind: event.type.replace("-delta", ""), contentBytes: Buffer.byteLength(event.text, "utf8") },
      raw: () => ({ content: event.text }),
    }
  return undefined
}

export function diagnosticStreamExit(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit))
    return {
      event: "llm.request.failed" as const,
      status: "failed" as const,
      error: new Error("Provider stream ended without a finish event"),
    }
  if (Cause.hasInterruptsOnly(exit.cause))
    return {
      event: "llm.request.cancelled" as const,
      status: "cancelled" as const,
      error: Cause.squash(exit.cause),
    }
  return { event: "llm.request.failed" as const, status: "failed" as const, error: Cause.squash(exit.cause) }
}

export * as LLM from "./llm"
