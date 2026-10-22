import { test as teardown } from '@playwright/test';
import { Api, cleanup, WEB_PREFIX } from './helpers';

type Row = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  deliveryPoint?: string;
  notes?: string;
};

/**
 * Safety net after the whole run: remove every row THIS suite left behind
 * (names start with `QA-E2E-web-`). Order matters: orders and tasks first, so
 * the recipes they reference become deletable; then recipes, then materials.
 */
teardown('sweep QA-E2E-web- leftovers', async () => {
  const api = await Api.create();
  const ours = (r: Row) =>
    [r.name, r.title, r.deliveryPoint, r.notes].some((v) => (v ?? '').startsWith(WEB_PREFIX));
  const list = async (path: string) => {
    const body = await api.get<{ data: Row[] } | Row[]>(path);
    return (Array.isArray(body) ? body : body.data).filter(ours);
  };
  const q = `search=${encodeURIComponent(WEB_PREFIX)}&limit=100`;

  await cleanup('teardown', [
    async () => api.removeOrders((await list(`/orders?${q}`)).map((r) => r.id)),
    async () => api.removeOrders((await list(`/orders?${q}&archived=true`)).map((r) => r.id)),
    async () => api.removeTasks((await list(`/tasks?${q}`)).map((r) => r.id)),
    async () => {
      for (const extra of ['', '&archived=true', '&draft=true']) {
        for (const r of await list(`/recipes?${q}${extra}`)) await api.removeRecipe(r.id);
      }
    },
    async () => {
      for (const r of await list(`/raw-materials?${q}`)) await api.removeRawMaterial(r.id);
    },
    async () => {
      for (const r of await list(`/consumables?${q}`)) await api.removeConsumable(r.id);
    },
    () => api.discardQaSalesDrafts(),
  ]);
  await api.dispose();
});
