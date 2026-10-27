import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261027091750_session_external_context",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_external_context\` (
          \`session_id\` text PRIMARY KEY,
          \`source\` text NOT NULL,
          \`revision\` integer DEFAULT 0 NOT NULL,
          \`value\` text NOT NULL,
          \`last_instance_id\` text,
          \`last_context_version\` integer,
          \`last_request_id\` text,
          \`last_request_hash\` text,
          \`last_request_result\` text,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_external_context_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
