# eBriza fixtures

`vanzari-produse-2026-10-16.csv` is a real, unmodified eBriza "Vânzări produse" export for one shop day
(16.10.2026, Cofetărie Napoca). It holds product totals only: no customers and no receipts.

The format as eBriza exports it, which the importer must accept:

- **Encoding: UTF-16LE with no BOM.** The first bytes are `4E 00 75 00` ("Nu"). Lines end in CRLF.
- **Delimiter `;`**, no quoting.
- **Decimal comma with 4 decimals**: `28,0000`, `454,0540`.
- **Headers:** `Nume produs;Cantitate vanduta;Total vanzari brut;Total discount oferit;Total incasat;Total incasat fara TVA`
- 29 product rows, no total row, no unit column. Product names keep their diacritics (`Cookie crème brûlée`).

Expected parse: 29 rows, name = `Nume produs`, quantity = `Cantitate vanduta`, for example `1 Macarons` = 28.
At 2026-10-17, `parseSalesReport` decodes the buffer as UTF-8 and so rejects this file
("Nu am găsit … Denumire/Produs … Cantitate"). After a UTF-16 decode, all 29 rows parse.
