import {
  AudioLines,
  BookA,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Mic,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { previewError } from '@/app/recordingController'
import { FALLBACK_PROVIDER_ID, providers } from '@/app/services'
import { useRecording } from '@/app/stores/recordingStore'
import { clearSessions, useSessions } from '@/app/stores/sessionsStore'
import { updateSettings, useSettings } from '@/app/stores/settingsStore'
import { notify } from '@/app/stores/uiStore'
import {
  listMicrophones,
  onMicrophonesChanged,
  requestMicrophoneAccess,
  type MicrophoneInfo,
} from '@/audio/devices'
import type { AppErrorKind } from '@/core/errors'
import { toPersianDigits } from '@/core/format/digits'
import { isBusy } from '@/core/recording/machine'
import { GLOSSARY_MAX_LENGTH } from '@/core/settings'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'
import { ConfirmDialog } from './ConfirmDialog'
import { EngineRadios, LanguageRadios } from './EnginePicker'
import { PageHeader } from './PageHeader'
import { ToggleSwitch } from './ToggleSwitch'

const ERROR_KINDS = Object.keys(fa.errors) as AppErrorKind[]

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="surface-card p-4 sm:p-5">
      <h3
        id={headingId}
        className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink"
      >
        <Icon aria-hidden="true" className="size-[1.125rem] text-ink-3" />
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function SwitchRow({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const switchId = useId()
  return (
    <label
      htmlFor={switchId}
      className={cn(
        'flex min-h-12 items-center justify-between gap-4 py-2',
        disabled && 'opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-ink-3">{hint}</span>
      </span>
      <ToggleSwitch
        id={switchId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  )
}

function EngineSection() {
  const providerId = useSettings((settings) => settings.sttProviderId)
  const busy = useRecording((state) => isBusy(state.phase))
  const engineHeadingId = useId()
  const languageHeadingId = useId()
  const provider = providers.get(providerId) ?? providers.get(FALLBACK_PROVIDER_ID)
  const offline = provider?.getCapabilities().offline ?? true

  return (
    <Section icon={AudioLines} title={fa.settings.engineSection}>
      {busy && <p className="mb-2 text-xs text-rec">{fa.status.lockedWhileRecording}</p>}
      <h4 id={engineHeadingId} className="text-xs font-medium text-ink-3">
        {fa.status.engineTitle}
      </h4>
      <EngineRadios labelledBy={engineHeadingId} disabled={busy} className="mt-2 -mx-2.5" />
      <p className="mt-2 text-xs leading-5 text-ink-3">
        {offline ? fa.status.localPrivacy : fa.status.cloudPrivacy}
      </p>
      <h4 id={languageHeadingId} className="mt-5 text-xs font-medium text-ink-3">
        {fa.status.languageTitle}
      </h4>
      <LanguageRadios labelledBy={languageHeadingId} disabled={busy} className="mt-2 sm:max-w-80" />
    </Section>
  )
}

/** Radio value for "no specific microphone"; the stored setting for it is an empty id. */
const SYSTEM_MICROPHONE = 'system-default'

const MICROPHONE_ROW =
  'group flex min-h-12 w-full items-center gap-3 rounded-[0.625rem] px-2.5 py-2 text-start transition-colors duration-150 hover:bg-hover disabled:opacity-50 data-[state=checked]:bg-hover'

function MicrophoneRow({ value, title, hint }: { value: string; title: string; hint?: string }) {
  return (
    <RadioGroup.Item value={value} className={MICROPHONE_ROW}>
      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong group-data-[state=checked]:border-live">
        <RadioGroup.Indicator className="size-2 rounded-full bg-live" />
      </span>
      <span className="min-w-0 flex-1">
        <bdi className="block truncate text-sm text-ink">{title}</bdi>
        {hint && <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>}
      </span>
    </RadioGroup.Item>
  )
}

function MicrophoneSection() {
  const microphoneId = useSettings((settings) => settings.microphoneId)
  const busy = useRecording((state) => isBusy(state.phase))
  const [devices, setDevices] = useState<MicrophoneInfo[]>([])
  const [refreshes, setRefreshes] = useState(0)
  const [denied, setDenied] = useState(false)
  const headingId = useId()

  useEffect(() => {
    let current = true
    void listMicrophones().then((list) => {
      if (current) setDevices(list)
    })
    return () => {
      current = false
    }
  }, [refreshes])

  useEffect(() => onMicrophonesChanged(() => setRefreshes((count) => count + 1)), [])

  // Without the permission the system reports devices but hides what they are called.
  const named = devices.some((device) => device.label.length > 0)
  const chosen = devices.some((device) => device.deviceId === microphoneId)

  const showList = async () => {
    setDenied(!(await requestMicrophoneAccess()))
    setRefreshes((count) => count + 1)
  }

  return (
    <Section icon={Mic} title={fa.settings.microphoneSection}>
      {busy && <p className="mb-2 text-xs text-rec">{fa.status.lockedWhileRecording}</p>}
      <span id={headingId} className="sr-only">
        {fa.settings.microphoneSection}
      </span>
      <RadioGroup.Root
        dir="rtl"
        value={chosen ? microphoneId : SYSTEM_MICROPHONE}
        onValueChange={(value) =>
          updateSettings({ microphoneId: value === SYSTEM_MICROPHONE ? '' : value })
        }
        disabled={busy}
        aria-labelledby={headingId}
        className="-mx-2.5 grid gap-1"
      >
        <MicrophoneRow
          value={SYSTEM_MICROPHONE}
          title={fa.settings.microphoneDefault}
          hint={fa.settings.microphoneDefaultHint}
        />
        {named &&
          devices.map((device, index) => (
            <MicrophoneRow
              key={device.deviceId}
              value={device.deviceId}
              title={
                device.label ||
                fa.settings.microphoneUnnamed.replace('{number}', toPersianDigits(index + 1))
              }
            />
          ))}
      </RadioGroup.Root>
      {named ? (
        <p className="mt-2 text-xs leading-5 text-ink-3">{fa.settings.microphoneHint}</p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-5 text-ink-3">
            {denied ? fa.settings.microphoneAccessDenied : fa.settings.microphoneNeedsAccess}
          </p>
          <button
            type="button"
            onClick={() => void showList()}
            disabled={busy}
            className="btn btn-secondary mt-3"
          >
            {fa.settings.microphoneShowList}
          </button>
        </>
      )}
    </Section>
  )
}

function GlossarySection() {
  const glossary = useSettings((settings) => settings.glossary)
  const fieldId = useId()
  const hintId = useId()

  return (
    <Section icon={BookA} title={fa.settings.glossarySection}>
      <label htmlFor={fieldId} className="text-sm text-ink">
        {fa.settings.glossaryLabel}
      </label>
      <textarea
        id={fieldId}
        dir="auto"
        rows={3}
        value={glossary}
        maxLength={GLOSSARY_MAX_LENGTH}
        onChange={(event) => updateSettings({ glossary: event.target.value })}
        autoCapitalize="off"
        spellCheck={false}
        placeholder={fa.settings.glossaryPlaceholder}
        aria-describedby={hintId}
        className="mt-2 block w-full resize-y rounded-[0.625rem] border border-line-strong bg-backdrop/60 px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-ink-3"
      />
      <p id={hintId} className="mt-2 text-xs leading-5 text-ink-3">
        {fa.settings.glossaryHint}
      </p>
    </Section>
  )
}

function AiSection() {
  const aiEnabled = useSettings((settings) => settings.aiEnabled)
  const cleanEnabled = useSettings((settings) => settings.cleanEnabled)
  const summaryEnabled = useSettings((settings) => settings.summaryEnabled)

  return (
    <Section icon={Sparkles} title={fa.settings.aiSection}>
      <div className="divide-y divide-line">
        <SwitchRow
          title={fa.ai.master}
          hint={fa.settings.aiMasterHint}
          checked={aiEnabled}
          onChange={(checked) => updateSettings({ aiEnabled: checked })}
        />
        <SwitchRow
          title={fa.ai.clean}
          hint={fa.settings.aiCleanHint}
          checked={cleanEnabled}
          disabled={!aiEnabled}
          onChange={(checked) => updateSettings({ cleanEnabled: checked })}
        />
        <SwitchRow
          title={fa.ai.summary}
          hint={fa.settings.aiSummaryHint}
          checked={summaryEnabled}
          disabled={!aiEnabled}
          onChange={(checked) => updateSettings({ summaryEnabled: checked })}
        />
      </div>
    </Section>
  )
}

/**
 * Demo of the key field. The value lives only in this component while it is
 * being typed and is dropped on save: nothing is stored or sent anywhere.
 */
function KeySection() {
  const [value, setValue] = useState('')
  const [shown, setShown] = useState(false)
  const fieldId = useId()
  const hintId = useId()

  const save = (event: FormEvent) => {
    event.preventDefault()
    setValue('')
    setShown(false)
    notify('key-not-saved')
  }

  return (
    <Section icon={KeyRound} title={fa.settings.keySection}>
      <form onSubmit={save}>
        <label htmlFor={fieldId} className="text-sm text-ink">
          {fa.settings.keyLabel}
        </label>
        <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id={fieldId}
              dir="ltr"
              type={shown ? 'text' : 'password'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="sk-or-…"
              aria-describedby={hintId}
              className="h-11 w-full rounded-[0.625rem] border border-line-strong bg-backdrop/60 pr-11 pl-3 font-mono text-sm text-ink placeholder:text-ink-3"
            />
            <button
              type="button"
              onClick={() => setShown(!shown)}
              aria-label={shown ? fa.settings.keyHide : fa.settings.keyShow}
              aria-pressed={shown}
              className="icon-btn absolute top-0 right-0"
            >
              {shown ? (
                <EyeOff aria-hidden="true" className="size-[1.125rem]" />
              ) : (
                <Eye aria-hidden="true" className="size-[1.125rem]" />
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={value.trim().length === 0}
            className="btn btn-primary h-11"
          >
            {fa.settings.keySave}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-2">{fa.settings.keyNone}</p>
        <p id={hintId} className="mt-1 text-xs leading-5 text-ink-3">
          {fa.settings.keyHint}
        </p>
      </form>
    </Section>
  )
}

function DataSection() {
  const count = useSessions((state) => state.sessions.length)
  const [confirming, setConfirming] = useState(false)

  return (
    <Section icon={ShieldCheck} title={fa.settings.dataSection}>
      <p className="text-sm leading-6 text-ink-2">{fa.settings.dataNote}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-ink-3">
          {toPersianDigits(count)} {fa.history.sessionsUnit}
        </span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={count === 0}
          className="btn border border-rec/40 text-rec hover:bg-rec/10"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {fa.settings.clearHistory}
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={fa.history.confirmClearTitle}
        body={fa.history.confirmClearBody}
        confirmLabel={fa.history.confirmClear}
        onConfirm={() => {
          clearSessions()
          notify('history-cleared')
        }}
      />
    </Section>
  )
}

function DemoSection() {
  const busy = useRecording((state) => isBusy(state.phase))
  const headingId = useId()

  return (
    <Section icon={FlaskConical} title={fa.settings.demoSection}>
      <p className="text-xs leading-5 text-ink-3">{fa.settings.demoNote}</p>
      <h4 id={headingId} className="mt-4 text-sm text-ink">
        {fa.settings.errorPreview}
      </h4>
      <p className="mt-0.5 text-xs leading-5 text-ink-3">{fa.settings.errorPreviewHint}</p>
      <ul aria-labelledby={headingId} className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {ERROR_KINDS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => previewError(kind)}
              disabled={busy}
              className="flex min-h-11 w-full items-center rounded-[0.625rem] border border-line bg-backdrop/40 px-3 py-2 text-start text-[0.8125rem] leading-5 text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-50"
            >
              {fa.errors[kind].title}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => updateSettings({ onboarded: false })}
        disabled={busy}
        className="btn btn-secondary mt-4"
      >
        {fa.settings.showWelcome}
      </button>
    </Section>
  )
}

export function SettingsView() {
  return (
    <>
      <PageHeader title={fa.settings.title} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[46rem] gap-4 px-4 pt-2 pb-10 sm:px-8">
          <EngineSection />
          <MicrophoneSection />
          <GlossarySection />
          <AiSection />
          <KeySection />
          <DataSection />
          <DemoSection />
        </div>
      </div>
    </>
  )
}
