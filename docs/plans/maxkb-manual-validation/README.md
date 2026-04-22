# MaxKB manual validation fixtures

These files are raw MCP responses and parsed payloads captured during live
production validation of the MaxKB integration.

Phase 1.2 fixtures document the browse contract used by the TUI and Web
knowledge-base views:

- `resources/read maxkb://datasets`
- `resources/read maxkb://datasets/{dataset_id}/categories`
- `resources/read maxkb://datasets/{dataset_id}/documents/{document_id}`
- `tools/call list_dataset_documents`
- `tools/call get_document_paragraphs`

Phase 2 fixtures document the answer-time retrieval contract used by session
prompt integration:

- `tools/list`
- `tools/call search_dataset`
- `tools/call search_knowledge`
- one invalid `search_dataset` call to preserve `isError: true` semantics
- one unauthorized `search_dataset` call to preserve business auth failure
  semantics separately from validation errors

The fixtures intentionally preserve the MCP envelope in `*-response.json` files
and the parsed `contents[0].text` / `content[0].text` JSON in `*-payload.json`
files. Use them as regression inputs when MaxKB changes its resource or tool
response shape.
