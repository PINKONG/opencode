import { Component, Show, createMemo, createResource } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useUpdaterAction } from "../updater-action"
import { buildSidecarLanAccessUrl } from "@/util/sidecar-lan-access-url"
import {
  monoDefault,
  monoFontFamily,
  monoInput,
  sansDefault,
  sansFontFamily,
  sansInput,
  terminalDefault,
  terminalFontFamily,
  terminalInput,
  useSettings,
} from "@/context/settings"
import { playSoundById, SOUND_OPTIONS } from "@/utils/sound"
import { SettingsListV2 } from "./parts/list"
import { SettingsLogsSectionV2 } from "../settings-logs"
import { SettingsRowV2 } from "./parts/row"
import { LayoutRetirementNotice, LayoutTransitionToggle } from "./interface-transition"
import {
  createAppearanceSettingsController,
  createPermissionScopeController,
  createShellOptions,
  createShellSettingsController,
  createSoundSettingsController,
  soundOptions,
  type AppearanceSettingsController,
  type PermissionScopeController,
  type ShellSettingsController,
  type SoundSettingsController,
} from "./general-controllers"
import "./settings-v2.css"

const schemeOptions: ("system" | "light" | "dark")[] = ["system", "light", "dark"]
const fontSettings = {
  ui: {
    action: "settings-ui-font",
    title: "settings.general.row.uiFont.title",
    description: "settings.general.row.uiFont.description",
    font: "ui",
    input: "setUI",
  },
  code: {
    action: "settings-code-font",
    title: "settings.general.row.font.title",
    description: "settings.general.row.font.description",
    font: "code",
    input: "setCode",
  },
  terminal: {
    action: "settings-terminal-font",
    title: "settings.general.row.terminalFont.title",
    description: "settings.general.row.terminalFont.description",
    font: "terminal",
    input: "setTerminal",
  },
} as const
const soundSettings = {
  agent: {
    action: "settings-sounds-agent",
    title: "settings.general.sounds.agent.title",
    description: "settings.general.sounds.agent.description",
  },
  permissions: {
    action: "settings-sounds-permissions",
    title: "settings.general.sounds.permissions.title",
    description: "settings.general.sounds.permissions.description",
  },
  errors: {
    action: "settings-sounds-errors",
    title: "settings.general.sounds.errors.title",
    description: "settings.general.sounds.errors.description",
  },
} as const

const PermissionScopeSetting: Component<{ controller: PermissionScopeController }> = (props) => {
  const language = useLanguage()
  return (
    <SettingsRowV2
      title={language.t("command.permissions.autoaccept.enable")}
      description={language.t("toast.permissions.autoaccept.on.description")}
    >
      <div data-action="settings-auto-accept-permissions">
        <Switch
          checked={props.controller.accepting()}
          disabled={!props.controller.enabled()}
          onChange={props.controller.set}
        />
      </div>
    </SettingsRowV2>
  )
}

