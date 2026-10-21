import { Component, Show, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Switch } from "@opencode-ai/ui/switch"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Switch as SwitchV2 } from "@opencode-ai/ui/v2/switch-v2"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { cleanupDiagnosticLogs, openDiagnosticDirectory } from "./diagnostic-settings"
import { SettingsList } from "./settings-list"
import { SettingsRow } from "./settings-row"
import { SettingsListV2 } from "./settings-v2/parts/list"
import { SettingsRowV2 } from "./settings-v2/parts/row"

function useLogs() {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const diagnostics = createMemo(() => serverSync().data.config.diagnostics ?? {})
  const update = (patch: Partial<NonNullable<ConfigV1.Info["diagnostics"]>>) =>
    serverSync().updateConfig({ diagnostics: { ...diagnostics(), ...patch } })
  const open = async () => {
    try {
      const result = await openDiagnosticDirectory({
        status: async () => {
          const response = await serverSdk().client.global.diagnostics.status()
          if (!response.data) throw new Error(String(response.error ?? language.t("settings.logs.status.unavailable")))
          return response.data
        },
        reveal: platform.revealPath ? (directory) => platform.revealPath!(directory) : undefined,
      })
      if (!result.opened) window.alert(language.t("settings.logs.folder.unavailable", { path: result.root }))
    } catch (error) {
      window.alert(language.t("settings.logs.folder.failed", { error: String(error) }))
    }
  }
  const cleanup = async () => {
    try {
      const result = await cleanupDiagnosticLogs({
        confirm: () => window.confirm(language.t("settings.logs.cleanup.confirm")),
        cleanup: async () => {
          const response = await serverSdk().client.global.diagnostics.cleanup()
          if (!response.data) throw new Error(String(response.error ?? language.t("settings.logs.cleanup.unavailable")))
          return response.data
        },
      })
      if (!result) return
      window.alert(
        language.t(result.skipped ? "settings.logs.cleanup.partial" : "settings.logs.cleanup.success", {
          deleted: result.deleted,
          skipped: result.skipped,
        }),
      )
    } catch (error) {
      window.alert(language.t("settings.logs.cleanup.failed", { error: String(error) }))
    }
  }
  const updateRaw = (rawPayloads: boolean) => {
    if (rawPayloads && !window.confirm(language.t("settings.logs.raw.confirm"))) return
    void update({ rawPayloads })
  }
  return { language, diagnostics, update, updateRaw, open, cleanup }
}

export const SettingsLogsSection: Component = () => {
  const logs = useLogs()
  return (
    <div class="flex flex-col gap-1">
      <h3 class="text-14-medium text-text-strong pb-2">{logs.language.t("settings.general.section.logs")}</h3>
      <SettingsList>
        <SettingsRow
          title={logs.language.t("settings.logs.enabled.title")}
          description={logs.language.t("settings.logs.enabled.description")}
        >
          <Switch checked={logs.diagnostics().enabled ?? false} onChange={(enabled) => logs.update({ enabled })} />
        </SettingsRow>
        <Show when={logs.diagnostics().enabled}>
          <SettingsRow
            title={logs.language.t("settings.logs.raw.title")}
            description={logs.language.t("settings.logs.raw.description")}
          >
            <Switch checked={logs.diagnostics().rawPayloads ?? false} onChange={logs.updateRaw} />
          </SettingsRow>
          <SettingsRow
            title={logs.language.t("settings.logs.streaming.title")}
            description={logs.language.t("settings.logs.streaming.description")}
          >
            <Switch
              checked={logs.diagnostics().streaming ?? false}
              onChange={(streaming) => logs.update({ streaming })}
            />
          </SettingsRow>
        </Show>
        <SettingsRow
          title={logs.language.t("settings.logs.folder.title")}
          description={logs.language.t("settings.logs.folder.description")}
        >
          <Button size="small" variant="secondary" onClick={() => void logs.open()}>
            {logs.language.t("settings.logs.folder.action")}
          </Button>
        </SettingsRow>
        <SettingsRow
          title={logs.language.t("settings.logs.cleanup.title")}
          description={logs.language.t("settings.logs.cleanup.description")}
        >
          <Button size="small" variant="secondary" onClick={() => void logs.cleanup()}>
            {logs.language.t("settings.logs.cleanup.action")}
          </Button>
        </SettingsRow>
      </SettingsList>
    </div>
  )
}

export const SettingsLogsSectionV2: Component = () => {
  const logs = useLogs()
  return (
    <div class="settings-v2-section settings-v2-logs-section">
      <h3 class="settings-v2-section-title">{logs.language.t("settings.general.section.logs")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={logs.language.t("settings.logs.enabled.title")}
          description={logs.language.t("settings.logs.enabled.description")}
        >
          <SwitchV2 checked={logs.diagnostics().enabled ?? false} onChange={(enabled) => logs.update({ enabled })} />
        </SettingsRowV2>
        <Show when={logs.diagnostics().enabled}>
          <SettingsRowV2
            title={logs.language.t("settings.logs.raw.title")}
            description={logs.language.t("settings.logs.raw.description")}
          >
            <SwitchV2 checked={logs.diagnostics().rawPayloads ?? false} onChange={logs.updateRaw} />
          </SettingsRowV2>
          <SettingsRowV2
            title={logs.language.t("settings.logs.streaming.title")}
            description={logs.language.t("settings.logs.streaming.description")}
          >
            <SwitchV2
              checked={logs.diagnostics().streaming ?? false}
              onChange={(streaming) => logs.update({ streaming })}
            />
          </SettingsRowV2>
        </Show>
        <SettingsRowV2
          title={logs.language.t("settings.logs.folder.title")}
          description={logs.language.t("settings.logs.folder.description")}
        >
          <ButtonV2 size="normal" variant="neutral" onClick={() => void logs.open()}>
            {logs.language.t("settings.logs.folder.action")}
          </ButtonV2>
        </SettingsRowV2>
        <SettingsRowV2
          title={logs.language.t("settings.logs.cleanup.title")}
          description={logs.language.t("settings.logs.cleanup.description")}
        >
          <ButtonV2 size="normal" variant="neutral" onClick={() => void logs.cleanup()}>
            {logs.language.t("settings.logs.cleanup.action")}
          </ButtonV2>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )
}
