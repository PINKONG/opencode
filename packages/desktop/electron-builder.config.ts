import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")
const isGitHubActions = process.env.GITHUB_ACTIONS === "true"

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (!isGitHubActions) return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

async function editWindowsResources(context: Parameters<NonNullable<Configuration["afterPack"]>>[0]) {
  if (process.platform !== "win32") return
  if (context.electronPlatformName !== "win32") return
  if (isGitHubActions) return

  await execFileAsync(
    path.join(rootDir, "node_modules", ".bun", "electron-winstaller@5.4.0", "node_modules", "electron-winstaller", "vendor", "rcedit.exe"),
    [
      path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`),
      "--set-version-string",
      "FileDescription",
      context.packager.appInfo.productName,
      "--set-version-string",
      "ProductName",
      context.packager.appInfo.productName,
      "--set-file-version",
      context.packager.appInfo.version,
      "--set-product-version",
      context.packager.appInfo.version,
      "--set-icon",
      path.join(rootDir, "packages", "desktop", "resources", "icons", "icon.ico"),
    ],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const getBase = (): Configuration => ({
  artifactName: "${productName}_${version}_${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  toolsets: {
    winCodeSign: "1.1.0",
  },
  afterPack: editWindowsResources,
  files: ["out/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
    {
      from: "resources/",
      to: ".",
      filter: ["wiscode-cli", "wiscode-cli.exe", "wiscode-node", "wiscode-node.exe", "rg", "rg.exe"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "WisCode",
    schemes: ["wiscode"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    ...(isGitHubActions
      ? { signtoolOptions: { sign: signWindows } }
      : { signAndEditExecutable: false, signExts: ["!.exe"] }),
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    warningsAsErrors: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
    include: "resources/nsis-installer.nsh",
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "ai.wiscode.desktop.dev",
        productName: "WisCode Dev",
        rpm: { packageName: "wiscode-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "ai.wiscode.desktop.beta",
        productName: "WisCode Beta",
        protocols: { name: "WisCode Beta", schemes: ["wiscode"] },
        publish: { provider: "github", owner: "PINKONG", repo: "opencode", channel: "beta" },
        rpm: { packageName: "wiscode-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.wiscode.desktop",
        productName: "WisCode",
        protocols: { name: "WisCode", schemes: ["wiscode"] },
        publish: { provider: "github", owner: "PINKONG", repo: "opencode", channel: "latest" },
        rpm: { packageName: "wiscode" },
      }
    }
  }
}

export default getConfig()
