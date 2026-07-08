import { Component, Show, createMemo, createResource, onMount } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useTheme, type ColorScheme } from "@opencode-ai/ui/theme/context"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useServerSDK } from "@/context/server-sdk"
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
import { Link } from "../link"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

let demoSoundState = {
  cleanup: undefined as (() => void) | undefined,
  timeout: undefined as NodeJS.Timeout | undefined,
  run: 0,
}

type ThemeOption = {
  id: string
  name: string
}

type ShellOption = {
  path: string
  name: string
  acceptable: boolean
}

type ShellSelectOption = {
  id: string
  value: string
  label: string
}

// To prevent audio from overlapping/playing very quickly when navigating the settings menus,
// delay the playback by 100ms during quick selection changes and pause existing sounds.
const stopDemoSound = () => {
  demoSoundState.run += 1
  if (demoSoundState.cleanup) {
    demoSoundState.cleanup()
  }
  clearTimeout(demoSoundState.timeout)
  demoSoundState.cleanup = undefined
}

const playDemoSound = (id: string | undefined) => {
  stopDemoSound()
  if (!id) return

  const run = ++demoSoundState.run
  demoSoundState.timeout = setTimeout(() => {
    void playSoundById(id).then((cleanup) => {
      if (demoSoundState.run !== run) {
        cleanup?.()
        return
      }
      demoSoundState.cleanup = cleanup
    })
  }, 100)
}

