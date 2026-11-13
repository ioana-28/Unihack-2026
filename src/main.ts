import './lobby/lobby.css'
import { App } from './app'
import { mountLobby } from './lobby/lobby'
import type { Lobby } from './lobby/lobby'
import { supportsImmersiveVR } from './xr/session'

const canvas = document.querySelector<HTMLCanvasElement>('#stage')
if (!canvas) throw new Error('Element not found: #stage')

let lobby: Lobby | null = null

const app = new App(canvas, (mode) => {
  lobby?.setMode(mode)
})

lobby = mountLobby({
  onEnter: () => {
    lobby?.setBusy(true)
    void app
      .enterVR()
      .then(() => lobby?.setBusy(false))
      .catch((error: unknown) => {
        lobby?.setBusy(false)
        lobby?.toast(vrFailureMessage(error), {
          label: 'Continuă pe desktop',
          run: () => app.enterDesktop(),
        })
      })
  },
  onDesktop: () => app.enterDesktop(),
  onExit: () => app.exitToLobby(),
})

const secureContext = window.isSecureContext
const vrAvailable = secureContext ? await supportsImmersiveVR() : false

if (!secureContext) {
  lobby.setStatus('warn', 'Mod desktop activ')
  lobby.setEntry({
    target: 'desktop',
    label: 'Deschide apartamentul',
    hint: 'Mod desktop. Pentru VR, deschide pagina prin HTTPS pe telefon.',
    showDesktop: false,
  })
} else if (vrAvailable) {
  lobby.setStatus('ok', 'Cască detectată')
  lobby.setEntry({
    target: 'vr',
    label: 'Intră în VR',
    hint: 'Așezat, cu telefonul în cască.',
    showDesktop: true,
  })
} else {
  lobby.setStatus('off', 'Mod desktop activ')
  lobby.setEntry({
    target: 'desktop',
    label: 'Deschide apartamentul',
    hint: 'Mod desktop. Pentru VR, deschide pe telefonul Android.',
    showDesktop: false,
  })
}

const requestedMode = new URLSearchParams(window.location.search).get('mode')
if (requestedMode === 'desktop') app.enterDesktop()

function vrFailureMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') {
    return 'Browserul a blocat pornirea VR. Permite accesul și încearcă din nou.'
  }
  if (name === 'NotSupportedError') {
    return 'VR nu este disponibil aici. Poți continua pe desktop.'
  }
  if (name === 'InvalidStateError') {
    return 'O sesiune VR este deja pornită.'
  }
  return 'VR nu a pornit. Încearcă din nou sau continuă pe desktop.'
}
