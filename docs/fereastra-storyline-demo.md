---
title: "FEREASTRA — Storyline demo"
subtitle: "Timișoara, 15–22 decembrie 1989 · UNIHACK, Immersive Arts"
---

# Camerele

| Cameră | Obiecte |
|---|---|
| **Sufrageria** | Fereastra, televizorul, telefonul, radioul, calendarul, ziarul, ușa de la intrare (cu vizor) |
| **Bucătăria** | Frigiderul, raftul cu borcanele de castraveți |
| **Baia** | Cada (doar pentru momentul cu împușcăturile din ziua 17) |
| **Dormitorul** | Nefolosit în demo (ușa rămâne închisă) |

# Cum merge

- **Totul se petrece în sufragerie.** În bucătărie jucătorul merge doar pentru frigider (opțional) și pentru a ascunde filmul (ziua 17). În baie merge o singură dată, ca să se ascundă în cadă (ziua 17).
- **Fiecare zi începe în sufragerie**, cu data afișată pe ecran.
- **Ziua se termină la calendar:** după ce jucătorul a văzut fereastra zilei, calendarul începe să strălucească. Privire la calendar → fila se rupe → negru → gândul lui Radu (voce sau text) → ziua următoare.
- **Obiectele active strălucesc ușor.**
- **Fereastra:** fade la negru → imaginea zilei pe ecran fix → sunetul din piață → fade înapoi.
- **Ziarul:** privire → se deschide imaginea primei pagini, pe ecran fix. Se închide când jucătorul se uită în altă parte.
- **Ușa:** sună soneria → privire la ușă → vizorul (imagine rotundă, fisheye) → vocea vine de după ușă.
- **Ioana nu intră niciodată în apartament.** Vorbește doar la telefon sau de după ușă.
- **Doamna Ana** apare în vizor ca video. Pe 16 și 22 are replici fixe; pe 17 e conversație liberă cu agentul.
- **Agentul de Securitate** apare în vizor ca video (~10 s), în două variante.

# INTRO

**Pe ecran (negru):**

> FEREASTRA
>
> Timișoara, decembrie 1989

**Se aude:** vânt + `Radu-replica1_deschidere`

Fade in: sufrageria.

**Pe ecran:**

> Privește un obiect pentru a interacționa.

# 15 DECEMBRIE

**Pe ecran:** *Vineri, 15 decembrie 1989* · seară

**1. Radioul**
Europa Liberă, cu paraziți:

> „Ascultați Radio Europa Liberă. Ne parvin informații din Timișoara, unde pastorul reformat László Tőkés urmează să fie evacuat forțat. Un grup de enoriași s-a adunat în fața casei pentru a-l sprijini."

Apoi: `Radu_replica2_daca aude cineva, sa auda`

**2. Telefonul** (sună după radio)
Ioana:

> „Radule! Ce faci, invalidule? Ascultă, lumea se strânge la Piața Maria, la popa ăla ungur. Mă duc să văd."

`Radu_replica3_Ioana, nu la telefon`

Ioana:

> „Of, iar începi. Te sun mâine. Pa!"

**3. Se ia curentul** (automat, după telefon)
Luminile se sting. `Radu_replica4_Iar s-a luat curentul`

**4. Fereastra** (în timpul penei de curent)
Imagine: `img_piata_bezna` → după 5 s revine curentul → `img_piata_noapte`

**Opțional în ziua asta:**

- **Ziarul:** `ziar_z15.jpg` (Scînteia: realizări economice, nimic despre Timișoara)
- **Frigiderul** (bucătărie): se deschide, aproape gol. **Pe ecran:** *Câteva picioare de pui, un borcan de zacuscă, salam cu soia. Carnea bună pleca la export.*

**5. Calendarul** → negru → `Radu-replica5_15 decembrie, Ioana vb prea tare`

# 16 DECEMBRIE

**Pe ecran:** *Sâmbătă, 16 decembrie 1989* · zi

**1. Doamna Ana la ușă** (sonerie)
Vizor: `ana_z16.mp4`. Ana:

> „Radule, eu sunt, Ana. Am stat la coadă la ulei de la șase și n-am prins. Da' zice lumea că s-au strâns oameni mulți la popa ungur. Și Sorin al meu vrea să meargă să vadă, mânca-l-ar mama!"

`Radu_replica7_16dec_spuneti-i sa stea acasa`

**2. Telefonul, seara** (lumina trece pe seară; zgomot de mulțime în fundal)
Ioana:

> „Radule! Sunt aici! Toți sunt aici! Nu mai e doar pentru pastor, strigă împotriva lui!"

`Radu_replica8_16dec_Ioana du-te acasa` → ton de ocupat

**3. Fereastra**
Imagine: `img_piata_cativaoameni` + scandări îndepărtate (arhivă)
`Radu_replica9_16dec_Libertate...`

**Opțional:** **Radioul** — postul sârbesc:

> „Agențiile de presă relatează că în orașul vecin Timișoara au loc demonstrații. Autoritățile române nu au făcut nicio declarație."

**4. Calendarul** → negru → `Radu-replica6_16 decembrie, mi-a fost frig`

# 17 DECEMBRIE

**Pe ecran:** *Duminică, 17 decembrie 1989* · după-amiază

**1. Fereastra, după-amiaza**
Imagine: `img_piata_plina17` → după 8 s, zgomot de șenile, trecere la `img_piata_tancuri_zi(17)`
Sunet de declanșator. **Pe ecran:**

> *Clic. Radu a fotografiat tancurile.*

**2. Doamna Ana** (sonerie insistentă) → **conversație liberă cu agentul**
Vizor: `ana_z17_asculta.mp4` / `ana_z17_vorbeste.mp4`
Prima replică (din agent): *„Radule… Sorin n-a venit. L-ai văzut de la geam?"*
Conversația se încheie când agentul încheie, după 90 s sau când jucătorul se uită în altă parte 3 s.
Rezervă fără internet:

> „Sorin n-a venit acasă… A zis că merge doar până în centru. Dacă-l vezi de la geam, strigă-mă, Radule."

**3. Fereastra, noaptea** (lumina din cameră trece pe noapte)
Video: `video_piata_tancuri_noapte_17` 6 s (fum, flash-uri îndepărtate) → `video_piata_focuri_17` (soldații trag spre blocuri, flash-uri tot mai aproape) + rafale puternice, tot mai aproape → la final, un flash foarte aproape și sunet de geam spart → tăiere bruscă la negru.

**4. Ascunde-te!** (automat, înapoi în sufragerie)
Lumina e stinsă, rafalele continuă, foarte aproape. **Pe ecran, cu roșu:**

> *Se trage spre bloc! Ascunde-te în cadă!*

Doar marcajul spre baie e activ. Jucătorul merge în baie și se uită la cadă.

În cadă: negru aproape total, privirea coboară la nivelul marginii căzii, rafalele se aud înăbușite, respirație grea. **10 secunde.** Apoi liniște și ieșire automată. **Pe ecran:**

> *Împușcăturile s-au oprit. Ești în siguranță.*

Jucătorul revine automat în sufragerie.

**5. Ioana la ușă** (bătăi rapide)
Vizor: holul gol, întunecat (Ioana stă lipită de ușă, nu se vede). Ușa rămâne închisă. Ioana, în șoaptă:

> „Radule, eu sunt. Nu deschide, nu stau. Voiam doar să știi că sunt bine."
>
> „Au tras, Radule. În oameni. M-am ascuns într-o scară de bloc până s-a făcut liniște."
>
> „Iau pe toți care au fost acolo. Și pe cei care au poze. Ascunde filmul ăla. Eu mă duc la cămin."

Sunet: pași grăbiți pe scară.

**6. ALEGERE**

- **Ascunde filmul în bucătărie.**
- **Lasă-l în aparat.**

Dacă alege să-l ascundă: raftul cu castraveți din bucătărie strălucește. Jucătorul merge acolo și se uită la borcan. Sunet: capac deșurubat, înșurubat. **Pe ecran:**

