# FEREASTRA — State machine (logic only)

VR experience for a phone in a Cardboard-style headset, built in JavaScript. The only input is gaze. Positions and coordinates come from the 3D apartment model; this document defines only the logic.

**Naming convention:** all identifiers (states, steps, positions, variables, file names, audio IDs) and all in-game text (dialogue, on-screen text, choice labels) are in Romanian and must be used exactly as written. Descriptions are in English.

---

# 1. General rules

## Interaction

- **Gaze is the only input.** A reticle sits at the center of the view. Active object + gaze held for **1.5 s** = activation. The reticle ring fills during those 1.5 s; looking away resets it.
- **ACTIVE object** = glows softly and reacts to gaze. **INACTIVE object** = no glow, no reaction at all.
- **Choice cards (bilețele)** activate with a **2 s** gaze. No time limit.
- **Head rotation is never locked.** The player can always look around.

## Scenes (locking)

A **scene** = any running sequence: dialogue, chained audio, close-up view (window / peephole / newspaper), choice, day transition.

- While a scene runs: **all other objects and movement are locked** (inactive).
- When the scene ends, objects return to their previous state.
- Only one scene runs at a time.

## Ringing objects (phone, door)

- When the phone or doorbell rings, the sound loops and **only that object is active**. Everything else is locked until the player answers.
- The door is activated by gazing at the front door (anywhere on it).

## Close-up views (fixed panel)

The window (fereastra), the peephole (vizor) and the newspaper (ziar) open a **close-up view**: 0.5 s fade to black → a large panel fixed in world space (NOT head-locked) in front of the player → fade to black → back in the room.

| View | Shows | How it closes |
|---|---|---|
| **Fereastra** | the day's image / video, framed by the window frame | automatically, after the duration given for each day |
| **Vizor** | round fisheye image / video | automatically, when the dialogue ends |
| **Ziar** | the front page image | player looks outside the panel for 2 s |

## Global variables

| Variable | Initial value | Changes |
|---|---|---|
| `zi` | 15 | at each calendar use |
| `film_ascuns` | false | true if on day 17 the player hides the film in the jar |
| `film_confiscat` | false | true on day 18 if `film_ascuns = false` |
| `a_dat_numele` | false | true if on day 18 the player picks „Nepotul doamnei Ana. Sorin." |

Other state (lighting, which steps of the day are done) is local to each day.

# 2. Movement

## Positions

| Position | Where |
|---|---|
| **P_SUF** | Living room (sufragerie), central point. All living room objects are visible from here. |
| **P_BUC** | Kitchen (bucătărie). |
| **P_BAIE** | Bathroom (baie), next to the bathtub (cada). Reachable only during step 17.4a. |

The bedroom (dormitor) has no position: its door is closed and inactive for the whole game.

## Transitions

- **P_SUF → P_BUC:** gaze 1.5 s at the marker in the kitchen doorway. Short fade (0.3 s), player appears at P_BUC.
- **P_BUC → P_SUF:** gaze 1.5 s at the marker in the doorway back to the living room.
- **P_SUF → P_BAIE:** gaze 1.5 s at the marker in the bathroom doorway. This marker is visible and active **only during step 17.4a**; otherwise the bathroom door is closed and inactive.
- **P_BAIE → P_SUF:** automatic only, at the end of step 17.4b (no return marker).
- Markers are active whenever **no scene is running and nothing is ringing**.
- Every new day starts at **P_SUF**, facing the window.

## Objects per position

| P_SUF | P_BUC | P_BAIE |
|---|---|---|
| Fereastra (window), Televizor (TV), Telefon (phone), Radio, Calendar, Ziar (newspaper), Ușa (front door), marker to kitchen, marker to bathroom (only in 17.4a) | Frigider (fridge), Borcan (jar on the pickle shelf), marker to living room | Cada (bathtub) |

Objects can only be activated from the position they belong to.

# 3. Startup

**S_START** — 2D screen, before the phone goes into the headset.
- „Începe" button (screen tap): requests microphone permission, device orientation permission (iPhone), unlocks audio, enters VR mode.
- **Demo only:** below „Începe", buttons „Ziua 15 … Ziua 22" to jump straight to a day (variables at default values).
- → **S_INTRO**

