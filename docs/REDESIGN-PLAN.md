# Web redesign — analiză: ce trebuie făcut ca să fie CA ÎN DESIGN (17.10.2026)

Prototip: https://claude.ai/artifact/MtgQskpxUGkMxtmRU7C2SD · Tranșa 1 (stratul vizual) e pe test.
Ce urmează nu e „cum arată”, ci STRUCTURA fiecărui ecran: ce blocuri are, ce date cer, ce lipsește în API.
Efort: S = sub o zi, M = 1–2 zile, L = 3+ zile. Totul doar web, livrat pe `dev` → test.

## Concluzie pe scurt

- 11 ecrane se pot aduce la design DOAR din web (datele există): Panou, Producție (tablă), Comenzi, Comandă, Calendar, Rețete, Rețetă, Stoc, Mișcări, Revizie, Vânzări, Echipă, Setări.
- 4 lucruri cer API nou: legătura task ↔ comandă, pașii rețetei, agregatele pentru Statistici, căutarea globală. Fără ele, ecranele respective rămân „aproape”, nu „ca în design”.
- Ordine propusă: (1) shell + Panou + Stoc, (2) Producție + Task + Comenzi + Comandă, (3) Rețete + Calendar + Mișcări/Revizie/Vânzări, (4) Statistici + Echipă + Setări + căutare globală.

## Shell (toate paginile) — M

| Design                                                                                                                                                                              | Acum                                                                                                | De făcut                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Logo-marcă rotundă + nume org + „Laborator · Cofetărie Napoca”                                                                                                                      | wordmark serif                                                                                      | header sidebar nou; sub-linia = locațiile active                                                |
| Grupuri: Zilnic (Panou, Producție, Comenzi, Calendar) · Catalog (Rețete, Prețuri) · Stoc (Stoc, Mișcări, Revizie, Vânzări→stoc) · Echipă (Statistici, Echipă & roluri) · Setări jos | Zilnic / Catalog / Stoc & aprovizionare / … / Ajutor; Transferuri, Furnizori, Necesar sunt în meniu | reordonare `NAV_GROUPS`; Transferuri/Furnizori/Necesar/Expirări devin acțiuni rapide în Stoc    |
| Header: titlu Fraunces + eyebrow cu data/contor, căutare globală (⌘K), clopoțel, „+”                                                                                                | titlu + descriere; clopoțel există                                                                  | `PageHeader` primește `meta` (contor) și slot de acțiuni icon-only; căutarea globală = tranșa 4 |
| Sub 800 px: sidebar ca rând de chip-uri                                                                                                                                             | drawer                                                                                              | CSS pe `AppSidebar`                                                                             |

## Panou principal — M (fără API)

- KPI: Taskuri azi (finalizate · în lucru), Comenzi de livrat (ridicări · livrare), Alerte stoc, Expiră în 3 zile → `dashboard/stats` are primele 3; „expiră în 3 zile” = `stock/expiring?days=3` (există).
- „Producția de azi”: cantitate în chip, nume, cine, termen, bară de progres, pill status → `tasks?dueBefore/dueAfter` (există). Progresul = derivat din status (De făcut 0 / În lucru 50 / Finalizat 100) până apar pașii.
- „Comenzile de azi”: oră mare + RIDICARE/LIVRARE (din `fulfillmentType` + `dueDate`), client, nr, produse, pill status; chip-uri „Mâine · N” / „Sâmbătă · N” → `orders/calendar` (există).
- „Stoc critic” grid cu Minim/Stoc colorat + „Comandă” → `dashboard/stats.lowStockMaterials` (există). „Activitate” cu punct colorat pe tip → `activity` (există).
- Dispare: cardul „Acțiuni rapide”.

## Producție — L (API: S)

- Tablă pe 4 coloane (De făcut / În lucru / Blocat / Finalizat) ↔ listă, comutabile din segment icon-only; chip-uri Azi / Săptămâna / Ale mele / Nealocate / Blocate → grupare pe client din `tasks` (există `status`, `assignedToId`, `dueAfter/Before`, `myDay`). „Nealocate” are nevoie de `assignedToId=null` în query (API: S).
- Card: cantitate Fraunces, tag status, „doar alocații” (din `visibility`), bară, avatar, termen roșu când e depășit.
- Lista de cumpărături rămâne ca icon în header (există `tasks/shopping-list`).

## Task (detaliu) — L (API: M)

