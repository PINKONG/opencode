# WisCode Desktop

Native WisCode desktop app, built with Electron.

## Development

From this package:

```bash
bun install
bun dev
```

This starts the Electron Vite dev server and opens the native window.

## Build

Build the app's JS assets, then package the native app bundle:

```bash
bun run build && bun run package
```

The resulting app will be in `dist/`.
