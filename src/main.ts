import './lobby/lobby.css'
import { App } from './app'
import { mountLobby } from './lobby/lobby'
import type { Lobby } from './lobby/lobby'
import { hasXR, supportsImmersiveVR } from './xr/session'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
if (!canvas) throw new Error('Element not found: #stage')

let lobby: Lobby | null = null

const app = new App(canvas, (mode) => {
  lobby?.setMode(mode)
})

const secureContext = window.isSecureContext
const xrPresent = hasXR()
const vrAvailable = secureContext && xrPresent ? await supportsImmersiveVR() : false

lobby = mountLobby({
  onEnter: () => {
    if (!vrAvailable) {
      void app.enterCardboard()
      return
    }
    lobby?.setBusy(true)
    void app
      .enterVR()
      .then(() => lobby?.setBusy(false))
      .catch((error: unknown) => {
        lobby?.setBusy(false)
        lobby?.toast(vrFailureMessage(error), {
          label: 'Continuă în Cardboard',
          run: () => {
            void app.enterCardboard()
          },
        })
      })
  },
  onDesktop: () => app.enterDesktop(),
  onExit: () => app.exitToLobby(),
})

lobby.setStatus(
  vrAvailable ? 'ok' : 'off',
  vrAvailable ? 'WebXR disponibil' : 'Mod Cardboard',
)
lobby.setEntry({
  target: 'vr',
  label: 'Intră în VR',
  hint: vrAvailable
    ? 'WebXR. Așezat, cu telefonul în cască.'
    : 'Cardboard. Fullscreen, două imagini, giroscop.',
  showDesktop: true,
})

const requestedMode = new URLSearchParams(window.location.search).get('mode')
if (requestedMode === 'desktop') app.enterDesktop()

function vrFailureMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') {
    return 'Browserul a blocat pornirea VR. Permite accesul și încearcă din nou.'
  }
  if (name === 'NotSupportedError') {
    return 'WebXR nu este disponibil. Poți continua în Cardboard.'
  }
  if (name === 'InvalidStateError') {
    return 'O sesiune VR este deja pornită.'
  }
  return 'VR nu a pornit. Încearcă din nou sau continuă în Cardboard.'
}
