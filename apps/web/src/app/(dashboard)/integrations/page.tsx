'use client';

import { BackLink } from '@/components/back-link';

import { useEffect, useState, useCallback } from 'react';
import { integrations as integrationsApi, recipes as recipesApi } from '@/lib/api';
import type { Integration, ProductMapping, ExternalOrder, Recipe } from '@/lib/types';
import { syncStatusLabels, syncStatusColors } from '@/lib/constants';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Plus,
  Plug,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings,
  Link as LinkIcon,
  Trash2,
  X,
} from 'lucide-react';
import { usePermissions } from '@/contexts/auth-context';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'sonner';

const integrationStatusColors: Record<string, string> = {
  ACTIVE: 'st-green',
  INACTIVE: 'st-gray',
  ERROR: 'st-red',
};

const integrationStatusLabels: Record<string, string> = {
  ACTIVE: 'Activ',
  INACTIVE: 'Inactiv',
  ERROR: 'Eroare',
};

const PROVIDERS = [
  { value: 'ebriza', label: 'eBriza', hint: 'Casă de marcat / POS eBriza' },
  { value: 'woocommerce', label: 'WooCommerce', hint: 'Magazin online WooCommerce' },
];

/** Title-case provider name for a raw key like "WOOCOMMERCE". */
function providerLabel(key: string): string {
  return PROVIDERS.find((p) => p.value === key.toLowerCase())?.label ?? key;
}

