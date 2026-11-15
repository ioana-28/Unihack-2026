import './lobby/lobby.css'
import { App } from './app'
import { mountDay18Selector } from './game/day18-selector'
import { mountLobby } from './lobby/lobby'
import type { EntryState, Lobby } from './lobby/lobby'
import { hasXR, supportsImmersiveVR } from './xr/session'

const params = new URLSearchParams(window.location.search)
const canvas = document.querySelector<HTMLCanvasElement>('#stage')
if (!canvas) throw new Error('Element not found: #stage')

let lobby: Lobby | null = null

const app = new App(canvas, (mode) => {
  lobby?.setMode(mode)
})
;(window as unknown as { __app: App }).__app = app

const secureContext = window.isSecureContext
const xrPresent = hasXR()
const vrAvailable = secureContext && xrPresent ? await supportsImmersiveVR() : false
const vrStatus = vrAvailable
  ? 'WebXR disponibil'
  : !secureContext
    ? 'WebXR cere HTTPS'
    : !xrPresent
      ? 'WebXR lipsește din browser'
      : 'WebXR fără immersive-vr'

lobby = mountLobby({
  onEnter: () => {
    if (!app.isRoomReady()) {
      lobby?.toast('Apartamentul se incarca inca. Incearca din nou in cateva secunde.')
      return
    }
    lobby?.setBusy(true)
    void app
      .enterVR()
      .then(() => lobby?.setBusy(false))
      .catch((error: unknown) => {
        lobby?.setBusy(false)
        lobby?.toast(vrFailureMessage(error))
      })
  },
  onDesktop: () => app.enterDesktop(),
  onExit: () => app.exitToLobby(),
})

mountDay18Selector({
  onChange: (selection) =>
    app.setStartSelection(selection.day, selection.filmAscuns, selection.aDatNumele),
})

lobby.setStatus(vrAvailable ? 'ok' : 'off', vrStatus)

const entryState: EntryState = {
  target: 'vr',
  label: 'Intra in VR',
  hint: vrAvailable
    ? 'WebXR. Asezat, cu telefonul in casca.'
    : 'WebXR necesita HTTPS si un browser compatibil.',
  showDesktop: true,
}

let watchTimer = 0
let reportedError = false

function stopWatching(): void {
  if (watchTimer !== 0) {
    window.clearInterval(watchTimer)
    watchTimer = 0
  }
}

function updateEntry(): boolean {
  if (app.isRoomReady()) {
    const failure = app.getModelError()
    lobby?.setEntry({
      ...entryState,
      hint: failure
        ? 'Apartamentul nu s-a putut incarca. Se foloseste sala simpla.'
        : entryState.hint,
    })
    if (failure && !reportedError) {
      reportedError = true
      lobby?.toast('Apartamentul nu s-a putut descarca. Verifica conexiunea si incearca din nou.', {
        label: 'Reincearca',
        run: () => {
          app.retryModel()
          startWatching()
        },
      })
    }
    return true
  }

  const { loaded, total } = app.getModelProgress()
  const percent = total > 0 ? Math.min(99, Math.max(1, Math.round((loaded / total) * 100))) : 0
  lobby?.setEntry({
    ...entryState,
    hint: percent > 0 ? `Se incarca apartamentul... ${percent}%` : 'Se incarca apartamentul...',
    disabled: vrAvailable,
  })
  return false
}

function startWatching(): void {
  stopWatching()
  reportedError = false
  if (updateEntry()) return
  watchTimer = window.setInterval(() => {
    if (updateEntry()) stopWatching()
  }, 250)
}

startWatching()

const requestedMode = params.get('mode')
if (requestedMode === 'desktop') app.enterDesktop()
const debugParam = params.get('debug')
if (debugParam === '' || debugParam === '1') app.setDebug(true)
if (params.has('stereo')) app.setMono(false)

function vrFailureMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') {
    return 'Browserul a blocat pornirea VR. Permite accesul și încearcă din nou.'
  }
  if (name === 'NotSupportedError') {
    return 'WebXR nu este disponibil. Rulează pe HTTPS, într-un browser compatibil WebXR.'
  }
  if (name === 'InvalidStateError') {
    return 'O sesiune VR este deja pornită.'
  }
  return 'WebXR nu a pornit. Verifică HTTPS și suportul immersive-vr al browserului.'
}
