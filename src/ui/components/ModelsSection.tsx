import { useId, useState } from 'react'
import { selectLocalModel } from '@/app/recordingController'
import { FALLBACK_PROVIDER_ID, providers } from '@/app/services'
import {
  downloadModel,
  modelsStore,
  removeModel,
  stopDownload,
  useModels,
} from '@/app/stores/modelsStore'
import { useRecording } from '@/app/stores/recordingStore'
import { useSettings } from '@/app/stores/settingsStore'
import { notify } from '@/app/stores/uiStore'
import { isBusy } from '@/core/recording/machine'
import { toPersianDigits } from '@/core/format/digits'
import {
  engineOutlook,
  type DownloadProgress,
  type LocalModelStatus,
} from '@/core/models/localModels'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'
import { ConfirmDialog } from './ConfirmDialog'

const megabytes = (bytes: number) => toPersianDigits(Math.round(bytes / (1024 * 1024)))

const sizeLabel = (bytes: number) => fa.settings.megabytes.replace('{size}', megabytes(bytes))

const partLabel = (done: number, bytes: number) =>
  fa.settings.megabytesOf.replace('{done}', megabytes(done)).replace('{size}', megabytes(bytes))

function ProgressBar({ progress, label }: { progress: DownloadProgress; label: string }) {
  const fraction = progress.total > 0 ? Math.min(1, progress.received / progress.total) : 0
  return (
    <progress
      aria-label={label}
      max={100}
      value={Math.round(fraction * 100)}
      className={cn(
        'mt-3 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-line-strong',
        '[&::-webkit-progress-bar]:bg-transparent [&::-moz-progress-bar]:bg-live',
        '[&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-live',
        '[&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300',
      )}
    />
  )
}

function ModelRow({ model, recommended }: { model: LocalModelStatus; recommended: boolean }) {
  // The model the next recording uses, when the local engine is the chosen one.
  const inUse = useSettings((settings) => {
    const provider = providers.get(settings.sttProviderId) ?? providers.get(FALLBACK_PROVIDER_ID)
    return provider?.getCapabilities().offline === true && settings.sttModel === model.id
  })
  const busy = useRecording((state) => isBusy(state.phase))
  const progress = useModels((state) => state.downloading[model.id])
  const failure = useModels((state) => state.failures[model.id])
  const [confirming, setConfirming] = useState(false)
  const text = fa.localModels[model.id]
  const title = text?.title ?? model.id
  const named = (action: string) =>
    fa.settings.modelActionFor.replace('{action}', action).replace('{model}', title)

  const partial = !model.installed && model.downloadedBytes > 0
  const verifying =
    progress !== undefined && progress.total > 0 && progress.received >= progress.total
  const status = progress
    ? verifying
      ? fa.settings.modelVerifying
      : partLabel(progress.received, progress.total)
    : model.installed
      ? `${fa.settings.modelInstalled} · ${sizeLabel(model.bytes)}`
      : partial
        ? `${fa.settings.modelPartial} · ${partLabel(model.downloadedBytes, model.bytes)}`
        : `${fa.settings.modelMissing} · ${sizeLabel(model.bytes)}`

  const download = async () => {
    await downloadModel(model.id)
    const now = modelsStore.getState().models.find((entry) => entry.id === model.id)
    if (now?.installed) notify('model-installed')
  }

  const remove = async () => {
    try {
      await removeModel(model.id)
      notify('model-deleted')
    } catch {
      notify('model-delete-failed')
    }
  }

  return (
    <li className="rounded-[0.625rem] border border-line bg-backdrop/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <bdi className="font-mono text-sm text-ink">{title}</bdi>
            {inUse && model.installed && (
              <span className="rounded-full bg-live/15 px-2 py-0.5 text-[0.6875rem] leading-4 text-live">
                {fa.settings.modelInUse}
              </span>
            )}
            {recommended && (
              <span className="rounded-full border border-live/40 px-2 py-0.5 text-[0.6875rem] leading-4 text-live">
                {fa.settings.modelRecommended}
              </span>
            )}
          </p>
          {text && <p className="mt-1 text-xs leading-5 text-ink-3">{text.body}</p>}
          <p
            className={cn(
              'mt-1 text-xs leading-5',
              model.installed && !progress ? 'text-live' : 'text-ink-2',
            )}
          >
            {status}
          </p>
        </div>
        <span className="flex shrink-0 gap-1">
          {progress ? (
            <button
              type="button"
              onClick={() => stopDownload(model.id)}
              disabled={verifying}
              aria-label={named(fa.settings.modelStop)}
              className="btn btn-secondary h-8 px-3 text-xs"
            >
              {fa.settings.modelStop}
            </button>
          ) : (
            <>
              {model.installed && !inUse && (
                <button
                  type="button"
                  onClick={() => selectLocalModel(model.id)}
                  disabled={busy}
                  aria-label={named(fa.settings.modelUse)}
                  className="btn btn-primary h-8 px-3 text-xs"
                >
                  {fa.settings.modelUse}
                </button>
              )}
              {!model.installed && (
                <button
                  type="button"
                  onClick={() => void download()}
                  aria-label={named(partial ? fa.settings.modelResume : fa.settings.modelDownload)}
                  className="btn btn-primary h-8 px-3 text-xs"
                >
                  {partial ? fa.settings.modelResume : fa.settings.modelDownload}
                </button>
              )}
              {(model.installed || partial) && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  aria-label={named(fa.settings.modelDelete)}
                  className="btn h-8 border border-rec/40 px-3 text-xs text-rec hover:bg-rec/10"
                >
                  {fa.settings.modelDelete}
                </button>
              )}
            </>
          )}
        </span>
      </div>
      {progress && (
        <ProgressBar
          progress={progress}
          label={fa.settings.modelProgress.replace('{model}', title)}
        />
      )}
      {failure && !progress && (
        <p role="alert" className="mt-2 text-xs leading-5 text-rec">
          {fa.modelFailures[failure]}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={fa.settings.confirmModelDeleteTitle}
        body={fa.settings.confirmModelDeleteBody}
        confirmLabel={fa.settings.modelDelete}
        onConfirm={() => void remove()}
      />
    </li>
  )
}

/** The local engine's models: which are on the disk, with the way to fetch or remove each. */
export function ModelsList() {
  const models = useModels((state) => state.models)
  const system = useModels((state) => state.system)
  const listId = useId()

  return (
    <>
      {system && (
        <p id={listId} className="text-sm leading-6 text-ink-2">
          {fa.engineOutlooks[engineOutlook(system)]}
        </p>
      )}
      <ul aria-describedby={system ? listId : undefined} className="mt-3 grid gap-2">
        {/* The platform lists the model to start with first. */}
        {models.map((model, index) => (
          <ModelRow key={model.id} model={model} recommended={index === 0} />
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-ink-3">{fa.settings.modelsHint}</p>
    </>
  )
}