const ShellSetting: Component<{ controller: ShellSettingsController }> = (props) => {
  const language = useLanguage()
  const options = createMemo(() =>
    createShellOptions({
      shells: props.controller.shells(),
      current: props.controller.current(),
    }),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.shell.title")}
      description={language.t("settings.general.row.shell.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-shell"
        options={options()}
        current={options().find((option) => option.value === props.controller.current()) ?? options()[0]}
        placement="bottom-end"
        gutter={6}
        value={(option) => option.id}
        label={(option) => {
          if (option.id === "auto") return language.t("settings.general.row.shell.autoDefault")
          if (!option.terminalOnly) return option.name
          return `${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`
        }}
        onSelect={(option) => option && props.controller.select(option.value)}
      />
    </SettingsRowV2>
  )
}

const AppearanceSection: Component<{ controller: AppearanceSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.appearance")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.colorScheme.title")}
          description={language.t("settings.general.row.colorScheme.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-color-scheme"
            options={schemeOptions}
            current={schemeOptions.find((option) => option === props.controller.scheme.current())}
            placement="bottom-end"
            gutter={6}
            label={(option) => {
              if (option === "system") return language.t("theme.scheme.system")
              if (option === "light") return language.t("theme.scheme.light")
              return language.t("theme.scheme.dark")
            }}
            onSelect={(option) => option && props.controller.scheme.select(option)}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.theme.title")}
          description={language.t("settings.general.row.theme.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-theme"
            options={props.controller.theme.options()}
            current={props.controller.theme.current()}
            placement="bottom-end"
            gutter={6}
            value={(option) => option.id}
            label={(option) => option.name}
            onSelect={props.controller.theme.select}
          />
        </SettingsRowV2>

        <FontSetting kind="ui" fonts={props.controller.fonts} />
        <FontSetting kind="code" fonts={props.controller.fonts} />
        <FontSetting kind="terminal" fonts={props.controller.fonts} />
      </SettingsListV2>
    </div>
  )
}

const FontSetting: Component<{
  kind: "ui" | "code" | "terminal"
  fonts: AppearanceSettingsController["fonts"]
}> = (props) => {
  const language = useLanguage()
  const config = () => fontSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <div class="w-full sm:w-[220px]">
        <TextInputV2
          data-action={config().action}
          type="text"
          appearance="base"
          value={props.fonts[config().font]().value}
          onInput={(event) => props.fonts[config().input](event.currentTarget.value)}
          placeholder={props.fonts[config().font]().placeholder}
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          aria-label={language.t(config().title)}
          style={{ "font-family": props.fonts[config().font]().family }}
        />
      </div>
    </SettingsRowV2>
  )
}

const SoundsSection: Component<{ controller: SoundSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.sounds")}</h3>
      <SettingsListV2>
        <SoundSetting kind="agent" channel={props.controller.agent} />
        <SoundSetting kind="permissions" channel={props.controller.permissions} />
        <SoundSetting kind="errors" channel={props.controller.errors} />
      </SettingsListV2>
    </div>
  )
}

const SoundSetting: Component<{
  kind: "agent" | "permissions" | "errors"
  channel: SoundSettingsController["agent"]
}> = (props) => {
  const language = useLanguage()
  const config = () => soundSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <SelectV2
        appearance="inline"
        data-action={config().action}
        options={soundOptions}
        current={props.channel.current()}
        value={(option) => option.id}
        label={(option) => language.t(option.label)}
        onHighlight={props.channel.highlight}
        onSelect={props.channel.select}
        placement="bottom-end"
        gutter={6}
      />
    </SettingsRowV2>
  )
}

