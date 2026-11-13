import type { Mode } from '../mode'

export type StatusKind = 'ok' | 'warn' | 'off'
export type EnterTarget = 'vr' | 'desktop'

export type EntryState = {
  target: EnterTarget
  label: string
  hint: string
  showDesktop: boolean
}

export type ToastAction = {
  label: string
  run: () => void
}

export type LobbyHandlers = {
  onEnter: () => void
  onDesktop: () => void
  onExit: () => void
}

export type Lobby = {
  setStatus: (kind: StatusKind, text: string) => void
  setEntry: (state: EntryState) => void
  setBusy: (busy: boolean) => void
  setMode: (mode: Mode) => void
  toast: (message: string, action?: ToastAction) => void
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Element not found: ${selector}`)
  return element
}

export function mountLobby(handlers: LobbyHandlers): Lobby {
  const enter = requireElement<HTMLButtonElement>('#enter')
  const enterLabel = requireElement<HTMLElement>('#enter .btn__label')
  const enterHint = requireElement<HTMLElement>('#enter-hint')
  const desktop = requireElement<HTMLButtonElement>('#desktop')
  const howtoToggle = requireElement<HTMLButtonElement>('#howto-toggle')
  const howto = requireElement<HTMLElement>('#howto')
  const exit = requireElement<HTMLButtonElement>('#exit')
  const statusDot = requireElement<HTMLElement>('#status-dot')
  const statusText = requireElement<HTMLElement>('#status-text')
  const toastElement = requireElement<HTMLElement>('#toast')
  const toastMessage = requireElement<HTMLElement>('#toast-message')
  const toastActionButton = requireElement<HTMLButtonElement>('#toast-action')

  let enterTarget: EnterTarget = 'desktop'
  let currentHint = ''
  let toastTimer = 0
  let toastRun: (() => void) | null = null

  const hideToast = () => {
    toastElement.hidden = true
    toastRun = null
    window.clearTimeout(toastTimer)
  }

  const closeHowto = () => {
    howto.hidden = true
    howtoToggle.setAttribute('aria-expanded', 'false')
  }

  howtoToggle.addEventListener('click', () => {
    const opening = howto.hidden
    howto.hidden = !opening
    howtoToggle.setAttribute('aria-expanded', String(opening))
  })

  enter.addEventListener('click', () => {
    if (enterTarget === 'vr') handlers.onEnter()
    else handlers.onDesktop()
  })

  desktop.addEventListener('click', handlers.onDesktop)
  exit.addEventListener('click', handlers.onExit)

  toastActionButton.addEventListener('click', () => {
    const run = toastRun
    hideToast()
    run?.()
  })

  return {
    setStatus(kind, text) {
      statusDot.dataset.kind = kind
      statusText.textContent = text
    },
    setEntry(state) {
      enterTarget = state.target
      currentHint = state.hint
      enterLabel.textContent = state.label
      enterHint.textContent = state.hint
      desktop.hidden = !state.showDesktop
    },
    setBusy(busy) {
      enter.disabled = busy
      desktop.disabled = busy
      if (busy) {
        enter.setAttribute('aria-busy', 'true')
        enterHint.textContent = 'Se pornește VR…'
      } else {
        enter.removeAttribute('aria-busy')
        enterHint.textContent = currentHint
      }
    },
    setMode(mode) {
      document.body.dataset.mode = mode
      exit.hidden = mode !== 'desktop'
      if (mode !== 'lobby') {
        closeHowto()
        hideToast()
      }
    },
    toast(message, action) {
      toastMessage.textContent = message
      if (action) {
        toastActionButton.textContent = action.label
        toastActionButton.hidden = false
        toastRun = action.run
      } else {
        toastActionButton.hidden = true
        toastRun = null
      }
      toastElement.hidden = false
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(hideToast, 8000)
    },
  }
}
