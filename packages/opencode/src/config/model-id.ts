import { Schema } from "effect"
import z from "zod"
import { zod, ZodOverride } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

export const ConfigModelID = Schema.String.annotate({
  [ZodOverride]: z.string().meta({ $ref: "https://models.dev/model-schema.json#/$defs/Model" }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type ConfigModelID = Schema.Schema.Type<typeof ConfigModelID>
