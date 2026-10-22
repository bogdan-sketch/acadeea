# Web redesign — inventar (17.10.2026)

Prototipul: https://claude.ai/artifact/MtgQskpxUGkMxtmRU7C2SD (16 ecrane). Regulile din design:
hârtie caldă + un singur accent, Fraunces pentru titluri și cifre mari, DM Sans pentru restul,
butoane doar icon cu tooltip explicit, filtre ca chip-uri toggle (fără „Toate”, fără select),
săptămâna Luni–Duminică, 24h. Totul DOAR pe web, livrat pe test (`test.horae.ca`).

## Livrat în prima tranșă (branch `feat/web-redesign` → `dev` → Vercel `acadeea-test`)

| Zonă          | Ce s-a făcut                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokeni        | `globals.css`: hârtie `#f6f3ee`, cerneală `#1c1719`, accent `#c2305b`, borduri solide `#e8e2dc`, raze 18/12 px, statusuri (albastru/verde/chihlimbar/roșu) ca în design, dark de bază „cacao”                                                                                            |
| Fonturi       | DM Sans (UI) + Fraunces (display) prin `next/font`; `--font-serif-stack` → Fraunces                                                                                                                                                                                                      |
| Teme          | 6 scheme (`data-scheme` pe `<html>`): Atelier, Lapte, Miere (luminoase) · Cacao, Ardezie, Piper (întunecate). Alese din Setări › Temă, salvate per browser (`localStorage`), aplicate înainte de hidratare. Atelier/Cacao păstrează accentul organizației; celelalte 4 au accent propriu |
| Setări        | „Mod întunecat” → `SchemePicker` (6 carduri cu swatch, fără select)                                                                                                                                                                                                                      |
| Acțiuni       | `ActionTiles` randează implicit butoane 42 px doar icon, cu `title` + `aria-label`; `variant="tile"` păstrează plăcile cu etichetă acolo unde e nevoie (hub-uri)                                                                                                                         |
| Carduri KPI   | `StatCard`: etichetă + punct de ton, număr Fraunces 38 px, o linie de hint (fără watermark)                                                                                                                                                                                              |
| Header pagină | `PageHeader`: titlu Fraunces 34/600, eyebrow mut (data), descriere 14 px                                                                                                                                                                                                                 |
| Sidebar       | 248 px, item activ = pastilă accent-soft cu text accent, etichete de grup 11/700                                                                                                                                                                                                         |
| Panou         | Salut „Bună, X. Azi ies N comenzi.” + buton „+” doar icon pentru comandă nouă                                                                                                                                                                                                            |

## Ce lipsește față de design (de făcut în tranșele următoare)

### Shell

- [ ] Logo-marcă rotundă + „Acadeea / Laborator · Cofetărie Napoca” în capul sidebar-ului (acum wordmark serif)
- [ ] Grupurile de meniu din design: Zilnic (Panou, Producție, Comenzi, Calendar) · Catalog (Rețete, Prețuri) · Stoc (Stoc, Mișcări, Revizie, Vânzări→stoc) · Echipă (Statistici, Echipă & roluri); acum: Zilnic/Catalog/Stoc & aprovizionare/…/Ajutor
- [ ] Căutare globală în header (⌘K) + clopoțel notificări cu punct roșu
- [ ] Sub 800 px: sidebar ca rând de chip-uri (acum: drawer)

### Panou principal

- [ ] Listele „Producția de azi” (cantitate în chip, bară de progres, status pill) și „Comenzile de azi” (oră mare Fraunces + RIDICARE/LIVRARE, chip-uri „Mâine · N comenzi”)
- [ ] „Stoc critic” ca rânduri grid cu Minim/Stoc colorat + link „Comandă”; „Activitate” cu punct colorat pe tip

### Producție

- [ ] Tablă pe statusuri (4 coloane) ↔ listă, comutabile din segment icon-only; carduri cu cantitate Fraunces, tag status, „doar alocații”, bară, avatar, termen roșu când e întârziat
- [ ] Chip-uri Azi / Săptămâna / Ale mele / Nealocate / Blocate
- [ ] Detaliu task: ingrediente bifabile cu „în stoc” colorat + „Lipsește N ingrediente”, pași numerotați, card „Cine vede taskul” cu 3 chip-uri, acțiuni icon-only + „Finalizează” verde

### Comenzi

- [ ] Chip-uri de status cu punct colorat + contor, chip-uri sursă (De pe site / Manuale)
- [ ] Coloane: Comandă (nr + „Site · WooCommerce”), Client, Produse, Termen (roșu azi), Mod, Status, acțiuni icon (taskuri, aviz)
- [ ] Detaliu comandă: stepper de status clickabil (Nouă → Livrată), card Produse cu „De unde” și task legat, Istoric, Client compact, Predare (segment Ridicare/Livrare + Când/De la), Note

### Calendar

- [ ] Săptămână Luni–Duminică cu straturi comutabile (Comenzi / Producție / Expirări), ziua de azi marcată, comutare Săptămână/Lună, export PDF

### Rețete

- [ ] Carduri cu bloc de culoare pe categorie + inițială, pilule stoc (ok/puțin/fără), cost/preț/marjă pe card; segment Produse finale / Semipreparate + carusel categorii cu contor
- [ ] Detaliu rețetă: scalare ×1/×2/×6/×12, tabel ingrediente cu „în stoc” colorat, alergeni, card „Cost & preț” (cost/tort, preț, marjă, cost/porție), stoc pe locații, „Pe site” (mapări Woo)

### Stoc

- [ ] Rândul de acțiuni rapide ca chip-uri icon + etichetă (Recepție, Transfer, Mișcare, Consum teste, Expirări, Necesar MP, Furnizori, Revizie, Vânzări) + „Fără stoc” toggle
- [ ] Grupuri pe categorie cu header pliabil (pill + „PRIM · N”), coloane Furnizor/Loturi/Expiră/Minim/Stoc, acțiuni icon pe rând (ajustează, istoric, transfer)
- [ ] Mișcări: presetări 7 zile / 30 zile / Luna trecută, 4 totaluri (intrări/ieșiri/ajustări/rezervări), grupare pe zi, semn și culoare pe cantitate
- [ ] Revizie: 3 pași ca în design + raport cu „Din” tăiat / „În” verde
- [ ] Vânzări → stoc: 3 plăci de sursă, drop-zone, istoric cu filtre Site/eBriza/Manual

### Statistici / Echipă / Setări

- [ ] Statistici: presetări de perioadă, grafic comenzi/zi site vs manual, top produse cu bare, producție pe persoană, pierderi & expirări, card marjă
- [ ] Echipă: segment Persoane / Roluri & drepturi, matrice de drepturi bifabilă (admin blocat)
- [ ] Setări: hub cu 9 carduri icon + descriere, Locații cu „Implicită / Fă implicită”, Integrări cu stare

### Transversal

- [ ] Toate butoanele cu text din pagini (în afara submit-urilor de formular) → icon-only cu tooltip
- [ ] Bani: `[COST]`/`[PREȚ]` din prototip = valorile reale din app (nimic de făcut), dar formatul `1 240 lei` cu spațiu ca separator de mii
- [ ] iOS/Android: neatinse (decizie: web întâi)
