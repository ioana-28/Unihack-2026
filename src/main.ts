import './lobby/lobby.css'
import { App } from './app'
import { mountLobby } from './lobby/lobby'
import type { Lobby } from './lobby/lobby'
import { hasXR, supportsImmersiveVR } from './xr/session'

const params = new URLSearchParams(window.location.search)
const canvas = document.querySelector<HTMLCanvasElement>('#stage')
if (!canvas) throw new Error('Element not found: #stage')

let lobby: Lobby | null = null

const app = new App(canvas, (mode) => {
  lobby?.setMode(mode)
})

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

lobby.setStatus(vrAvailable ? 'ok' : 'off', vrStatus)
lobby.setEntry({
  target: 'vr',
  label: 'Intră în VR',
  hint: vrAvailable
    ? 'WebXR. Așezat, cu telefonul în cască.'
    : 'WebXR necesită HTTPS și un browser compatibil.',
  showDesktop: true,
})

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
