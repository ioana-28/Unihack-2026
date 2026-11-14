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

The primary VR path is WebXR. It needs a trusted HTTPS origin. When WebXR is unavailable, the app falls back to a fullscreen Cardboard view that works over a plain LAN URL.

1. Start the dev server with `npm run dev`.
2. For WebXR, run `npm run tunnel` in a second terminal and open the printed HTTPS URL in Chrome on the Android phone. For Cardboard, open the LAN URL.
3. Press **Intră în VR**.
4. Allow the motion permission if Chrome asks.
5. Put the phone in the headset.

WebXR handles the stereo view and the lens correction. Cardboard renders a side-by-side view into a fullscreen canvas, hides the browser navigation with `navigationUI: hide`, and locks landscape. Press Escape or use the browser back gesture to leave Cardboard.

If WebXR has black bars inside the lenses, set the correct viewer profile in Chrome's VR settings. If Cardboard shows an X, that is the browser's fullscreen control and the page cannot remove it.

`npm run tunnel` is optional. Use it when you need a public HTTPS link to share. Cardboard does not require HTTPS.

The lobby, the mode switch, the Cardboard entry, and the deep link are proven by `npm run smoke`. WebXR and head tracking on a real phone are not proven. Test those before you demo.

## Controls

| Surface | Action |
| --- | --- |
| Lobby | **Intră în VR** starts WebXR when available, otherwise Cardboard. **Deschide pe desktop** opens the mouse and keyboard view |
| Desktop | Fullscreen on entry. Drag to look. W A S D or the arrow keys to move. **Esc** returns to the lobby |
| VR | WebXR when available, otherwise Cardboard. Look with the headset. **Esc** leaves Cardboard |
| HUD | **Ieși** leaves desktop mode |

## Layout

```
index.html            entry page and lobby markup
src/main.ts           starts the app, wires the lobby, applies ?mode=
src/app.ts            render loop, camera rig, lobby, desktop, Cardboard, and WebXR transitions
src/lobby/lobby.ts    DOM wiring and lobby state
src/lobby/lobby.css   lobby styling
src/scene/room.ts     placeholder apartment
src/scene/hint.ts     head-locked gaze hint shown at session start
src/cardboard/stereo.ts       side-by-side stereo render
src/cardboard/orientation.ts  gyroscope camera control
src/xr/session.ts     WebXR support check and session start
src/textures.ts       canvas textures for wood, the window, the calendar, and the TV
src/input/desktop.ts  drag look and movement
scripts/smoke.mjs     headless browser check of the served build
```

The mode is one value, `'lobby' | 'desktop' | 'cardboard' | 'vr'`, held in `src/app.ts` and mirrored to `document.body.dataset.mode`. CSS hides the lobby from that attribute. The reticle and hint sit at 10 m in Cardboard and 50 m in WebXR, which keeps them at the same screen position in both eyes.

## Check your work

```powershell
npm run build
npm run smoke
```

The smoke script starts the preview server, drives Edge or Chrome headless through the DevTools protocol, clicks the real buttons, and writes screenshots to `.artifacts/`. Twenty checks cover the initial mode, the how-to panel, keyboard focus, the full-bleed canvas, the Cardboard entry, the stereo frame, the desktop switch, Escape, the deep link, uncaught errors, and console warnings. Set `BROWSER_PATH` when the script cannot find a browser.

## Known limits

- Phone headsets have three degrees of freedom. The camera follows the gyroscope in Cardboard and the head pose in WebXR, without position tracking. The app uses one seated viewpoint.
- Long documents need a reading mode that leaves stereo, so plan the newspaper and diary UI around that.
- The room is a placeholder. It has no collision, no baked lighting, and no audio.
