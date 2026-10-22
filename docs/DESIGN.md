# Horae — Design System (extras din aplicația iOS existentă)

> Sursă: `apps/ios/Horae` (SwiftUI, iOS 17+) — `Core/Theme/AppTheme.swift`,
> `Core/Branding/BrandingManager.swift` și pattern-urile de UI din Features/.
> Folosit ca referință pentru orice design nou (Stitch / Claude Design / web),
> ca ecranele noi să arate ca aplicația reală.

## 1. Identitate

- **Produs:** platformă de management de producție pentru o cofetărie (rețete,
  taskuri de producție, stoc, comenzi, livrări, transferuri între locații).
- **Ton vizual:** iOS nativ, curat, utilitar, cald. NU e un dashboard corporate —
  e o unealtă de atelier folosită de cofetari pe telefon, cu mâinile ocupate.
- **Limbă:** toate textele în **română, fără diacritice în iOS** (ex. "Selecteaza
  articol", "Miscare stoc", "Lista de cumparaturi").
- **White-label:** culoarea de accent vine din setările organizației
  (default **#D4527B — roz Acadeea**). Tot ce e "brand" trebuie să funcționeze
  dacă accentul se schimbă.

## 2. Culori

### Accent & neutre

| Token                  | Valoare                              | Utilizare                                 |
| ---------------------- | ------------------------------------ | ----------------------------------------- |
| `primary` / accent     | `#D4527B`                            | butoane primare, link-uri, selecții, tint |
| background             | iOS `systemBackground` (alb / negru) | fundal ecran                              |
| secondaryBackground    | iOS `secondarySystemBackground`      | carduri, rânduri                          |
| groupedBackground      | iOS `systemGroupedBackground`        | fundal liste insetGrouped                 |
| label / secondaryLabel | iOS semantic                         | text primar / secundar                    |
| destructive            | roșu sistem                          | ștergeri, erori                           |
| success                | verde sistem                         | confirmare, stoc suficient                |
| warning                | portocaliu sistem                    | atenționări, stoc scăzut                  |

Light + dark mode obligatoriu — folosim exclusiv culori semantice, niciodată
hex hardcodat pentru fundal/text.

### Culori de status (semantica domeniului — NU se schimbă)

- **Task:** DE_FACUT albastru · BLOCAT galben · IN_LUCRU portocaliu · FINALIZAT verde · ANULAT roșu
- **Material:** ACTIVE verde · LOW_STOCK portocaliu · OUT_OF_STOCK roșu · DISCONTINUED gri
- **Transfer:** IN_ASTEPTARE portocaliu · IN_TRANZIT albastru · FINALIZAT verde · ANULAT roșu
- **Comandă:** NOUA albastru · IN_PREGATIRE portocaliu · PREGATITA mov · IN_TRANZIT indigo · LIVRATA verde · ANULATA roșu
- **Tip rețetă:** FINAL albastru · SEMIPREPARAT mov
- **Marjă:** ≥30% verde · ≥15% portocaliu · <15% roșu

### Paleta de categorii (presets alese de admin)

`#D4527B #E91E63 #9C27B0 #673AB7 #3F51B5 #2196F3 #009688 #4CAF50 #FF9800 #795548 #607D8B #F44336`

## 3. Tipografie

Font: **SF Pro (sistem iOS)** — echivalent web: **Inter**. Scala = iOS text styles:

| Nivel              | Mărime / greutate     | Utilizare                              |
| ------------------ | --------------------- | -------------------------------------- |
| largeTitle         | 34 / bold             | titluri de ecran mari (rar)            |
| title2–3           | 22–20 / semibold      | titluri de secțiune importante         |
| headline           | 17 / semibold         | titluri de card/rând                   |
| body               | 17 / regular          | conținut                               |
| subheadline        | 15 / regular–semibold | valori în rânduri, metadate importante |
| caption / caption2 | 12 / 11               | etichete secundare, tag-uri, detalii   |

Numere: cantități cu 1–2 zecimale fără zerouri finale ("310", "1.2", "0.95");
prețuri "24.50 RON"; procente "12.5%".

## 4. Spațiere & forme

- **Spacing scale:** 2 (xxs) · 4 (xs) · 8 (sm) · 12 (md) · 16 (lg) · 24 (xl) · 32 (xxl)
- **Corner radius:** 6 (sm) · 10 (md — carduri, rânduri) · 16 (lg — sheet-uri, carduri mari)
- Chips/badge-uri: **capsulă** (rotunjire completă).

## 5. Componente & pattern-uri (cum arată aplicația azi)

- **Liste:** `List` insetGrouped cu `Section("Titlu")` — majoritatea ecranelor
  sunt formulare sau liste secționate, nu grid-uri.
- **Rânduri de listă:** titlu (headline/body) + metadate pe caption dedesubt;
  valoarea numerică aliniată dreapta (subheadline semibold); tag-uri mici
  capsulă gri (`caption2`) pentru tip ("M. Prime", "Consumabil").
- **Status badge:** capsulă colorată cu textul statusului în română.
- **Filtre:** chips orizontale scrollabile (capsule; selectat = fundal accent,
  text alb; neselectat = fundal gri deschis).
- **Formulare:** `Form` cu secțiuni titrate; câmpuri cu label deasupra sau
  `LabeledContent`; toggle-uri iOS; pickers segmentate pentru 2–3 opțiuni;
  `Menu` dropdown pentru selecții lungi (cu chevron.up.chevron.down).
- **Toolbar:** acțiune de confirmare = iconă ✓ dreapta-sus; anulare = ✗ stânga-sus.
- **Empty states:** `ContentUnavailableView` cu SF Symbol + titlu + subtitlu.
- **Quick actions:** rând de butoane-card cu iconă SF Symbol + label scurt.
- **Grafice:** linie simplă pentru evoluție preț/stoc, culoare accent.
- **Icoane:** exclusiv **SF Symbols** (web: Lucide, echivalent apropiat).
- **Share:** ecranele de raport (trasabilitate, listă cumpărături) au buton
  share (square.and.arrow.up) care exportă text/fișier.

## 6. Do / Don't

**Do:** păstrează aspectul iOS nativ; folosește culorile de status exact ca în
tabel; totul în română; light+dark; densitate moderată — un ecran = o treabă.

**Don't:** nu introduce borduri 1px peste tot (iOS separă prin fundal și
spațiu); nu folosi alt accent decât cel al organizației; nu engleza în UI; nu
umbre grele — elevația vine din straturi de fundal.
