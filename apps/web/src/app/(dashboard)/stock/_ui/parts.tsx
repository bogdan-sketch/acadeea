'use client';

import Link from 'next/link';
import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Hint } from '@/components/hint';
import { STICKY_HEAD } from '@/lib/sticky-head';

/** White card used by every block of the redesigned stock pages. */
export const CARD = 'rounded-[var(--radius-card)] border border-border bg-card';

/** Header row: small meta line above a serif title, actions on the right. */
export function PageHead({
  meta,
  title,
  children,
}: {
  meta?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className={`mb-1 flex flex-wrap items-end justify-between gap-4 ${STICKY_HEAD}`}>
      <div className="flex min-w-0 flex-col gap-1">
        {meta && <span className="text-[13px] font-semibold text-muted-foreground">{meta}</span>}
        <h1 className="font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.4px] sm:text-[34px]">
          {title}
        </h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}

type IconActionProps = {
  icon: ComponentType<{ className?: string }>;
  /** Tooltip and accessible name — icon-only buttons never go unlabelled. */
  label: string;
  title?: string;
  /** One visible word next to the icon (header actions). Omit for a pure 42px square. */
  word?: string;
  /** `danger` = outlined in red for destructive actions ("Șterge", "Resetează…"). */
  tone?: 'outline' | 'primary' | 'danger';
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  spinning?: boolean;
  pressed?: boolean;
  /** Smaller 32px ghost variant for table rows. */
  row?: boolean;
};

/** Icon-only 42px button/link (accent fill or outlined). */
export function IconAction({
  icon: Icon,
  label,
  title,
  word,
  tone = 'outline',
  onClick,
  href,
  disabled,
  spinning,
  pressed,
  row,
}: IconActionProps) {
  const cls = row
    ? 'inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60'
    : cn(
        'inline-flex h-[42px] flex-none cursor-pointer items-center justify-center whitespace-nowrap rounded-[var(--radius-ctl)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
        word ? 'gap-1.5 pl-3 pr-3.5 text-[13px] font-semibold' : 'w-[42px]',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary-pressed'
          : tone === 'danger'
            ? 'border border-destructive/40 bg-card font-bold text-destructive hover:bg-destructive/5'
            : 'border border-border bg-card text-foreground hover:bg-muted',
      );
  const icon = (
    <>
      <Icon
        className={cn(row ? 'h-[15px] w-[15px]' : 'h-[18px] w-[18px]', spinning && 'animate-spin')}
      />
      {word && !row && <span>{word}</span>}
    </>
  );
  if (href && !disabled) {
    return (
      <Hint label={label} detail={title}>
        <Link href={href} aria-label={label} className={cls}>
          {icon}
        </Link>
      </Hint>
    );
  }
  return (
    <Hint label={label} detail={title}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cls}
      >
        {spinning ? (
          <>
            <Loader2
              className={cn(row ? 'h-[15px] w-[15px]' : 'h-[18px] w-[18px]', 'animate-spin')}
            />
            {word && !row && <span>{word}</span>}
          </>
        ) : (
          icon
        )}
      </button>
    </Hint>
  );
}

/** Toggle pill (chip): accent fill when on, white with border otherwise. */
export function Pill({
  on,
  onClick,
  children,
  className,
  title,
  height = 'h-[34px]',
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  height?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex flex-none cursor-pointer items-center gap-[7px] rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
        height,
        on
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Small coloured capsule (status / type). `tone` is an `st-*` utility. */
export function Capsule({
  tone,
  children,
  size = 'sm',
}: {
  tone: string;
  children: ReactNode;
  /** `lg` = 32px, matches a row IconAction beside it. */
  size?: 'sm' | 'lg';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-self-start whitespace-nowrap rounded-full font-bold',
        size === 'lg' ? 'h-8 px-3 text-[13px]' : 'h-6 px-[9px] text-xs',
        tone,
      )}
    >
      {children}
    </span>
  );
}

/** Drop-zone that opens a file picker on click and accepts drag & drop. */
export function DropZone({
  accept,
  onFile,
  title,
  hint,
  icon: Icon,
  busy,
  label,
  tooltip,
  className,
}: {
  accept: string;
  onFile: (f: File) => void;
  title: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  busy?: boolean;
  label: string;
  tooltip?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={tooltip ?? label}
        disabled={busy}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-[14px] border-2 border-dashed p-[18px] text-foreground/80 transition-colors disabled:cursor-wait',
          over ? 'border-primary bg-accent' : 'border-border bg-muted/40 hover:bg-muted',
          className,
        )}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" />}
        <span className="text-[13px] font-bold">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
