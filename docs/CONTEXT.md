# FEREASTRA — Full project context for the coding assistant

This file collects every decision made during design that the code needs to know. Read it together with:

- `docs/fereastra-state-machine-EN.md` — the game logic (states, steps, choices, endings). **Primary source for logic.**
- `docs/fereastra-storyline-demo.md` — the Romanian script: exact dialogue and on-screen text. **Primary source for text.**

Where this file adds something the state machine does not cover (TV, passive window images, intro video, Ana's video loops), this file is the reference.

**Naming rule:** identifiers, asset names and all in-game text are in **Romanian** and must be used exactly as written. Code and comments can be in English.

---

## 1. The project

- **Event:** UNIHACK 2026, Immersive Arts track, Timișoara. 48-hour hackathon. There is a separate prize for best use of **ElevenLabs**, so ElevenLabs usage should be clearly visible.
- **Concept:** first-person VR. The player is **Radu Petrescu**, 34, engineer at the Elba factory, home with a broken leg (on crutches), in an apartment overlooking Opera Square (Piața Operei) in Timișoara, 15–22 December 1989. He experiences the Revolution only through the window, radio, TV, phone, newspaper and neighbors at the door.
- **Characters (none are 3D-animated):**
  - **Radu** — the player; voice for narration and short lines.
  - **Ioana** — Radu's sister, 20, student. Never enters the apartment. Only on the phone or behind the closed front door.
  - **Doamna Ana** — elderly neighbor. Seen only through the peephole (video). Her grandson **Sorin** goes missing on 17 Dec and never returns, in every ending.
  - **Agentul de Securitate** — secret police officer, seen only through the peephole (video), day 18.
  - **Radio voices:** Radio România (state), Europa Liberă (foreign, with static), postul sârbesc (Serbian station, speaks Serbian, needs Romanian subtitles).
- **Choices:** 2 (hide the film on day 17, lie or give a name on day 18). **Endings:** 3 (DOSARUL, MARTORUL, FEREASTRA).

## 2. Platform and hard constraints

- **Hardware:** a phone inside a Cardboard-style headset. **No controllers, no buttons.** Gaze is the only input.
- **Runtime:** browser, plain JavaScript. Must work on Android Chrome and, ideally, iPhone Safari.
  - iPhone Safari has no WebXR for VR. Do **not** depend on WebXR. Use **side-by-side stereo rendering** (e.g. Three.js `StereoEffect`, or A-Frame's Cardboard mode) with camera rotation driven by **device orientation**.
  - A-Frame already includes a gaze cursor with dwell (`cursor="fuse: true"`) and is the fastest option. Three.js gives more control. Use whichever the project already uses.
- **HTTPS is mandatory** (microphone and orientation sensors only work on HTTPS). Deploy to GitHub Pages / Vercel / Netlify for phone testing, not a LAN `http://` address.
- **Start screen (2D, before the headset):** one big „Începe" button. On tap it must, inside the same user gesture:
  1. resume/unlock the `AudioContext`;
  2. request device orientation permission (`DeviceOrientationEvent.requestPermission()` on iOS);
  3. request microphone permission (`getUserMedia({audio:true})`) for the Ana agent;
  4. enter fullscreen / stereo mode.
  - **Demo shortcut:** below „Începe", buttons „Ziua 15" … „Ziua 22" that jump directly to a day with default variables. Judges will try 5–10 minutes at most; jumping to day 17 or 18 must be instant.
- **Headphones are expected** (spatial audio, and so the Ana agent does not hear itself through the speaker).
- **Performance:** phones overheat. Keep a steady frame rate: bake lighting, low-poly model, compressed textures (sizes 512/1024/2048), few real-time lights, load assets **per day**, not all at once.
- **Comfort:** no camera motion the player didn't cause. Close-up panels are fixed in world space, **never head-locked**. Movement between positions uses a short fade (0.3 s).

## 3. Gaze system (build this first)

- Raycast from the camera center every frame.
- Reticle at the center; a ring fills over **1.5 s** while gazing at an **active** object; looking away resets it.
- **Choice cards:** 2 s dwell.
- Each interactable object has: `onGazeEnter`, `onGazeExit`, `onActivate`, and an `active` flag. Active objects glow softly (emissive pulse or outline). Inactive objects do nothing.
- **Global scene lock:** while a scene runs (dialogue, close-up, choice, day transition), all other objects and markers are inactive. Head rotation is never locked.
- **Ringing objects** (phone, door): loop the ring sound; only that object is active until answered.
- Add a **desktop mouse-look mode** (click-drag or pointer lock) so the team can test without a headset.

## 4. The 3D model (Blender → glTF/GLB)

The colleague building the model should expose named objects so code can find them with `scene.getObjectByName(...)`. Suggested names:

| Name | What |
|---|---|
| `fereastra` | the window (gaze target) |
| `ecran_fereastra` | a plane behind the glass showing the day's passive image (16:9 UVs) |
| `televizor` / `ecran_tv` | TV body (gaze target) / its screen plane (4:3 UVs) |
| `telefon`, `radio`, `calendar`, `ziar` | gaze targets in the living room |
| `usa_intrare` | front door (gaze target, peephole interaction) |
| `frigider`, `borcan` | kitchen: fridge, pickle jar on the shelf |
| `cada` | bathtub (bathroom) |
| `marcaj_bucatarie`, `marcaj_sufragerie`, `marcaj_baie` | doorway markers for movement |
| `poz_P_SUF`, `poz_P_BUC`, `poz_P_BAIE` | empties marking player positions (eye height ~1.6 m; `P_BAIE` camera goes lower, to tub-rim height, during step 17.4b) |

glTF does **not** carry video textures; videos are applied in code (`THREE.VideoTexture`) onto the named planes.

## 5. Close-up views

Window, peephole and newspaper open a **close-up panel**: fade to black 0.5 s → large panel in world space in front of the player → content → fade back.

- **Window panel:** 16:9, with the window frame already drawn into the images/videos.
- **Peephole panel:** circular, fisheye content with black edges (the effect is baked into the media, or done in code with a circular mask + barrel distortion shader so all peephole media match).
- **Newspaper panel:** the front-page image; closes when the player looks outside the panel for 2 s.

## 6. Window: passive image vs. close-up

The window has two states:

1. **Passive** (just looking around the room): `ecran_fereastra` behind the glass shows the day's static image, slightly dimmed/blurred.
2. **Close-up** (1.5 s gaze on the window): the panel shows the day's **video** (or the same image if no video exists yet) with the window soundscape.

| Day | Passive image | Close-up content |
|---|---|---|
| 15 | `img_piata_noapte`; during power cut `img_piata_bezna` | `bezna` 5 s → `noapte` 10 s |
| 16 | `img_piata_cativaoameni` | `cativaoameni` 15 s |
| 17 afternoon | `img_piata_plina17` | `plina17` 8 s → `tancuri_zi(17)` 8 s; passive switches to `tancuri_zi` |
| 17 night | `img_piata_tancuri_noapte(17)` (switches at step 17.3) | `tancuri_noapte` 6 s → `video_piata_focuri_17` 8 s → hard cut (see 17.4) |
| 18 | `img_piata_lumanari_18` | 15 s |
| 19 | `img_piata_doarsoldati_19` | 10 s |
| 20 | `img_piata_plina_20` | `video_piata_plinasidacia_20` looped, 20 s |
| 21 | `img_piata_grupuristeaguri_21` | 12 s |
| 22 | `img_piata_22_steagin geam` | 15 s, then the ending |

**File names:** some team files contain spaces and parentheses (e.g. `img_piata_tancuri_noapte(17)`, `img_piata_22_steagin geam`). Rename on import to safe names (e.g. `img_piata_tancuri_noapte_17.jpg`, `img_piata_22_steagingeam.jpg`) and keep a mapping in one config file. Videos for the window are named `video_` + image name.

If a video is missing, fall back to the static image. Videos are 1280×720 MP4, **muted**, looped.

## 7. TV behaviour per day

The TV is "always on". Days without content show static. Static TV images play **on the TV screen itself**, not as a close-up.

| Day | Behaviour |
|---|---|
| 15 | `tv_purici.mp4` loop + soft hiss. Off during the power cut (15.3–15.4), back with the lights. Inactive. |
| 16 | static. Inactive. |
| 17 | static; **optional**: on gaze, `tv_17_populare.jpg` + cheerful folk music while gazed at, back to static when the player looks away. After 17.3 (night) the TV is off. |
| 18, 19 | static. Inactive. |
| 20 | static. *Optional, only if time:* after the window step, the TV turns itself on (click + hiss) with `tv_20_discurs.jpg` + muffled speech sound; gaze makes it louder ~10 s. |
| 21 | **mandatory** (step 21.1): turns itself on and glows at day start; on gaze `tv_21_miting.mp4` → hard cut → `tv_purici.mp4` for the rest of the day. |
| 22 | static; after step 22.1 the TV turns itself on with `tv_22_libera.jpg` + crowd/applause; **optional** gaze raises the sound ~10 s. |

An old-CRT effect (scanlines, flicker, slight curvature) can be applied in a shader to everything shown on the TV.

## 8. Audio

- **All audio is separate from video.** Videos are muted (autoplay with sound fails on phones when not triggered by a tap).
- **Format:** MP3, mono for anything positional, normalized. Short ambient loops may be WAV to avoid MP3 gap clicks.
- **Folders:** `audio/voce/`, `audio/sfx/`, `audio/ambient/`.
- **Positional audio** (Web Audio / `THREE.PositionalAudio`, HRTF): radio, TV, phone, door, window soundscapes come from their object's position. Voices behind the door come from the door. Window crowd sound stays audible (quieter) in the room after closing the close-up.
- **Radio effect:** radio and phone voices are band-passed (~300–3500 Hz). Europa Liberă has a shortwave static bed under it. The Serbian station has static and short signal dropouts, and **shows Romanian subtitles**.
- **Bathtub (17.4b):** the gunfire loop gets a low-pass filter (muffled) + heavy breathing.
- **Ambience:** living room: wind at the window, wall clock. Kitchen: fridge hum. Clock and fridge stop during the power cut on day 15. Day 20: crowd from the window direction, slowly getting louder. Day 22: distant church bells.
- **Voice file names:** Radu's lines are named by the team like `Radu-replica1_deschidere`, `Radu_replica2_daca aude cineva, sa auda` … `Radu_replica9_16dec_Libertate...`. Map them to safe IDs in config, same as images. The storyline document says which replica plays where.

### What's recorded vs. still to generate
- **Done:** all Radu lines (replica 1–9), all Ioana lines.
- **Still to generate:** Doamna Ana (16, day-17 fallback, 22), Agentul de Securitate (6 lines), Europa Liberă (15, 18, 21), postul sârbesc (16, 19), Radio România (22).
- Code must tolerate missing files (log and skip, show subtitle only) so the build never breaks during the hackathon.

## 9. Subtitles and on-screen text

- **Rendered by code**, never baked into videos.
- Subtitles: lower part of the view, following the head with slight lag (smooth), readable size for phone VR, dark semi-transparent background.
- Show a subtitle for every voice line for the duration of its audio. Serbian radio lines show the Romanian translation.
- On-screen texts (dates, „Clic. Radu a fotografiat…", „Se trage spre bloc! Ascunde-te în cadă!" in red, end-of-day thoughts, endings, dedication) come from the storyline document.
- Keep all text in one data file (e.g. `data/texte.json` or per-day JSON) so it can be edited without touching logic.

## 10. Intro

1. Start screen (see §2).
2. `intro_video.mp4` (Radu's life before: factory, ration queue, empty fridge, radio, power cut and crutches). Planned to be slowed to ~20 s with Radu's voice-over narration on top (separate audio file).
3. Black: title „FEREASTRA" → „Timișoara, decembrie 1989".
4. `Radu-replica1_deschidere`.
5. Fade in at `P_SUF`; text „Privește un obiect pentru a interacționa." 4 s → day 15.

## 11. Peephole videos

All peephole media: circular fisheye, dark stairwell, muted.

| File | Use |
|---|---|
| `ana_z16.mp4` | day 16, plays together with Ana's fixed line |
| `ana_z17_asculta.mp4` / `ana_z17_vorbeste.mp4` | day 17 agent conversation, seamless loops (see §12) |
| `ana_z22.mp4` | day 22, Ana with a candle, plays with her fixed line |
| `vizor_hol_gol.jpg` | day 17, Ioana knocks: the hallway looks empty (she is pressed against the door) |
| `video_agent_film.mp4` / `video_agent_gol.mp4` | day 18, ~10 s; choose by `film_ascuns`; hold the last frame while choice cards are shown |

## 12. Doamna Ana — ElevenLabs conversational agent (day 17, step 17.2)

The only live AI interaction, and the centerpiece for the ElevenLabs prize.

- **SDK:** `@elevenlabs/client` (`Conversation.startSession`). Works from plain JS / CDN ESM.
- **Agent:** already created in the ElevenLabs dashboard (Romanian, Ana's custom voice). Needs **overrides enabled** in the agent's Security settings for system prompt and first message.
- **Auth:**
  - Quick (hackathon): public agent, `agentId` only. Never ship an ElevenLabs **API key** in client code.
  - Correct: a tiny serverless function (Vercel/Netlify) that holds the API key and returns a conversation token; the client passes the token to `startSession`.
- **Video sync:** both loops play continuously; switch which one is shown on the peephole panel via `onModeChange` (`speaking` → `ana_z17_vorbeste`, otherwise `ana_z17_asculta`). Lips are not exactly synced; the small fisheye peephole hides it.
- **Subtitles:** from `onMessage` when the source is the AI.
- **Exit conditions** (any): agent ends the call, **90 s** timer, player looks outside the peephole for **3 s** → call `endSession()`. All paths converge in `onDisconnect` → stop videos, hide subtitles, close peephole, go to step 17.3.
- **Fallback:** if `startSession` throws or `onError` fires: show `ana_z17_vorbeste`, play the pre-generated fallback line, then close.
- **Mic icon** visible while the session is live.

Pattern:

```javascript
import { Conversation } from "@elevenlabs/client";

const vVorbeste = makeVideo("video/ana_z17_vorbeste.mp4");
const vAsculta  = makeVideo("video/ana_z17_asculta.mp4");
function makeVideo(src) {
  const v = document.createElement("video");
  Object.assign(v, { src, muted: true, loop: true, playsInline: true, crossOrigin: "anonymous" });
  return v;
}
const texVorbeste = new THREE.VideoTexture(vVorbeste);
const texAsculta  = new THREE.VideoTexture(vAsculta);

let conv = null, maxTimer = null;

async function startAna() {
  vVorbeste.play(); vAsculta.play();
  openPeephole(texAsculta);
  try {
    conv = await Conversation.startSession({
      agentId: AGENT_ID, // or conversationToken from the serverless function
      overrides: {
        agent: {
          prompt: { prompt: PROMPT_BAZA + "\n\n" + PROMPT_Z17 },
          firstMessage: "Radule… Sorin n-a venit. L-ai văzut de la geam?",
          language: "ro",
        },
      },
      onModeChange: ({ mode }) => setPeepholeTexture(mode === "speaking" ? texVorbeste : texAsculta),
      onMessage: (m) => { if (m.source === "ai") showSubtitle(m.message); },
      onDisconnect: () => endAna(),
      onError: () => fallbackAna(),
    });
    maxTimer = setTimeout(() => conv?.endSession(), 90_000);
  } catch { fallbackAna(); }
}
function endAna() {
  clearTimeout(maxTimer); conv = null;
  vVorbeste.pause(); vAsculta.pause();
  hideSubtitle(); closePeephole(); goToStep("17.3");
}
function fallbackAna() {
  setPeepholeTexture(texVorbeste);
  playVoice("ana_z17_rezerva", () => endAna());
}
// in the render loop: gaze outside the peephole panel for 3 s → conv?.endSession()
```

Check the current SDK docs for exact option names; they change between versions.

### Base prompt (`PROMPT_BAZA`, Romanian, used as-is)

```
Ești Doamna Ana Mureșan, 71 de ani, pensionară, fostă croitoreasă din Timișoara. Locuiești în blocul din centru, cu fereastra spre Piața Operei, pe același palier cu Radu Petrescu, 34 de ani, inginer la Elba, care are piciorul în ghips. Îl știi de ani de zile, îi duci de mâncare. Sora lui, Ioana, e studentă. Nepotul tău, Sorin, 19 ani, stă cu tine. Ești în decembrie 1989. Vorbești cu Radu.

CUM VORBEȘTI
- Română colocvială, cu câteva cuvinte bănățene: „no", „amu", „mânca-te-ar mama", „maică".
- Răspunsuri SCURTE: maxim două propoziții. E o conversație între vecini, nu un monolog.
- Caldă și maternă cu Radu. Emoțiile tale depind de zi.
- Despre politică vorbești doar în șoaptă și ocolit, de frica Securității.

REGULI STRICTE
- Știi DOAR ce poate ști o pensionară din Timișoara în ziua curentă. Nu știi ce se va întâmpla mâine.
- Nu inventa nume de persoane reale, cifre de morți sau răniți, sau detalii istorice precise. Când nu știi: „Zice lumea că…" sau „Nu știu, maică, nu ne spune nimeni nimic."
- Nu ieși niciodată din rol. Dacă ți se vorbește despre lucruri din viitor (telefoane mobile, internet, inteligență artificială), ești nedumerită și schimbi vorba.
- Nu descrie violență în detaliu.
- Nu știi și nu afli niciodată ce s-a întâmplat cu Sorin.
- Dacă Radu e nepoliticos sau vorbește urât, te superi și spui „No, eu mă duc.", apoi închei conversația.
- Dacă Radu își ia la revedere, îți iei și tu la revedere scurt și închei conversația.
```

### Day 17 section (`PROMPT_Z17`)

```
ZIUA 17 DECEMBRIE, seara. Ești disperată. Sorin a plecat după-amiază „doar până în centru, să vadă" și nu s-a întors. Ai auzit împușcături. Nu știi ce să faci. Întrebi întruna dacă Radu a văzut ceva de la geam. Plângi, te liniștești puțin, apoi iar te sperii.
```

## 13. Game state and endings (summary)

Variables: `zi`, `film_ascuns`, `film_confiscat`, `a_dat_numele` (see the state machine). Ending order: `a_dat_numele` → **DOSARUL**; else `film_ascuns` → **MARTORUL**; else → **FEREASTRA**. Then dedication, credits, „Privește aici pentru a juca din nou" → back to start with variables reset.

Recommended architecture:
- `gameState` object (variables + current day/step).
- One data file per day (`data/z15.json` …) describing steps, active objects, media, texts, and transitions, so content can change without code changes.
- A small step runner that executes the current step, locks/unlocks objects, and advances on completion.
- `resolveEnding()` with the three ifs.

## 14. Build order (priority)

1. Start screen + stereo + orientation + gaze reticle working **on a phone over HTTPS**.
2. Movement between `P_SUF` and `P_BUC` (and `P_BAIE` for 17.4).
3. Step runner + day data + calendar transition, with day 15 complete.
4. Days **17 and 18** complete (choices, kitchen jar, bathtub, agent videos, endings logic).
5. Day 22 + endings.
6. Ana agent (with fallback).
7. Days 16, 20, then 19, 21.
8. TV extras, newspaper, fridge.
9. Polish: subtitles, CRT shader, audio mix.

**If time runs out, cut in this order:** TV extras → newspaper → fridge → day 19 → day 21. **Never cut days 17 and 18** (choices and endings live there).

## 15. Historical and ethical rules

- The characters are fictional; the events are real. Violence is shown through sound and aftermath, never graphically.
- No real person's voice is cloned. Archival TV footage of the Bucharest rally is used only as a short clip on the TV.
- Sorin never returns in any ending. The FEREASTRA ending does not judge the player for being afraid.
- Keep a credits list of every downloaded sound/image with its source and license.
