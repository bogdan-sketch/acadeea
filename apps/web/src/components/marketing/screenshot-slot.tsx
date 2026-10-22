import Image from 'next/image';
import { cn } from '@/lib/utils';

type ScreenshotSlotProps = {
  /**
   * Calea către captura reală de ecran. Cât timp lipsește, se randează
   * mock-ul CSS din `children`; când capturile aplicației sunt gata, e
   * suficient să se paseze `src` + `alt`, fără alte modificări de layout.
   */
  src?: string;
  alt?: string;
  className?: string;
  children: React.ReactNode;
};

export function ScreenshotSlot({ src, alt = '', className, children }: ScreenshotSlotProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/5',
        className,
      )}
    >
      {src ? (
        <Image src={src} alt={alt} width={1600} height={1000} className="h-auto w-full" />
      ) : (
        <div aria-hidden>{children}</div>
      )}
    </div>
  );
}