**S_INTRO** — scene.
- Black → title „FEREASTRA" → „Timișoara, decembrie 1989" → audio `Radu-replica1_deschidere` → fade in at P_SUF.
- On-screen text for 4 s: „Privește un obiect pentru a interacționa."
- → **Z15**

# 4. Days

Each day is a list of steps. **[O]** = mandatory, in the given order. **[OPT]** = optional, active from the start of the day until the calendar is used, can be repeated.
The **Calendar** becomes active only after the day's last mandatory step.

**Day transition (shared):** Calendar → paper tearing sound → black → end-of-day thought (voice or on-screen text, 4 s) → set next day's lighting → fade in at P_SUF → on-screen date text for 3 s.

---

## Z15 — Vineri, 15 decembrie · evening light

**Optional:** Ziar → `ziar_z15.jpg` · Frigider (P_BUC) → fridge door opens + on-screen text for 5 s: *„Câteva picioare de pui, un borcan de zacuscă, salam cu soia. Carnea bună pleca la export."*

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **15.1 [O]** | Radio | Europa Liberă broadcast (with static) → `Radu_replica2` | 15.2, after 3 s |
| **15.2 [O]** | Telefon (ringing) | Ioana → `Radu_replica3` → Ioana | 15.3, after 2 s |
| **15.3 [O]** | — (automatic) | All lights go off → `Radu_replica4`. Stays dark. | 15.4 |
| **15.4 [O]** | Fereastra | `img_piata_bezna` 5 s → `img_piata_noapte` 10 s. On exit, room lights come back on. | calendar active |
| **15.5** | Calendar | Transition. End of day: `Radu-replica5` | **Z16** |

During 15.3–15.4 (power cut), Radio and Televizor are inactive.

---

## Z16 — Sâmbătă, 16 decembrie · day → evening

**Optional:** Radio → Serbian station broadcast (16).

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **16.1 [O]** | Ușa (rings 3 s after day start) | Vizor: `ana_z16.mp4` + Ana's line → `Radu_replica7` | 16.2 |
| **16.2 [O]** | — (automatic) | Lighting fades to evening over 5 s. Then the phone rings. | 16.3 |
| **16.3 [O]** | Telefon (ringing) | Crowd noise + Ioana → `Radu_replica8` → busy tone | window active |
| **16.4 [O]** | Fereastra | `img_piata_cativaoameni` 15 s + distant chanting → `Radu_replica9` | calendar active |
| **16.5** | Calendar | Transition. End of day: `Radu-replica6` | **Z17** |

---

## Z17 — Duminică, 17 decembrie · afternoon → night

**Optional:** Televizor → `tv_17_populare.jpg` + cheerful folk music (plays on the TV screen itself while the player looks at it; not a close-up view).

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **17.1 [O]** | Fereastra | `img_piata_plina17` 8 s → tank tracks sound → `img_piata_tancuri_zi(17)` 8 s → camera shutter sound + on-screen text: *„Clic. Radu a fotografiat tancurile."* | 17.2, after 3 s |
| **17.2 [O]** | Ușa (insistent ringing) | **Conversation with the Ana agent** (see section 5). | 17.3 |
| **17.3 [O]** | — (automatic) | Lighting fades to night over 5 s. | window active |
| **17.4 [O]** | Fereastra | `video_piata_tancuri_noapte_17` 6 s → `video_piata_focuri_17` 8 s + gunfire getting closer → a very close flash + breaking glass sound → hard cut to black (no fade) | 17.4a |
| **17.4a [O]** | Only the bathroom marker, then Cada (P_BAIE) | Back at P_SUF, lights off, very close gunfire looping. Red on-screen text for the whole step: *„Se trage spre bloc! Ascunde-te în cadă!”*. All other objects and markers inactive. No time limit. | 17.4b |
| **17.4b [O]** | — (automatic) | Fade → camera lowered to the height of the bathtub rim, almost black. Gunfire becomes muffled + heavy breathing, **10 s**. Then 2 s of silence → on-screen text *„Împușcăturile s-au oprit. Ești în siguranță.”* for 3 s → fade → P_SUF, night lighting | 17.5, after 2 s |
| **17.5 [O]** | Ușa (fast knocking, looped) | Vizor: `vizor_hol_gol.jpg`. The door does NOT open. 3 lines from Ioana → footsteps on the stairs | 17.6 |
| **17.6 [O]** | Choice cards | **CHOICE 1** (below) | 17.7 or 17.8 |
| **17.7** | Kitchen marker, then Borcan (P_BUC) | Only if the player chose to hide the film. The jar glows. Gaze → lid sound + on-screen text *„Filmul e ascuns după castraveți."* → `film_ascuns = true` | calendar active |
| **17.8** | Calendar | Transition. End of day (on-screen text): *„Azi am auzit cum sună o armă adevărată. Nu seamănă cu filmele."* | **Z18** |

