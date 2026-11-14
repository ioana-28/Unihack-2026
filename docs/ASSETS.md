# Assets

All media lives in `public/` under safe ASCII names (no spaces, no parentheses). This table maps each file to the step that uses it and to the team's original file name.

When you add a new file, rename it to the scheme below and add a row here.

## Naming scheme

- Voices: `<speaker>_<day>[_<letter>]` (`ioana_z15_a`, `ana_z17_rezerva`). Radu keeps the numbering from the storyline (`radu_replica1` … `radu_replica9`).
- Radio: `radio_<station>_<day>` with `europa`, `sarb`, `romania`.
- Window media: the names from the docs, with `(17)` becoming `_17` and spaces removed.
- Videos have no audio track. Sound is always played from code.

## Voice (`public/audio/voce/`)

| File | Used in | Original name |
|---|---|---|
| `radu_intro.mp3` | intro, voice-over on `intro_video` | `replica radu intro.mp3` |
| `radu_replica1.mp3` | intro, after the title | `Radu-replica1_deschidere.mp3` |
| `radu_replica2.mp3` | 15.1, after Europa Liberă | `Radu-replica2_daca aude cineva,sa auda.mp3` |
| `radu_replica3.mp3` | 15.2, phone | `Radu_replica3_Ioana,nu la telefon.mp3` |
| `radu_replica4.mp3` | 15.3, power cut | `Radu-replica4_Iar s-a luat curentul.mp3` |
| `radu_replica5.mp3` | 15.5, end of day | `Radu-replica5_15 decembrie,Ioana vb prea tare.mp3` |
| `radu_replica6.mp3` | 16.5, end of day | `Radu-replica6_16 decembrie, mi a fost frig.mp3` |
| `radu_replica7.mp3` | 16.1, after Ana | `Radu_replica7_16dec_spunetii sa stea acasa.mp3` |
| `radu_replica8.mp3` | 16.3, phone | `Radu_replica8_16dec_ioana du te acasa.mp3` |
| `radu_replica9.mp3` | 16.4, window | `Radu_replica9_16dec_Libertate....mp3` |
| `ioana_z15_a.mp3` | 15.2 „Radule! Ce faci, invalidule?…" | `Ioana_replica1_Radule,ce faci invalidule.mp3` |
| `ioana_z15_b.mp3` | 15.2 „Of, iar începi…" | `Ioana_replica2_Of,iar incepi.mp3` |
| `ioana_z16.mp3` | 16.3 „Radule! Sunt aici!…" | `Ioana_replica3_Sunt aici, striga impotriva lui.mp3` |
| `ioana_z17.mp3` | 17.5, all 3 lines behind the door (11.4 s) | `Ioana_replica4_ascunde filmul.mp3` |
| `ioana_z20.mp3` | 20.1 „Radule, uită-te pe geam!…" | `Ioana_replica5_suntem oras liber.mp3` |
| `ana_z16.mp3` | 16.1 | `Vecina_replica1_Sorin vrea sa mearga.mp3` |
| `ana_z17_rezerva.mp3` | 17.2 fallback (A_REZERVA) | `Vecina-REZERVA_replica2_sorin n a venit acasa.mp3` |
| `ana_z22.mp3` | 22.2 | `Vecina_replica3_Am pus o lumanare.mp3` |
| `agent_intro.mp3` | 18.2 „Bună ziua, tovarășe Petrescu…" (9.6 s) | `agentsec-repl1.mp3` |
| `agent_nesortat_2.mp3` | **to sort** (5.3 s) | `agentsec-rep2.mp3` |
| `agent_nesortat_3.mp3` | **to sort** (4.9 s) | `agentsec-rep3.mp3` |
| `agent_nesortat_4.mp3` | **to sort** (4.6 s) | `agentsec_rep4.mp3` |
| `agent_nesortat_5.mp3` | **to sort** (4.7 s) | `ElevenLabs_2026-11-14T20_29_16_agent securitate_gen_s50_sim75_v4.mp3` |
| `radio_europa_z15.mp3` | 15.1 | `RadioEU-replica1-informatii noi.mp3` |
| `radio_europa_z18.mp3` | Z18 optional | `RadioEU-replica2-s-a deschis focul.mp3` |
| `radio_europa_z21.mp3` | Z21 optional | `RadioEU-replica3-revolta bucuresti.mp3` |
| `radio_romania_z22.mp3` | 22.1 „Dictatorul a fugit!" | `RadioEU-replica4-va vorbim liberi.mp3` |
| `radio_sarb_z16.mp3` | Z16 optional | `radiosarbesc 16 dec.mp3` |
| `radio_sarb_z19.mp3` | Z19 optional | `radiosarbesc 19 dec.mp3` |

