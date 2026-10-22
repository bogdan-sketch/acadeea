"""Smoke test for POST <resource>/bulk-action against a local API (seeded + demo admin).
Usage: python3 -I bulk-action.py [BASE]"""
import json, sys, urllib.request, uuid
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3077/api/v1'
PASS = FAIL = 0
def call(method, path, body=None, tok=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
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
    PASS += bool(cond); FAIL += (not cond)
    print(('  ok   ' if cond else '  FAIL ') + name + ('' if cond else f'  -> {info}'))
def must(s, d, exp=(200, 201)):
    assert s in exp, (s, d); return d
def items(d): return d.get('data') if isinstance(d, dict) and 'data' in d else d.get('items') if isinstance(d, dict) and 'items' in d else d
def act(route, ids, action, params=None, tok=None):
    return call('POST', f'/{route}/bulk-action', {'ids': ids, 'action': action, **({'params': params} if params is not None else {})}, tok)

_, d = call('POST', '/auth/login', {'email': 'demo@horae.ca', 'password': 'HoraeDemo2026!'}); ADMIN = d['accessToken']; ME = d['user']['id']
_, d = call('POST', '/auth/login', {'email': 'viz@test.local', 'password': 'HoraeDemo2026!'}); VIZ = d['accessToken']

print('\n# validation / permissions')
s, d = act('tasks', [str(uuid.uuid4())], 'nope', tok=ADMIN); check('unknown action -> 400', s == 400, d)
s, d = act('tasks', [str(uuid.uuid4())], 'priority', {'priority': 9}, tok=ADMIN); check('bad param -> 400 before touching rows', s == 400, d)
s, d = act('tasks', [str(uuid.uuid4())], 'status', {'status': 'FINALIZAT'}, tok=ADMIN); check('FINALIZAT not bulk-able -> 400', s == 400, d)
s, d = act('recipes', [str(uuid.uuid4())], 'archive', {'archived': True}, tok=VIZ); check('viewer -> 403', s == 403, d)
ghost = str(uuid.uuid4())
s, d = act('orders', [ghost], 'archive', {'archived': True}, tok=ADMIN); check('unknown id -> failed row', s == 200 and d['done'] == [] and len(d['failed']) == 1, d)

print('\n# fixtures')
locs = items(must(*call('GET', '/locations', tok=ADMIN)))
while len(locs) < 2:
    must(*call('POST', '/locations', {'name': f'Loc {uuid.uuid4().hex[:4]}', 'type': 'DEPOZIT', 'address': 'Str. Test 1'}, ADMIN)); locs = items(must(*call('GET', '/locations', tok=ADMIN)))
L1, L2 = locs[0]['id'], locs[1]['id']
mat = must(*call('POST', '/raw-materials', {'title': 'BA Faina', 'unit': 'KILOGRAME'}, ADMIN))['id']
must(*call('POST', '/stock/movements', {'rawMaterialId': mat, 'movementType': 'INTRARE', 'quantity': 100, 'unit': 'KILOGRAME', 'locationId': L1}, ADMIN))
cons = must(*call('POST', '/consumables', {'title': 'BA Cutii'}, ADMIN))['id']
rec = must(*call('POST', '/recipes', {'name': 'BA Tort', 'unit': 'BUCATI', 'yieldQuantity': 10, 'type': 'FINAL',
    'components': [{'name': 'Baza', 'sortOrder': 0, 'ingredients': [{'rawMaterialId': mat, 'name': 'Faina', 'quantity': 1, 'unit': 'KILOGRAME', 'sortOrder': 0}]}]}, ADMIN))['id']
t1 = must(*call('POST', '/tasks', {'recipeId': rec, 'targetQuantity': 10, 'targetUnit': 'BUCATI', 'locationId': L1}, ADMIN))['id']
t2 = must(*call('POST', '/tasks', {'recipeId': rec, 'targetQuantity': 5, 'targetUnit': 'BUCATI', 'locationId': L1}, ADMIN))['id']
o1 = must(*call('POST', '/orders', {'deliveryPoint': 'BA Client', 'items': [{'recipeId': rec, 'quantity': 2, 'unit': 'BUCATI'}]}, ADMIN))['id']
tr = must(*call('POST', '/stock/transfers', {'fromLocationId': L1, 'toLocationId': L2, 'items': [{'rawMaterialId': mat, 'quantity': 10, 'unit': 'KILOGRAME'}]}, ADMIN))['id']
sd = must(*call('POST', '/sales-deductions/manual', {'locationId': L1}, ADMIN))['id']

print('\n# tasks')
s, d = act('tasks', [t1, t2], 'priority', {'priority': 5}, tok=ADMIN); check('priority -> 2 done', d['done'] == [t1, t2] and not d['failed'], d)
check('priority persisted', must(*call('GET', f'/tasks/{t1}', tok=ADMIN))['priority'] == 5)
s, d = act('tasks', [t1, t2], 'assign', {'assignedToId': ME}, tok=ADMIN); check('assign -> 2 done', len(d['done']) == 2 and not d['failed'], d)
s, d = act('tasks', [t1], 'plannedDate', {'plannedDate': '2026-11-01T08:00:00.000Z'}, tok=ADMIN); check('plannedDate done', d['done'] == [t1], d)
s, d = act('tasks', [t1], 'status', {'status': 'IN_LUCRU'}, tok=ADMIN); check('status IN_LUCRU done (stock ok)', d['done'] == [t1], d)
s, d = act('tasks', [t1, t2], 'location', {'locationId': L2}, tok=ADMIN); check('location done', len(d['done']) == 2, d)
s, d = act('tasks', [t1, t2], 'status', {'status': 'ANULAT', 'reason': 'test'}, tok=ADMIN); check('cancel both', len(d['done']) == 2 and not d['failed'], d)
check('t1 is ANULAT', must(*call('GET', f'/tasks/{t1}', tok=ADMIN))['status'] == 'ANULAT')
m = must(*call('GET', f'/raw-materials/{mat}', tok=ADMIN)); check('reservation released after cancel', float(m.get('reservedCount') or 0) == 0, m.get('reservedCount'))

print('\n# orders')
s, d = act('orders', [o1], 'status', {'status': 'LIVRATA'}, tok=ADMIN); check('invalid transition NOUA->LIVRATA fails per row', d['done'] == [] and len(d['failed']) == 1, d)
s, d = act('orders', [o1], 'status', {'status': 'IN_PREGATIRE'}, tok=ADMIN); check('NOUA->IN_PREGATIRE done', d['done'] == [o1], d)
s, d = act('orders', [o1], 'assign', {'assignedToId': ME}, tok=ADMIN); check('assign done', d['done'] == [o1], d)
s, d = act('orders', [o1], 'dueDate', {'dueDate': '2026-11-02T10:00:00.000Z'}, tok=ADMIN); check('dueDate done', d['done'] == [o1], d)
s, d = act('orders', [o1], 'status', {'status': 'ANULATA'}, tok=ADMIN); check('cancel done', d['done'] == [o1], d)
s, d = act('orders', [o1], 'archive', {'archived': True}, tok=ADMIN); check('archive done', d['done'] == [o1], d)
check('order archived', must(*call('GET', f'/orders/{o1}', tok=ADMIN)).get('archivedAt') is not None)

print('\n# transfers')
s, d = act('stock/transfers', [tr], 'status', {'status': 'FINALIZAT'}, tok=ADMIN); check('IN_ASTEPTARE->FINALIZAT refused per row', d['done'] == [], d)
s, d = act('stock/transfers', [tr], 'status', {'status': 'IN_TRANZIT', 'assignedToId': ME}, tok=ADMIN); check('-> IN_TRANZIT done', d['done'] == [tr], d)
s, d = act('stock/transfers', [tr], 'status', {'status': 'ANULAT'}, tok=ADMIN); check('-> ANULAT done', d['done'] == [tr], d)
rows = items(must(*call('GET', f'/locations/{L1}/stock', tok=ADMIN))) or []
q = next((float(r['quantity']) for r in rows if r['rawMaterialId'] == mat), 0.0); check('stock back at source (100)', q == 100.0, q)

print('\n# raw materials / consumables')
s, d = act('raw-materials', [mat], 'category', {'category': 'BA Cat'}, tok=ADMIN); check('category done', d['done'] == [mat], d)
s, d = act('raw-materials', [mat], 'minimumStock', {'minimumStock': 7}, tok=ADMIN); check('minimumStock done', d['done'] == [mat], d)
s, d = act('raw-materials', [mat], 'supplier', {'supplierId': None}, tok=ADMIN); check('supplier null done', d['done'] == [mat], d)
s, d = act('raw-materials', [mat], 'status', {'status': 'DISCONTINUED'}, tok=ADMIN); check('discontinue done', d['done'] == [mat], d)
m = must(*call('GET', f'/raw-materials/{mat}', tok=ADMIN)); check('material fields persisted', m['status'] == 'DISCONTINUED' and float(m['minimumStock']) == 7 and m.get('category') == 'BA Cat', m)
s, d = act('raw-materials', [mat], 'status', {'status': 'ACTIVE'}, tok=ADMIN); check('reactivate done', d['done'] == [mat], d)
s, d = act('consumables', [cons], 'category', {'category': 'BA Cat'}, tok=ADMIN); check('cons category done', d['done'] == [cons], d)
s, d = act('consumables', [cons], 'status', {'status': 'DISCONTINUED'}, tok=ADMIN); check('cons discontinue done', d['done'] == [cons], d)
s, d = act('consumables', [cons], 'minimumStock', {'minimumStock': 3}, tok=ADMIN); check('cons minimumStock done', d['done'] == [cons], d)

print('\n# recipes')
s, d = act('recipes', [rec], 'category', {'category': 'BA RCat'}, tok=ADMIN); check('recipe category done', d['done'] == [rec], d)
s, d = act('recipes', [rec], 'draft', {'draft': True}, tok=ADMIN); check('draft done', d['done'] == [rec], d)
s, d = act('recipes', [rec], 'archive', {'archived': True}, tok=ADMIN); check('archive done', d['done'] == [rec], d)
r = must(*call('GET', f'/recipes/{rec}', tok=ADMIN)); check('recipe flags persisted', r['isArchived'] and r['isDraft'], (r['isArchived'], r['isDraft']))
s, d = act('recipes', [rec], 'archive', {'archived': False}, tok=ADMIN); check('unarchive done', d['done'] == [rec], d)

print('\n# sales deductions')
s, d = act('sales-deductions', [sd], 'revert', tok=ADMIN); check('revert on DRAFT fails per row', d['done'] == [], d)
s, d = act('sales-deductions', [sd], 'discard', tok=ADMIN); check('discard DRAFT done', d['done'] == [sd], d)
check('status ANULAT', must(*call('GET', f'/sales-deductions/{sd}', tok=ADMIN))['status'] == 'ANULAT')

print('\n# cleanup (bulk delete with cascade)')
for route, ids in [('tasks', [t1, t2]), ('orders', [o1]), ('stock/transfers', [tr]), ('sales-deductions', [sd]), ('recipes', [rec]), ('raw-materials', [mat]), ('consumables', [cons])]:
    s, d = call('POST', f'/{route}/bulk-delete', {'ids': ids, 'cascade': True}, ADMIN); check(f'{route} cleaned', s == 200 and not d['failed'], d)

print(f'\nPASS={PASS} FAIL={FAIL}')
sys.exit(1 if FAIL else 0)
