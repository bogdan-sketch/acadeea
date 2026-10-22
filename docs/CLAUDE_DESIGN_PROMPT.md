# Prompt pentru Claude Design — completare design system + prototip Horae

> Lipește textul de mai jos în conversația Claude Design din proiectul
> "Acadeea Design System" (fișierul `Acadeea Suite.dc.html`).

---

Continuă de la turnul 1 (suita iOS/Android/Web). Vreau să duci proiectul la un
**design system complet + prototip complet**, în aceeași direcție vizuală ca
opțiunile 1a–1j. Aplicația există deja în producție (iOS SwiftUI nativ + web
Next.js/shadcn + Android Compose incipient) — designul trebuie să rămână fidel
ei, nu să o reinventeze.

## Adevărul de bază (nu se negociază)

- **Accent white-label:** #D4527B (roz Acadeea) — configurabil per organizație;
  nimic altceva nu are voie să fie "brand color". Font: Inter (echivalent SF Pro).
- **Limbă:** română peste tot (pe mobil fără diacritice: "Selecteaza articol",
  "Miscare stoc", "Materie prima noua").
- **Light + dark obligatoriu** pe iOS și web, prin culori semantice.
- **Spacing:** 2/4/8/12/16/24/32 · **Radius:** 6 / 10 (carduri, rânduri) / 16
  (sheet-uri) · chips și badge-uri = capsulă.
- **Culori de status (fixe, folosite identic pe toate platformele):**
  - Task: DE_FACUT albastru · BLOCAT galben · IN_LUCRU portocaliu · FINALIZAT verde · ANULAT roșu
  - Material: ACTIVE verde · LOW_STOCK portocaliu · OUT_OF_STOCK roșu · DISCONTINUED gri
  - Transfer: IN_ASTEPTARE portocaliu · IN_TRANZIT albastru · FINALIZAT verde · ANULAT roșu
  - Comandă: NOUA albastru · IN_PREGATIRE portocaliu · PREGATITA mov · IN_TRANZIT indigo · LIVRATA verde · ANULATA roșu
  - Tip rețetă: FINAL albastru · SEMIPREPARAT mov · Marjă: ≥30% verde, ≥15% portocaliu, <15% roșu
- **Numere:** cantități fără zerouri finale ("310", "1.2"), prețuri "24.50 RON",
  procente "12.5%".
- iOS = liste insetGrouped cu secțiuni titrate, ✓/✗ în toolbar, empty states cu
  iconă+titlu+subtitlu, fără borduri 1px, fără umbre grele. Web = sidebar cu
  navigare gated pe permisiuni + DataTable + carduri shadcn.

## Partea A — Fundația design system (pagini noi, separate de ecrane)

Creează cards/pagini de fundație, ca bibliotecă reutilizabilă:

1. **Tokens:** paletă (accent + semantic + toate culorile de status de mai sus +
   paleta de categorii `#D4527B #E91E63 #9C27B0 #673AB7 #3F51B5 #2196F3 #009688
#4CAF50 #FF9800 #795548 #607D8B #F44336`), scala tipografică (34/22/17/15/12/11),
   spacing, radius — fiecare în light + dark.
2. **Componente de bază**, fiecare cu toate stările (default/hover/pressed/disabled)
   și în light + dark:
   - Status badge (toate statusurile din toate domeniile, cu text românesc)
   - Chips de filtrare (selectat/neselectat, rând orizontal scrollabil)
   - Rând de listă (titlu + metadate caption + valoare dreapta + tag capsulă tip)
   - Câmpuri de formular: text, numeric cu unitate ("kg", "RON"), toggle,
     segmented control (2–3 opțiuni), dropdown cu chevron, date picker, search bar
   - Butoane (primar/secundar/ghost/distructiv) + butoanele ✓/✗ de toolbar (iOS)
   - Card de statistică (dashboard), quick-action button (iconă + label)
   - Empty state, loading state, error alert
   - Tabel web (DataTable cu paginare) + PageHeader cu acțiuni
   - Bară de progres stoc (StockLevelBar) + grafic linie (evoluție preț)

