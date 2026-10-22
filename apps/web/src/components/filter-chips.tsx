'use client';

/**
 * Design-system filter chips (prototype .chips/.chip): bordered pills,
 * single-select, NO "Toate" chip — clicking a chip filters, clicking the
 * active chip again clears the filter (value → null).
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  layout = 'row',
}: {
  options: { value: T; label: string }[];
  /** Active filter; null = no filter. */
  value: T | null;
  onChange: (v: T | null) => void;
  /** 'bare' = doar butoanele, fără container — părintele dă layout-ul
   *  (ex. un swiper comun cu alte pastile). */
  layout?: 'row' | 'bare';
}) {
  const chips = options.map((opt) => {
    const selected = opt.value === value;
    return (
      <button
        key={opt.value}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(selected ? null : opt.value)}
        className={`cursor-pointer rounded-full border px-[15px] py-[7px] text-[13px] font-semibold transition-colors shrink-0 max-sm:snap-start ${
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {opt.label}
      </button>
    );
  });

  if (layout === 'bare') return <>{chips}</>;

  return (
    // min-w-0: ca flex item, altfel latimea intrinseca (toate chip-urile pe
    // o linie) forteaza pagina mai lata decat viewportul.
    // Un singur rând la orice lățime: derulare doar pe orizontală (pill-strip).
    <div className="pill-strip min-w-0 gap-2 py-0.5 max-sm:snap-x">{chips}</div>
  );
}
