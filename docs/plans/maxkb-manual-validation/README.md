# MaxKB manual validation fixtures

These files are raw MCP responses and parsed payloads captured during the
MaxKB Phase 1.2 manual validation pass. They document the browser contract used
by the TUI and Web knowledge-base views:

- `resources/read maxkb://datasets`
- `resources/read maxkb://datasets/{dataset_id}/categories`
- `resources/read maxkb://datasets/{dataset_id}/documents/{document_id}`
- `tools/call list_dataset_documents`
- `tools/call get_document_paragraphs`

The fixtures intentionally preserve the MCP envelope in `*-response.json` files
and the parsed `contents[0].text` / `content[0].text` JSON in `*-payload.json`
files. Use them as regression inputs when MaxKB changes its resource or tool
response shape.