const LanguageSetting = () => {
  const language = useLanguage()
  const options = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.language.title")}
      description={language.t("settings.general.row.language.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-language"
        options={options()}
        placement="bottom-end"
        gutter={6}
        current={options().find((option) => option.value === language.locale())}
        value={(option) => option.value}
        label={(option) => option.label}
        onSelect={(option) => option && language.setLocale(option.value)}
      />
    </SettingsRowV2>
  )
}

export const SettingsGeneralV2: Component<{
  sessionID?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const serverSync = useServerSync()
  const dialog = useDialog()
  const settings = useSettings()
  const mobile = createMediaQuery("(max-width: 767px)")
  const updater = useUpdaterAction()
  const permissionScope = createPermissionScopeController(() => props.sessionID)
  const shell = createShellSettingsController()
  const appearance = createAppearanceSettingsController()
  const sounds = createSoundSettingsController()
  const desktop = createMemo(() => platform.platform === "desktop")

  const [pinchZoom, { mutate: setPinchZoom }] = createResource(
    () => desktop() && "getPinchZoomEnabled" in platform,
    () => Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    { initialValue: false },
  )

  const onPinchZoomChange = (checked: boolean) => {
    setPinchZoom(checked)
    const update = platform.setPinchZoomEnabled?.(checked)
    if (!update) return
    void update.catch(() => setPinchZoom(!checked))
  }

  const InterfaceSection = () => (
    <LayoutTransitionToggle
      title={language.t("settings.general.row.newInterface.title")}
      badge={language.t("settings.general.row.newInterface.badge")}
      description={language.t("settings.general.row.newInterface.description")}
      checked={settings.general.newLayoutDesigns()}
      onChange={(checked) => {
        settings.general.setNewLayoutDesigns(checked)
        if (checked) return
        void import("@/components/dialog-settings").then((module) => {
          void dialog.show(() => <module.DialogSettings />)
        })
      }}
    />
  )

  const InterfaceNoticeSection = () => (
    <LayoutRetirementNotice
      title={language.t("settings.general.row.newInterfaceNotice.title")}
      description={language.t("settings.general.row.newInterfaceNotice.description")}
      dismiss={language.t("settings.general.row.newInterfaceNotice.dismiss")}
      onDismiss={() => settings.general.dismissNewInterfaceNotice()}
    />
  )

  const GeneralSection = () => (
    <div class="settings-v2-section">
      <SettingsListV2>
        <LanguageSetting />

        <PermissionScopeSetting controller={permissionScope} />

        <ShellSetting controller={shell} />

        <SettingsRowV2
          title={language.t("settings.general.row.reasoningSummaries.title")}
          description={language.t("settings.general.row.reasoningSummaries.description")}
        >
          <div data-action="settings-feed-reasoning-summaries">
            <Switch
              checked={settings.general.showReasoningSummaries()}
              onChange={(checked) => settings.general.setShowReasoningSummaries(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.shellToolPartsExpanded.title")}
          description={language.t("settings.general.row.shellToolPartsExpanded.description")}
        >
          <div data-action="settings-feed-shell-tool-parts-expanded">
            <Switch
              checked={settings.general.shellToolPartsExpanded()}
              onChange={(checked) => settings.general.setShellToolPartsExpanded(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.editToolPartsExpanded.title")}
          description={language.t("settings.general.row.editToolPartsExpanded.description")}
        >
          <div data-action="settings-feed-edit-tool-parts-expanded">
            <Switch
              checked={settings.general.editToolPartsExpanded()}
              onChange={(checked) => settings.general.setEditToolPartsExpanded(checked)}
            />
          </div>
        </SettingsRowV2>

        <Show when={mobile() && import.meta.env.VITE_OPENCODE_CHANNEL !== "prod"}>
          <SettingsRowV2
            title={language.t("settings.general.row.mobileTitlebarBottom.title")}
            description={language.t("settings.general.row.mobileTitlebarBottom.description")}
          >
            <div data-action="settings-mobile-titlebar-bottom">
              <Switch
                checked={settings.general.mobileTitlebarPosition() === "bottom"}
                onChange={(checked) => settings.general.setMobileTitlebarPosition(checked ? "bottom" : "top")}
              />
            </div>
          </SettingsRowV2>
        </Show>
      </SettingsListV2>
    </div>
  )

  const AdvancedSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.advanced")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.showFileTree.title")}
          description={language.t("settings.general.row.showFileTree.description")}
        >
          <div data-action="settings-show-file-tree">
            <Switch
              checked={settings.general.showFileTree()}
              onChange={(checked) => settings.general.setShowFileTree(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showSearch.title")}
          description={language.t("settings.general.row.showSearch.description")}
        >
          <div data-action="settings-show-search">
            <Switch
              checked={settings.general.showSearch()}
              onChange={(checked) => settings.general.setShowSearch(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showStatus.title")}
          description={language.t("settings.general.row.showStatus.description")}
        >
          <div data-action="settings-show-status">
            <Switch
              checked={settings.general.showStatus()}
              onChange={(checked) => settings.general.setShowStatus(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showCustomAgents.title")}
          description={language.t("settings.general.row.showCustomAgents.description")}
        >
          <div data-action="settings-show-custom-agents">
            <Switch
              checked={settings.general.showCustomAgents()}
              onChange={(checked) => settings.general.setShowCustomAgents(checked)}
            />
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const NotificationsSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.notifications")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.notifications.agent.title")}
          description={language.t("settings.general.notifications.agent.description")}
        >
          <div data-action="settings-notifications-agent">
            <Switch
              checked={settings.notifications.agent()}
              onChange={(checked) => settings.notifications.setAgent(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.notifications.permissions.title")}
          description={language.t("settings.general.notifications.permissions.description")}
        >
          <div data-action="settings-notifications-permissions">
            <Switch
              checked={settings.notifications.permissions()}
              onChange={(checked) => settings.notifications.setPermissions(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.notifications.errors.title")}
          description={language.t("settings.general.notifications.errors.description")}
        >
          <div data-action="settings-notifications-errors">
            <Switch
              checked={settings.notifications.errors()}
              onChange={(checked) => settings.notifications.setErrors(checked)}
            />
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const UpdatesSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.updates")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.releaseNotes.title")}
          description={language.t("settings.general.row.releaseNotes.description")}
        >
          <div data-action="settings-release-notes">
            <Switch
              checked={settings.general.releaseNotes()}
              onChange={(checked) => settings.general.setReleaseNotes(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.updates.row.check.title")}
          description={language.t("settings.updates.row.check.description")}
        >
          <ButtonV2 size="normal" variant="neutral" disabled={!updater.action().run} onClick={() => updater.run()}>
            {language.t(updater.action().label)}
          </ButtonV2>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const SidecarLanSection = () => (
    <Show when={desktop() && platform.getSidecarLanConfig && platform.setSidecarLanConfig}>
      {(_) => {
        const [configResource, actions] = createResource(() => platform.getSidecarLanConfig?.())
        const [lanStatus, lanStatusActions] = createResource(() => platform.getSidecarLanStatus?.())
        const config = createMemo(() => configResource.latest)
        const enabled = createMemo(() => config()?.enabled ?? false)
        const addressMode = createMemo(() => config()?.addressMode ?? "lan")
        const customAddress = createMemo(() => config()?.customAddress ?? "")
        const fixedToken = createMemo(() => config()?.fixedToken ?? false)
        const fixedPort = createMemo(() => {
          const value = config()?.fixedPort
          if (typeof value !== "number" || !Number.isInteger(value)) return ""
          return String(value)
        })
        const sidecarLanAccessUrl = createMemo(() => {
          const status = lanStatus.latest
          if (status?.accessUrl) return status.accessUrl
          const url = status?.url
          if (!url) return
          const conn = server.list.find((conn) => conn.type === "sidecar" && conn.variant === "base")
          if (!conn) return url
          return buildSidecarLanAccessUrl(conn.http, url)
        })

        const updateLanConfig = async (next: {
          enabled?: boolean
          addressMode?: "lan" | "custom"
          customAddress?: string
          fixedToken?: boolean
          fixedPort?: number
        }) => {
          const current = config()
          const customAddress = (next.customAddress ?? current?.customAddress ?? "").trim()
          const fixedPort = next.fixedPort ?? current?.fixedPort
          const normalizedPort =
            typeof fixedPort === "number" && Number.isInteger(fixedPort) && fixedPort >= 1 && fixedPort <= 65535
              ? fixedPort
              : undefined
          await Promise.resolve(
            platform.setSidecarLanConfig?.({
              enabled: next.enabled ?? current?.enabled ?? false,
              addressMode: next.addressMode ?? current?.addressMode ?? "lan",
              customAddress,
              fixedToken: next.fixedToken ?? current?.fixedToken ?? false,
              fixedPort: normalizedPort,
            }),
          )
          await actions.refetch()
          await lanStatusActions.refetch()
        }

        const statusDescription = createMemo(() => {
          const status = lanStatus.latest
          if (!status || status.status === "disabled") return language.t("settings.desktop.sidecarLan.status.disabled")
          if (status.status === "available" && status.url) {
            return language.t("settings.desktop.sidecarLan.status.available", {
              url: sidecarLanAccessUrl() ?? status.url,
            })
          }
          if (status.status === "custom_unavailable") {
            return language.t("settings.desktop.sidecarLan.status.customUnavailable")
          }
          return language.t("settings.desktop.sidecarLan.status.unavailable")
        })

        const onChange = (checked: boolean) => {
          if (!checked) {
            void updateLanConfig({ enabled: false })
            return
          }

          const confirmed = window.confirm(
            [
              language.t("settings.desktop.sidecarLan.confirm.title"),
              "",
              language.t("settings.desktop.sidecarLan.confirm.risk1"),
              language.t("settings.desktop.sidecarLan.confirm.risk2"),
              language.t("settings.desktop.sidecarLan.confirm.risk3"),
            ].join("\n"),
          )

          if (!confirmed) {
            void actions.refetch()
            return
          }

          void updateLanConfig({ enabled: true })
        }

        const addressModeOptions: { value: "lan" | "custom"; label: string }[] = [
          { value: "lan", label: language.t("settings.desktop.sidecarLan.addressMode.option.lan") },
          { value: "custom", label: language.t("settings.desktop.sidecarLan.addressMode.option.custom") },
        ]

        return (
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.desktop.section.network")}</h3>

            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.desktop.sidecarLan.title")}
                description={language.t("settings.desktop.sidecarLan.description")}
              >
                <div data-action="settings-sidecar-lan">
                  <Switch checked={enabled()} disabled={configResource.state === "pending"} onChange={onChange} />
                </div>
              </SettingsRowV2>

              <Show when={enabled()}>
                <SettingsRowV2
                  title={language.t("settings.desktop.sidecarLan.status.title")}
                  description={statusDescription()}
                >
                  <div class="text-12-regular text-text-muted text-right break-all max-w-[260px]">
                    {sidecarLanAccessUrl() ?? language.t("settings.desktop.sidecarLan.status.notAdvertised")}
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.desktop.sidecarLan.addressMode.title")}
                  description={language.t("settings.desktop.sidecarLan.addressMode.description")}
                >
                  <SelectV2
                    appearance="inline"
                    data-action="settings-sidecar-lan-address-mode"
                    options={addressModeOptions}
                    current={addressModeOptions.find((option) => option.value === addressMode())}
                    placement="bottom-end"
                    gutter={6}
                    value={(option) => option.value}
                    label={(option) => option.label}
                    onSelect={(option) => {
                      if (!option) return
                      if (option.value === "custom" && !customAddress()) {
                        void updateLanConfig({
                          addressMode: "custom",
                          customAddress: "192.168.1.100",
                        })
                        return
                      }
                      void updateLanConfig({ addressMode: option.value })
                    }}
                  />
                </SettingsRowV2>

                <Show when={addressMode() === "custom"}>
                  <SettingsRowV2
                    title={language.t("settings.desktop.sidecarLan.customAddress.title")}
                    description={language.t("settings.desktop.sidecarLan.customAddress.description")}
                  >
                    <div class="w-full sm:w-[220px]">
                      <TextInputV2
                        data-action="settings-sidecar-lan-custom-address"
                        type="text"
                        appearance="base"
                        value={customAddress()}
                        onInput={(event) => void updateLanConfig({ customAddress: event.currentTarget.value })}
                        placeholder="192.168.1.100"
                        spellcheck={false}
                        autocorrect="off"
                        autocomplete="off"
                        autocapitalize="off"
                        aria-label={language.t("settings.desktop.sidecarLan.customAddress.title")}
                      />
                    </div>
                  </SettingsRowV2>
                </Show>

                <SettingsRowV2
                  title={language.t("settings.desktop.sidecarLan.fixedToken.title")}
                  description={language.t("settings.desktop.sidecarLan.fixedToken.description")}
                >
                  <div data-action="settings-sidecar-lan-fixed-token">
                    <Switch
                      checked={fixedToken()}
                      disabled={configResource.state === "pending"}
                      onChange={(checked) => void updateLanConfig({ fixedToken: checked })}
                    />
                  </div>
                </SettingsRowV2>

                <Show when={fixedToken()}>
                  <SettingsRowV2
                    title={language.t("settings.desktop.sidecarLan.fixedToken.risk.title")}
                    description={language.t("settings.desktop.sidecarLan.fixedToken.risk.description")}
                  >
                    <div />
                  </SettingsRowV2>
                </Show>

                <SettingsRowV2
                  title={language.t("settings.desktop.sidecarLan.fixedPort.title")}
                  description={language.t("settings.desktop.sidecarLan.fixedPort.description")}
                >
                  <div class="w-full sm:w-[220px]">
                    <TextInputV2
                      data-action="settings-sidecar-lan-fixed-port"
                      type="text"
                      appearance="base"
                      value={fixedPort()}
                      onInput={(event) => {
                        const trimmed = event.currentTarget.value.trim()
                        if (!trimmed) {
                          void updateLanConfig({ fixedPort: undefined })
                          return
                        }
                        const parsed = Number.parseInt(trimmed, 10)
                        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return
                        void updateLanConfig({ fixedPort: parsed })
                      }}
                      placeholder={language.t("settings.desktop.sidecarLan.fixedPort.placeholder")}
                      spellcheck={false}
                      autocorrect="off"
                      autocomplete="off"
                      autocapitalize="off"
                      aria-label={language.t("settings.desktop.sidecarLan.fixedPort.title")}
                    />
                  </div>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        )
      }}
    </Show>
  )

  // We can probably remove this, right?
  const DisplaySection = () => (
    <Show when={desktop()}>
      <div class="settings-v2-section">
        <h3 class="settings-v2-section-title">{language.t("settings.general.section.display")}</h3>

        <SettingsListV2>
          <SettingsRowV2
            title={language.t("settings.general.row.pinchZoom.title")}
            description={language.t("settings.general.row.pinchZoom.description")}
          >
            <div data-action="settings-pinch-zoom">
              <Switch checked={pinchZoom.latest} onChange={onPinchZoomChange} />
            </div>
          </SettingsRowV2>
        </SettingsListV2>
      </div>
    </Show>
  )

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.general")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <Show when={settings.general.layoutTransitionAvailable()}>
          <InterfaceSection />
        </Show>

        <Show when={settings.general.newInterfaceNoticeVisible()}>
          <InterfaceNoticeSection />
        </Show>

        <GeneralSection />

        <AppearanceSection controller={appearance} />

        <NotificationsSection />

        <SoundsSection controller={sounds} />

        <Show when={desktop()}>
          <UpdatesSection />
        </Show>

        <SidecarLanSection />

        <Show when={desktop()}>
          <SettingsLogsSectionV2 />
        </Show>

        <DisplaySection />

        <AdvancedSection />
      </div>
    </>
  )
}
