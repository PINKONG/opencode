import { describe, expect, test } from "bun:test"
import { AccountTransportError } from "../../src/account/schema"
import { FormatError } from "../../src/cli/error"
import { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"

describe("cli.error", () => {
  test("formats account transport errors clearly", () => {
    const error = new AccountTransportError({
      method: "POST",
      url: "https://console.opencode.ai/auth/device/code",
    })

    const formatted = FormatError(error)

    expect(formatted).toContain("Could not reach POST https://console.opencode.ai/auth/device/code.")
    expect(formatted).toContain("This failed before the server returned an HTTP response.")
    expect(formatted).toContain("Check your network, proxy, or VPN configuration and try again.")
  })

  test("formats missing model guidance with wiscode config naming", () => {
    const error = new Provider.ModelNotFoundError({
      providerID: ProviderID.make("openai"),
      modelID: ModelID.make("missing-model"),
      suggestions: ["gpt-4.1"],
    })

    const formatted = FormatError(error)

    expect(formatted).toContain("Try: `wiscode models` to list available models")
    expect(formatted).toContain("Or check your config (wiscode.json) provider/model names")
    expect(formatted).not.toContain("opencode.json")
  })
})
