import {
  AudioLines,
  BookA,
  Eye,
  EyeOff,
  FlaskConical,
  HardDriveDownload,
  KeyRound,
  Mic,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { previewError, resolveModel } from '@/app/recordingController'
import { cloud, FALLBACK_PROVIDER_ID, IS_DESKTOP, localModels, providers } from '@/app/services'
import { removeKey, saveKey, testKey, useKeys } from '@/app/stores/keysStore'
import { useRecording } from '@/app/stores/recordingStore'
import { useModels } from '@/app/stores/modelsStore'
import { clearSessions, useSessions } from '@/app/stores/sessionsStore'
import { settingsStore, updateSettings, useSettings } from '@/app/stores/settingsStore'
import { notify } from '@/app/stores/uiStore'
import {
  listMicrophones,
  onMicrophonesChanged,
  requestMicrophoneAccess,
  type MicrophoneInfo,
} from '@/audio/devices'
import { DEFAULT_AI_MODELS } from '@/core/ai/chat'
import { CLOUD_PROVIDERS, isCloudProvider, type CloudProviderId } from '@/core/cloud/transport'
import type { AppErrorKind } from '@/core/errors'
import { toPersianDigits } from '@/core/format/digits'
import { engineOutlook } from '@/core/models/localModels'
import { isBusy } from '@/core/recording/machine'
import { AI_MODEL_MAX_LENGTH, GLOSSARY_MAX_LENGTH } from '@/core/settings'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'
import { ConfirmDialog } from './ConfirmDialog'
import { EngineRadios, LanguageRadios } from './EnginePicker'
import { ModelsList } from './ModelsSection'
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
  const modelHeadingId = useId()
  const provider = providers.get(providerId) ?? providers.get(FALLBACK_PROVIDER_ID)
  const offline = provider?.getCapabilities().offline ?? true
  // Subscribed to, so the choice below follows the setting; the value itself is resolved.
  useSettings((settings) => settings.sttModel)
  const model = provider ? resolveModel(provider, settingsStore.getState()) : ''
  const language = useSettings((settings) => settings.language)
  const system = useModels((state) => state.system)
  const outlook = offline && system ? engineOutlook(system) : 'gpu'
  const slowOutlook = outlook === 'gpu' ? null : outlook
  const keyMissing = useKeys((keys) =>
    provider && isCloudProvider(provider.id) ? !keys[provider.id] : false,
  )

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
      {keyMissing && <p className="mt-2 text-xs leading-5 text-rec">{fa.settings.sttKeyMissing}</p>}
      {slowOutlook && (
        <p className="mt-2 text-xs leading-5 text-rec">{fa.engineOutlooks[slowOutlook]}</p>
      )}
      {provider && !offline && provider.models.length > 1 && (
        <>
          <h4 id={modelHeadingId} className="mt-5 text-xs font-medium text-ink-3">
            {fa.settings.sttModelTitle}
          </h4>
          <RadioGroup.Root
            dir="rtl"
            value={model}
            onValueChange={(value) => updateSettings({ sttModel: value })}
            disabled={busy}
            aria-labelledby={modelHeadingId}
            className="-mx-2.5 mt-2 grid gap-1"
          >
            {provider.models.map((entry) => (
              <RadioGroup.Item key={entry.id} value={entry.id} className={RADIO_ROW}>
                <span className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong group-data-[state=checked]:border-live">
                  <RadioGroup.Indicator className="size-2 animate-pop-in rounded-full bg-live" />
                </span>
                <bdi className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{entry.id}</bdi>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <p className="mt-2 text-xs leading-5 text-ink-3">{fa.settings.sttModelHint}</p>
        </>
      )}
      <h4 id={languageHeadingId} className="mt-5 text-xs font-medium text-ink-3">
        {fa.status.languageTitle}
      </h4>
      <LanguageRadios labelledBy={languageHeadingId} disabled={busy} className="mt-2 sm:max-w-80" />
      {offline && language === 'auto' && (
        <p className="mt-2 text-xs leading-5 text-ink-3">{fa.settings.languageAutoHint}</p>
      )}
    </Section>
  )
}

/** Radio value for "no specific microphone"; the stored setting for it is an empty id. */
const SYSTEM_MICROPHONE = 'system-default'

function MicrophoneRow({ value, title, hint }: { value: string; title: string; hint?: string }) {
  return (
    <RadioGroup.Item value={value} className={RADIO_ROW}>
      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong group-data-[state=checked]:border-live">
        <RadioGroup.Indicator className="size-2 animate-pop-in rounded-full bg-live" />
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

const RADIO_ROW =
  'group flex min-h-12 w-full items-center gap-3 rounded-[0.625rem] px-2.5 py-2 text-start transition-colors duration-150 hover:bg-hover disabled:opacity-50 data-[state=checked]:bg-hover'

const TEXT_FIELD =
  'h-11 w-full rounded-[0.625rem] border border-line-strong bg-backdrop/60 px-3 font-mono text-sm text-ink placeholder:text-ink-3'

/** Which service does the AI step, and with which of its models. */
function AiServiceFields() {
  const aiProviderId = useSettings((settings) => settings.aiProviderId)
  const aiModel = useSettings((settings) => settings.aiModel)
  const hasKey = useKeys((keys) => keys[aiProviderId])
  const headingId = useId()
  const modelId = useId()
  const modelHintId = useId()

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h4 id={headingId} className="text-xs font-medium text-ink-3">
        {fa.settings.aiProviderTitle}
      </h4>
      <RadioGroup.Root
        dir="rtl"
        value={aiProviderId}
        // Each service has its own model names, so the choice of model starts over.
        onValueChange={(value) =>
          updateSettings({ aiProviderId: value as CloudProviderId, aiModel: '' })
        }
        aria-labelledby={headingId}
        className="-mx-2.5 mt-2 grid gap-1"
      >
        {CLOUD_PROVIDERS.map((provider) => (
          <RadioGroup.Item key={provider} value={provider} className={RADIO_ROW}>
            <span className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong group-data-[state=checked]:border-live">
              <RadioGroup.Indicator className="size-2 animate-pop-in rounded-full bg-live" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink">{fa.cloudProviders[provider].name}</span>
              <span className="mt-0.5 block text-xs leading-5 text-ink-3">
                {fa.cloudProviders[provider].hint}
              </span>
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {!hasKey && <p className="mt-2 text-xs leading-5 text-rec">{fa.settings.aiKeyMissing}</p>}

      <label htmlFor={modelId} className="mt-4 block text-sm text-ink">
        {fa.settings.aiModelLabel}
      </label>
      <input
        id={modelId}
        dir="ltr"
        type="text"
        value={aiModel}
        maxLength={AI_MODEL_MAX_LENGTH}
        onChange={(event) => updateSettings({ aiModel: event.target.value.trim() })}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={DEFAULT_AI_MODELS[aiProviderId]}
        aria-describedby={modelHintId}
        className={cn(TEXT_FIELD, 'mt-2 sm:max-w-96')}
      />
      <p id={modelHintId} className="mt-2 text-xs leading-5 text-ink-3">
        {fa.settings.aiModelHint}
      </p>
      <p className="mt-2 text-xs leading-5 text-ink-3">{fa.settings.aiPrivacy}</p>
    </div>
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
      {cloud && <AiServiceFields />}
    </Section>
  )
}

const KEY_PLACEHOLDERS: Record<CloudProviderId, string> = {
  openrouter: 'sk-or-…',
  google: 'AIza…',
}

/** What the service said about the stored key, once it has been asked. */
type KeyCheck = 'unknown' | 'checking' | 'valid' | AppErrorKind

function keyStatusText(stored: boolean, check: KeyCheck): string {
  if (!stored) return fa.settings.keyNone
  if (check === 'unknown') return fa.settings.keyStored
  if (check === 'checking') return fa.settings.keyChecking
  if (check === 'valid') return fa.settings.keyValid
  return fa.settings.keyCheckFailed.replace('{reason}', fa.errors[check].title)
}

/**
 * The key of one cloud service. What is typed lives only in this component
 * until it is saved; after that the field is emptied and the key cannot be
 * shown again, only replaced, checked or removed. The browser demo has
 * nowhere safe to keep a key, so there the value is simply dropped.
 */
function KeyField({ provider }: { provider: CloudProviderId }) {
  const stored = useKeys((keys) => keys[provider])
  const [value, setValue] = useState('')
  const [shown, setShown] = useState(false)
  const [check, setCheck] = useState<KeyCheck>('unknown')
  const fieldId = useId()
  const statusId = useId()
  const label = fa.cloudProviders[provider].keyLabel
  const named = (action: string) =>
    fa.settings.keyActionFor.replace('{action}', action).replace('{key}', label)

  const runCheck = async () => {
    setCheck('checking')
    const error = await testKey(provider)
    setCheck(error ? error.kind : 'valid')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const key = value
    setValue('')
    setShown(false)
    if (!cloud) {
      notify('key-not-saved')
      return
    }
    try {
      await saveKey(provider, key)
    } catch {
      notify('key-save-failed')
      return
    }
    notify('key-saved')
    await runCheck()
  }

  const remove = async () => {
    await removeKey(provider).catch(() => {})
    setCheck('unknown')
    notify('key-deleted')
  }

  const failed = stored && check !== 'unknown' && check !== 'checking' && check !== 'valid'

  return (
    <form onSubmit={(event) => void save(event)}>
      <label htmlFor={fieldId} className="text-sm text-ink">
        {label}
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
            placeholder={stored ? fa.settings.keyReplace : KEY_PLACEHOLDERS[provider]}
            aria-describedby={statusId}
            className={cn(TEXT_FIELD, 'pr-11 placeholder:font-sans')}
          />
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-label={named(shown ? fa.settings.keyHide : fa.settings.keyShow)}
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
          aria-label={named(fa.settings.keySave)}
          className="btn btn-primary h-11"
        >
          {fa.settings.keySave}
        </button>
      </div>
      <div className="mt-2 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <output
          id={statusId}
          className={cn(
            'text-xs leading-5',
            failed ? 'text-rec' : check === 'valid' && stored ? 'text-live' : 'text-ink-2',
          )}
        >
          {keyStatusText(stored, check)}
        </output>
        {stored && (
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => void runCheck()}
              disabled={check === 'checking'}
              aria-label={named(fa.settings.keyCheck)}
              className="btn btn-secondary h-8 px-3 text-xs"
            >
              {fa.settings.keyCheck}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              aria-label={named(fa.settings.keyDelete)}
              className="btn h-8 border border-rec/40 px-3 text-xs text-rec hover:bg-rec/10"
            >
              {fa.settings.keyDelete}
            </button>
          </span>
        )}
      </div>
    </form>
  )
}

function KeySection() {
  return (
    <Section icon={KeyRound} title={fa.settings.keySection}>
      <div className="grid gap-5">
        {CLOUD_PROVIDERS.map((provider) => (
          <KeyField key={provider} provider={provider} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-3">
        {!cloud
          ? fa.settings.keyHintDemo
          : IS_DESKTOP
            ? fa.settings.keyHint
            : fa.settings.keyHintWeb}
      </p>
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
        <div className="stagger mx-auto grid w-full max-w-[46rem] gap-4 px-4 pt-2 pb-10 sm:px-8">
          <EngineSection />
          {localModels && (
            <Section icon={HardDriveDownload} title={fa.settings.modelsSection}>
              <ModelsList />
            </Section>
          )}
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