- Header: status pill + termen + „Din comanda WOO-…” → **lipsește legătura task ↔ comandă** (Task n-are `orderId`). API: `Task.orderId?` + `orderItemId?`, setate când taskul se creează din comandă; endpoint-ul de creare din comandă există deja (de verificat `orders/:id/tasks`).
- Ingrediente bifabile cu „în stoc” colorat și „Lipsește N ingrediente” → `stock/item-availability` + rezervările taskului (există); bifarea = stare locală (sau API: `TaskIngredientCheck` — opțional).
- Pași numerotați cu durată → **lipsesc în model** (Recipe n-are pași). API: `RecipeStep { recipeId, position, title, text, minutes }` + CRUD în editorul de rețete. Fără asta, cardul „Pași” nu există.
- „Cine lucrează” (alocați + „Adaugă”), „Cine vede taskul” (3 chip-uri) → există din 1.29.
- Acțiuni icon-only: pauză, blocat, editează + „Finalizează” verde → endpoint-urile de status există.

## Comenzi — M (fără API)

- Chip-uri status cu punct colorat + contor (din `orders/stats`), chip-uri sursă De pe site / Manuale (prefix `WOO-`/`CMD-`; API: S dacă vrem filtru server-side `source=`).
- Coloane: Comandă (nr + „Site · WooCommerce” / „Manuală”), Client, Produse, Termen (roșu = azi), Mod (Ridicare/Livrare), Status, acțiuni icon (taskuri, aviz).
- Header icon-only: calendar, statistici, sincronizare Woo (există `integrations/:id/sync`), „+”.
- Dispar: cardurile KPI de sus (Noi / În pregătire / …) → devin chip-uri.

## Comandă (detaliu) — M (API: S)

- Stepper de status clickabil Nouă → Livrată (există `orders/:id/status`).
- Produse: Cant., Preț, „De unde” (Din stoc / Producție) și task legat → are nevoie de task ↔ comandă (vezi Task). Până atunci „De unde” = dacă stocul de produs finit acoperă cantitatea (`stock/recipes`).
- Istoric: schimbări de status + scăderea automată din stoc → `activity?orderId=` (API: S, filtru) sau din `SalesDeduction` după `fileHash woo:*:<id>` (există).
- Client compact cu „N comenzi” (API: S — `orders?customerName=` există ca filtru), Predare (segment + Când/De la + „Vezi în calendar”), Note cu sursa.
- Acțiuni icon-only: aviz PDF, semnătură, editează, anulează (toate există).

## Calendar — M (fără API)

- O singură pagină (în loc de /calendar + /orders/calendar): săptămână Luni–Duminică cu 3 straturi comutabile — Comenzi (`orders/calendar`), Producție (`tasks` pe interval), Expirări (`stock/expiring`) — ziua de azi marcată, Săptămână ↔ Lună, export PDF (print CSS).

## Rețete — M (fără API)

- Segment Produse finale / Semipreparate + carusel categorii cu contor (`recipes/categories/counts` există).
- Carduri: bloc de culoare pe categorie + inițială (sau `photoUrl` când există), pilulă stoc (ok / puțin / fără din `stockCount`), cost / preț / marjă (`calculatedCost`, `manualCost`, `sellingPrice` există).
- Header icon-only: prețuri, import Excel, „+”.

## Rețetă (detaliu) — L (API: M pentru pași)

- Scalare ×1 ×2 ×6 ×12 (client), tabel ingrediente cu cost și „în stoc” colorat (`recipes/:id` + `stock/item-availability`), alergeni (chip-uri; API: S — câmp `allergens` sau derivat din materii prime cu `allergens`), card „Cost & preț” (există datele), „Stoc pe locații” (`stock/recipes/:id/lots`), „Pe site” (mapările Woo: `integrations/:id/mappings` filtrate pe recipeId).
- Pași → cer `RecipeStep` (vezi Task).

## Stoc — M (fără API)

- Rând de acțiuni rapide chip icon + etichetă (Recepție, Transfer, Mișcare, Consum teste, Expirări, Necesar MP, Furnizori, Revizie, Vânzări) + „Fără stoc” toggle → `ActionTiles variant="tile"` + link-uri existente.
- Locații ca chip-uri toggle (nimic ales = cumulat) — există.
- 3 plăci + carusel categorii — există (1.32).
- Grupuri pe categorie cu header pliabil și coloane Furnizor / Loturi / Expiră / Minim / Stoc → `stock/lots?rawMaterialId=` există; pentru listă e nevoie de **sumar de loturi per material în `raw-materials` list** (nr loturi + cea mai apropiată expirare) → API: S (include în DTO).
- Acțiuni pe rând icon: ajustează, istoric, transfer (toate există ca pagini/dialoguri).