**CHOICE 1 — The film**

| Card | Effect |
|---|---|
| „Ascunde filmul în bucătărie." | Activates the kitchen marker and the jar. Calendar stays inactive until the film is hidden (17.7). |
| „Lasă-l în aparat." | `film_ascuns` stays false. Calendar becomes active immediately. |

---

## Z18 — Luni, 18 decembrie · day

**Optional:** Radio → Europa Liberă broadcast (18) · Ziar → `ziar_z18.jpg`.

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **18.1 [O]** | Fereastra | `img_piata_lumanari_18` 15 s + quiet singing, gunfire, silence | 18.2, after 3 s |
| **18.2 [O]** | Ușa (long ring + knocking) | Vizor: if `film_ascuns` → `video_agent_gol`; else → `video_agent_film` and set `film_confiscat = true`. Over the video: agent intro → variant line → the offer. Video holds on its last frame. | 18.3 |
| **18.3 [O]** | Choice cards (over the peephole view) | **CHOICE 2** | 18.4 |
| **18.4** | — (automatic) | Agent's reply → footsteps on the stairs → peephole view closes | calendar active |
| **18.5** | Calendar | Transition. End of day (on-screen text, depends on `a_dat_numele`) | **Z19** |

**CHOICE 2 — The agent**

| Card | Effect |
|---|---|
| „N-am văzut pe nimeni." | `a_dat_numele` stays false. Agent: „Însănătoșire grabnică…" |
| „Nepotul doamnei Ana. Sorin." | `a_dat_numele = true`. Agent: „Vedeți? Nu a fost greu…" |

End-of-day text:
- `a_dat_numele = false`: *„Am mințit un ofițer de Securitate. Mi-a tremurat vocea, dar am mințit."*
- `a_dat_numele = true`: *„Am spus un nume. Un singur nume. Măcar n-au întrebat de Ioana."*

---

## Z19 — Marți, 19 decembrie · day

**Optional:** Radio → Serbian station broadcast (19).

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **19.1 [O]** | Fereastra | `img_piata_doarsoldati_19` 10 s + wind | calendar active |
| **19.2** | Calendar | Transition. End of day (on-screen text): *„Muncitorii de la Elba au ieșit. Fabrica mea."* | **Z20** |

---

## Z20 — Miercuri, 20 decembrie · day

All day: crowd sound coming from the window direction, slowly getting louder.

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **20.1 [O]** | Telefon (rings after 3 s) | Ioana, with crowd in the background | window active |
| **20.2 [O]** | Fereastra | `video_piata_plinasidacia_20` looped for 20 s + crowd → shutter sound + on-screen text *„Clic. Radu a fotografiat piața plină."* | calendar active |
| **20.3** | Calendar | Transition. End of day (on-screen text): *„La televizor ne zic huligani. Huliganii eram noi. Jumătate de oraș."* | **Z21** |

---

## Z21 — Joi, 21 decembrie · day

**Optional:** Radio → Europa Liberă broadcast (21).

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **21.1 [O]** | Televizor | On the TV screen: `tv_21_miting.mp4` → cuts out → `tv_purici.mp4` looped (stays like this for the rest of the day) | window active |
| **21.2 [O]** | Fereastra | `img_piata_grupuristeaguri_21` 12 s + calmer crowd | calendar active |
| **21.3** | Calendar | Transition. End of day (on-screen text): *„Pentru prima dată, toată țara a râs de el. În același timp."* | **Z22** |

