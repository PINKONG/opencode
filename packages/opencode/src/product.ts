const trim = (input: string) => input.replace(/\/+$/, "")

const pick = (key: string, fallback: string) => trim(process.env[key] || fallback)

export namespace Product {
  export const api = () => pick("WISCODE_API_URL", "https://api.opencode.ai")

  export const app = () => pick("WISCODE_APP_URL", "https://app.opencode.ai")

  export const site = () => pick("WISCODE_SITE_URL", "https://opencode.ai")

  export const dev = () => pick("WISCODE_SITE_DEV_URL", "https://dev.opencode.ai")

  export const docs = () => pick("WISCODE_DOCS_URL", `${site()}/docs`)

  export const install = () => pick("WISCODE_INSTALL_URL", `${site()}/install`)

  export const auth = () => pick("WISCODE_AUTH_URL", `${site()}/auth`)

  export const github = () => pick("WISCODE_GITHUB_URL", "https://github.com/PINKONG/opencode")

  export const discord = () => pick("WISCODE_DISCORD_URL", "https://opencode.ai/discord")
}
