import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from './reveal';
import { ScreenshotSlot } from './screenshot-slot';

/**
 * Momentele de scroll în stil Apple: fiecare secțiune spune o singură
 * capabilitate, cu tipografie mare centrată și un vizual amplu dedesubt.
 * Vizualele sunt mock-uri CSS în <ScreenshotSlot> — când capturile reale de
 * ecran sunt gata, se înlocuiesc prin prop-ul `src`, fără schimbări de layout.
 */

type MomentProps = {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  lead: string;
  wide?: boolean;
  children: React.ReactNode;
};

function Moment({ id, eyebrow, title, lead, wide, children }: MomentProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titlu`}
      className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28"
    >
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
        <h2
          id={`${id}-titlu`}
          className="mt-4 text-balance text-4xl leading-[1.05] font-medium tracking-tight text-foreground [font-family:var(--font-display),serif] sm:text-5xl lg:text-6xl"
        >
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {lead}
        </p>
      </Reveal>
      <Reveal
        delay={150}
        className={cn('mx-auto mt-12 lg:mt-16', wide ? 'max-w-6xl' : 'max-w-4xl')}
      >
        {children}
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------- mocks -- */

function TaskBoardMock() {
  const columns = [
    {
      name: 'De făcut',
      dot: 'bg-(--st-blue)',
      items: [
        { name: 'Tort Diplomat', meta: '×8 · Laborator' },
        { name: 'Savarine', meta: '×60 · pentru 12:00' },
      ],
    },
    {
      name: 'În lucru',
      dot: 'bg-(--st-orange)',
      items: [
        { name: 'Ecler cu fistic', meta: '×120 · rețeta v3' },
        { name: 'Cozonac cu nucă', meta: '×40 · cuptor 2' },
      ],
    },
    {
      name: 'Finalizat',
      dot: 'bg-(--st-green)',
      items: [
        { name: 'Macarons zmeură', meta: '×200 · 07:40' },
        { name: 'Choux vanilie', meta: '×90 · 09:15' },
      ],
    },
  ];
  return (
    <div className="p-3 text-left sm:p-6">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-card-foreground">Producție — luni, 6 iul.</p>
        <span className="st-gray hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline">
          3 cofetari activi
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
        {columns.map((col) => (
          <div key={col.name} className="rounded-xl bg-muted/60 p-2 sm:p-3">
            <div className="flex items-center gap-1.5 px-1">
              <span className={cn('size-1.5 shrink-0 rounded-full', col.dot)} />
              <p className="truncate text-[11px] font-semibold text-muted-foreground sm:text-xs">
                {col.name}
              </p>
            </div>
            <ul className="mt-2 space-y-2">
              {col.items.map((item) => (
                <li
                  key={item.name}
                  className="rounded-lg border border-border bg-card p-2 sm:p-2.5"
                >
                  <p className="truncate text-[11px] font-medium text-card-foreground sm:text-sm">
                    {item.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground sm:text-xs">
                    {item.meta}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function StockRow({
  name,
  qty,
  pct,
  warn,
}: {
  name: string;
  qty: string;
  pct: number;
  warn?: boolean;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-medium text-card-foreground sm:text-sm">{name}</p>
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground sm:text-xs">{qty}</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', warn ? 'bg-(--st-orange)' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

function StockTransferMock() {
  return (
    <div className="flex flex-col items-stretch gap-4 p-4 text-left sm:p-8 md:flex-row md:items-center md:gap-6">
      <div className="flex-1 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-semibold text-card-foreground">Laborator Central</p>
        <p className="font-mono text-[11px] text-muted-foreground">Depozit · Frigider</p>
        <ul className="mt-4 space-y-3.5">
          <StockRow name="Ciocolată 54%" qty="12,4 kg" pct={62} />
          <StockRow name="Unt 82%" qty="3,1 kg · sub prag" pct={16} warn />
          <StockRow name="Pastă de fistic" qty="5,0 kg" pct={48} />
        </ul>
      </div>

      <div className="flex items-center justify-center gap-2.5 md:flex-col md:px-1">
        <span className="st-indigo rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
          În tranzit
        </span>
        <ArrowRight className="size-4 rotate-90 text-muted-foreground md:rotate-0" aria-hidden />
        <p className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
          #T-118 · cu aviz
        </p>
      </div>

      <div className="flex-1 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-sm font-semibold text-card-foreground">Magazin Centru</p>
        <p className="font-mono text-[11px] text-muted-foreground">Vitrină · Frigider</p>
        <ul className="mt-4 space-y-3.5">
          <StockRow name="Ecler cu fistic" qty="46 buc" pct={71} />
          <StockRow name="Tort Diplomat" qty="5 buc" pct={38} />
          <StockRow name="Macarons zmeură" qty="112 buc" pct={84} />
        </ul>
      </div>
    </div>
  );
}

function RecipeCostMock() {
  const rows = [
    { name: 'Cremă de patiserie', qty: '2,4 kg', cost: '38,20 lei', sub: true },
    { name: 'Pastă de fistic', qty: '0,45 kg', cost: '76,50 lei' },
    { name: 'Făină 000', qty: '1,2 kg', cost: '4,10 lei' },
    { name: 'Unt 82%', qty: '0,9 kg', cost: '33,80 lei' },
  ];
  return (
    <div className="p-4 text-left sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-card-foreground sm:text-base">Ecler cu fistic</p>
          <p className="font-mono text-[11px] text-muted-foreground sm:text-xs">
            rețeta v3 · randament 120 buc
          </p>
        </div>
        <span className="st-green rounded-full px-2.5 py-0.5 text-xs font-medium">
          costuri actualizate azi
        </span>
      </div>
      <ul className="mt-5 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.name} className="flex items-baseline justify-between gap-3 py-2.5">
            <p className="flex min-w-0 items-baseline gap-2 text-xs text-card-foreground sm:text-sm">
              <span className="truncate font-medium">{row.name}</span>
              {row.sub && (
                <span className="st-purple shrink-0 rounded-full px-2 py-px text-[10px] font-medium">
                  semipreparat
                </span>
              )}
            </p>
            <p className="shrink-0 font-mono text-[11px] text-muted-foreground sm:text-xs">
              {row.qty} · {row.cost}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-muted/60 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">
          Cost lot · cost pe bucată
        </p>
        <p className="font-mono text-sm font-semibold text-card-foreground sm:text-base">
          152,60 lei · <span className="text-primary">1,27 lei/buc</span>
        </p>
      </div>
    </div>
  );
}

function OrderFlowMock() {
  const steps = [
    { label: 'Nouă', meta: 'marți, 09:12', capsule: 'st-blue' },
    { label: 'În producție', meta: 'miercuri, 06:30', capsule: 'st-orange' },
    { label: 'Livrată · aviz #A-311', meta: 'joi, 08:05', capsule: 'st-green' },
  ];
  return (
    <div className="p-4 text-left sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comenzi & livrare
      </p>
      <p className="mt-2 text-sm font-semibold text-card-foreground">Comandă #C-2041</p>
      <p className="font-mono text-[11px] text-muted-foreground">Hotel Aria · 3 produse</p>
      <ul className="mt-4 space-y-3 border-l border-border pl-4">
        {steps.map((step) => (
          <li key={step.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={cn('rounded-full px-2 py-px text-[11px] font-medium', step.capsule)}>
              {step.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{step.meta}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TraceMock() {
  const lots = [
    { lot: 'L-0409', name: 'Ouă M', exp: 'exp. 12 iul' },
    { lot: 'L-0412', name: 'Ciocolată 54%', exp: 'exp. 14 sep' },
    { lot: 'L-0415', name: 'Frișcă 35%', exp: 'exp. 9 iul' },
  ];
  return (
    <div className="p-4 text-left sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Trasabilitate FIFO
      </p>
      <p className="mt-2 text-sm font-semibold text-card-foreground">Tort Diplomat · lot P-88</p>
      <p className="font-mono text-[11px] text-muted-foreground">a consumat, în ordine:</p>
      <ul className="mt-4 space-y-2">
        {lots.map((l) => (
          <li
            key={l.lot}
            className="flex items-baseline justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
          >
            <p className="min-w-0 truncate text-xs text-card-foreground">
              <span className="font-mono font-semibold text-primary">{l.lot}</span> · {l.name}
            </p>
            <p className="shrink-0 font-mono text-[10px] text-muted-foreground">{l.exp}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalyticsMock() {
  const days = [
    { day: 'L', pct: 44 },
    { day: 'M', pct: 62 },
    { day: 'M', pct: 55 },
    { day: 'J', pct: 100 },
    { day: 'V', pct: 78 },
    { day: 'S', pct: 90 },
    { day: 'D', pct: 30 },
  ];
  const max = Math.max(...days.map((d) => d.pct));
  return (
    <div className="flex h-full flex-col p-4 text-left sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analize</p>
      <p className="mt-2 text-sm font-semibold text-card-foreground">Produse săptămâna aceasta</p>
      <p className="font-mono text-[11px] text-muted-foreground">1.840 buc · cost mediu 2,04 lei</p>
      <div
        className="mt-auto flex items-end gap-2 border-b border-border pt-6 pb-0.5"
        style={{ height: '6.5rem' }}
      >
        {days.map((d, i) => (
          <div key={`${d.day}-${i}`} className="flex-1">
            <div
              className={cn('rounded-t', d.pct === max ? 'bg-primary' : 'bg-primary/25')}
              style={{ height: `${d.pct * 0.8}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {days.map((d, i) => (
          <p
            key={`${d.day}-${i}`}
            className="flex-1 text-center font-mono text-[10px] text-muted-foreground"
          >
            {d.day}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sections -- */

export function FeatureSections() {
  return (
    <>
      <Moment
        id="functionalitati"
        eyebrow="Producție"
        title={
          <>
            Ziua de producție, limpede <em className="text-primary">de la prima oră.</em>
          </>
        }
        lead="Sarcinile de producție trec prin stări clare — de făcut, în lucru, finalizat — cu cantități, rețete și responsabili. Toată echipa vede aceeași tablă, în laborator și pe telefon."
      >
        <ScreenshotSlot>
          <TaskBoardMock />
        </ScreenshotSlot>
      </Moment>

      <Moment
        id="stocuri"
        eyebrow="Stocuri & transferuri"
        title={
          <>
            Stocul știe unde se află. <em className="text-primary">Și încotro pleacă.</em>
          </>
        }
        lead="Fiecare locație își vede stocul ei — depozit, frigider, vitrină. Transferurile între laborator și magazine pleacă cu aviz și ajung confirmate: nimic nu se pierde pe drum."
      >
        <ScreenshotSlot>
          <StockTransferMock />
        </ScreenshotSlot>
      </Moment>

      <Moment
        id="retete"
        eyebrow="Rețete & costuri"
        title={
          <>
            Costul exact, <em className="text-primary">până la ultimul gram.</em>
          </>
        }
        lead="Rețetele cuprind ingrediente, semipreparate și randamente. Când se schimbă prețul untului, se schimbă și costul eclerului — automat, în toate rețetele care îl folosesc."
      >
        <ScreenshotSlot>
          <RecipeCostMock />
        </ScreenshotSlot>
      </Moment>

      <Moment
        id="cum-functioneaza"
        eyebrow="Cum funcționează"
        title={
          <>
            De la comandă la aviz, <em className="text-primary">cu fiecare lot pe urmele lui.</em>
          </>
        }
        lead="Comenzile devin sarcini de producție, producția consumă loturi în ordine FIFO, livrarea pleacă cu aviz. Iar analizele îți arată ce s-a produs, cu ce cost și încotro a plecat."
        wide
      >
        <div className="grid gap-4 md:grid-cols-3">
          <ScreenshotSlot>
            <OrderFlowMock />
          </ScreenshotSlot>
          <ScreenshotSlot>
            <TraceMock />
          </ScreenshotSlot>
          <ScreenshotSlot>
            <AnalyticsMock />
          </ScreenshotSlot>
        </div>
      </Moment>
    </>
  );
}
