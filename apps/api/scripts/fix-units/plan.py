#!/usr/bin/env python3
"""
Plan the unit-of-measure data correction (fix/stock-units, 17 Oct 2026).

Reads the READ-ONLY export produced by export.sql and writes one SQL file that
(1) shows a dry-run SELECT of every change and (2) applies it inside a
transaction that ends in ROLLBACK unless you change it to COMMIT yourself.

Every UPDATE is guarded by the value observed at export time
(`... AND quantity = <seen>`), so a stale script cannot overwrite data that
changed after the export — re-export and re-plan instead.

What it corrects (all caused by the bugs fixed on fix/stock-units):
  A. Journal rows (StockMovement / StockReservation / LotConsumption) whose unit
     differs from the item's unit are converted into the item's unit
     (e.g. IESIRE_TESTE 40 GRAME on a KILOGRAME material → 0,04 KILOGRAME).
     Rows with no exact factor (900 BUCATI on a GRAME product) are relabelled:
     before the fix the stock took the raw number in the item's unit.
  B. Per-location MaterialStock is set to the replay of the converted journal
     (+ transfers that predate transfer journaling). Before the fix a test
     consumption of 40 g on a material kept in kg removed 40 kg (clamped at 0).
     Only materials whose AS-STORED replay reproduces today's stock exactly are
     touched — otherwise the journal can't be trusted and the material is listed
     as "skipped" for a manual count.
  C. RawMaterial.stockCount = sum of its locations.
  D. Lots of corrected materials are brought in line with the stock (FIFO trim
     when they hold more, the newest lot gets the difference when they held
     the same as the stock before).
  E. "Vanilie pastai": the 13 Oct reception of 600 was typed into a kilogram
     field but was 600 g (the owner then switched the item to grams and
     counted 596 g on prod). The material is kept in GRAME, the 600 intake is
     relabelled 600 GRAME and every other row converted kg → g.

Usage:
  psql ... -f export.sql > export.txt              # READ-ONLY
  python3 -I plan.py export.txt <env-label> > fix-units-<env>.sql
"""
import csv
import io
import sys
from collections import defaultdict

FACTOR = {
    'MILIGRAME': ('m', 0.001), 'GRAME': ('m', 1.0), 'KILOGRAME': ('m', 1000.0),
    'MILILITRI': ('v', 1.0), 'LITRI': ('v', 1000.0),
}
VANILLA_TITLE = 'Vanilie pastai'
EPS = 1e-9


def conv(q, frm, to):
    if frm == to:
        return q
    a, b = FACTOR.get(frm), FACTOR.get(to)
    if not a or not b or a[0] != b[0]:
        return None
    return q * a[1] / b[1]


def sections(path):
    out, name, buf = {}, None, []
    for line in open(path, encoding='utf-8'):
        if line.startswith('-- @@'):
            if name:
                out[name] = list(csv.DictReader(io.StringIO(''.join(buf))))
            name, buf = line[5:].strip(), []
        else:
            buf.append(line)
    if name:
        out[name] = list(csv.DictReader(io.StringIO(''.join(buf))))
    return out


def num(x):
    return float(x) if x not in (None, '') else 0.0


def lit(x):
    return repr(round(x, 15)) if isinstance(x, float) else str(x)


def near(col, v):
    """Guard: the column still holds (within 1e-9) what the export saw."""
    return f'abs("{col}" - ({lit(v)})) < 1e-9'