export const SettingsGeneralV2: Component<{
  sessionID?: string
}> = (props) => {
  const theme = useTheme()
  const language = useLanguage()
  const permission = usePermission()
  const platform = usePlatform()
  const server = useServer()
  const dialog = useDialog()
  const settings = useSettings()
  const serverSync = useServerSync()
  const serverSdk = useServerSDK()
  const mobile = createMediaQuery("(max-width: 767px)")

  const updater = useUpdaterAction()

  const dir = createMemo(() => {
    if (!props.sessionID) return undefined
    return serverSync().session.lineage.peek(props.sessionID)?.session.directory
  })
  const accepting = createMemo(() => {
    const value = dir()
    if (!value || !props.sessionID) return false
    return permission.isAutoAccepting(props.sessionID, value)
  })

  const toggleAccept = (checked: boolean) => {
    const value = dir()
    if (!value || !props.sessionID) return

    if (checked) {
      permission.enableAutoAccept(props.sessionID, value)
      return
    }

    permission.disableAutoAccept(props.sessionID, value)
  }
  const desktop = createMemo(() => platform.platform === "desktop")

  const themeOptions = createMemo<ThemeOption[]>(() => theme.ids().map((id) => ({ id, name: theme.name(id) })))

  const [shells] = createResource(
    () =>
      serverSdk()
        .client.pty.shells()
        .then((res) => res.data ?? [])
        .catch(() => [] as ShellOption[]),
    { initialValue: [] as ShellOption[] },
  )

  const [pinchZoom, { mutate: setPinchZoom }] = createResource(
    () => (desktop() && platform.getPinchZoomEnabled ? true : false),
    () => Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    { initialValue: false },
  )

  onMount(() => {
    void theme.loadThemes()
  })

  const autoOption = { id: "auto", value: "", label: language.t("settings.general.row.shell.autoDefault") }
  const currentShell = createMemo(() => serverSync().data.config.shell ?? "")

  const shellOptions = createMemo<ShellSelectOption[]>(() => {
    const list = shells.latest
    const current = serverSync().data.config.shell

    const nameCounts = new Map<string, number>()
    for (const s of list) {
      nameCounts.set(s.name, (nameCounts.get(s.name) || 0) + 1)
    }

    const options = [
      autoOption,
      ...list.map((s) => {
        const ambiguousName = (nameCounts.get(s.name) || 0) > 1
        const text = ambiguousName ? s.path : s.name
        const label = s.acceptable ? text : `${text} (${language.t("settings.general.row.shell.terminalOnly")})`
        return {
          id: s.path,
          // Prefer name over path - "bash" is much cleaner than the explicit full route even when it may change due to PATH.
          value: ambiguousName ? s.path : s.name,
          label,
        }
      }),
    ]

    if (current && !options.some((o) => o.value === current)) {
      options.push({ id: current, value: current, label: current })
    }

    return options
  })

  const onPinchZoomChange = (checked: boolean) => {
    setPinchZoom(checked)
    const update = platform.setPinchZoomEnabled?.(checked)
    if (!update) return
    void update.catch(() => setPinchZoom(!checked))
  }

  const colorSchemeOptions = createMemo((): { value: ColorScheme; label: string }[] => [
    { value: "system", label: language.t("theme.scheme.system") },
    { value: "light", label: language.t("theme.scheme.light") },
    { value: "dark", label: language.t("theme.scheme.dark") },
  ])

  const languageOptions = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )

  const noneSound = { id: "none", label: "sound.option.none" } as const
  const soundOptions = [noneSound, ...SOUND_OPTIONS]
  const mono = () => monoInput(settings.appearance.font())
  const sans = () => sansInput(settings.appearance.uiFont())
  const terminal = () => terminalInput(settings.appearance.terminalFont())

  const soundSelectProps = (
    enabled: () => boolean,
    current: () => string,
    setEnabled: (value: boolean) => void,
    set: (id: string) => void,
  ) => ({
    options: soundOptions,
    current: enabled() ? (soundOptions.find((o) => o.id === current()) ?? noneSound) : noneSound,
    value: (o: (typeof soundOptions)[number]) => o.id,
    label: (o: (typeof soundOptions)[number]) => language.t(o.label),
    onHighlight: (option: (typeof soundOptions)[number] | undefined) => {
      if (!option) return
      playDemoSound(option.id === "none" ? undefined : option.id)
    },
    onSelect: (option: (typeof soundOptions)[number] | null) => {
      if (!option) return
      if (option.id === "none") {
        setEnabled(false)
        stopDemoSound()
        return
      }
      setEnabled(true)
      set(option.id)
      playDemoSound(option.id)
    },
  })

  const GeneralSection = () => (
    <div class="settings-v2-section">
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.language.title")}
          description={language.t("settings.general.row.language.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-language"
            options={languageOptions()}
            placement="bottom-end"
            gutter={6}
            current={languageOptions().find((o) => o.value === language.locale())}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(option) => option && language.setLocale(option.value)}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("command.permissions.autoaccept.enable")}
          description={language.t("toast.permissions.autoaccept.on.description")}
        >
          <div data-action="settings-auto-accept-permissions">
            <Switch checked={accepting()} disabled={!dir()} onChange={toggleAccept} />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.shell.title")}
          description={language.t("settings.general.row.shell.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-shell"
            options={shellOptions()}
            current={shellOptions().find((o) => o.value === currentShell()) ?? autoOption}
            placement="bottom-end"
            gutter={6}
            value={(o) => o.id}
            label={(o) => o.label}
            onSelect={(option) => {
              if (!option) return
              if (option.value === currentShell()) return
              serverSync().updateConfig({ shell: option.value })
            }}
          />
        </SettingsRowV2>

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

        <SettingsRowV2
          title={language.t("settings.general.row.newLayoutDesigns.title")}
          description={language.t("settings.general.row.newLayoutDesigns.description")}
        >
          <div data-action="settings-new-layout-designs">
            <Switch
              checked={settings.general.newLayoutDesigns()}
              onChange={(checked) => {
                settings.general.setNewLayoutDesigns(checked)
                if (checked) return
                void import("@/components/dialog-settings").then((module) => {
                  dialog.show(() => <module.DialogSettings />)
                })
              }}
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

  const AppearanceSection = () => (
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
            options={colorSchemeOptions()}
            current={colorSchemeOptions().find((o) => o.value === theme.colorScheme())}
            placement="bottom-end"
            gutter={6}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(option) => option && theme.setColorScheme(option.value)}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.theme.title")}
          description={
            <>
              {language.t("settings.general.row.theme.description")}{" "}
              <Link class="settings-v2-link" href="https://github.com/PINKONG/opencode">
                {language.t("common.learnMore")}
              </Link>
            </>
          }
        >
          <SelectV2
            appearance="inline"
            data-action="settings-theme"
            options={themeOptions()}
            current={themeOptions().find((o) => o.id === theme.themeId())}
            placement="bottom-end"
            gutter={6}
            value={(o) => o.id}
            label={(o) => o.name}
            onSelect={(option) => {
              if (!option) return
              theme.setTheme(option.id)
            }}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.uiFont.title")}
          description={language.t("settings.general.row.uiFont.description")}
        >
          <div class="w-full sm:w-[220px]">
            <TextInputV2
              data-action="settings-ui-font"
              type="text"
              appearance="base"
              value={sans()}
              onInput={(event) => settings.appearance.setUIFont(event.currentTarget.value)}
              placeholder={sansDefault}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.general.row.uiFont.title")}
              style={{ "font-family": sansFontFamily(settings.appearance.uiFont()) }}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.font.title")}
          description={language.t("settings.general.row.font.description")}
        >
          <div class="w-full sm:w-[220px]">
            <TextInputV2
              data-action="settings-code-font"
              type="text"
              appearance="base"
              value={mono()}
              onInput={(event) => settings.appearance.setFont(event.currentTarget.value)}
              placeholder={monoDefault}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.general.row.font.title")}
              style={{ "font-family": monoFontFamily(settings.appearance.font()) }}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.terminalFont.title")}
          description={language.t("settings.general.row.terminalFont.description")}
        >
          <div class="w-full sm:w-[220px]">
            <TextInputV2
              data-action="settings-terminal-font"
              type="text"
              appearance="base"
              value={terminal()}
              onInput={(event) => settings.appearance.setTerminalFont(event.currentTarget.value)}
              placeholder={terminalDefault}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              aria-label={language.t("settings.general.row.terminalFont.title")}
              style={{ "font-family": terminalFontFamily(settings.appearance.terminalFont()) }}
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

  const SoundsSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.sounds")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.sounds.agent.title")}
          description={language.t("settings.general.sounds.agent.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-sounds-agent"
            {...soundSelectProps(
              () => settings.sounds.agentEnabled(),
              () => settings.sounds.agent(),
              (value) => settings.sounds.setAgentEnabled(value),
              (id) => settings.sounds.setAgent(id),
            )}
            placement="bottom-end"
            gutter={6}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.sounds.permissions.title")}
          description={language.t("settings.general.sounds.permissions.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-sounds-permissions"
            {...soundSelectProps(
              () => settings.sounds.permissionsEnabled(),
              () => settings.sounds.permissions(),
              (value) => settings.sounds.setPermissionsEnabled(value),
              (id) => settings.sounds.setPermissions(id),
            )}
            placement="bottom-end"
            gutter={6}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.sounds.errors.title")}
          description={language.t("settings.general.sounds.errors.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-sounds-errors"
            {...soundSelectProps(
              () => settings.sounds.errorsEnabled(),
              () => settings.sounds.errors(),
              (value) => settings.sounds.setErrorsEnabled(value),
              (id) => settings.sounds.setErrors(id),
            )}
            placement="bottom-end"
            gutter={6}
          />
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
          <ButtonV2 size="normal" variant="neutral" disabled={!updater.action().run} onClick={updater.run}>
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
            return language.t("settings.desktop.sidecarLan.status.available", { url: sidecarLanAccessUrl() ?? status.url })
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
        <GeneralSection />

        <AppearanceSection />

        <NotificationsSection />

        <SoundsSection />

        <Show when={desktop()}>
          <UpdatesSection />
        </Show>

        <SidecarLanSection />

        <DisplaySection />

        <AdvancedSection />
      </div>
    </>
  )
}