The agent needs 5 lines after the intro: `agent_film`, `agent_gol`, `agent_propunere`, `agent_raspuns_minciuna`, `agent_raspuns_nume`. There are 4 unsorted files, so **one line is still missing**. Listen to each one and rename it.

## Sound effects (`public/audio/sfx/`)

| File | Used in | Source |
|---|---|---|
| `sonerie.mp3` | door rings (16.1, 17.2, 18.2, 22.2) | Freesound 500217, urupin |
| `usa_bataie.mp3` | 17.5 fast knocking, 18.2 | Freesound 256513, hunter4708 |
| `telefon_suna.mp3` | phone rings | Freesound 629201, audacitier |
| `hartie_rupta.mp3` | calendar transition | Freesound 489968, falcospizaetus |
| `declansator.mp3` | 17.1, 20.2 shutter | Freesound 745482, artem_uanety |
| `impuscatura.mp3` | 17.4 single close shot | Freesound 511960, neoxygen |
| `rafale.mp3` | 17.4 / 17.4a / 17.4b gunfire loop (5 s) | ElevenLabs SFX |
| `senile.mp3` | 17.1 tank tracks | ElevenLabs SFX |

## Ambience (`public/audio/ambient/`)

| File | Used in | Source |
|---|---|---|
| `vant.mp3` | whole game at P_SUF (first 120 s of the original) | `sunet_vant.wav` |
| `ceas.mp3` | whole game at P_SUF, stops 15.3–15.4 | `sunet_ceas.mp3` |
| `clopote.mp3` | Z22 bells | Freesound 480014, craigsmith |
| `scandari_z16.mp3` | 16.4 distant chanting (archive) | YouTube CVnmiZBCjuI „Azi în Timișoara, mâine-n toată țara!" |
| `multime_z20.mp3` | 20.2 crowd and chanting (archive) | YouTube MLWtqAr8WWU „Nu suntem huligani!" |

## Video (`public/video/`, all muted)

| File | Used in | Original name |
|---|---|---|
| `intro_video.mp4` | intro | `intro_video.mp4` |
| `ana_z16.mp4` | 16.1 peephole | `vecina_replica1_sorin vrea sa vada.mp4` |
| `ana_z17_asculta.mp4` | 17.2 agent listening (4 s loop) | `vecina_agent_listen.mp4` |
| `ana_z17_vorbeste.mp4` | 17.2 agent speaking (4 s loop) | `vecina_agent_talk.mp4` |
| `ana_z22_a.mp4` | 22.2 „Radule… a fugit!" | `vecina_replica3_radule a fugit.mp4` |
| `ana_z22_b.mp4` | 22.2 „Am pus o lumânare…" (plays after `_a`) | `vecina_replica3_am pus o lumanare.mp4` |
| `video_piata_plina17.mp4` | 17.1 window (full square, tanks arrive) | `vedere_geam_17dec cu sunet.mp4` |
| `video_piata_tancuri_noapte_17.mp4` | 17.4 window, first part | `ElevenLabs_video_google-veo-3-1-fast_…mp4` |
| `video_piata_cativaoameni.mp4` | 16.4 window. **Check:** identified from one frame; the original is 2.44:1, not 16:9 | `ElevenLabs_video_seedance-2-5_…mp4` |
| `video_piata_plinasidacia_20.mp4` | 20.2 window | `video_piata_plinasidacia_20.mp4` |

## Images (`public/img/`, max 2048 px wide)

`img_piata_bezna`, `img_piata_noapte`, `img_piata_cativaoameni`, `img_piata_plina17`, `img_piata_tancuri_zi_17`, `img_piata_tancuri_noapte_17`, `img_piata_lumanari_18`, `img_piata_doarsoldati_19`, `img_piata_plina_20`, `img_piata_grupuristeaguri_21`, `img_piata_22_steagingeam`. All are `.jpg`; the names are the docs' names made safe.

## Still missing

- **Video:** `video_piata_focuri_17` (17.4, required), `video_agent_film`, `video_agent_gol` (18.2, required), `tv_purici`, `tv_21_miting`.
- **Images:** `vizor_hol_gol` (17.5, required), `ziar_z15`, `ziar_z18`, `ziar_z22`, `tv_17_populare`, `tv_22_libera`.
- **Voice:** 1 of the agent's lines (see above).
- **Sound effects:** glass breaking (17.4), heavy breathing (17.4b), footsteps on the stairs (17.5, 18.4), jar lid (17.7), fridge door, phone busy tone (16.3), TV hiss, light switch / power cut click.
- **Ambience:** fridge hum, folk music (Z17 TV, optional).
- **Licenses:** confirm the license of each Freesound file and the two YouTube archive clips for the credits screen.