export default function IntegrationsPage() {
  const { can } = usePermissions();
  const isAdmin = can('manage', 'Integration');
  const [data, setData] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [provider, setProvider] = useState('ebriza');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [externalOrders, setExternalOrders] = useState<ExternalOrder[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Integration | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Mapping editor state
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [mappingExtId, setMappingExtId] = useState('');
  const [mappingExtName, setMappingExtName] = useState('');
  const [mappingRecipeId, setMappingRecipeId] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [creatingMapping, setCreatingMapping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await integrationsApi.list();
      setData(res);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await integrationsApi.create({ provider });
      setDialogOpen(false);
      load();
    } catch {
      //
    } finally {
      setCreating(false);
    }
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setLoadingDetails(true);
    try {
      const [m, o] = await Promise.all([
        integrationsApi.mappings(id),
        integrationsApi.externalOrders(id),
      ]);
      setMappings(m);
      setExternalOrders(o);
    } catch {
      //
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(true);
    try {
      const result = await integrationsApi.sync(id);
      toast.success(`Sincronizat: ${result.synced} reușite, ${result.failed} eșuate`);
      const [m, o] = await Promise.all([
        integrationsApi.mappings(id),
        integrationsApi.externalOrders(id),
      ]);
      setMappings(m);
      setExternalOrders(o);
    } catch {
      toast.error('Eroare la sincronizare');
    } finally {
      setSyncing(false);
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      await integrationsApi.delete(target.id);
      toast.success('Integrare ștearsă');
      setExpandedId(null);
      setPendingDelete(null);
      load();
    } catch (err: unknown) {
      toast.error('Eroare la ștergere', { description: (err as { message?: string }).message });
    } finally {
      setDeleting(false);
    }
  };

  const openMappingDialog = async () => {
    setMappingDialogOpen(true);
    try {
      const r = await recipesApi.list({ limit: 100 });
      setRecipes(r.data);
    } catch {
      //
    }
  };

  const submitMapping = async () => {
    if (!expandedId || !mappingExtId || !mappingRecipeId) return;
    setCreatingMapping(true);
    try {
      await integrationsApi.createMapping(expandedId, {
        externalProductId: mappingExtId,
        externalProductName: mappingExtName || mappingExtId,
        recipeId: mappingRecipeId,
      });
      toast.success('Mapare adăugată');
      setMappingDialogOpen(false);
      setMappingExtId('');
      setMappingExtName('');
      setMappingRecipeId('');
      // Refresh the mappings list for the expanded integration.
      const m = await integrationsApi.mappings(expandedId);
      setMappings(m);
      load();
    } catch {
      toast.error('Eroare la adăugarea mapării');
    } finally {
      setCreatingMapping(false);
    }
  };

  const mappingColumns: Column<ProductMapping>[] = [
    {
      key: 'externalProduct',
      header: 'Produs extern',
      sortValue: (m) => m.externalProductName,
      cell: (m) => m.externalProductName,
    },
    {
      key: 'externalId',
      header: 'ID extern',
      sortValue: (m) => m.externalProductId,
      cell: (m) => <span className="font-mono text-xs">{m.externalProductId}</span>,
    },
    {
      key: 'recipe',
      header: 'Rețetă',
      sortValue: (m) => m.recipeName,
      cell: (m) => m.recipeName,
    },
    {
      key: 'createdAt',
      header: 'Data',
      sortValue: (m) => m.createdAt,
      cell: (m) => format(new Date(m.createdAt), 'dd MMM yyyy', { locale: ro }),
    },
  ];

  const orderColumns: Column<ExternalOrder>[] = [
    {
      key: 'externalId',
      header: 'ID extern',
      sortValue: (o) => o.externalId,
      cell: (o) => <span className="font-mono text-sm">{o.externalId}</span>,
    },
    {
      key: 'syncStatus',
      header: 'Status sync',
      sortValue: (o) => syncStatusLabels[o.syncStatus] || o.syncStatus,
      cell: (o) => (
        <StatusBadge
          label={syncStatusLabels[o.syncStatus] || o.syncStatus}
          colorClass={syncStatusColors[o.syncStatus] || 'st-gray'}
        />
      ),
    },
    {
      key: 'error',
      header: 'Eroare',
      sortValue: (o) => o.errorMessage ?? null,
      cell: (o) => o.errorMessage || '—',
    },
    {
      key: 'createdAt',
      header: 'Data',
      sortValue: (o) => o.createdAt,
      cell: (o) => format(new Date(o.createdAt), 'dd MMM yyyy', { locale: ro }),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/profil?tab=setari#comenzi-site" label="Profil & setări" />
        <PageHead title="Integrări" meta="Conectează platforme externe pentru sincronizare comenzi">
          {isAdmin && (
            <IconAction
              icon={Plus}
              word="Integrare"
              tone="primary"
              label="Integrare nouă"
              title="Conectează eBriza sau WooCommerce"
              onClick={() => setDialogOpen(true)}
            />
          )}
        </PageHead>
      </div>

      {data.length === 0 && !loading ? (
        <EmptyState
          icon={Plug}
          title="Nicio integrare"
          description="Adaugă o integrare pentru a sincroniza comenzile cu platforme externe."
          actionLabel={isAdmin ? 'Adaugă integrare' : undefined}
          onAction={isAdmin ? () => setDialogOpen(true) : undefined}
        />
      ) : loading ? (
        <p className="text-muted-foreground">Se încarcă...</p>
      ) : (
        <div className="space-y-3">
          {data.map((integration) => (
            <Card key={integration.id}>
              <CardHeader className="cursor-pointer" onClick={() => handleExpand(integration.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">
                      {providerLabel(integration.provider)}
                    </CardTitle>
                    <StatusBadge
                      label={integrationStatusLabels[integration.status] || integration.status}
                      colorClass={integrationStatusColors[integration.status] || 'st-gray'}
                    />
                    <span className="text-sm text-muted-foreground">
                      {integration.mappingsCount} mapări
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {integration.lastSyncAt && (
                      <span className="text-xs text-muted-foreground">
                        Ultima sincronizare:{' '}
                        {format(new Date(integration.lastSyncAt), 'dd MMM', {
                          locale: ro,
                        })}
                      </span>
                    )}
                    {expandedId === integration.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {expandedId === integration.id && (
                <CardContent className="space-y-4 border-t pt-4">
                  {/* Config section */}
                  {isAdmin && integration.config && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <Settings className="h-3 w-3" />
                        Configurare
                      </h4>
                      <pre className="text-xs font-mono overflow-auto max-h-32">
                        {JSON.stringify(integration.config, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5">
                    <IconAction
                      icon={RefreshCw}
                      word="Sincronizează"
                      label="Sincronizează"
                      title={
                        syncing ? 'Se sincronizează…' : 'Aduce comenzile noi din platforma externă'
                      }
                      onClick={() => handleSync(integration.id)}
                      disabled={syncing}
                      spinning={syncing}
                    />
                    {isAdmin && (
                      <>
                        <IconAction
                          icon={LinkIcon}
                          word="Mapare"
                          label="Adaugă mapare"
                          title="Leagă un produs extern de o rețetă"
                          onClick={openMappingDialog}
                        />
                        <IconAction
                          icon={Trash2}
                          word="Șterge"
                          label="Șterge integrarea"
                          title="Deconectează platforma și șterge mapările"
                          onClick={() => setPendingDelete(integration)}
                        />
                      </>
                    )}
                  </div>

                  {loadingDetails ? (
                    <p className="text-sm text-muted-foreground">Se încarcă detaliile...</p>
                  ) : (
                    <>
                      <div>
                        <h4 className="text-sm font-medium mb-2">Mapări produse</h4>
                        {mappings.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nicio mapare configurată</p>
                        ) : (
                          <DataTable columns={mappingColumns} data={mappings} />
                        )}
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-2">Comenzi externe</h4>
                        {externalOrders.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nicio comandă externă</p>
                        ) : (
                          <DataTable columns={orderColumns} data={externalOrders} />
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create integration dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Integrare nouă</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Platformă</Label>
              <ChoiceChips
                label="Platformă"
                value={provider}
                onChange={(v) => v && setProvider(v)}
                options={PROVIDERS}
              />
            </div>
          </div>
          <DialogFooter>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Închide fără să creezi integrarea"
              onClick={() => setDialogOpen(false)}
            />
            <IconAction
              icon={Plus}
              word="Creează"
              tone="primary"
              label="Creează integrarea"
              title={`Conectează ${providerLabel(provider)}`}
              onClick={handleCreate}
              disabled={creating}
              spinning={creating}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Ștergi integrarea ${pendingDelete ? providerLabel(pendingDelete.provider) : ''}?`}
        description="Platforma se deconectează și mapările de produse se pierd. Comenzile deja importate rămân."
        confirmLabel="Șterge integrarea"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
      />

      {/* Mapping editor dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă mapare produs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mapping-ext-id">ID produs extern</Label>
              <Input
                id="mapping-ext-id"
                value={mappingExtId}
                onChange={(e) => setMappingExtId(e.target.value)}
                placeholder="ex: PROD-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapping-ext-name">Nume produs extern</Label>
              <Input
                id="mapping-ext-name"
                value={mappingExtName}
                onChange={(e) => setMappingExtName(e.target.value)}
                placeholder="Numele produsului din platforma externă"
              />
            </div>
            <div className="space-y-2">
              <Label>Rețetă</Label>
              <ChoiceListField
                title="Alege rețeta"
                placeholder="Selectează rețetă"
                searchPlaceholder="Caută rețetă…"
                emptyText="Nicio rețetă găsită."
                value={mappingRecipeId}
                options={recipes.map((r) => ({
                  value: r.id,
                  label: r.name,
                  hint: r.category ?? undefined,
                }))}
                onChange={setMappingRecipeId}
              />
            </div>
          </div>
          <DialogFooter>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Închide fără să adaugi maparea"
              onClick={() => setMappingDialogOpen(false)}
            />
            <IconAction
              icon={Plus}
              word="Adaugă"
              tone="primary"
              label="Adaugă maparea de produs"
              title={
                !mappingExtId || !mappingRecipeId
                  ? 'Completează ID-ul extern și alege rețeta'
                  : 'Comenzile cu acest produs vor crea taskuri pe rețeta aleasă'
              }
              onClick={submitMapping}
              disabled={!mappingExtId || !mappingRecipeId || creatingMapping}
              spinning={creatingMapping}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