## Mișcări — S (API: S)

- Presetări 7 zile / 30 zile / Luna trecută (client), 4 totaluri (intrări / ieșiri / ajustări / rezervări) → API: `stock/movements/summary?from&to` (S) sau calcul pe lista filtrată (limitat la paginație → mai bine API).
- Grupare pe zi, semn + culoare pe cantitate, coloana „De către” — client.

## Revizie stocuri — S (fără API)

- Cele 3 plăci de pași (Exportă / Corectează / Încarcă cu drop-zone), raportul cu „Din” tăiat și „În” verde, bannerul „N rânduri nu mai există” → doar UI peste `stock/review/*` (1.34).

## Vânzări → stoc — S (fără API)

- Panoul „Scădere nouă” cu 3 plăci de sursă + drop-zone + „Șablon CSV”, cardul ultimei scăderi, istoric cu chip-uri Site / eBriza / Manual → doar UI peste endpoint-urile existente.

## Statistici — L (API: M)

- Presetări 7 zile / 14 zile / Luna / Anul, KPI cu delta față de perioada anterioară → `analytics/summary` + perioada anterioară (API: S).
- Grafic comenzi/zi site vs manual → **API nou**: `analytics/orders-by-day?from&to` cu `{ day, site, manual }`.
- Top produse (bucăți) → `analytics/orders` are top? de verificat; altfel API: S.
- Producție pe persoană (taskuri finalizate + ore) → `analytics/users` există (de aliniat câmpurile).
- Stoc · pierderi & expirări (aruncate, expirate, consum teste, diferențe la revizii, comenzi cu stoc insuficient) → **API nou**: `analytics/stock-losses?from&to` din `StockMovement` (IESIRE_TESTE, AJUSTARE „Revizie stocuri”, loturi expirate).
- Card marjă pe perioadă → din `analytics/orders` + costurile rețetelor (API: M).

## Echipă & roluri — S (fără API)

- Segment Persoane / Roluri & drepturi; lista cu avatar, rol pill, locație, ultima activitate, stare (invitație) → `users` + `roles` există; „ultima activitate” din `activity` (sau `User.lastSeenAt` — API: S).
- Matrice de drepturi bifabilă (admin blocat) → pagina `/roles` are deja switch-uri; se mută în același ecran.
- Acțiuni icon pe rând: resetează parola (există), editează, dezactivează.

## Setări — S (fără API)

- Hub cu 9 carduri (icon + descriere), segment Luminos / Întunecat / Sistem → înlocuit de cele 6 scheme (deja), Locații cu „Implicită / Fă implicită” (există), Integrări cu stare (există).

## Căutare globală (⌘K) — M (API: M)

- **API nou**: `search?q=` care întoarce comenzi (nr, client), rețete, produse/materii prime, persoane — sau 4 apeluri paralele la listele existente cu `search=` (fără API nou, mai lent). Paleta pe web: dialog cu chip-uri pe tip, fără select.

## API — lista completă de făcut (în ordinea nevoii)

1. `Task.orderId` + `orderItemId` (migrare) și setarea lor la crearea taskului din comandă; `tasks?orderId=` și `orders/:id` returnează taskurile legate. — M
2. `RecipeStep` (poziție, titlu, text, minute) + CRUD în `recipes/:id/steps`; editorul de rețete pe web. — M
3. `tasks?assignedToId=null` (nealocate). — S
4. `raw-materials` list: `lotCount`, `nextExpiryDate`. — S
5. `stock/movements/summary?from&to`. — S
6. `analytics/orders-by-day`, `analytics/stock-losses`, perioada anterioară în `summary`. — M
7. `search?q=`. — M
8. Opțional: `allergens` pe rețetă/materie primă; `activity?orderId=`; `User.lastSeenAt`. — S fiecare

## Tranșe propuse (web, pe test)

1. Shell + Panou + Stoc + Mișcări/Revizie/Vânzări (fără API, în afară de 4 și 5) — ~3 zile
2. Producție (tablă) + Task + Comenzi + Comandă (cu API 1 și 3) — ~4 zile
3. Rețete + Rețetă (cu API 2) + Calendar — ~3 zile
4. Statistici (API 6) + Echipă + Setări + căutare globală (API 7) — ~3 zile
