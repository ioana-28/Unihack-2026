# Apartamentul

A seated WebXR experience set in a Timișoara apartment during the week of 15–22 December 1989.

The whole experience runs in VR, with a short 2D lobby that collects the tap browsers require before starting a session. A prologue film plays head-locked, then fades into the living room. Days 15–21 are playable from `data/z15.json`–`data/z21.json`; day 17 includes a live conversation with the neighbour, Doamna Ana, through the peephole.

The apartment is the `romconfort` GLB with KTX2/ETC1S textures, cached in Cache Storage after the first load. Ana's conversation uses an ElevenLabs Conversational AI agent over WebRTC, with pre-recorded video loops for her face and a recorded fallback line when the live session is unavailable.

## Requirements

| Thing | Version / notes |
| --- | --- |
| Node.js | 22 LTS (Vite 8 needs 20.19+ or 22.12+) |
| npm | 10+ (ships with Node 22) |
| Git | any recent version |
| Browser | Chrome, Edge, or a WebXR-capable headset browser |
| Microphone | needed only for the day-17 Ana conversation |

Optional tools, only if you regenerate assets or test on a phone:

| Tool | Used by |
| --- | --- |
| [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.4+ | `npm run model:ktx2` |
| Chrome or Edge | `npm run poster` |
| [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools) (`adb`) | `npm run reverse:dev`, `npm run reverse:preview` |
| [Tailscale](https://tailscale.com/download) | `npm run tailscale:*` |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | `npm run tunnel` |

## Quick start

```powershell
git clone https://github.com/ioana-28/Unihack-2026.git
cd Unihack-2026
npm install
npm run dev
```

Open `http://localhost:5173`. The lobby appears first.

- Use `http://localhost:5173/?mode=desktop` to skip the lobby and start in the room with mouse and keyboard.
- The primary lobby button starts the game: WebXR when the device supports it, desktop otherwise.
- `npm run typecheck` checks TypeScript. `npm run build` creates the production bundle in `dist/`. `npm run preview` serves it on `http://localhost:4173`.

The KTX2 model (`public/models/romconfort.glb`, about 100 MB) and the media files are committed, so a fresh clone does not need any asset generation.

## ElevenLabs agent

Ana is implemented in `src/game/z17/ana.ts` and configured in `src/game/z17/ana-config.ts`.

The default agent ID is public and is read from:

```ts
import.meta.env.VITE_ELEVENLABS_AGENT_ID ?? 'agent_9401m7bme2wce8ft25gn340azf0a'
```

To use your own agent, create `.env.local` in the repo root:

```ini
VITE_ELEVENLABS_AGENT_ID=agent_your_id_here
```

Restart `npm run dev` after changing it. Never put an ElevenLabs API key in this repo: the browser fetches a short-lived conversation token for a public agent, and no secret is needed.

The agent must have:

- public/shareable access, so the token endpoint accepts the request;
- prompt, first-message, and language **overrides enabled** in the ElevenLabs dashboard;
- the voice and TTS model chosen in the dashboard. The code only overrides the prompt, the opening line, and `language: 'ro'`.

Ana needs a microphone and a **secure context**. `localhost` and HTTPS work; a plain `http://192.168.x.x:5173` LAN URL does not, and the scene falls back to the recorded line. Add `?logs` to see the `[ana]` log panel, or read the `[phone]` lines that the dev server prints in its terminal.

## Phone / headset setup

WebXR and the microphone both require a secure origin. There are three ways to get one on a phone or headset. Prefer USB while developing, and Tailscale Serve for a stable address.

### Option 1: USB with `adb reverse` (fastest for development)

`adb reverse` forwards the phone's `localhost` port over the USB cable to the PC, so the phone sees a real secure `localhost` origin without certificates.

1. Install Android Platform Tools and add the folder containing `adb` to `PATH`.
2. On the phone, enable **Developer options → USB debugging**, connect the USB cable, and accept the RSA fingerprint prompt.
3. Verify the device:

   ```powershell
   adb devices
   ```

   It should list your device as `device`, not `unauthorized`.

4. Terminal 1, start the dev server:

   ```powershell
   npm run dev
   ```

5. Terminal 2, create the reverse tunnel:

   ```powershell
   npm run reverse:dev
   ```

6. On the phone, open `http://localhost:5173`. Add `?mode=desktop` for a non-VR test.

For a production build over USB, use ports 4173 instead:

```powershell
npm run build
npm run preview
npm run reverse:preview
```

Then open `http://localhost:4173` on the phone.

Notes:

- `adb reverse --list` shows the active tunnel. Re-run the script after unplugging the phone.
- Both `reverse:*` scripts target fixed ports. Keep Vite on 5173 (dev) or 4173 (preview), or adjust the script.
- Use a data cable; charge-only cables do not expose USB debugging.

### Option 2: Tailscale Serve (stable HTTPS address)

Best when the PC and the phone/headset are on Wi-Fi and you want the same origin across sessions, so the 100 MB model stays in Cache Storage.

1. Install Tailscale on the PC and on the phone/headset and sign both into the same tailnet.
2. Terminal 1, start the dev server:

   ```powershell
   npm run dev
   ```

3. Terminal 2, first time only:

   ```powershell
   npm run tailscale:login
   ```

4. Serve the dev port and print the URL:

   ```powershell
   npm run tailscale:serve
   npm run tailscale:url
   ```

5. Open the printed `https://<machine>.<tailnet>.ts.net/` address on the phone or headset.

`npm run tailscale:serve` runs `tailscale serve --bg 5173`, so the dev server must be listening on 5173. `npm run tailscale:status` shows the current Serve config.

### Option 3: Cloudflare quick tunnel

Useful when Tailscale is not available, but the `trycloudflare.com` hostname changes on every run, so the model cache is thrown away each time.

1. Install `cloudflared` and put it on `PATH`.
2. Terminal 1: `npm run dev`.
3. Terminal 2: `npm run tunnel`.
4. Open the printed HTTPS URL on the phone.

Do not use the plain **Network** URL that Vite prints. It is `http://`, so WebXR and the microphone are blocked.

### Starting VR

1. Open the secure URL (`http://localhost:5173` over USB, or the HTTPS address).
2. The lobby status line reports one of `WebXR disponibil`, `WebXR cere HTTPS`, `WebXR lipsește din browser`, or `WebXR fără immersive-vr`.
3. Press the primary button and allow the session if the browser asks.
4. Put the phone into the headset. The prologue plays, then fades into the living room.

Android Chrome with only a Cardboard viewer usually does not expose `immersive-vr`. Use a WebXR-capable headset browser for the full experience.

The renderer is **monoscopic by default**: both eyes receive the same image, which avoids double points on viewers with imperfect lens alignment. Add `?stereo` for true stereo.

## URL options

| Parameter | Effect |
| --- | --- |
| `?mode=desktop` | Start directly in the room with mouse and keyboard |
| `?zi=17` or `?day=17` | Start that day with default variables (15–22; only days with a `data/zNN.json` file exist) |
| `?debug` or `?debug=1` | Free-fly debug camera (also **Ctrl+Shift+`**) |
| `?logs` | On-screen panel with `[ana]`, `[z17]`, `[day]`, `[audio]`, `[media]` logs; in dev, tagged logs are also relayed to the Vite terminal as `[phone] ...` |
| `?stereo` | True stereo instead of the default monoscopic render |

## Controls

| Surface | Action |
| --- | --- |
| Lobby | Primary button starts the game. **Deschide pe desktop** opens the mouse and keyboard view |
| VR prologue | Plays automatically and fills the view. It follows the head. When it ends it fades into the room |
| Desktop | Fullscreen on entry. Drag to look, **W A S D** or arrow keys to move, **Esc** returns to the lobby |
| Room | Look with the headset or mouse. Hold the gaze on an object or navigation tag for about 1.5 s to interact or move |
| HUD | **Ieși** leaves desktop mode |
| Debug | **Ctrl+Shift+`** or `?debug`. **WASD** move, **Q/E** down/up, **Shift** faster, click to capture the mouse, **C** copy pose, **P** add waypoint, **L** copy waypoints, **Delete** clear |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with `--host` on port 5173 |
| `npm run build` | TypeScript check, then Vite production build into `dist/` |
| `npm run preview` | Serves `dist/` on port 4173 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run reverse:dev` | `adb reverse tcp:5173 tcp:5173` |
| `npm run reverse:preview` | `adb reverse tcp:4173 tcp:4173` |
| `npm run tailscale:login` | `tailscale up` |
| `npm run tailscale:serve` | `tailscale serve --bg 5173` |
| `npm run tailscale:status` | `tailscale serve status` |
| `npm run tailscale:url` | Prints `https://<machine>.<tailnet>.ts.net/` |
| `npm run tunnel` | Cloudflare quick tunnel to `http://localhost:5173` |
| `npm run tunnel:preview` | Cloudflare quick tunnel to `http://localhost:4173` |
| `npm run model:ktx2` | Rebuilds the KTX2/ETC1S apartment model |
| `npm run poster` | Regenerates the prologue poster and cut frames |
| `npm run smoke` | Legacy headless smoke test. It still asserts removed UI and will fail; do not use it as proof |

## Regenerating assets

The checked-in files work as-is. These steps are only needed when the source media changes.

**Apartment model.** `npm run model:ktx2` reads `assets/models/romconfort-source.glb`, converts its WebP textures to PNG, then encodes KTX2/ETC1S into `public/models/romconfort.glb`. It needs KTX-Software with `ktx` on `PATH`, or set `KTX_PATH` to the executable. Pass a quality value through npm:

```powershell
npm run model:ktx2 -- 192
```

The intermediate file goes to `.artifacts/romconfort-png.glb` and is deleted on success.

**Prologue poster and cuts.** `npm run poster` reads `public/media/prologue.mp4` and writes `public/media/prologue-poster.jpg` plus frames in `.artifacts/cuts/`. It drives a headless Chrome or Edge. Override the times or ports with environment variables:

```powershell
$env:POSTER_CUTS='0,2,4,6,8.3'
$env:BROWSER_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run poster
```

It also accepts `POSTER_TIME`, `POSTER_PORT`, and `POSTER_DEBUG_PORT`.

**Day content.** Days are bundled from `data/z*.json` (`src/game/days.ts`). Add `data/z22.json` and it becomes available to the runner automatically. Media paths in a day file are relative to `public/`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Ana answers with the recorded line | The live session did not start. Check the `[ana]` lines: `microphone denied` or `Microphone not available` means the mic or secure context failed; `connection failed (...)` carries the network or agent error. Use `localhost`/HTTPS, grant microphone access, and confirm the agent is public and has overrides enabled |
| No microphone prompt on the phone | The page is on plain HTTP. Use `adb reverse` (`http://localhost:5173`) or Tailscale/Cloudflare HTTPS |
| `WebXR cere HTTPS` | The origin is not secure. `localhost` and HTTPS are secure; a LAN IP is not |
| `WebXR lipsește din browser` / `WebXR fără immersive-vr` | The browser or headset does not expose `immersive-vr`. Use a WebXR-capable headset browser |
| `adb devices` shows `unauthorized` | Unlock the phone and accept the RSA prompt; revoke USB debugging authorizations and reconnect if it never appears |
| `npm run reverse:dev` says `adb` is not recognized | Install Android Platform Tools and add the folder to `PATH`, then reopen the terminal |
| Model stuck on the loading shell or 404 | Confirm `public/models/romconfort.glb` exists; rebuild it with `npm run model:ktx2`. The first load is about 100 MB and is cached per origin afterward |
| Tailscale URL loads nothing | The dev server is not on 5173. Free the port or change the `tailscale:serve` script to the actual port |
| `[media] Could not preload ...` warnings | Some optional clips are not produced yet; those assets load on demand and the scene continues |

## Project layout

```
index.html                 lobby markup
data/                      day files, z15.json through z21.json
assets/models/             romconfort-source.glb, the 93 MB source model
public/models/             romconfort.glb, the KTX2/ETC1S apartment
public/media/              prologue, voice, ambient, SFX, images, video loops
public/basis/, public/draco/   decoders used by Three loaders
src/main.ts                boot, lobby wiring, URL flags
src/app.ts                 render loop, camera rig, desktop/WebXR transitions
src/game/runner.ts         data-driven day runner and extension point
src/game/z17/              day-17 actions, Ana conversation, peephole helpers
src/game/z20/, src/game/z21/   later-day extensions
src/scene/                 room loader, prologue, interaction, reticle, hints
src/lobby/                 lobby markup wiring and styling
src/debug/                 free-fly camera and log relay/panel
src/input/desktop.ts       drag look and movement
src/xr/session.ts          WebXR support check and session start
scripts/                   model, poster, Tailscale, smoke helpers
```

## Known limits

- One seated viewpoint. WebXR headsets may track position, but the experience does not use locomotion beyond the authored transitions.
- The KTX2 apartment is about 100 MB on first download. It is cached in Cache Storage per origin and reused on later loads.
- ETC1S is the smaller KTX2 codec. Normal and metallic-roughness maps can look blocky up close; rebuild with UASTC if quality matters more than memory.
- The room has no collision and no baked lighting. Several point lights and a few transmission/clearcoat materials keep it expensive on phones.
- The prologue film is a reconstruction with diegetic sound, not archival footage and not a complete voiceover.
