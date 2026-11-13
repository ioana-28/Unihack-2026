import type { WebGLRenderer } from 'three'

export function hasXR(): boolean {
  return typeof navigator !== 'undefined' && 'xr' in navigator
}

export async function supportsImmersiveVR(): Promise<boolean> {
  if (!hasXR() || !navigator.xr) return false
  try {
    return await navigator.xr.isSessionSupported('immersive-vr')
  } catch {
    return false
  }
}

export async function enterVRSession(renderer: WebGLRenderer): Promise<XRSession> {
  if (!navigator.xr) {
    throw new Error('WebXR nu este disponibil în acest browser.')
  }
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor'],
  })
  await renderer.xr.setSession(session)
  return session
}
