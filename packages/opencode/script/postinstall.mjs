#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import childProcess from "child_process"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const cli = "wiscode-cli"

function detectPlatformAndArch() {
  // Map platform names
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  // Map architecture names
  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}

function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `${cli}-${platform}-${arch}`
  const binaryName = platform === "windows" ? `${cli}.exe` : cli

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packageJsonPath)
    const binaryPath = path.join(packageDir, "bin", binaryName)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }

    return { binaryPath, binaryName }
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`, { cause: error })
  }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      // On Windows, the .exe is already included in the package and bin field points to it
      // No postinstall setup needed
      console.log("Windows detected: binary setup not needed (using packaged .exe)")
      return
    }

    // On non-Windows platforms, just verify the binary package exists
    // Don't replace the wrapper script - it handles binary execution
    const { binaryPath } = findBinary()
    const target = path.join(__dirname, "bin", ".wiscode-cli")
    const temp = path.join(__dirname, "bin", ".wiscode-cli.tmp")
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
    try {
      fs.linkSync(binaryPath, temp)
    } catch {
      fs.copyFileSync(binaryPath, temp)
    }
    fs.chmodSync(temp, 0o755)

    if (os.platform() === "darwin") {
      const verify = childProcess.spawnSync("codesign", ["--verify", "--verbose=2", temp], {
        encoding: "utf8",
      })
      if (verify.status !== 0) {
        const remove = childProcess.spawnSync("codesign", ["--remove-signature", temp], {
          encoding: "utf8",
        })
        if (remove.status !== 0) {
          throw new Error(`codesign remove failed: ${(remove.stderr || remove.stdout || "").trim()}`)
        }
        const sign = childProcess.spawnSync("codesign", ["--force", "--sign", "-", temp], {
          encoding: "utf8",
        })
        if (sign.status !== 0) {
          throw new Error(`codesign ad-hoc sign failed: ${(sign.stderr || sign.stdout || "").trim()}`)
        }
      }
    }

    fs.renameSync(temp, target)
  } catch (error) {
    console.error(`Failed to setup ${cli} binary:`, error.message)
    process.exit(1)
  }
}

try {
  void main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
