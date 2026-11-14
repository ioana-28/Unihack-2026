# Apartamentul

A seated VR experience set in a Timișoara apartment during the week of 15 to 22 December 1989.

The whole experience runs inside VR. The lobby is the launcher: a short 2D screen that collects the tap browsers require before they grant fullscreen, motion access, or a VR session. After that, everything is rendered in the headset.

The prologue introduces Radu Petrescu, a 34 year old design engineer at ELBA, confined with a leg cast after slipping on ice in a pre-dawn food queue. It is a ten second film in five shots. When the VR session starts, the film plays head-locked on a full-view screen, then fades directly into the living room without leaving VR. A narrated voiceover and subtitles will be added to the film later.

The apartment behind the lobby is a placeholder built from boxes, canvas textures, and a few point lights. Replace the placeholder room when the modelled apartment lands.

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

The primary VR path is WebXR. It needs a trusted HTTPS origin. When WebXR is unavailable, the app falls back to a fullscreen Cardboard view that works over a plain LAN URL.

1. Start the dev server with `npm run dev`.
2. For WebXR, run `npm run tunnel` in a second terminal and open the printed HTTPS URL in Chrome on the Android phone. For Cardboard, open the LAN URL.
3. Press **Intră în VR**.
4. Allow the motion permission if Chrome asks.
5. Put the phone in the headset. The film plays on a full-view screen, then fades into the living room.

WebXR handles the stereo view and the lens correction. Cardboard renders a side-by-side view into a fullscreen canvas, hides the browser navigation with `navigationUI: hide`, and locks landscape. Press Escape or use the browser back gesture to leave Cardboard.

If WebXR has black bars inside the lenses, set the correct viewer profile in Chrome's VR settings. If Cardboard shows an X, that is the browser's fullscreen control and the page cannot remove it.

`npm run tunnel` is optional. Use it when you need a public HTTPS link to share. Cardboard does not require HTTPS.

## Controls

| Surface | Action |
| --- | --- |
| Lobby | **Intră în VR** starts WebXR when available, otherwise Cardboard. **Deschide pe desktop** opens the mouse and keyboard view |
| VR prologue | Plays automatically and fills the view. Look around with the headset; the screen follows the head. When the film ends it fades into the room |
| Desktop | Fullscreen on entry. Drag to look. W A S D or the arrow keys to move. **Esc** returns to the lobby |
| Room | Look with the headset. Hold your gaze on an object for about 1.5 seconds to interact. **Esc** leaves Cardboard |
| HUD | **Ieși** leaves desktop mode |

The film is unmuted when it starts. If the browser blocks audio, it retries muted so the picture still plays. Voiceover and subtitles are not in the build yet.

## Layout

```
index.html            lobby markup
public/media/         prologue.mp4 and the generated poster
src/main.ts           starts the app, wires the lobby, applies ?mode=
src/app.ts            render loop, camera rig, lobby, desktop, Cardboard, and WebXR transitions
src/lobby/lobby.ts    lobby wiring and status/toast state
src/lobby/lobby.css   lobby styling
src/scene/prologue.ts full-view VR prologue screen, layout, and film fade
src/scene/room.ts     placeholder apartment
src/scene/hint.ts     head-locked gaze hint shown at session start
src/cardboard/stereo.ts       side-by-side stereo render
src/cardboard/orientation.ts  gyroscope camera control
src/xr/session.ts     WebXR support check and session start
src/textures.ts       canvas textures for wood, the window, the calendar, and the TV
src/input/desktop.ts  drag look and movement
scripts/poster.mjs    poster and cut frames from prologue.mp4
scripts/smoke.mjs     stale headless browser check, see below
```

The mode is `'lobby' | 'desktop' | 'cardboard' | 'vr'`, held in `src/app.ts` and mirrored to `document.body.dataset.mode`. The lobby is visible only while the mode is `'lobby'`.

The VR entry starts `src/scene/prologue.ts`. The prologue is a camera-attached screen at 2 m. It is sized to cover each stereo eye, so the 16:9 film fills the view and is center-cropped. The black backdrop stays behind it for the fade. The video is created by the prologue module and kept off-screen; there is no prologue markup in `index.html`. When the film ends the screen fades over one second and the reticle and hint appear. The mode never changes during the transition, so the viewer stays in VR.

## Check your work

The smoke test in `scripts/smoke.mjs` is not maintained. It still asserts the removed scrollable prologue, the beats, the dossier, the CTA, the sound toggle, and the replay control, so it will fail against this build. Do not use it as proof. Verify the build and the real phone instead:

```powershell
npm run build
```

Then open the app on the Android phone in Chrome and walk the Cardboard path by hand.

## Known limits

- Phone headsets have three degrees of freedom. The camera follows the gyroscope in Cardboard and the head pose in WebXR, without position tracking. The app uses one seated viewpoint.
- Long documents need a reading mode that leaves stereo, so plan the newspaper and diary UI around that.
- The room is a placeholder. It has no collision, no baked lighting, and no audio.
- The prologue film is a reconstruction with diegetic sound and no voiceover or subtitles yet. It is not an archive recording.
- The prologue is a 16:9 film filling a near-square Cardboard eye view, so its sides are cropped. A native stereo or taller film would keep more of the frame.
- The audio fallback can mute the film when the browser blocks playback, which will be more noticeable once the narration lands.
