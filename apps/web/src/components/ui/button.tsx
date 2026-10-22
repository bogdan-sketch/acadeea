import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Focus (H-7/M-12): one system — outline off, 3px SOLID accent ring. The ring
// at 50–60 % alpha measured ~2:1 against cream for the teal tenant accent;
// solid reaches 3.3–3.7:1 (WCAG 1.4.11). The filled variant adds a 2px
// background offset so the ring is visible around a same-coloured button.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-ctl)] border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Disabled (H-2): a 50 %-faded filled button drops to ~1.4:1; render
        // it tinted instead — text-safe accent on the 10 % wash (≥4.5:1).
        default:
          'bg-primary text-primary-foreground hover:bg-primary-pressed active:bg-primary-pressed focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:border-primary/20 disabled:bg-accent disabled:text-primary-text disabled:opacity-100',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary-text underline-offset-4 hover:underline',
      },
      size: {
        // Generous DS sizing (prototype .btn: 11px/18px padding, 14px/600).
        default:
          'h-10 gap-2 px-[18px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-7 gap-1 rounded-[9px] px-2.5 text-xs in-data-[slot=button-group]:rounded-[var(--radius-ctl)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[10px] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-[var(--radius-ctl)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5',
        icon: 'size-10',
        'icon-xs':
          "size-7 rounded-[9px] in-data-[slot=button-group]:rounded-[var(--radius-ctl)] [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 rounded-[10px] in-data-[slot=button-group]:rounded-[var(--radius-ctl)]',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
