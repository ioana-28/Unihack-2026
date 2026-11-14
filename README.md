# Apartamentul

A seated VR experience set in a Timișoara apartment during the week of 15 to 22 December 1989.

The whole experience runs inside VR. The lobby is the launcher: a short 2D screen that collects the tap browsers require before they grant a VR session. After that, everything is rendered in the headset.

The app enters WebXR only. There is no Cardboard fallback in the lobby. WebXR needs an HTTPS origin and a browser or headset that exposes `immersive-vr`; the lobby status line reports why the session is unavailable when it is. The old Cardboard modules remain in the repo but are no longer reachable from the UI.

The prologue introduces Radu Petrescu, a 34 year old design engineer at ELBA, confined with a leg cast after slipping on ice in a pre-dawn food queue. It is a ten second film in five shots. When the VR session starts, the film plays head-locked on a full-view screen, then fades directly into the living room without leaving VR. A narrated voiceover and subtitles will be added to the film later.

The apartment is the exported `romconfort_assets.glb` model, loaded from `public/models/romconfort.glb`. The loader hides the blockout furniture (`BLK_*`), the catalog label plates (`LBL*`, `PLT_AST*`), and the review ceiling. The living room is the starting room: the viewer is seated on the couch facing the TV. The 54 MB file is mostly 4K PNG textures, so it loads slowly on a phone; a compressed export is the next step. Until it is ready, a simple room shell is shown, and the prologue holds its last frame until the model can take over.

The film is a reconstruction, not archival footage. Radu is a fictional character. The setting and the objects in the room come from the documented context of the week.

## Run it

Install the dependencies, then start the dev server.

```powershell
npm install
npm run dev
```

Open the URL that Vite prints. The lobby opens first. Add `?mode=desktop` to start in the room with mouse and keyboard.

Build the production bundle with `npm run build`.

Regenerate the poster and the five cut frames with `npm run poster`. The script reads `public/media/prologue.mp4` and writes `public/media/prologue-poster.jpg` plus `.artifacts/cuts/`. To capture other times, set `POSTER_CUTS` first.

```powershell
$env:POSTER_CUTS='0,2,4,6,8.3'
npm run poster
```

## Open it on the phone in VR

WebXR is required. It needs a trusted HTTPS origin and a browser or headset that reports `immersive-vr`.

1. Start the dev server with `npm run dev`.
2. Run `npm run tunnel` in a second terminal and open the printed HTTPS URL in Chrome on the Android phone or in the headset browser.
3. Press **Intră în VR**.
4. Allow the session if the browser asks.
5. Put the phone in the headset. The film plays on a full-view screen, then fades into the living room.

WebXR hands the session and lens calibration to the browser or headset. The lobby status line says `WebXR disponibil` when the session is available, or one of `WebXR cere HTTPS`, `WebXR lipsește din browser`, `WebXR fără immersive-vr` when it is not. Android Chrome with only a Cardboard viewer usually does not expose `immersive-vr`; use a WebXR-capable headset or browser for this build.

The renderer is **monoscopic by default**: the same camera image is submitted to both eye viewports, so both eyes see the TV, reticle, and HUD at the same screen position. This avoids double points on viewers whose IPD or lens alignment is off. Add `?stereo` to the URL for true stereo, where the right eye sees slightly more of the right side because it is physically offset from the left eye.

`npm run tunnel` is optional if you already serve the app over HTTPS.

## Controls

| Surface | Action |
| --- | --- |
| Lobby | **Intră în VR** starts WebXR. WebXR is the only VR entry; there is no Cardboard fallback. **Deschide pe desktop** opens the mouse and keyboard view |
| VR prologue | Plays automatically and fills the view. Look around with the headset; the screen follows the head. When the film ends it fades into the room |
| Desktop | Fullscreen on entry. Drag to look. W A S D or the arrow keys to move. **Esc** returns to the lobby |
| Room | Look with the headset. Hold your gaze on an object for about 1.5 seconds to interact |
| HUD | **Ieși** leaves desktop mode |
| Debug | **Ctrl+Shift+`** or `?debug` toggles the free-fly debug camera. See below |

The film is unmuted when it starts. If the browser blocks audio, it retries muted so the picture still plays. Voiceover and subtitles are not in the build yet.

## Scene prep debug

Press **Ctrl+Shift+`** (or add `?debug` to the URL) to toggle the debug camera in the lobby or desktop mode. It takes over the camera and hides the lobby overlay.

