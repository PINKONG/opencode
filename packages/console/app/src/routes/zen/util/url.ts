const trim = (input: string) => input.replace(/\/+$/, "")

const site = () => trim(process.env.WISCODE_SITE_URL || "https://opencode.ai")

export function workspaceUrl(id: string, page: "billing" | "members") {
  return `${site()}/workspace/${id}/${page}`
}
