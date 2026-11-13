# Apartamentul

A web lobby for a seated VR experience set in a Timișoara apartment during the week of 15 to 22 December 1989.

The lobby works. The apartment behind it is a placeholder built from boxes, canvas textures, and a few point lights. Replace the placeholder room when the modelled apartment lands.

## Run it

Install the dependencies, then start the dev server.

```powershell
npm install
npm run dev
```

Open the URL that Vite prints. Add `?mode=desktop` to skip the lobby and start in the room.

Build the production bundle with `npm run build`.

## Open it on the phone in VR

WebXR needs a secure context. `http://localhost` works on the development machine only.

1. Build the bundle with `npm run build`.
2. Serve `dist` from an HTTPS host, or expose the dev server with a tunnel.
3. Open the HTTPS URL in Chrome on the Android phone.
4. Wait for the status line to read "Cască detectată".
5. Put the phone in the headset, then press **Intră în VR**.

The first session may ask you to pick a viewer profile. Pick the headset model or scan its QR code.

The lobby, the mode switch, and the deep link are proven by `npm run smoke`. An immersive session on a real headset is not proven. Test that on the phone before you demo.

## Controls

| Surface | Action |
| --- | --- |
| Lobby | **Intră în VR** when WebXR is present, otherwise **Deschide apartamentul** |
| Desktop | Drag to look. W A S D or the arrow keys to move. **Esc** returns to the lobby |
| VR | Look around with your head. A short hint explains the 1.5 second gaze. Dwell interaction comes with the first real object |
| HUD | **Ieși** leaves desktop mode |

## Layout

```
index.html            entry page and lobby markup
src/main.ts           starts the app, detects WebXR, applies ?mode=
src/app.ts            render loop, camera rig, lobby and VR transitions
src/lobby/lobby.ts    DOM wiring and lobby state
src/lobby/lobby.css   lobby styling
src/scene/room.ts     placeholder apartment
src/scene/hint.ts     head-locked gaze hint shown at VR session start
src/textures.ts       canvas textures for wood, the window, the calendar, and the TV
src/input/desktop.ts  drag look and movement
src/xr/session.ts     WebXR support check and session start
scripts/smoke.mjs     headless browser check of the served build
```

The mode is one value, `'lobby' | 'desktop' | 'vr'`, held in `src/app.ts` and mirrored to `document.body.dataset.mode`. CSS hides the lobby from that attribute.

## Check your work

```powershell
npm run build
npm run smoke
```

The smoke script starts the preview server, drives Edge or Chrome headless through the DevTools protocol, clicks the real buttons, and writes screenshots to `.artifacts/`. Fifteen checks cover the initial mode, the how-to panel, keyboard focus, the single entry control, the desktop switch, Escape, the deep link, uncaught errors, and console warnings. Set `BROWSER_PATH` when the script cannot find a browser.

## Known limits

- Phone headsets have three degrees of freedom. The camera rotates but does not track position. The app uses one seated viewpoint and shifts the room down 1.62 m so the floor sits under the head.
- Long documents need a reading mode that leaves stereo, so plan the newspaper and diary UI around that.
- The room is a placeholder. It has no collision, no baked lighting, and no audio.
