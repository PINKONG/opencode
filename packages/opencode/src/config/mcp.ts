import { Schema } from "effect"
import { PositiveInt, withStatics } from "@opencode-ai/core/schema"
import { z } from "zod"

const localZod = z.object({
  type: z.literal("local"),
  command: z.array(z.string()),
  environment: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
})

const oauthZod = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scope: z.string().optional(),
  redirectUri: z.string().optional(),
})

const maxkbHmacAuthZod = z.object({
  type: z.literal("maxkb-hmac"),
  appKey: z.string(),
  appSecret: z.string(),
})

const remoteZod = z
  .object({
    type: z.literal("remote"),
    url: z.string(),
    enabled: z.boolean().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    auth: maxkbHmacAuthZod.optional(),
    oauth: z.union([oauthZod, z.literal(false)]).optional(),
    timeout: z.number().int().positive().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.auth?.type !== "maxkb-hmac") return
    if (input.oauth === false) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "maxkb-hmac auth requires oauth to be explicitly set to false",
    })
  })

export const Local = Schema.Struct({
  type: Schema.Literal("local").annotate({ description: "Type of MCP server connection" }),
  command: Schema.mutable(Schema.Array(Schema.String)).annotate({
    description: "Command and arguments to run the MCP server",
  }),
  environment: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Environment variables to set when running the MCP server",
  }),
  enabled: Schema.optional(Schema.Boolean).annotate({
    description: "Enable or disable the MCP server on startup",
  }),
  timeout: Schema.optional(PositiveInt).annotate({
    description: "Timeout in ms for MCP server requests. Defaults to 5000 (5 seconds) if not specified.",
  }),
})
  .annotate({ identifier: "McpLocalConfig" })
  .pipe(withStatics(() => ({ zod: localZod })))
export type Local = Schema.Schema.Type<typeof Local>

export const OAuth = Schema.Struct({
  clientId: Schema.optional(Schema.String).annotate({
    description: "OAuth client ID. If not provided, dynamic client registration (RFC 7591) will be attempted.",
  }),
  clientSecret: Schema.optional(Schema.String).annotate({
    description: "OAuth client secret (if required by the authorization server)",
  }),
  scope: Schema.optional(Schema.String).annotate({ description: "OAuth scopes to request during authorization" }),
  redirectUri: Schema.optional(Schema.String).annotate({
    description: "OAuth redirect URI (default: http://127.0.0.1:19876/mcp/oauth/callback).",
  }),
})
  .annotate({ identifier: "McpOAuthConfig" })
  .pipe(withStatics(() => ({ zod: oauthZod })))
export type OAuth = Schema.Schema.Type<typeof OAuth>

export const MaxkbHmacAuth = Schema.Struct({
  type: Schema.Literal("maxkb-hmac"),
  appKey: Schema.String,
  appSecret: Schema.String,
})
  .annotate({ identifier: "McpMaxkbHmacAuthConfig" })
  .pipe(withStatics(() => ({ zod: maxkbHmacAuthZod })))
export type MaxkbHmacAuth = Schema.Schema.Type<typeof MaxkbHmacAuth>

const maxkbRequiresOauthDisabled = Schema.makeFilter<
  {
    type: "remote"
    url: string
    enabled?: boolean
    headers?: Record<string, string>
    auth?: MaxkbHmacAuth
    oauth?: OAuth | false
    timeout?: number
  }
>((input) => {
  if (input.auth?.type !== "maxkb-hmac") return undefined
  return input.oauth === false ? undefined : "maxkb-hmac auth requires oauth to be explicitly set to false"
})
export const Remote = Schema.Struct({
  type: Schema.Literal("remote").annotate({ description: "Type of MCP server connection" }),
  url: Schema.String.annotate({ description: "URL of the remote MCP server" }),
  enabled: Schema.optional(Schema.Boolean).annotate({
    description: "Enable or disable the MCP server on startup",
  }),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Headers to send with the request",
  }),
  auth: Schema.optional(MaxkbHmacAuth).annotate({
    description: "Authentication configuration for the MCP server.",
  }),
  oauth: Schema.optional(Schema.Union([OAuth, Schema.Literal(false)])).annotate({
    description: "OAuth authentication configuration for the MCP server. Set to false to disable OAuth auto-detection.",
  }),
  timeout: Schema.optional(PositiveInt).annotate({
    description: "Timeout in ms for MCP server requests. Defaults to 5000 (5 seconds) if not specified.",
  }),
})
  .check(maxkbRequiresOauthDisabled)
  .annotate({ identifier: "McpRemoteConfig" })
  .pipe(withStatics(() => ({ zod: remoteZod })))
export type Remote = Schema.Schema.Type<typeof Remote>

export const Info = Schema.Union([Local, Remote])
  .annotate({ discriminator: "type" })
  .pipe(withStatics(() => ({ zod: z.union([localZod, remoteZod]) })))
export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigMCP from "./mcp"
