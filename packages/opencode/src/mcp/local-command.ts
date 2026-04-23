import path from "node:path"

export type LocalCommandResolution = {
  command: string[]
  env: Record<string, string>
  resolution: "bundled" | "shebang" | "system" | "none"
}

type Input = {
  command: string[]
  env: Record<string, string>
  bundledNodePath?: string
  bundledNodeUsable: boolean
  bundledNodeDisabled?: boolean
  pathDelimiter: string
}

const isNodeCommand = (value: string) => {
  const lower = value.toLowerCase()
  return lower === "node" || lower === "node.exe"
}

const detectPathKey = (env: Record<string, string>) => {
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") return key
  }
  return "PATH"
}

const prefixPath = (env: Record<string, string>, dir: string, delimiter: string) => {
  const key = detectPathKey(env)
  const current = env[key]
  const next = current ? `${dir}${delimiter}${current}` : dir
  return { ...env, [key]: next }
}

const nodeDir = (value: string, delimiter: string) => {
  if (delimiter === ";") return path.win32.dirname(value)
  return path.posix.dirname(value)
}

export function resolveLocalCommand(input: Input): LocalCommandResolution {
  const [cmd, ...args] = input.command
  if (!cmd) return { command: input.command, env: { ...input.env }, resolution: "none" }

  if (input.bundledNodeDisabled) {
    return {
      command: [cmd, ...args],
      env: { ...input.env },
      resolution: isNodeCommand(cmd) ? "system" : "none",
    }
  }

  if (!input.bundledNodePath || !input.bundledNodeUsable) {
    return {
      command: [cmd, ...args],
      env: { ...input.env },
      resolution: isNodeCommand(cmd) ? "system" : "none",
    }
  }

  const dir = nodeDir(input.bundledNodePath, input.pathDelimiter)
  const env = prefixPath(input.env, dir, input.pathDelimiter)
  if (!isNodeCommand(cmd)) return { command: [cmd, ...args], env, resolution: "shebang" }
  return { command: [input.bundledNodePath, ...args], env, resolution: "bundled" }
}
