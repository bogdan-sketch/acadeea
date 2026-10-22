'use client';

import { useEffect, useState } from 'react';
import { organization as orgApi } from '@/lib/api';
import { usePermissions } from '@/contexts/auth-context';
import type { Organization } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { ActionTiles } from '@/components/action-tiles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '../../stock/_ui/parts';
import { Building, Save, Percent, Truck } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Firmă și documente — company data printed on avize/declarații + the VAT
 * cost-basis settings. Moved out of the Setări hub so the hub stays 1:1 with
 * the design (Organizație / Sistem link cards only).
 */
export default function CompanySettingsPage() {
  const { can } = usePermissions();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState('');
  const [cui, setCui] = useState('');
  const [legalAddress, setLegalAddress] = useState('');
  const [regCom, setRegCom] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [administratorName, setAdministratorName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    orgApi
      .get()
      .then((o) => {
        setOrg(o);
        setName(o.name || '');
        setCui(o.cui || '');
        setLegalAddress(o.legalAddress || '');
        setRegCom(o.regCom || '');
        setContactPhone(o.contactPhone || '');
        setContactEmail(o.contactEmail || '');
        setWebsite(o.website || '');
        setAdministratorName(o.administratorName || '');
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await orgApi.update({
        name,
        cui: cui.trim() || null,
        legalAddress: legalAddress.trim() || null,
        regCom: regCom.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        website: website.trim() || null,
        administratorName: administratorName.trim() || null,
      });
      setOrg(updated);
      toast.success('Setări salvate');
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  if (!can('update', 'Organization')) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink href="/profil?tab=setari#companie" label="Profil & setări" />
        <EmptyState
          icon={Building}
          title="Fără acces la datele firmei"
          description="Doar administratorii organizației pot modifica datele de pe documente."
          actionLabel="Înapoi la setări"
          actionHref="/profil?tab=setari"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/profil?tab=setari#companie" label="Profil & setări" />
      <PageHead
        title="Firmă și documente"
        meta="Organizație · datele tipărite pe avize și declarații + regimul de TVA"
      />

      <div className="flex max-w-3xl flex-col gap-5">
        <TutorialAnchor id="settings.org.company">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Date firmă
                </CardTitle>
                <ActionTiles
                  actions={[
                    {
                      key: 'save',
                      label: 'Salvează datele firmei',
                      word: 'Salvează',
                      icon: Save,
                      spinning: saving,
                      onClick: handleSave,
                      disabled: saving,
                      title: 'Salvează datele organizației',
                    },
                  ]}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nume organizație</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>CUI</Label>
                  <Input
                    value={cui}
                    onChange={(e) => setCui(e.target.value)}
                    placeholder="ex. RO12345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Adresă sediu (documente)</Label>
                  <Input
                    value={legalAddress}
                    onChange={(e) => setLegalAddress(e.target.value)}
                    placeholder="Adresa tipărită pe avize"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nr. Reg. Com.</Label>
                  <Input
                    value={regCom}
                    onChange={(e) => setRegCom(e.target.value)}
                    placeholder="ex. J2019004159128"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefon (documente)</Label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="ex. 0757796625"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email (documente)</Label>
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="ex. comenzi@acadeea.ro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="ex. www.acadeea.ro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Administrator (semnează declarațiile)</Label>
                  <Input
                    value={administratorName}
                    onChange={(e) => setAdministratorName(e.target.value)}
                    placeholder="ex. Anca Cheregi"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TutorialAnchor>

        {/* VAT: payer status decides the cost basis of stored purchase prices */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              TVA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label>Plătitor de TVA</Label>
                <p className="text-sm text-muted-foreground">
                  Ca plătitor, prețurile de achiziție se rețin <b>fără TVA</b> (TVA-ul se
                  recuperează, costul real e cel net). Ca neplătitor, se rețin <b>cu TVA</b>. La
                  introducerea unui preț poți bifa dacă valoarea tastată include TVA — conversia se
                  face automat.
                </p>
              </div>
              <Switch
                checked={org?.vatPayer ?? true}
                onCheckedChange={async (checked) => {
                  try {
                    const updated = await orgApi.update({ vatPayer: checked });
                    setOrg(updated);
                    toast.success(checked ? 'Setat: plătitor de TVA' : 'Setat: neplătitor de TVA');
                  } catch {
                    toast.error('Eroare la salvare');
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label>Cota TVA (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                className="w-24 text-right"
                defaultValue={Number(org?.vatRatePercent ?? 21)}
                key={`vat-${Number(org?.vatRatePercent ?? 21)}`}
                onBlur={async (e) => {
                  const raw = e.target.value.trim();
                  // Number('') === 0 — an empty field must NOT save 0% VAT.
                  if (raw === '') return;
                  const v = Number(raw);
                  if (!Number.isFinite(v) || v < 0 || v > 100) return;
                  if (v === Number(org?.vatRatePercent ?? 21)) return;
                  try {
                    const updated = await orgApi.update({ vatRatePercent: v });
                    setOrg(updated);
                    toast.success('Cota TVA salvată');
                  } catch {
                    toast.error('Eroare la salvare');
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Feature switch: shop delivery (Pickupia) — gates locations + order filters. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Magazin online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="org-woo-delivery">Livrări din magazinul online</Label>
                <p className="text-sm text-muted-foreground">
                  Preia data și metoda de livrare din WooCommerce (pluginul Pickupia), ID extern și
                  unitate principală la locații, filtre pe metoda de livrare la comenzi.
                </p>
              </div>
              <Switch
                id="org-woo-delivery"
                checked={!!org?.wooDeliveryEnabled}
                disabled={!org}
                onCheckedChange={async (checked) => {
                  try {
                    const updated = await orgApi.update({ wooDeliveryEnabled: checked });
                    setOrg(updated);
                    toast.success(
                      checked
                        ? 'Livrările din magazinul online sunt active'
                        : 'Livrările din magazinul online sunt dezactivate',
                    );
                  } catch {
                    toast.error('Eroare la salvare');
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