> *Filmul e ascuns după castraveți.*

**Opțional:** **Televizorul** — imagine statică cu dansatori populari + muzică populară veselă.

**7. Calendarul** → negru → **Pe ecran:**

> *Azi am auzit cum sună o armă adevărată. Nu seamănă cu filmele.*

# 18 DECEMBRIE

**Pe ecran:** *Luni, 18 decembrie 1989* · zi

**1. Fereastra**
Imagine: `img_piata_lumanari_18` + cântec încet, apoi rafale, apoi liniște.

**2. Percheziția** (sonerie lungă, apoi bătăi ferme)
Vizor: video cu agentul. Agentul, peste începutul video-ului:

> „Bună ziua, tovarășe Petrescu. Securitatea. Căutăm studenți care au participat la tulburări. Și oameni care fotografiază."

**Varianta A — filmul a rămas în aparat** (`video_agent_film`):

> „Un Zenit. Frumos aparat. Aveți grijă ce fotografiați."

**Varianta B — filmul e ascuns** (`video_agent_gol`):

> „Aparatul e gol? Bine. Foarte bine."

Apoi, pentru toți:

> „Dacă ne spuneți cine din bloc a fost în piață, nu mai căutăm prin casă."

**3. ALEGERE**

- **„N-am văzut pe nimeni."**
- **„Nepotul doamnei Ana. Sorin."**

Agentul:

- după prima: *„Însănătoșire grabnică, tovarășe Petrescu. Ne mai vedem."*
- după a doua: *„Vedeți? Nu a fost greu. O zi bună."*

Sunet: pași pe scară care se îndepărtează.

**Opțional:**

- **Radioul** — Europa Liberă: *„Agențiile occidentale relatează că forțele de ordine au deschis focul asupra demonstranților din Timișoara. Numărul victimelor nu poate fi confirmat."*
- **Ziarul:** `ziar_z18.jpg` (Scînteia: Ceaușescu pleacă în vizită oficială în Iran; nimic despre Timișoara)

**4. Calendarul** → negru → **Pe ecran:**

- dacă a mințit: *Am mințit un ofițer de Securitate. Mi-a tremurat vocea, dar am mințit.*
- dacă a dat numele: *Am spus un nume. Un singur nume. Măcar n-au întrebat de Ioana.*

# 19 DECEMBRIE *(zi scurtă)*

**Pe ecran:** *Marți, 19 decembrie 1989* · zi

**1. Fereastra**
Imagine: `img_piata_doarsoldati_19` + vânt, liniște.

**Opțional:** **Radioul** — postul sârbesc:

> „Din Timișoara sosesc vești că muncitorii din mai multe fabrici au oprit lucrul. Printre ei, și cei de la Elba."

**2. Calendarul** → negru → **Pe ecran:**

> *Muncitorii de la Elba au ieșit. Fabrica mea.*

# 20 DECEMBRIE

**Pe ecran:** *Miercuri, 20 decembrie 1989* · zi

Din direcția ferestrei se aude mulțimea, tot mai tare.

**1. Telefonul** — Ioana, cu mulțime în fundal:

> „Radule, uită-te pe geam! Toată Timișoara e în piață! Zic de la balcon că suntem oraș liber!"

**2. Fereastra**
Video: `video_piata_plinasidacia_20` + mulțime și scandări (arhivă).
Sunet de declanșator. **Pe ecran:**

> *Clic. Radu a fotografiat piața plină.*

**3. Calendarul** → negru → **Pe ecran:**

> *La televizor ne zic huligani. Huliganii eram noi. Jumătate de oraș.*

# 21 DECEMBRIE *(zi scurtă)*

**Pe ecran:** *Joi, 21 decembrie 1989* · zi

**1. Televizorul**
Mitingul de la București (arhivă) → transmisia se taie → purici.

**2. Fereastra**
Imagine: `img_piata_grupuristeaguri_21` + mulțime mai liniștită.

**Opțional:** **Radioul** — Europa Liberă:

> „La București, mitingul convocat de Nicolae Ceaușescu a fost întrerupt de huiduielile mulțimii. Revolta pornită la Timișoara se extinde în toată țara."

**3. Calendarul** → negru → **Pe ecran:**

> *Pentru prima dată, toată țara a râs de el. În același timp.*

# 22 DECEMBRIE

**Pe ecran:** *Vineri, 22 decembrie 1989* · zi

**1. Radioul**
Radio România, emoționat:

> „Aici Radio România. Dictatorul a fugit! Pentru prima dată după atâția ani, vă vorbim liberi!"

**2. Doamna Ana** (sonerie)
Vizor: `ana_z22.mp4` (cu o lumânare). Ana:

> „Radule… a fugit! A fugit, mânca-l-ar ciuma. Am pus o lumânare la geam. Pentru Sorin. Să găsească drumul spre casă."

**3. Fereastra**
Imagine: `img_piata_22_steagin geam` + clopote, mulțime care cântă.

**Opțional:**

- **Televizorul:** carton scris de mână, tremurat: **„Televiziunea Română Liberă"**
- **Ziarul:** `ziar_z22.jpg` (ziarul liber, titluri despre căderea regimului)

**4. FINALUL** (automat, după fereastră, pe negru)

**„Dosarul"** — dacă a dat numele lui Sorin:

> *În 2005, Radu și-a cerut dosarul de la Securitate. Pe o pagină era o declarație despre Sorin. Semnată de el.*
>
> *Doamna Ana n-a aflat niciodată.*

**„Martorul"** — dacă a mințit și filmul a fost ascuns:

> *Fotografiile lui Radu au fost publicate în ianuarie 1990.*
>
> *Una dintre ele a ajutat o familie să afle ce s-a întâmplat cu fiul lor.*

**„Fereastra"** — dacă a mințit, dar filmul a fost confiscat:

> *Radu n-a mai avut nicio fotografie din acele zile. Doar fereastra.*
>
> *Cei mai mulți oameni au trăit Revoluția așa: de după o perdea, cu frică și cu speranță.*

**Dedicația** (pentru toate):

> *În memoria celor care și-au pierdut viața în Timișoara, în decembrie 1989.*

# Fișiere vizuale

**Vizor:** `ana_z16.mp4`, `ana_z17_asculta.mp4`, `ana_z17_vorbeste.mp4`, `ana_z22.mp4`, `vizor_hol_gol.jpg` (ziua 17, Ioana), `video_agent_film.mp4`, `video_agent_gol.mp4`

**Ziar:** `ziar_z15.jpg`, `ziar_z18.jpg`, `ziar_z22.jpg`

**Televizor:** `tv_17_populare.jpg` + muzică populară · `tv_21_miting.mp4` (arhivă) + `tv_purici.mp4` · `tv_22_libera.jpg`

**Video-urile cu agentul (~10 s):** efect de vizor, hol de bloc întunecat, un bec galben slab. Bărbat de ~45 de ani, haină de piele neagră, căciulă, față inexpresivă. Camera nu se mișcă. `video_agent_film`: ține aparatul Zenit, deschide capacul și trage filmul afară, la lumină, apoi ridică privirea spre vizor. `video_agent_gol`: deschide capacul, vede că e gol, se uită lung, bănuitor, spre vizor, închide capacul. Vocea e separată, pusă peste video.

# Ce mai e de generat (voce)

| Voce | Replici |
|---|---|
| **Doamna Ana** | 16, rezervă 17, 22 → **3** |
| **Agentul de Securitate** | 18: intro, film, gol, propunere, 2 răspunsuri → **6** |
| **Europa Liberă** | 15, 18, 21 → **3** |
| **Post sârbesc** | 16, 19 → **2** |
| **Radio România** | 22 → **1** |

Radu și Ioana sunt gata.

**Dacă rămânem fără timp, tăiem în ordinea asta:** televizorul, ziarul, frigiderul, ziua 19, ziua 21. Nu tăiem 17 și 18: acolo sunt alegerile și finalurile.