def factor(old, new):
    """Exact SQL multiplier old → new (1000, 0.001, 1 …); falls back to the ratio."""
    if old == 0:
        return '1'
    r = new / old
    for k in (1.0, 1000.0, 0.001, 1000000.0, 0.000001):
        if abs(r - k) < 1e-9 * max(1.0, k):
            return repr(k)
    return f'({lit(new)} / ({lit(old)}))'


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    data = sections(sys.argv[1])
    env = sys.argv[2] if len(sys.argv) > 2 else 'env'
    mats = {m['id']: m for m in data['materials']}
    vanilla = {mid for mid, m in mats.items() if m['title'] == VANILLA_TITLE}
    target_unit = {mid: ('GRAME' if mid in vanilla else m['unit']) for mid, m in mats.items()}

    stock = {(r['rawMaterialId'], r['locationId']): r for r in data['stock']}
    events = []
    for r in data['movements']:
        events.append((r['createdAt'], 'mv', r))
    for r in data['transfers']:
        if r['journaled'] == 't':
            continue
        events.append((r['createdAt'], 'tr_out', r))
        if r['recv']:
            events.append((r['recv'], 'tr_in', r))
    events.sort(key=lambda e: e[0])

    row_fix = []          # (table, id, old_q, old_unit, new_q, new_unit, title, type)
    bad_mats = set(vanilla)
    raw = defaultdict(float)
    good = defaultdict(float)
    for _, kind, r in events:
        mid = r['rawMaterialId']
        if mid not in mats:
            continue
        mu, tu = mats[mid]['unit'], target_unit[mid]
        if kind == 'mv':
            k = (mid, r['locationId'])
            qv, u, t = num(r['quantity']), r['unit'], r['movementType']
            if mid in vanilla and t == 'INTRARE' and u == 'KILOGRAME' and abs(qv - 600) < EPS:
                cq, cu = qv, 'GRAME'                      # E: typed into kg, was grams
            else:
                c = conv(qv, u, tu)
                cq, cu = (c, tu) if c is not None else (qv, tu)
            if cu != u or abs(cq - qv) > EPS:
                row_fix.append(('StockMovement', r['id'], qv, u, cq, cu, mats[mid]['title'], t))
                bad_mats.add(mid)
            # as-stored replay (raw numbers, exactly what the old code did)
            if t == 'INTRARE':
                raw[k] += qv
                good[k] += cq
            elif t == 'AJUSTARE':
                raw[k] = qv
                good[k] = cq
            elif t.startswith('IESIRE'):
                raw[k] = max(0.0, raw[k] - qv)
                good[k] = max(0.0, good[k] - cq)
        else:
            loc = r['fromLocationId'] if kind == 'tr_out' else r['toLocationId']
            k = (mid, loc)
            qv = num(r['quantity'])                      # transfers always used the item unit
            cq = conv(qv, mu, tu) if mid in vanilla else qv
            sign = -1 if kind == 'tr_out' else 1
            raw[k] += sign * qv
            good[k] += sign * (cq if cq is not None else qv)

    stock_fix, skipped = [], []
    new_count = {}
    for mid in sorted(bad_mats, key=lambda m: mats[m]['title']):
        rows = [r for (m, _), r in stock.items() if m == mid]
        trusted = all(abs(raw[(mid, r['locationId'])] - num(r['quantity'])) < 1e-6 for r in rows)
        vanilla_rescale = mid in vanilla and mats[mid]['unit'] != 'GRAME'
        if not trusted and not vanilla_rescale:
            skipped.append(mats[mid]['title'])
            continue
        total = 0.0
        for r in rows:
            k = (mid, r['locationId'])
            tgt = good[k] if trusted else (conv(num(r['quantity']), mats[mid]['unit'], 'GRAME') or 0)
            total += tgt
            if abs(tgt - num(r['quantity'])) > 1e-6:
                stock_fix.append((r['id'], num(r['quantity']), tgt, mats[mid]['title'], mats[mid]['unit'], target_unit[mid]))
        new_count[mid] = total

    # D. lots
    lots_by = defaultdict(list)
    for l in data['lots']:
        lots_by[l['rawMaterialId']].append(l)
    lot_fix = []
    for mid, total in new_count.items():
        ls = lots_by.get(mid, [])
        if not ls:
            continue
        mu, tu = mats[mid]['unit'], target_unit[mid]
        # vanilla lots were already grams by intent (600 typed into a kg field)
        f = 1.0 if mid in vanilla else (conv(1.0, mu, tu) or 1.0)
        rem = {l['id']: num(l['remainingQuantity']) * f for l in ls}
        qty = {l['id']: num(l['quantity']) * f for l in ls}
        s = sum(rem.values())
        old = num(mats[mid]['stockCount']) * f
        if abs(s - total) < 1e-6 and f == 1.0:
            continue
        new_rem = dict(rem)
        if s > total + 1e-9:
            order = sorted(ls, key=lambda l: (l['onHold'] == 't', l['receivedAt'], l['createdAt']))
            over = s - total
            for l in order:
                take = min(new_rem[l['id']], over)
                new_rem[l['id']] -= take
                over -= take
                if over <= 1e-12:
                    break
        elif abs(s - old) < 1e-6:                        # lots were in sync before
            newest = max(ls, key=lambda l: (l['receivedAt'], l['createdAt']))
            new_rem[newest['id']] += total - s
        for l in ls:
            o_rem, o_q = num(l['remainingQuantity']), num(l['quantity'])
            if abs(new_rem[l['id']] - o_rem) > 1e-9 or abs(qty[l['id']] - o_q) > 1e-9:
                lot_fix.append((l['id'], o_q, o_rem, qty[l['id']], new_rem[l['id']], mats[mid]['title']))

    # A'. reservations + lot consumptions (unit != material unit), vanilla kg → g
    aux_fix = []
    for table, rows, col in (('StockReservation', data['reservations'], 'quantityReserved'),
                             ('LotConsumption', data['lotconsumptions'], 'quantity')):
        for r in rows:
            mid = r['rawMaterialId']
            if mid not in mats:
                continue
            c = conv(num(r['quantity']), r['unit'], target_unit[mid])
            if c is not None:
                aux_fix.append((table, col, r['id'], num(r['quantity']), r['unit'], c, target_unit[mid]))
    # Recipe journal rows in a unit other than the product's
    rec_fix = []
    for r in data['recipemovements']:
        if r['unit'] == r['recipe_unit']:
            continue
        c = conv(num(r['quantity']), r['unit'], r['recipe_unit'])
        rec_fix.append((r['id'], num(r['quantity']), r['unit'], c if c is not None else num(r['quantity']), r['recipe_unit'], r['name'], r['movementType']))

    w = sys.stdout.write
    w(f"-- fix-units — generated by scripts/fix-units/plan.py for {env}\n")
    w("-- Review the dry run, then run the whole file; it ends in ROLLBACK.\n")
    w("-- Change the last line to COMMIT only after the dry run and the in-transaction\n")
    w("-- check look right. Every UPDATE is guarded by the value seen at export time.\n")
    if skipped:
        w("-- SKIPPED (journal does not reproduce today's stock — count manually): " + ', '.join(skipped) + "\n")
    w("\n-- ===== DRY RUN (read-only) =====\n")
    w("SELECT * FROM (VALUES\n")
    preview = []
    for t, i, oq, ou, nq, nu, title, typ in row_fix:
        preview.append(f"  ('movement', {q(title)}, {q(typ)}, {lit(oq)}::numeric, {q(ou)}, {lit(nq)}::numeric, {q(nu)})")
    for i, oq, nq, title, ou, nu in stock_fix:
        preview.append(f"  ('stock', {q(title)}, 'MaterialStock', {lit(oq)}::numeric, {q(ou)}, {lit(nq)}::numeric, {q(nu)})")
    for i, oq, orem, nq, nrem, title in lot_fix:
        preview.append(f"  ('lot remaining', {q(title)}, 'StockLot', {lit(orem)}::numeric, '', {lit(nrem)}::numeric, '')")
    for table, col, i, oq, ou, nq, nu in aux_fix:
        preview.append(f"  ({q(table)}, '', {q(col)}, {lit(oq)}::numeric, {q(ou)}, {lit(nq)}::numeric, {q(nu)})")
    for i, oq, ou, nq, nu, name, typ in rec_fix:
        preview.append(f"  ('recipe movement', {q(name)}, {q(typ)}, {lit(oq)}::numeric, {q(ou)}, {lit(nq)}::numeric, {q(nu)})")
    w(',\n'.join(preview) if preview else "  ('nothing', '', '', 0::numeric, '', 0::numeric, '')")
    w("\n) AS plan(kind, item, what, old_qty, old_unit, new_qty, new_unit);\n")

    w("\n-- ===== APPLY =====\nBEGIN;\n")
    for mid in sorted(vanilla):
        if mats[mid]['unit'] != 'GRAME':
            w(f"UPDATE \"RawMaterial\" SET unit = 'GRAME', \"minimumStock\" = \"minimumStock\" * 1000, \"updatedAt\" = now() WHERE id = {q(mid)} AND unit = {q(mats[mid]['unit'])};\n")
    for t, i, oq, ou, nq, nu, title, typ in row_fix:
        w(f"UPDATE \"StockMovement\" SET quantity = quantity * {factor(oq, nq)}, unit = {q(nu)} WHERE id = {q(i)} AND unit = {q(ou)} AND {near('quantity', oq)}; -- {title} {typ}\n")
    for table, col, i, oq, ou, nq, nu in aux_fix:
        w(f"UPDATE \"{table}\" SET \"{col}\" = \"{col}\" * {factor(oq, nq)}, unit = {q(nu)} WHERE id = {q(i)} AND unit = {q(ou)} AND {near(col, oq)};\n")
    if vanilla:
        ids = ', '.join(q(m) for m in sorted(vanilla))
        w(f"UPDATE \"StockReservation\" SET \"quantityReserved\" = \"quantityReserved\" * 1000, unit = 'GRAME' WHERE \"rawMaterialId\" IN ({ids}) AND unit = 'KILOGRAME';\n")
        w(f"UPDATE \"LotConsumption\" SET quantity = quantity * 1000, unit = 'GRAME' WHERE \"rawMaterialId\" IN ({ids}) AND unit = 'KILOGRAME';\n")
    for i, oq, nq, title, ou, nu in stock_fix:
        w(f"UPDATE \"MaterialStock\" SET quantity = quantity + ({lit(nq - oq)}), \"updatedAt\" = now() WHERE id = {q(i)} AND {near('quantity', oq)}; -- {title}: {lit(oq)} -> {lit(nq)}\n")
    for i, oq, orem, nq, nrem, title in lot_fix:
        w(f"UPDATE \"StockLot\" SET \"remainingQuantity\" = \"remainingQuantity\" + ({lit(nrem - orem)}), \"updatedAt\" = now() WHERE id = {q(i)} AND {near('remainingQuantity', orem)}; -- {title}: remaining {lit(orem)} -> {lit(nrem)}\n")
    for i, oq, ou, nq, nu, name, typ in rec_fix:
        w(f"UPDATE \"StockMovement\" SET quantity = quantity * {factor(oq, nq) if oq else 1}, unit = {q(nu)} WHERE id = {q(i)} AND unit = {q(ou)} AND {near('quantity', oq)}; -- {name} {typ}\n")
    if new_count:
        ids = ', '.join(q(m) for m in sorted(new_count))
        w(f"UPDATE \"RawMaterial\" rm SET \"stockCount\" = COALESCE((SELECT SUM(ms.quantity) FROM \"MaterialStock\" ms WHERE ms.\"rawMaterialId\" = rm.id), 0), \"updatedAt\" = now() WHERE rm.id IN ({ids});\n")
        w("\n-- in-transaction check: stock vs lots for every corrected material\n")
        w(f"SELECT rm.title, rm.unit, rm.\"stockCount\"::numeric(18,6) AS stock, (SELECT COALESCE(SUM(\"remainingQuantity\"),0) FROM \"StockLot\" sl WHERE sl.\"rawMaterialId\" = rm.id)::numeric(18,6) AS lots FROM \"RawMaterial\" rm WHERE rm.id IN ({ids}) ORDER BY rm.title;\n")
    w("\nROLLBACK; -- change to COMMIT once reviewed\n")

    sys.stderr.write(
        f"{env}: {len(row_fix)} movement rows, {len(stock_fix)} stock rows, {len(lot_fix)} lots, "
        f"{len(aux_fix)} reservation/consumption rows, {len(rec_fix)} recipe rows; skipped: {skipped}\n")


if __name__ == '__main__':
    main()
