#!/usr/bin/env node
/**
 * Live endpoint smoke sweep — hunts 500s.
 *
 * 1. Logs in, pulls the OpenAPI document, and GETs every documented GET route
 *    (path params filled with random UUIDs) — anything >= 500 is a failure
 *    (404/400 on random ids is fine; unhandled exceptions are not).
 * 2. Runs the full CRUD lifecycle that the clients exercise (location →
 *    supplier → material → reception → recipe → task lifecycle → traceability
 *    → requirements plan → nutrition → transfer → order → recursive deletes),
 *    asserting expected statuses and zero 5xx.
 *
 * Usage: BASE_URL=https://api.test.horae.ca ADMIN_EMAIL=... ADMIN_PASSWORD=... node smoke-live.mjs
 */

const BASE = process.env.BASE_URL || 'https://api.test.horae.ca';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@acadeea.ro';
const PASSWORD = process.env.ADMIN_PASSWORD || 'asd123ASD';

const failures = [];
let token = '';

async function req(method, path, body, expect) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (res.status >= 500) {
    failures.push({ method, path, status: res.status, body: JSON.stringify(data).slice(0, 200) });
    console.log(`  ✖ 5xx  ${method} ${path} -> ${res.status}`);
  } else if (expect && res.status !== expect) {
    failures.push({
      method,
      path,
      status: res.status,
      expected: expect,
      body: JSON.stringify(data).slice(0, 200),
    });
    console.log(`  ✖ exp ${expect} got ${res.status}  ${method} ${path}`);
  }
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
console.log(`Smoke sweep on ${BASE}`);
const login = await req('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD }, 200);
if (login.status !== 200) {
  console.error('Login failed, aborting.');
  process.exit(1);
}
token = login.data.accessToken;

// --- 1. Generic GET sweep from the OpenAPI document -------------------------
const docRes = await fetch(`${BASE}/api/docs-json`, {
  headers: { Authorization: `Bearer ${token}` },
});
let getCount = 0;
if (docRes.ok) {
  const doc = await docRes.json();
  const uuid = () => crypto.randomUUID();
  for (const [path, ops] of Object.entries(doc.paths ?? {})) {
    if (!ops.get) continue;
    const concrete = path.replace(/\{[^}]+\}/g, uuid());
    await req('GET', concrete);
    getCount++;
  }
  console.log(`GET sweep: ${getCount} routes checked`);
} else {
  console.log(`(OpenAPI doc not reachable: ${docRes.status} — skipping generic sweep)`);
}

// --- 2. Full CRUD lifecycle --------------------------------------------------
console.log('CRUD lifecycle:');
const stamp = Date.now();

const loc = await req(
  'POST',
  '/api/v1/locations',
  { name: `Smoke Lab ${stamp}`, type: 'LABORATOR', address: 'Str. Test 1' },
  201,
);
const locId = loc.data?.id;

const loc2 = await req(
  'POST',
  '/api/v1/locations',
  { name: `Smoke Depozit ${stamp}`, type: 'DEPOZIT', address: 'Str. Test 2' },
  201,
);
const loc2Id = loc2.data?.id;

const supplier = await req('POST', '/api/v1/suppliers', { name: `Smoke Furnizor ${stamp}` }, 201);
const supplierId = supplier.data?.id;

const mat = await req(
  'POST',
  '/api/v1/raw-materials',
  {
    title: `Smoke Faina ${stamp}`,
    unit: 'KILOGRAME',
    storageType: 'WARM',
    supplierId,
    locationId: locId,
  },
  201,
);
const matId = mat.data?.id;

// Reception with lot + invoice (feeds FIFO)
await req(
  'POST',
  '/api/v1/stock/movements',
  {
    rawMaterialId: matId,
    movementType: 'INTRARE',
    quantity: 50,
    unit: 'KILOGRAME',
    locationId: locId,
    lotNumber: `L-${stamp}`,
    supplierInvoice: `FAC-${stamp}`,
    purchasePrice: 4.5,
  },
  201,
);

// Nutrition (feature-gated data)
await req('PATCH', '/api/v1/organization', { nutritionEnabled: true }, 200);
await req(
  'PATCH',
  `/api/v1/raw-materials/${matId}`,
  { nutrition: { calories: 364, protein: 10, carbs: 76, fat: 1 } },
  200,
);

const consumable = await req(
  'POST',
  '/api/v1/consumables',
  { title: `Smoke Cutie ${stamp}` },
  201,
);
const consumableId = consumable.data?.id;

const recipe = await req(
  'POST',
  '/api/v1/recipes',
  {
    name: `Smoke Tort ${stamp}`,
    unit: 'BUCATI',
    yieldQuantity: 2,
    type: 'FINAL',
    components: [
      {
        name: 'Blat',
        sortOrder: 0,
        ingredients: [
          { rawMaterialId: matId, name: 'Faina', quantity: 1, unit: 'KILOGRAME', sortOrder: 0 },
        ],
      },
    ],
  },
  201,
);
const recipeId = recipe.data?.id;

