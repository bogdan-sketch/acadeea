#!/usr/bin/env node
// Turns a PROD extract (extract.sql) + the TEST lookup (test-lookup.sql) into an
// idempotent SQL script for the TEST database.
//
//   node transform.mjs prod-extract.json test-lookup.json > load.sql
//
// Rules
// - Ids: every prod id becomes a deterministic test id (uuid v5-style sha1 of
//   "horae-seed-from-prod:<prod id>"), so a re-run maps to the same rows and every
//   INSERT is `ON CONFLICT DO NOTHING` (second run inserts 0 rows).
// - Natural keys already present in TEST (location by name/type, category by
//   name+kind, supplier/material/consumable/recipe by name, order by number,
//   integration by provider) are reused and LEFT UNTOUCHED: their children
//   (components, stock rows, lots, movements, reservations) are not copied.
// - Users are not copied: prod users map to existing test users with the same
//   role name (deterministic pick), falling back to the first Administrator.
// - Personal data: customer names, supplier contacts and Woo billing blocks are
//   generated (fake Romanian values, @example.com e-mails). Integration secrets
//   are never extracted; a missing integration is created with config {}.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [prodPath, testPath] = process.argv.slice(2);
if (!prodPath || !testPath) {
  console.error('usage: node transform.mjs prod-extract.json test-lookup.json > load.sql');
  process.exit(2);
}
const P = JSON.parse(readFileSync(prodPath, 'utf8'));
const T = JSON.parse(readFileSync(testPath, 'utf8'));
const ORG = T.orgId;

