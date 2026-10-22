"""Integration test for POST <resource>/bulk-delete[/preview] against a local API.
Usage: python3 -I bulk-test.py [BASE]   (default http://localhost:3077/api/v1)"""
import json, sys, urllib.request, uuid
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3077/api/v1'
PASS = FAIL = 0
def call(method, path, body=None, tok=None):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'content-type': 'application/json', **({'authorization': 'Bearer ' + tok} if tok else {})})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw.decode()
def check(name, cond, info=''):
    global PASS, FAIL
    PASS += cond; FAIL += (not cond)
    print(('  ok   ' if cond else '  FAIL ') + name + ('' if cond else f'  -> {info}'))
def login(email, pw):
    s, d = call('POST', '/auth/login', {'email': email, 'password': pw}); assert s == 201 or s == 200, (s, d); return d['accessToken']
def must(s, d, exp=(200, 201)):
    assert s in exp, (s, d); return d
def items(d): return d.get('data') if isinstance(d, dict) and 'data' in d else d.get('items') if isinstance(d, dict) and 'items' in d else d
def total(path, tok): s, d = call('GET', path, tok=tok); return d.get('total') if isinstance(d, dict) and 'total' in d else len(items(d) or [])
def deps(d): return {x['key']: x['count'] for x in d['dependents']}

ADMIN = login('demo@horae.ca', 'HoraeDemo2026!')
VIZ = login('viz@test.local', 'HoraeDemo2026!')
OTHER = login('admin@test.local', 'Test1234!')

print('\n# 1. validation + permissions')
s, d = call('POST', '/tasks/bulk-delete', {'ids': []}, ADMIN); check('empty ids -> 400', s == 400, d)
s, d = call('POST', '/tasks/bulk-delete', {'ids': ['nope']}, ADMIN); check('non-uuid -> 400', s == 400, d)
s, d = call('POST', '/tasks/bulk-delete', {'ids': [str(uuid.uuid4())]}); check('no auth -> 401', s == 401, d)
s, d = call('POST', '/recipes/bulk-delete', {'ids': [str(uuid.uuid4())]}, VIZ); check('viewer -> 403', s == 403, d)
s, d = call('POST', '/recipes/bulk-delete/preview', {'ids': [str(uuid.uuid4())]}, VIZ); check('viewer preview -> 403', s == 403, d)
ghost = str(uuid.uuid4())
s, d = call('POST', '/tasks/bulk-delete/preview', {'ids': [ghost]}, ADMIN); check('preview unknown -> missing', s == 200 and d['missing'] == [ghost] and d['found'] == 0, d)
s, d = call('POST', '/tasks/bulk-delete', {'ids': [ghost], 'cascade': True}, ADMIN); check('delete unknown -> failed row', s == 200 and len(d['failed']) == 1 and d['deleted'] == [], d)

print('\n# 2. fixtures')
locs = items(must(*call('GET', '/locations', tok=ADMIN)))
while len(locs) < 2:
    must(*call('POST', '/locations', {'name': f'Loc {uuid.uuid4().hex[:4]}', 'type': 'DEPOZIT', 'address': 'Str. Test 1'}, ADMIN))
    locs = items(must(*call('GET', '/locations', tok=ADMIN)))
L1, L2 = locs[0]['id'], locs[1]['id']
matA = must(*call('POST', '/raw-materials', {'title': 'BT Faina', 'unit': 'KILOGRAME'}, ADMIN))['id']
matB = must(*call('POST', '/raw-materials', {'title': 'BT Zahar', 'unit': 'KILOGRAME'}, ADMIN))['id']
for m in (matA, matB):
    must(*call('POST', '/stock/movements', {'rawMaterialId': m, 'movementType': 'INTRARE', 'quantity': 100, 'unit': 'KILOGRAME', 'locationId': L1}, ADMIN))
cons = must(*call('POST', '/consumables', {'title': 'BT Cutii'}, ADMIN))['id']
must(*call('POST', '/stock/movements', {'consumableId': cons, 'movementType': 'INTRARE', 'quantity': 50, 'unit': 'BUCATI', 'locationId': L1}, ADMIN))
def recipe(name, typ, ingredients):
    return must(*call('POST', '/recipes', {'name': name, 'unit': 'BUCATI', 'yieldQuantity': 10, 'type': typ,
        'components': [{'name': 'Baza', 'sortOrder': 0, 'ingredients': ingredients}]}, ADMIN))['id']
semi = recipe('BT Crema', 'SEMIPREPARAT', [{'rawMaterialId': matB, 'name': 'Zahar', 'quantity': 1, 'unit': 'KILOGRAME', 'sortOrder': 0}])
recA = recipe('BT Tort', 'FINAL', [{'rawMaterialId': matA, 'name': 'Faina', 'quantity': 2, 'unit': 'KILOGRAME', 'sortOrder': 0}])
recC = recipe('BT Prajitura', 'FINAL', [{'semipreparatRecipeId': semi, 'name': 'Crema', 'quantity': 1, 'unit': 'BUCATI', 'sortOrder': 0},
                                        {'rawMaterialId': matA, 'name': 'Faina', 'quantity': 1, 'unit': 'KILOGRAME', 'sortOrder': 1}])