- **WASD** or the arrow keys move. **Q/E** move down and up. **Shift** moves faster.
- Click the canvas to capture the mouse, then move the mouse or touchpad to look. **Esc** releases the pointer.
- The HUD shows the world position, yaw and pitch, the object under the crosshair, and the hit point.
- **C** copies the current pose, **P** adds a waypoint, **L** copies all waypoints, and **Delete** clears them.

Use the copied poses to define transitions, movement bounds, and interactive targets. The values are in the apartment model's world space, in metres and radians. Turning debug off returns to the lobby, or resumes desktop mode at the current pose.

## Layout

```
index.html            lobby markup
public/media/         prologue.mp4 and the generated poster
public/models/        romconfort.glb apartment model
src/main.ts           starts the app, wires the lobby, applies ?mode= and ?debug
src/app.ts            render loop, camera rig, lobby, desktop, and WebXR transitions
src/lobby/lobby.ts    lobby wiring and status/toast state
src/lobby/lobby.css   lobby styling
src/scene/prologue.ts full-view VR prologue screen, layout, and film fade
src/scene/room.ts     GLB apartment loader, placeholder shell, and room lights
src/scene/hint.ts     head-locked gaze hint shown at session start
src/cardboard/stereo.ts       legacy Cardboard stereo render, unused
src/cardboard/orientation.ts  legacy gyroscope control, unused
src/xr/session.ts     WebXR support check and session start
src/textures.ts       canvas textures for the prologue and the old room pieces
src/input/desktop.ts  drag look and movement
src/debug/debug.ts    free-fly debug camera, raycast target, and waypoint HUD
src/debug/debug.css   debug HUD and crosshair styling
scripts/poster.mjs    poster and cut frames from prologue.mp4
scripts/smoke.mjs     stale headless browser check, see below
```

The mode is `'lobby' | 'desktop' | 'cardboard' | 'vr'`, held in `src/app.ts` and mirrored to `document.body.dataset.mode`. The lobby is visible only while the mode is `'lobby'`. The `'cardboard'` value and the matching modules are legacy; the lobby no longer enters them.

The VR entry starts `src/scene/prologue.ts`. The prologue is a camera-attached screen at 2 m. It is sized to cover each stereo eye, so the 16:9 film fills the view and is center-cropped. The black backdrop stays behind it for the fade. The video is created by the prologue module and kept off-screen; there is no prologue markup in `index.html`. When the film ends the screen fades over one second and the reticle and hint appear. The mode never changes during the transition, so the viewer stays in VR.

## Check your work

The smoke test in `scripts/smoke.mjs` is not maintained. It still asserts the removed scrollable prologue, the beats, the dossier, the CTA, the sound toggle, and the replay control, so it will fail against this build. Do not use it as proof. Verify the build and the real phone instead:

```powershell
npm run build
```

Then open the app on the WebXR device and walk the flow by hand.

## Known limits

- Phone-only Cardboard has three degrees of freedom and no position tracking. WebXR headsets can provide position tracking; the app still uses one seated viewpoint.
- Long documents need a reading mode that leaves stereo, so plan the newspaper and diary UI around that.
- The apartment model is 54 MB, mostly 4K PNG textures. It loads slowly until it is re-exported with compressed textures and a smaller texture set.
- The room has no collision, no baked lighting, and no audio. The debug camera is the current way to choose movement limits.
- The prologue film is a reconstruction with diegetic sound and no voiceover or subtitles yet. It is not an archive recording.
- The audio fallback can mute the film when the browser blocks playback, which will be more noticeable once the narration lands.
