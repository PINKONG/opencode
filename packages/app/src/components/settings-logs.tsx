import { Component, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Switch } from "@opencode-ai/ui/switch"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { CheckboxV2 } from "@opencode-ai/ui/v2/checkbox-v2"
import { Switch as SwitchV2 } from "@opencode-ai/ui/v2/switch-v2"
import type { ConfigUpdate } from "@opencode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import {
  cleanupDiagnosticLogs,
  diagnosticCategoriesMatch,
  diagnosticCategoriesPatch,
  diagnosticLlmContentMatch,
  DIAGNOSTIC_CATEGORIES,
  openDiagnosticDirectory,
  selectedDiagnosticCategories,
  updateDiagnosticCategory,
} from "./diagnostic-settings"
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
  const [pending, setPending] = createStore({ categories: false, content: false })
  const saving = () => pending.categories || pending.content
  const update = (patch: NonNullable<ConfigUpdate["diagnostics"]>) =>
    serverSync().updateConfig({ diagnostics: { ...diagnostics(), ...patch } })
  const updateCategories = async (categories: readonly (typeof DIAGNOSTIC_CATEGORIES)[number][] | null) => {
    if (saving()) return
    const expected = categories === null ? null : [...categories]
    setPending("categories", true)
    try {
      const result = await update({ categories: diagnosticCategoriesPatch(expected) })
      if (!result.data?.diagnostics || !diagnosticCategoriesMatch(expected, result.data.diagnostics.categories)) {
        throw new Error(language.t("settings.logs.categories.unsupported"))
      }
    } catch (error) {
      window.alert(language.t("settings.logs.categories.failed", { error: String(error) }))
    } finally {
      setPending("categories", false)
    }
  }
  const updateContent = async (llmContent: boolean) => {
    if (saving()) return
    setPending("content", true)
    try {
      const result = await update({ llmContent })
      if (!diagnosticLlmContentMatch(llmContent, result.data?.diagnostics?.llmContent)) {
        throw new Error(language.t("settings.logs.content.unsupported"))
      }
    } catch (error) {
      window.alert(language.t("settings.logs.content.failed", { error: String(error) }))
    } finally {
      setPending("content", false)
    }
  }
  const toggleCategory = (category: (typeof DIAGNOSTIC_CATEGORIES)[number], checked: boolean) =>
    void updateCategories(updateDiagnosticCategory(diagnostics().categories, category, checked))
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
          const response = await serverSdk().client.global.diagnostics.clear()
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
  return { language, diagnostics, saving, update, updateRaw, updateContent, updateCategories, toggleCategory, open, cleanup }
}

function categoryLabel(language: ReturnType<typeof useLanguage>, category: (typeof DIAGNOSTIC_CATEGORIES)[number]) {
  return language.t(`settings.logs.categories.${category}`)
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
          <Switch disabled={logs.saving()} checked={logs.diagnostics().enabled ?? false} onChange={(enabled) => logs.update({ enabled })} />
        </SettingsRow>
        <Show when={logs.diagnostics().enabled}>
          <div class="flex flex-col gap-2 py-3 border-b border-border-weak-base last:border-none">
            <div class="flex flex-wrap items-center gap-4 sm:flex-nowrap">
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-14-medium text-text-strong">{logs.language.t("settings.logs.categories.title")}</span>
                <span class="text-12-regular text-text-weak">{logs.language.t("settings.logs.categories.description")}</span>
              </div>
              <div class="flex w-full justify-end gap-2 sm:w-auto sm:shrink-0">
                <Button size="small" variant="secondary" disabled={logs.saving()} onClick={() => void logs.updateCategories(null)}>
                  {logs.language.t("settings.logs.categories.all")}
                </Button>
                <Button size="small" variant="secondary" disabled={logs.saving()} onClick={() => void logs.updateCategories(["llm"])}>
                  {logs.language.t("settings.logs.categories.llmOnly")}
                </Button>
              </div>
            </div>
            <div class="flex flex-wrap gap-x-5 gap-y-2">
              {DIAGNOSTIC_CATEGORIES.map((category) => (
                <Checkbox
                  disabled={logs.saving()}
                  checked={selectedDiagnosticCategories(logs.diagnostics().categories).includes(category)}
                  onChange={(checked) => logs.toggleCategory(category, checked)}
                >
                  {categoryLabel(logs.language, category)}
                </Checkbox>
              ))}
            </div>
          </div>
          <SettingsRow
            title={logs.language.t("settings.logs.content.title")}
            description={logs.language.t("settings.logs.content.description")}
          >
            <Switch
              disabled={logs.saving()}
              checked={logs.diagnostics().llmContent ?? false}
              onChange={logs.updateContent}
            />
          </SettingsRow>
          <SettingsRow
            title={logs.language.t("settings.logs.raw.title")}
            description={logs.language.t("settings.logs.raw.description")}
          >
            <Switch disabled={logs.saving()} checked={logs.diagnostics().rawPayloads ?? false} onChange={logs.updateRaw} />
          </SettingsRow>
          <SettingsRow
            title={logs.language.t("settings.logs.streaming.title")}
            description={logs.language.t("settings.logs.streaming.description")}
          >
            <Switch
              disabled={logs.saving()}
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
          <SwitchV2 disabled={logs.saving()} checked={logs.diagnostics().enabled ?? false} onChange={(enabled) => logs.update({ enabled })} />
        </SettingsRowV2>
        <Show when={logs.diagnostics().enabled}>
          <div data-component="settings-v2-row" data-wrap="content">
            <div data-slot="settings-v2-row-copy">
              <div data-slot="settings-v2-row-title">{logs.language.t("settings.logs.categories.title")}</div>
              <div data-slot="settings-v2-row-description">{logs.language.t("settings.logs.categories.description")}</div>
            </div>
            <div data-slot="settings-v2-row-control">
              <div class="flex gap-2">
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  disabled={logs.saving()}
                  onClick={() => void logs.updateCategories(null)}
                >
                  {logs.language.t("settings.logs.categories.all")}
                </ButtonV2>
                <ButtonV2 size="normal" variant="neutral" disabled={logs.saving()} onClick={() => void logs.updateCategories(["llm"])}>
                  {logs.language.t("settings.logs.categories.llmOnly")}
                </ButtonV2>
              </div>
            </div>
            <div data-slot="settings-v2-row-content">
              {DIAGNOSTIC_CATEGORIES.map((category) => (
                <CheckboxV2
                  disabled={logs.saving()}
                  label={categoryLabel(logs.language, category)}
                  checked={selectedDiagnosticCategories(logs.diagnostics().categories).includes(category)}
                  onChange={(checked) => logs.toggleCategory(category, checked)}
                />
              ))}
            </div>
          </div>
          <SettingsRowV2
            title={logs.language.t("settings.logs.content.title")}
            description={logs.language.t("settings.logs.content.description")}
          >
            <SwitchV2
              disabled={logs.saving()}
              checked={logs.diagnostics().llmContent ?? false}
              onChange={logs.updateContent}
            />
          </SettingsRowV2>
          <SettingsRowV2
            title={logs.language.t("settings.logs.raw.title")}
            description={logs.language.t("settings.logs.raw.description")}
          >
            <SwitchV2 disabled={logs.saving()} checked={logs.diagnostics().rawPayloads ?? false} onChange={logs.updateRaw} />
          </SettingsRowV2>
          <SettingsRowV2
            title={logs.language.t("settings.logs.streaming.title")}
            description={logs.language.t("settings.logs.streaming.description")}
          >
            <SwitchV2
              disabled={logs.saving()}
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