taskA = must(*call('POST', '/tasks', {'recipeId': recA, 'targetQuantity': 10, 'targetUnit': 'BUCATI', 'locationId': L1}, ADMIN))['id']
s, d = call('POST', f'/tasks/{taskA}/transition', {'status': 'IN_LUCRU'}, ADMIN); check('task -> IN_LUCRU (reserves stock)', s in (200, 201), d)
taskB = must(*call('POST', '/tasks', {'recipeId': recC, 'targetQuantity': 5, 'targetUnit': 'BUCATI', 'locationId': L1}, ADMIN))['id']
order = must(*call('POST', '/orders', {'deliveryPoint': 'BT Client', 'items': [{'recipeId': recA, 'quantity': 2, 'unit': 'BUCATI'}]}, ADMIN))['id']
transfer = must(*call('POST', '/stock/transfers', {'fromLocationId': L1, 'toLocationId': L2, 'items': [{'rawMaterialId': matB, 'quantity': 10, 'unit': 'KILOGRAME'}]}, ADMIN))['id']
def loc_qty(loc, mat):
    rows = items(must(*call('GET', f'/locations/{loc}/stock', tok=ADMIN))) or []
    return next((float(r['quantity']) for r in rows if r['rawMaterialId'] == mat), 0.0)
check('transfer deducted 10 from source', loc_qty(L1, matB) == 90.0, loc_qty(L1, matB))
matA_dto = must(*call('GET', f'/raw-materials/{matA}', tok=ADMIN))
check('material A has reservation from IN_LUCRU task', float(matA_dto.get('reservedCount') or 0) > 0, matA_dto.get('reservedCount'))
# sales deduction on recA (needs recipe stock) — give it stock by finishing a task? simpler: manual draft + confirm with stockOverride
sd = must(*call('POST', '/sales-deductions/manual', {'locationId': L1}, ADMIN))['id']
s, d = call('POST', f'/sales-deductions/{sd}/confirm', {'lines': [{'rawName': 'Tort', 'decision': 'ACCEPT', 'recipeId': recA, 'quantity': 3, 'acceptShortfall': True}]}, ADMIN)
check('sales deduction confirmed', s in (200, 201) and d.get('status') == 'CONFIRMED', (s, d))
otherMat = must(*call('POST', '/raw-materials', {'title': 'Other org mat'}, OTHER))['id']

print('\n# 3. cross-org isolation')
s, d = call('POST', '/raw-materials/bulk-delete/preview', {'ids': [otherMat]}, ADMIN); check('other org id -> missing', d['missing'] == [otherMat], d)
s, d = call('POST', '/raw-materials/bulk-delete', {'ids': [otherMat], 'cascade': True}, ADMIN); check('other org id -> not deleted', d['deleted'] == [] and len(d['failed']) == 1, d)
s, d = call('GET', f'/raw-materials/{otherMat}', tok=OTHER); check('other org row still there', s == 200, s)

print('\n# 4. recipe with task + order + semipreparat usage')
s, d = call('POST', '/recipes/bulk-delete/preview', {'ids': [recA]}, ADMIN); dp = deps(d)
check('preview recA: tasks=1, orderLines=1, salesLines=1', dp.get('tasks') == 1 and dp.get('orderLines') == 1 and dp.get('salesLines') == 1, d)
s, d = call('POST', '/recipes/bulk-delete', {'ids': [recA]}, ADMIN)
check('no cascade -> refused with dependency reason', d['deleted'] == [] and 'dependențe' in d['failed'][0]['reason'], d)
s, d = call('GET', f'/recipes/{recA}', tok=ADMIN); check('recA still exists after refusal', s == 200, s)
s, d = call('POST', '/recipes/bulk-delete', {'ids': [recA], 'cascade': True}, ADMIN)
check('cascade -> recA deleted, no failures', d['deleted'] == [recA] and d['failed'] == [], d)
s, _ = call('GET', f'/recipes/{recA}', tok=ADMIN); check('recA gone', s == 404, s)
s, _ = call('GET', f'/tasks/{taskA}', tok=ADMIN); check('its IN_LUCRU task gone', s == 404, s)
matA_dto = must(*call('GET', f'/raw-materials/{matA}', tok=ADMIN))
check('material A reservation released (reservedCount 0)', float(matA_dto.get('reservedCount') or 0) == 0, matA_dto.get('reservedCount'))
o = must(*call('GET', f'/orders/{order}', tok=ADMIN))
check('order kept, line unlinked but labelled', len(o['items']) == 1 and o['items'][0].get('recipeId') is None and (o['items'][0].get('label') or o['items'][0].get('productName')) == 'BT Tort', o['items'])
s, d = call('GET', f'/sales-deductions/{sd}', tok=ADMIN); check('sales deduction kept (line unlinked)', s == 200, s)
s, d = call('POST', '/recipes/bulk-delete/preview', {'ids': [semi]}, ADMIN); dp = deps(d)
check('preview semi: semipreparatIn=1', dp.get('semipreparatIn') == 1, d)
s, d = call('POST', '/recipes/bulk-delete', {'ids': [semi], 'cascade': True}, ADMIN); check('semi deleted', d['deleted'] == [semi] and not d['failed'], d)
c = must(*call('GET', f'/recipes/{recC}', tok=ADMIN))
ings = [i for comp in c['components'] for i in comp['ingredients']]
check('recC kept, semipreparat ingredient removed, raw one kept', len(ings) == 1 and ings[0].get('rawMaterialId') == matA, ings)