---

## Z22 — Vineri, 22 decembrie · day

**Optional:** Televizor → `tv_22_libera.jpg` · Ziar → `ziar_z22.jpg`.

| Step | Active object | What happens | Goes to |
|---|---|---|---|
| **22.1 [O]** | Radio | Radio România broadcast: „Dictatorul a fugit!…" | 22.2, after 3 s |
| **22.2 [O]** | Ușa (rings) | Vizor: `ana_z22.mp4` + Ana's line | window active |
| **22.3 [O]** | Fereastra | `img_piata_22_steagin geam` 15 s + bells, crowd | **FINAL** (no calendar) |

# 5. Ana agent conversation (step 17.2)

ElevenLabs conversational agent, JavaScript SDK `@elevenlabs/client`, day-17 prompt override.

| State | What happens | Goes to |
|---|---|---|
| **A_CONECTARE** | Peephole view opens with `ana_z17_asculta.mp4` looped. Agent session starts. Microphone icon appears. | A_ACTIV or A_REZERVA |
| **A_ACTIV** | Agent speaking → `ana_z17_vorbeste.mp4` looped; agent listening → `ana_z17_asculta.mp4` looped (switch on the SDK's mode change). Her lines shown as subtitles at the bottom. | A_SFARSIT |
| **A_REZERVA** | If the connection fails: `ana_z17_vorbeste.mp4` + pre-generated fallback line. | A_SFARSIT |
| **A_SFARSIT** | Session ends, icon disappears, peephole view closes. | step 17.3 |

**Exit conditions from A_ACTIV** (whichever comes first):
- the agent ends the conversation itself;
- **90 s** have passed;
- the player looks outside the peephole view for **3 s**.

# 6. Ending

Evaluated in this order (first true condition wins):

| Order | Condition | Ending |
|---|---|---|
| 1 | `a_dat_numele = true` | **DOSARUL** |
| 2 | `film_ascuns = true` | **MARTORUL** |
| 3 | otherwise (`film_confiscat = true`) | **FEREASTRA** |

**Ending sequence:** black → ending text (2 lines, 5 s each) → dedication (6 s) → credits → on-screen text „Privește aici pentru a juca din nou" (active) → **S_START** with variables reset.

Ending texts:
- **DOSARUL:** *„În 2005, Radu și-a cerut dosarul de la Securitate. Pe o pagină era o declarație despre Sorin. Semnată de el."* / *„Doamna Ana n-a aflat niciodată."*
- **MARTORUL:** *„Fotografiile lui Radu au fost publicate în ianuarie 1990."* / *„Una dintre ele a ajutat o familie să afle ce s-a întâmplat cu fiul lor."*
- **FEREASTRA:** *„Radu n-a mai avut nicio fotografie din acele zile. Doar fereastra."* / *„Cei mai mulți oameni au trăit Revoluția așa: de după o perdea, cu frică și cu speranță."*
- **Dedication (all):** *„În memoria celor care și-au pierdut viața în Timișoara, în decembrie 1989."*

# 7. Lighting per day

| Day | Lighting at start | Changes |
|---|---|---|
| 15 | evening | 15.3: total darkness; restored when leaving the window view (15.4) |
| 16 | day | 16.2: fades to evening |
| 17 | afternoon | 17.3: fades to night |
| 18–21 | day | — |
| 22 | day | — |

# 8. Ambient sound

- **Whole game, at P_SUF:** wind at the window, wall clock ticking.
- **At P_BUC:** fridge hum.
- **15.3–15.4:** clock and fridge stop (power cut), resume with the lights.
- **17.4a:** very close gunfire, looping, from the window direction.
- **17.4b (in the bathtub):** the same gunfire, muffled (low-pass filter), + heavy breathing.
- **Z20:** crowd from the window direction, slowly getting louder.
- **Z22:** distant church bells from the window direction.