## Partea B — Prototip complet (toate ecranele, legate în flow-uri)

### iOS (prioritatea 1 — light + dark pentru fiecare)

Completează ce lipsește din navigarea reală a aplicației:

1. **Login** (logo org, show-password, "Ai uitat parola?")
2. **Detaliu task** — status, cantitate țintă, locație, "Materiale necesare"
   (necesar scalat vs stoc, avertisment roșu la insuficient), subtask-uri
   semipreparate, istoric statusuri; acțiuni de tranziție (Începe → 409 stoc
   insuficient → BLOCAT; Finalizează → sheet captură randament cu picker de
   locație destinație)
3. **Creare task** — picker rețetă (prefil cantitate din randament), verificare
   live de stoc cu avertismente per material, picker locație producție
4. **Fișa de trasabilitate** — produs, executant, date; per ingredient: cantitate
   - loturile consumate FIFO (mai multe pe ingredient: "3 kg — lot L-77, factura
     FAC-101, Metro"), subtask-uri semipreparate, buton share
5. **Detaliu materie primă** — categorie, furnizor, stoc per locație, istoric
   preț (grafic), istoric intrări (loturi cu factură/expirare), secțiune valori
   nutriționale editabilă (feature-gated — arată varianta cu switch ON)
6. **Necesar MP (plan de producție)** — listă produse+cantități, "Calculeaza
   necesarul", tabel rezultat cu furnizor + "De cumparat" roșu, export Excel + share
7. **Recepție marfă (batch)** — mai multe materiale odată: cantitate, lot,
   factură, preț, expirare, locație
8. **Detaliu rețetă** — componente + ingrediente, analiză (cost/marjă gated pe
   rol), valori nutriționale agregate (total / per buc / per 100g, "calcul
   parțial" când lipsesc date), istoric versiuni
9. **Detaliu comandă + foaie de livrare** (semnătură) · **Detaliu transfer + aprobare**
10. **Furnizori** (materiale grupate, count stoc scăzut) · **Expirări** ·
    **Lista de cumpărături** (din taskuri blocate) · **Setări** (profil, branding
    admin, categorii, logout)

### Web desktop (prioritatea 2 — light + dark)

Sidebar: Dashboard · Rețete · Comenzi · Taskuri · Stoc (hub cu 10 sub-pagini:
materii prime, consumabile, furnizori, **necesar MP**, mișcări, locații,
transferuri, stoc produse, stoc scăzut, expirare) · Utilizatori · Roluri ·
Analitice · Prețuri · Integrări (eBriza/WooCommerce) · Activitate · Calendar ·
Setări (cu "Funcții experimentale" → switch Valori nutriționale). Fă măcar:
dashboard, lista+detaliu task (cu trasabilitate), necesar MP cu tabel + export,
detaliu materie primă cu nutriție, setări, și dark mode pentru toate.

### Android (prioritatea 3)

Extinde 1i (Material 3) pe: Acasă, Stoc, Rețete, Comenzi — păstrează paritatea
vizuală cu iOS-ul, nu Material generic.

## Partea C — Prototip interactiv

Leagă ecranele în flow-uri navigabile (tap pe rând → detaliu, butoane → sheet-uri):

1. **Flux producție:** Acasă → Taskuri → Detaliu → Începe (cu cazul BLOCAT) →
   Finalizează (captură randament) → Trasabilitate → Share
2. **Flux stoc:** Stoc → Recepție batch → Detaliu MP → (lot nou vizibil în istoric)
3. **Flux planificare:** Necesar MP → adaugă 4 produse → rezultat → export
4. **Flux comandă:** Comenzi → Detaliu → status până la LIVRATA → foaie de livrare semnată

Lucrează iterativ: întâi Partea A (fundația), apoi ecranele iOS lipsă, apoi web,
apoi legăturile de prototip. La fiecare pas păstrează consistența cu 1a–1j și cu
regulile din "Adevărul de bază".
