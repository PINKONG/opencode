const trim = (input) => input.replace(/\/+$/, "")

const pick = (key, fallback) => trim(process.env[key] || fallback)

const stage = process.env.SST_STAGE || "dev"
const site = pick("WISCODE_SITE_URL", "https://opencode.ai")
const dev = pick("WISCODE_SITE_DEV_URL", `https://${stage}.opencode.ai`)

export default {
  url: stage === "production" ? site : dev,
  console: pick("WISCODE_AUTH_URL", `${stage === "production" ? site : dev}/auth`),
  install: pick("WISCODE_INSTALL_URL", `${site}/install`),
  email: "contact@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: pick("WISCODE_GITHUB_URL", "https://github.com/PINKONG/opencode"),
  discord: pick("WISCODE_DISCORD_URL", "https://opencode.ai/discord"),
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