print('\n# 5. active transfer returns stock')
s, d = call('POST', '/stock/transfers/bulk-delete/preview', {'ids': [transfer]}, ADMIN); check('preview transfer: activeTransfers=1', deps(d).get('activeTransfers') == 1, d)
s, d = call('POST', '/stock/transfers/bulk-delete', {'ids': [transfer]}, ADMIN); check('no cascade -> refused', d['deleted'] == [], d)
s, d = call('POST', '/stock/transfers/bulk-delete', {'ids': [transfer], 'cascade': True}, ADMIN); check('cascade -> deleted', d['deleted'] == [transfer] and not d['failed'], d)
check('source stock back to 100', loc_qty(L1, matB) == 100.0, loc_qty(L1, matB))
s, _ = call('GET', f'/stock/transfers/{transfer}', tok=ADMIN); check('transfer gone', s == 404, s)

print('\n# 6. raw material used in recipe, with stock')
s, d = call('POST', '/raw-materials/bulk-delete/preview', {'ids': [matA]}, ADMIN); dp = deps(d)
check('preview matA: recipesUsing=1, nonZeroStock=1', dp.get('recipesUsing') == 1 and dp.get('nonZeroStock') == 1, d)
s, d = call('POST', '/raw-materials/bulk-delete', {'ids': [matA], 'cascade': True}, ADMIN); check('matA deleted', d['deleted'] == [matA] and not d['failed'], d)
c = must(*call('GET', f'/recipes/{recC}', tok=ADMIN))
check('recC now has no ingredients but exists', sum(len(x['ingredients']) for x in c['components']) == 0, c['components'])
s, d = call('GET', '/stock/movements?limit=100', tok=ADMIN); mv = [m for m in (items(d) or []) if m.get('rawMaterialId') == matA]
check('matA movements gone', len(mv) == 0, len(mv))

print('\n# 7. consumable with stock')
s, d = call('POST', '/consumables/bulk-delete/preview', {'ids': [cons]}, ADMIN); check('preview cons: nonZeroStock=1', deps(d).get('nonZeroStock') == 1, d)
s, d = call('POST', '/consumables/bulk-delete', {'ids': [cons], 'cascade': True}, ADMIN); check('cons deleted', d['deleted'] == [cons] and not d['failed'], d)

print('\n# 8. sales deduction (confirmed -> reverted -> deleted)')
s, d = call('POST', '/sales-deductions/bulk-delete/preview', {'ids': [sd]}, ADMIN); check('preview sd: confirmedDeductions=1', deps(d).get('confirmedDeductions') == 1, d)
s, d = call('POST', '/sales-deductions/bulk-delete', {'ids': [sd], 'cascade': True}, ADMIN); check('sd deleted', d['deleted'] == [sd] and not d['failed'], d)
s, _ = call('GET', f'/sales-deductions/{sd}', tok=ADMIN); check('sd gone', s == 404, s)

print('\n# 9. orders + tasks (plain)')
s, d = call('POST', '/orders/bulk-delete/preview', {'ids': [order]}, ADMIN); check('preview order: clean', d['dependents'] == [] and d['found'] == 1, d)
s, d = call('POST', '/orders/bulk-delete', {'ids': [order, order]}, ADMIN); check('order deleted (dupes collapsed)', d['deleted'] == [order] and not d['failed'], d)
s, d = call('POST', '/tasks/bulk-delete', {'ids': [taskB]}, ADMIN); check('taskB deleted without cascade (clean)', d['deleted'] == [taskB], d)

print('\n# 10. delete EVERYTHING left, per resource, cascade — zero failures expected')
for route, listpath in [('tasks', '/tasks?limit=100'), ('sales-deductions', '/sales-deductions?limit=100'), ('orders', '/orders?limit=100'),
                        ('stock/transfers', '/stock/transfers?limit=100'), ('recipes', '/recipes?limit=100'),
                        ('raw-materials', '/raw-materials?limit=100'), ('consumables', '/consumables?limit=100')]:
    ids = [i['id'] for i in (items(must(*call('GET', listpath, tok=ADMIN))) or [])]
    if not ids: check(f'{route}: nothing to delete', True); continue
    s, d = call('POST', f'/{route}/bulk-delete', {'ids': ids, 'cascade': True}, ADMIN)
    check(f'{route}: {len(ids)} deleted, 0 failed', s == 200 and len(d['deleted']) == len(ids) and not d['failed'], d)
    left = total(listpath, ADMIN); check(f'{route}: list empty afterwards', left == 0, left)

print(f'\nPASS={PASS} FAIL={FAIL}')
sys.exit(1 if FAIL else 0)
