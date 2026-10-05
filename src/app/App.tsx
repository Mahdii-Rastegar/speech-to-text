import { Direction } from 'radix-ui'
import { useInstall } from '@/app/stores/installStore'
import { useSettings } from '@/app/stores/settingsStore'
import { useUi } from '@/app/stores/uiStore'
import { HistoryRail, HistorySheet } from '@/ui/components/HistoryRail'
import { HistoryView } from '@/ui/components/HistoryView'
import { InstallGuide } from '@/ui/components/InstallGuide'
import { RecorderDock } from '@/ui/components/RecorderDock'
import { SettingsView } from '@/ui/components/SettingsView'
import { Toaster } from '@/ui/components/Toaster'
import { TopBar } from '@/ui/components/TopBar'
import { TranscriptPanel } from '@/ui/components/TranscriptPanel'
import { Welcome } from '@/ui/components/Welcome'

/**
 * Wide screens keep History open beside the page; narrow ones get a single
 * column with History in a side sheet. Views switch by state, never by URL:
 * an installed iOS web app asks for the microphone again when the route changes.
 */
export function App() {
  const onboarded = useSettings((settings) => settings.onboarded)
  const view = useUi((state) => state.view)
  const installGuideSeen = useSettings((settings) => settings.installGuideSeen)
  const installable = useInstall((state) => state.platform !== null)

  // Before anything else: on an iPhone what is set up in the browser does not follow into the installed app.
  if (installable && !installGuideSeen) {
    return (
      <Direction.Provider dir="rtl">
        <InstallGuide />
      </Direction.Provider>
    )
  }

  if (!onboarded) {
    return (
      <Direction.Provider dir="rtl">
        <Welcome />
      </Direction.Provider>
    )
  }

  return (
    <Direction.Provider dir="rtl">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)] lg:p-3 lg:ps-0">
        <aside className="hidden min-h-0 lg:flex">
          <HistoryRail />
        </aside>
        <main className="surface-page flex min-h-0 min-w-0 flex-col overflow-hidden lg:rounded-[1.25rem] lg:border lg:border-line">
          <div key={view} className="flex min-h-0 flex-1 animate-view-in flex-col">
            {view === 'main' && (
              <>
                <TopBar />
                <TranscriptPanel />
                <RecorderDock />
              </>
            )}
            {view === 'history' && <HistoryView />}
            {view === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>
      <HistorySheet />
      <Toaster />
    </Direction.Provider>
  )
}
