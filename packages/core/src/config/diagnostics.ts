export * as ConfigDiagnostics from "./diagnostics"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "../schema"

export const categories = ["task", "processing", "llm", "tool", "knowledge", "plugin", "context"] as const
export const Category = Schema.Literals(categories)
export type Category = typeof Category.Type
export const Categories = Schema.Array(Category).check(Schema.isMinLength(1))

export const Info = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  rawPayloads: Schema.optional(Schema.Boolean),
  streaming: Schema.optional(Schema.Boolean),
  retentionDays: Schema.optional(NonNegativeInt),
  maxTotalBytes: Schema.optional(PositiveInt),
  categories: Schema.optional(Categories),
})
export type Info = typeof Info.Type
