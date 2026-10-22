/**
 * Thin builders over the public API — every fixture is created through the
 * same endpoints the clients use (so DTO validation is exercised too).
 */
import { TestApp } from './app';
import { RoleSlug, TestOrg, uid } from './org';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export class Api {
  constructor(
    readonly t: TestApp,
    readonly org: TestOrg,
  ) {}

  /** Request as a role; asserts the status when `expect` is given. */
  async req(
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
    expectStatus?: number,
    role: RoleSlug = 'administrator',
  ): Promise<{ status: number; body: Json; headers: Json; text: string }> {
    const r = await this.t.http[method](path).set(this.org.as(role)).send(body);
    if (r.status >= 500) {
      throw new Error(
        `5xx ${method.toUpperCase()} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 600)}`,
      );
    }
    if (expectStatus !== undefined && r.status !== expectStatus) {
      throw new Error(
        `Expected ${expectStatus}, got ${r.status}: ${method.toUpperCase()} ${path}\n${JSON.stringify(r.body).slice(0, 800)}`,
      );
    }
    return r;
  }

  get = (p: string, s?: number, role?: RoleSlug) => this.req('get', p, undefined, s, role);
  post = (p: string, b?: object, s?: number, role?: RoleSlug) => this.req('post', p, b, s, role);
  patch = (p: string, b?: object, s?: number, role?: RoleSlug) => this.req('patch', p, b, s, role);
  put = (p: string, b?: object, s?: number, role?: RoleSlug) => this.req('put', p, b, s, role);
  del = (p: string, s?: number, role?: RoleSlug) => this.req('delete', p, undefined, s, role);

  async location(overrides: Json = {}): Promise<Json> {
    return (
      await this.post(
        '/api/v1/locations',
        { name: `Loc ${uid()}`, type: 'LABORATOR', address: 'Str. Testului 1', ...overrides },
        201,
      )
    ).body;
  }

  async rawMaterial(overrides: Json = {}): Promise<Json> {
    return (
      await this.post(
        '/api/v1/raw-materials',
        { title: `MP ${uid()}`, unit: 'GRAME', ...overrides },
        201,
      )
    ).body;
  }

  async consumable(overrides: Json = {}): Promise<Json> {
    return (await this.post('/api/v1/consumables', { title: `Cons ${uid()}`, ...overrides }, 201))
      .body;
  }

  /** INTRARE (reception) — creates a lot. */
  async receive(rawMaterialId: string, quantity: number, extra: Json = {}): Promise<Json> {
    return (
      await this.post(
        '/api/v1/stock/movements',
        { rawMaterialId, movementType: 'INTRARE', quantity, unit: 'GRAME', ...extra },
        201,
      )
    ).body;
  }

  async rawMaterialById(id: string): Promise<Json> {
    return (await this.get(`/api/v1/raw-materials/${id}`, 200)).body;
  }

  /**
   * A recipe with one component. `ingredients`: [{rawMaterialId|semipreparatRecipeId, quantity, unit?}].
   */
  async recipe(
    ingredients: {
      rawMaterialId?: string;
      semipreparatRecipeId?: string;
      quantity: number;
      unit?: string;
      name?: string;
    }[],
    overrides: Json = {},
  ): Promise<Json> {
    return (
      await this.post(
        '/api/v1/recipes',
        {
          name: `Reteta ${uid()}`,
          unit: 'BUCATI',
          yieldQuantity: 1,
          type: 'FINAL',
          components: [
            {
              name: 'Baza',
              sortOrder: 0,
              ingredients: ingredients.map((i, idx) => ({
                name: i.name ?? `Ing ${idx}`,
                sortOrder: idx,
                unit: i.unit ?? 'GRAME',
                quantity: i.quantity,
                ...(i.rawMaterialId ? { rawMaterialId: i.rawMaterialId } : {}),
                ...(i.semipreparatRecipeId ? { semipreparatRecipeId: i.semipreparatRecipeId } : {}),
              })),
            },
          ],
          ...overrides,
        },
        201,
      )
    ).body;
  }

  async task(body: Json, s = 201): Promise<Json> {
    return (await this.post('/api/v1/tasks', body, s)).body;
  }

  async transition(taskId: string, body: Json, s?: number, role?: RoleSlug) {
    return this.post(`/api/v1/tasks/${taskId}/transition`, body, s, role);
  }
}