// ---------- helpers ----------
const sha = (s) => createHash('sha1').update(s).digest();
function tid(prodId) {
  if (prodId == null) return null;
  const h = sha('horae-seed-from-prod:' + prodId);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const pick = (seed, arr) => arr[sha(String(seed)).readUInt32BE(0) % arr.length];
const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function pgArray(a) {
  return '{' + a.map((v) => (v == null ? 'NULL' : '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"')).join(',') + '}';
}
// Json/Jsonb columns in the copied tables — always serialized as JSON (a JSON
// array must not become a Postgres array literal).
const JSON_COLS = new Set(['nutrition', 'shortages', 'config', 'rawPayload']);
function lit(v, col) {
  if (v === null || v === undefined) return 'NULL';
  if (JSON_COLS.has(col)) return q(JSON.stringify(v));
  if (Array.isArray(v)) return q(pgArray(v));
  if (typeof v === 'object') return q(JSON.stringify(v));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return q(v);
}
const out = [];
const counts = {};
function insert(table, rows) {
  counts[table] = (counts[table] ?? 0) + rows.length;
  if (!rows.length) return;
  out.push(`-- ${table}: ${rows.length} candidate rows`);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const cols = Object.keys(chunk[0]);
    out.push(
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES\n` +
        chunk.map((r) => '  (' + cols.map((c) => lit(r[c], c)).join(', ') + ')').join(',\n') +
        '\nON CONFLICT DO NOTHING;',
    );
  }
}
const without = (o, ...keys) => {
  const r = { ...o };
  for (const k of keys) delete r[k];
  return r;
};

// ---------- fake data ----------
const FIRST = ['Andrei', 'Ioana', 'Mihai', 'Elena', 'Alexandru', 'Maria', 'Cristian', 'Ana', 'Vlad', 'Raluca', 'Bogdan', 'Diana', 'Radu', 'Cristina', 'Ştefan', 'Larisa', 'Florin', 'Oana', 'Sorin', 'Bianca', 'Paul', 'Adriana', 'Tudor', 'Corina'];
const LAST = ['Popescu', 'Ionescu', 'Pop', 'Muresan', 'Rus', 'Moldovan', 'Lazăr', 'Stan', 'Dumitru', 'Matei', 'Crişan', 'Toma', 'Sabău', 'Pătraşcu', 'Marin', 'Bălan', 'Oprea', 'Cîmpean', 'Suciu', 'Rusu'];
const STREETS = ['Str. Memorandumului', 'Str. Observatorului', 'Calea Floreşti', 'Str. Horea', 'Bd. 21 Decembrie 1989', 'Str. Fabricii', 'Calea Turzii', 'Str. Republicii'];
const fakePerson = (seed) => ({ first: pick(seed + 'f', FIRST), last: pick(seed + 'l', LAST) });
const ascii = (s) => norm(s).replace(/[^a-z0-9]+/g, '');
const fakePhone = (seed) => '07' + String(sha(seed + 'p').readUInt32BE(0) % 100000000).padStart(8, '0');

// ---------- maps ----------
const testIds = new Set(); // every id that exists in TEST (incl. rows seeded by a previous run)
for (const k of ['locations', 'categories', 'suppliers', 'rawMaterials', 'consumables', 'recipes', 'orders', 'integrations'])
  for (const r of T[k]) testIds.add(r.id);

/** prod id → { id, isNew }. isNew=false ⇒ an existing test row we must not modify. */
function buildMap(prodRows, testRows, keyOf) {
  const byKey = new Map();
  for (const r of testRows) if (!byKey.has(keyOf(r))) byKey.set(keyOf(r), r.id);
  const m = new Map();
  for (const p of prodRows) {
    const det = tid(p.id);
    if (testIds.has(det)) m.set(p.id, { id: det, isNew: true }); // seeded by an earlier run
    else if (byKey.has(keyOf(p))) m.set(p.id, { id: byKey.get(keyOf(p)), isNew: false });
    else m.set(p.id, { id: det, isNew: true });
  }
  return m;
}
const idOf = (m, id) => (id == null ? null : m.get(id)?.id ?? null);
const isNew = (m, id) => id != null && m.get(id)?.isNew === true;

// Users: by role name
const admins = T.users.filter((u) => u.role === 'Administrator');
const fallbackUser = (admins.find((u) => u.email !== 'claude-verify@horae.ca') ?? admins[0] ?? T.users[0]).id;
const userMap = new Map();
for (const u of P.users) {
  const cands = T.users.filter((t) => t.role && t.role === u.role && t.email !== 'claude-verify@horae.ca');
  userMap.set(u.id, cands.length ? pick(u.id, cands).id : fallbackUser);
}
const usr = (id) => (id == null ? null : userMap.get(id) ?? fallbackUser);

// Locations: by normalized name, else by type, else first
const locMap = new Map();
for (const l of P.locations) {
  const hit =
    T.locations.find((t) => norm(t.name) === norm(l.name)) ??
    T.locations.find((t) => t.type === l.type) ??
    T.locations[0];
  locMap.set(l.id, hit.id);
}
const loc = (id) => (id == null ? null : locMap.get(id) ?? null);

const catMap = buildMap(P.categories, T.categories, (r) => norm(r.name) + '|' + r.kind);
const supMap = buildMap(P.suppliers, T.suppliers, (r) => norm(r.name));
const rmMap = buildMap(P.rawMaterials, T.rawMaterials, (r) => norm(r.title ?? r.name));
const consMap = buildMap(P.consumables, T.consumables, (r) => norm(r.title ?? r.name));
const recMap = buildMap(P.recipes, T.recipes, (r) => norm(r.name) + '|' + r.type);
const testOrderNumbers = new Map(T.orders.map((o) => [o.orderNumber, o.id]));
const intMap = new Map();
for (const i of P.integrations) {
  const t = T.integrations.find((x) => x.provider === i.provider);
  intMap.set(i.id, { id: t ? t.id : tid(i.id), isNew: !t || t.id === tid(i.id) });
}

// ---------- build ----------
out.push('-- Generated by apps/api/scripts/seed-from-prod/transform.mjs — do not edit.');
out.push(`-- prod extract taken at ${P.extractedAt}; target org ${ORG}`);
out.push('\\set ON_ERROR_STOP on');
out.push('BEGIN;');

// Categories (parents first — extract orders them NULLS FIRST)
insert(
  'RecipeCategoryConfig',
  P.categories.filter((c) => isNew(catMap, c.id)).map((c) => ({ ...c, id: idOf(catMap, c.id), organizationId: ORG, parentId: idOf(catMap, c.parentId) })),
);
const testKinds = new Set(T.kindColors);
insert('CategoryKindColor', P.kindColors.filter((k) => !testKinds.has(k.kind)).map((k) => ({ ...k, organizationId: ORG })));

insert(
  'Supplier',
  P.suppliers.filter((s) => isNew(supMap, s.id)).map((s) => {
    const p = fakePerson(s.id);
    return {
      id: idOf(supMap, s.id), organizationId: ORG, name: s.name,
      contactPerson: s.hasContact ? `${p.first} ${p.last}` : null,
      phone: s.hasPhone ? fakePhone(s.id) : null,
      email: s.hasEmail ? `comenzi.${ascii(s.name)}@example.com` : null,
      notes: null, createdAt: s.createdAt, updatedAt: s.updatedAt,
    };
  }),
);

insert(
  'RawMaterial',
  P.rawMaterials.filter((m) => isNew(rmMap, m.id)).map((m) => ({ ...m, id: idOf(rmMap, m.id), organizationId: ORG, supplierId: idOf(supMap, m.supplierId) })),
);
insert('Consumable', P.consumables.filter((m) => isNew(consMap, m.id)).map((m) => ({ ...m, id: idOf(consMap, m.id), organizationId: ORG })));

const newRecipes = P.recipes.filter((r) => isNew(recMap, r.id));
insert('Recipe', newRecipes.map((r) => ({ ...r, id: idOf(recMap, r.id), organizationId: ORG, createdById: usr(r.createdById), sourceRecipeId: null })));
for (const r of newRecipes.filter((r) => r.sourceRecipeId))
  out.push(`UPDATE "Recipe" SET "sourceRecipeId" = ${q(idOf(recMap, r.sourceRecipeId))} WHERE id = ${q(idOf(recMap, r.id))} AND "sourceRecipeId" IS NULL;`);

const newComp = P.components.filter((c) => isNew(recMap, c.recipeId));
const compIds = new Set(newComp.map((c) => c.id));
insert('RecipeComponent', newComp.map((c) => ({ ...c, id: tid(c.id), recipeId: idOf(recMap, c.recipeId) })));
insert(
  'RecipeIngredient',
  P.ingredients.filter((i) => compIds.has(i.componentId)).map((i) => ({
    ...i, id: tid(i.id), componentId: tid(i.componentId),
    rawMaterialId: idOf(rmMap, i.rawMaterialId), semipreparatRecipeId: idOf(recMap, i.semipreparatRecipeId),
  })),
);

insert(
  'MaterialStock',
  P.materialStocks.filter((s) => isNew(rmMap, s.rawMaterialId) && loc(s.locationId)).map((s) => ({
    ...s, id: tid(s.id), organizationId: ORG, locationId: loc(s.locationId), rawMaterialId: idOf(rmMap, s.rawMaterialId),
  })),
);
insert(
  'RecipeStock',
  P.recipeStocks.filter((s) => isNew(recMap, s.recipeId) && loc(s.locationId)).map((s) => ({
    ...s, id: tid(s.id), locationId: loc(s.locationId), recipeId: idOf(recMap, s.recipeId),
  })),
);
const newLots = P.stockLots.filter((l) => (l.rawMaterialId ? isNew(rmMap, l.rawMaterialId) : isNew(consMap, l.consumableId)));
const lotIds = new Set(newLots.map((l) => l.id));
insert('StockLot', newLots.map((l) => ({ ...l, id: tid(l.id), rawMaterialId: idOf(rmMap, l.rawMaterialId), consumableId: idOf(consMap, l.consumableId) })));
insert(
  'PriceHistory',
  P.priceHistory
    .filter((p) => (p.rawMaterialId ? isNew(rmMap, p.rawMaterialId) : p.consumableId ? isNew(consMap, p.consumableId) : isNew(recMap, p.recipeId)))
    .map((p) => ({
      ...p, id: tid(p.id), organizationId: ORG, changedById: usr(p.changedById),
      rawMaterialId: idOf(rmMap, p.rawMaterialId), consumableId: idOf(consMap, p.consumableId), recipeId: idOf(recMap, p.recipeId),
    })),
);

// Integrations: only create providers missing on test, never with secrets.
insert(
  'Integration',
  P.integrations.filter((i) => intMap.get(i.id).isNew).map((i) => ({
    id: intMap.get(i.id).id, organizationId: ORG, provider: i.provider, status: i.status,
    config: i.storeUrl ? { storeUrl: i.storeUrl } : {}, lastSyncAt: null, createdAt: i.createdAt, updatedAt: i.updatedAt,
  })),
);
insert(
  'ProductMapping',
  P.productMappings.map((m) => ({ ...m, id: tid(m.id), integrationId: intMap.get(m.integrationId)?.id, recipeId: idOf(recMap, m.recipeId) })),
);

// Tasks (parents first) + history, reservations, lots, yields
const taskIds = new Set(P.tasks.map((t) => t.id));
insert(
  'Task',
  P.tasks.map((t) => ({
    ...t, id: tid(t.id), organizationId: ORG, recipeId: idOf(recMap, t.recipeId), parentTaskId: tid(t.parentTaskId),
    locationId: loc(t.locationId), createdById: usr(t.createdById), assignedToId: usr(t.assignedToId),
    visibleToIds: (t.visibleToIds ?? []).map(usr), groupId: tid(t.groupId),
  })),
);
insert('TaskStatusHistory', P.taskHistory.map((h) => ({ ...h, id: tid(h.id), taskId: tid(h.taskId), changedById: usr(h.changedById) })));
const itemIsNew = (r) =>
  r.rawMaterialId ? isNew(rmMap, r.rawMaterialId) : r.consumableId ? isNew(consMap, r.consumableId) : isNew(recMap, r.recipeId);
insert(
  'StockReservation',
  P.reservations.filter(itemIsNew).map((r) => ({
    ...r, id: tid(r.id), organizationId: ORG, taskId: tid(r.taskId), locationId: loc(r.locationId),
    rawMaterialId: idOf(rmMap, r.rawMaterialId), consumableId: idOf(consMap, r.consumableId), recipeId: idOf(recMap, r.recipeId),
  })),
);
insert(
  'LotConsumption',
  P.lotConsumptions.filter((c) => lotIds.has(c.stockLotId) && taskIds.has(c.taskId)).map((c) => ({
    ...c, id: tid(c.id), taskId: tid(c.taskId), stockLotId: tid(c.stockLotId), rawMaterialId: idOf(rmMap, c.rawMaterialId),
  })),
);
insert('RecipeYieldHistory', P.yieldHistory.map((y) => ({ ...y, id: tid(y.id), recipeId: idOf(recMap, y.recipeId), taskId: tid(y.taskId) })));
insert(
  'RecipeStockLot',
  P.recipeStockLots.filter((l) => isNew(recMap, l.recipeId) && loc(l.locationId)).map((l) => ({
    ...l, id: tid(l.id), organizationId: ORG, recipeId: idOf(recMap, l.recipeId), locationId: loc(l.locationId),
    taskId: l.taskId && taskIds.has(l.taskId) ? tid(l.taskId) : null,
  })),
);
insert(
  'StockMovement',
  P.movements.filter(itemIsNew).map((m) => ({
    ...m, id: tid(m.id), organizationId: ORG, locationId: loc(m.locationId), performedById: usr(m.performedById),
    taskId: m.taskId && taskIds.has(m.taskId) ? tid(m.taskId) : null,
    rawMaterialId: idOf(rmMap, m.rawMaterialId), consumableId: idOf(consMap, m.consumableId), recipeId: idOf(recMap, m.recipeId),
  })),
);

// Orders (skip numbers that already exist on test)
const newOrders = P.orders.filter((o) => !testOrderNumbers.has(o.orderNumber) || testOrderNumbers.get(o.orderNumber) === tid(o.id));
const newOrderIds = new Set(newOrders.map((o) => o.id));
insert(
  'Order',
  newOrders.map((o) => {
    const p = fakePerson(o.id);
    return {
      ...without(o, 'hasDeliveryAddress', 'hasCustomerName'),
      id: tid(o.id), organizationId: ORG, pickupLocationId: loc(o.pickupLocationId),
      customerName: o.hasCustomerName ? `${p.first} ${p.last}` : null,
      deliveryAddress: o.hasDeliveryAddress ? `${pick(o.id + 's', STREETS)} nr. ${(sha(o.id).readUInt8(3) % 120) + 1}, Cluj-Napoca` : null,
      createdById: usr(o.createdById), assignedToId: usr(o.assignedToId),
    };
  }),
);
insert('OrderItem', P.orderItems.filter((i) => newOrderIds.has(i.orderId)).map((i) => ({ ...i, id: tid(i.id), orderId: tid(i.orderId), recipeId: idOf(recMap, i.recipeId) })));
insert('OrderStatusHistory', P.orderHistory.filter((h) => newOrderIds.has(h.orderId)).map((h) => ({ ...h, id: tid(h.id), orderId: tid(h.orderId), changedById: usr(h.changedById) })));
insert(
  'ExternalOrderSource',
  P.externalOrders.filter((e) => newOrderIds.has(e.orderId)).map((e) => {
    const integ = P.integrations.find((i) => i.provider === e.provider);
    const p = fakePerson(e.orderId);
    const billing = {
      first_name: p.first, last_name: p.last, city: 'Cluj-Napoca', country: 'RO',
      address_1: `${pick(e.orderId + 's', STREETS)} nr. ${(sha(e.orderId).readUInt8(3) % 120) + 1}`,
      email: `${ascii(p.first)}.${ascii(p.last)}@example.com`, phone: fakePhone(e.orderId),
    };
    return {
      id: tid(e.id), integrationId: intMap.get(integ.id).id, externalId: e.externalId, orderId: tid(e.orderId),
      syncStatus: e.syncStatus, rawPayload: { ...e.payload, billing, shipping: { ...billing, email: undefined, phone: undefined } },
      errorMessage: e.errorMessage, createdAt: e.createdAt, updatedAt: e.updatedAt,
    };
  }),
);

// Sales deductions
insert(
  'SalesDeduction',
  P.salesDeductions.filter((s) => loc(s.locationId)).map((s) => ({
    ...s, id: tid(s.id), organizationId: ORG, locationId: loc(s.locationId),
    createdById: usr(s.createdById), confirmedById: usr(s.confirmedById),
  })),
);
insert('SalesDeductionLine', P.salesDeductionLines.map((l) => ({ ...l, id: tid(l.id), salesDeductionId: tid(l.salesDeductionId), recipeId: idOf(recMap, l.recipeId) })));
const testAliases = new Set(T.salesAliases);
insert(
  'SalesProductAlias',
  P.salesAliases.filter((a) => !testAliases.has(a.normalizedName) && idOf(recMap, a.recipeId)).map((a) => ({ ...a, id: tid(a.id), organizationId: ORG, recipeId: idOf(recMap, a.recipeId) })),
);

out.push('COMMIT;');
process.stdout.write(out.join('\n') + '\n');
const matched = (m) => [...m.values()].filter((v) => !v.isNew).length;
console.error(
  JSON.stringify({ candidates: counts, reusedExistingTestRows: { categories: matched(catMap), suppliers: matched(supMap), rawMaterials: matched(rmMap), recipes: matched(recMap), orders: P.orders.length - newOrders.length } }, null, 1),
);