if (recipeId) {
  await req('GET', `/api/v1/recipes/${recipeId}/nutrition`, null, 200);
  await req('GET', `/api/v1/recipes/${recipeId}/cost`);
  await req(
    'GET',
    `/api/v1/tasks/preview-requirements?recipeId=${recipeId}&targetQuantity=2&targetUnit=BUCATI`,
    null,
    200,
  );
}

// Requirements plan + xlsx export
if (recipeId) {
  await req(
    'POST',
    '/api/v1/stock/requirements-plan',
    { items: [{ recipeId, quantity: 4 }] },
    200,
  );
  await req('POST', '/api/v1/stock/requirements-plan/export', {
    items: [{ recipeId, quantity: 4 }],
  });
}

// Task lifecycle: create → start (reserves) → finalize to ANOTHER location
// (generates the automatic foaie de drum — the FK case that 500ed today).
let taskId = null;
if (recipeId) {
  const task = await req(
    'POST',
    '/api/v1/tasks',
    { recipeId, targetQuantity: 2, targetUnit: 'BUCATI', locationId: locId },
    201,
  );
  taskId = task.data?.id;
  if (taskId) {
    await req('POST', `/api/v1/tasks/${taskId}/transition`, { status: 'IN_LUCRU' }, 200);
    await req(
      'POST',
      `/api/v1/tasks/${taskId}/transition`,
      { status: 'FINALIZAT', actualYield: 2, outputLocationId: loc2Id },
      200,
    );
    await req('GET', `/api/v1/tasks/${taskId}/traceability`, null, 200);
    await req('GET', `/api/v1/tasks/${taskId}/material-requirements`, null, 200);
  }
}

// Manual transfer with approval flow
if (matId && locId && loc2Id) {
  const tr = await req(
    'POST',
    '/api/v1/stock/transfers',
    {
      fromLocationId: locId,
      toLocationId: loc2Id,
      items: [{ rawMaterialId: matId, quantity: 1, unit: 'KILOGRAME' }],
    },
    201,
  );
  const trId = tr.data?.id;
  if (trId) {
    await req('GET', `/api/v1/stock/transfers/${trId}`, null, 200);
    await req('PATCH', `/api/v1/stock/transfers/${trId}`, { status: 'ANULAT' }, 200);
  }
}

// Order lifecycle
const order = await req(
  'POST',
  '/api/v1/orders',
  {
    deliveryPoint: `Smoke Point ${stamp}`,
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    items: recipeId ? [{ recipeId, quantity: 1, unit: 'BUCATI' }] : [],
  },
  201,
);
const orderId = order.data?.id;
if (orderId && recipeId) {
  await req('POST', `/api/v1/orders/${orderId}/items`, { recipeId, quantity: 1, unit: 'BUCATI' }, 201);
  await req('GET', `/api/v1/orders/${orderId}/delivery-note`);
}

// Shopping list + dashboards + analytics reads
await req('GET', '/api/v1/tasks/shopping-list', null, 200);
await req('GET', '/api/v1/dashboard/stats', null, 200);
await req('GET', '/api/v1/stock/low-stock', null, 200);
await req('GET', '/api/v1/stock/expiring', null, 200);

// Recursive location delete — today's 500 (historical transfers + recipe stock)
if (loc2Id) await req('DELETE', `/api/v1/locations/${loc2Id}?force=true`, null, 204);
if (locId) await req('DELETE', `/api/v1/locations/${locId}?force=true`, null, 204);

// Cleanup the rest
if (taskId) await req('DELETE', `/api/v1/tasks/${taskId}`);
if (orderId && order.data?.items?.length) {
  for (const it of order.data.items) {
    await req('DELETE', `/api/v1/orders/${orderId}/items/${it.id}`);
  }
}
if (recipeId) await req('DELETE', `/api/v1/recipes/${recipeId}`);
if (matId) await req('DELETE', `/api/v1/raw-materials/${matId}`);
if (consumableId) await req('DELETE', `/api/v1/consumables/${consumableId}`);
if (supplierId) await req('DELETE', `/api/v1/suppliers/${supplierId}`);
await req('PATCH', '/api/v1/organization', { nutritionEnabled: false }, 200);

// ---------------------------------------------------------------------------
console.log('');
if (failures.length) {
  console.log(`FAILURES: ${failures.length}`);
  for (const f of failures) {
    console.log(`  ${f.method} ${f.path} -> ${f.status}${f.expected ? ` (expected ${f.expected})` : ''}\n    ${f.body}`);
  }
  process.exit(1);
} else {
  console.log('ALL CLEAN — no 5xx, all expected statuses matched.');
}
