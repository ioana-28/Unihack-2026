# Fereastra — Timișoara 1989 (UNIHACK 2026, Immersive Arts)

First-person VR experience for phone-based (Cardboard-style) headsets, running in the browser with JavaScript. The player is Radu, an engineer with a broken leg, living in an apartment overlooking Opera Square in Timișoara during the Revolution (15–22 December 1989). He follows events through the window, radio, TV, phone, newspaper and neighbors at the door.

## Source of truth

- **`docs/fereastra-state-machine-EN.md`** — the full game logic: positions, objects, steps per day, choices, variables, the ElevenLabs agent conversation, endings, lighting and ambient sound. Implement the game from this file.
- **`docs/fereastra-storyline-demo.md`** — the story script in Romanian: exact dialogue, on-screen texts and asset file names per day.

If the two disagree, the state machine wins for logic and the storyline wins for text.

## Key constraints

- **Gaze is the only input.** Reticle in the center; 1.5 s dwell on active objects, 2 s on choice cards. No controllers, no free locomotion: the player moves between fixed positions (`P_SUF`, `P_BUC`, `P_BAIE`) via doorway markers.
- **Runs on phones** in a browser, over HTTPS. A start screen with a tap button must unlock audio, request microphone and device orientation permissions, then enter VR.
- **Close-up views** (window, peephole, newspaper) are panels fixed in world space, never head-locked.
- **Videos are muted** (`muted`, `playsInline`, `loop`). All audio is separate and played from code.
- **Subtitles and on-screen text are rendered by code**, never baked into videos.
- **Doamna Ana** (day 17) is a live ElevenLabs conversational agent via `@elevenlabs/client`, with a pre-generated fallback line if the connection fails. Never put an ElevenLabs API key in client code.

## Naming

All identifiers (states, steps, variables, positions), asset file names and in-game text are in **Romanian** and must be used exactly as written in the docs. Code comments and descriptions can be in English.

## Assets (expected layout)

```
audio/voce/   audio/sfx/   audio/ambient/
video/        img/
```

Asset file names are listed in the storyline and state machine documents.
