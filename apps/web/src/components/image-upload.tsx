'use client';

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, resolveApiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_BYTES = 60 * 1024 * 1024;
const NOTE_BYTES = 2 * 1024 * 1024;
const UPLOAD_TITLE = 'Încarcă o poză — orice format, se convertește automat în WebP';

interface ImageUploadProps {
  value: string | null | undefined;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  shape?: 'square' | 'circle';
  size?: number;
  label: 'Poză rețetă' | 'Poză de profil';
  fallback?: ReactNode;
  /** Hide the camera/remove buttons and drop target (read-only view). */
  readOnly?: boolean;
}

export function ImageUpload({
  value,
  onUpload,
  onRemove,
  shape = 'square',
  size = 84,
  label,
  fallback,
  readOnly = false,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const src = resolveApiUrl(value);
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-[18px]';
  const btn =
    'absolute flex h-9 w-9 items-center justify-center rounded-full shadow-md ring-2 ring-background transition-colors disabled:opacity-60';

  const errMsg = (e: unknown) =>
    e instanceof ApiError && e.message ? e.message : 'Nu am putut salva poza. Încearcă din nou.';

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Fișierul trebuie să fie o imagine.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Poza depășește 60 MB.');
      return;
    }
    setBusy(true);
    try {
      await onUpload(file);
      toast.success(
        file.size > NOTE_BYTES
          ? `${label} salvată. Poza e mare, serverul o comprimă automat.`
          : `${label} salvată.`,
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRemove();
      toast.success(`${label} ștearsă.`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (readOnly) return;
    void handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className="relative inline-block flex-none"
      style={{ width: size, height: size }}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden',
          radius,
          dragging && 'ring-2 ring-primary',
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : readOnly ? (
          fallback
        ) : (
          <button
            type="button"
            title={UPLOAD_TITLE}
            aria-label={UPLOAD_TITLE}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed border-primary/40 bg-accent text-primary transition-colors hover:bg-accent-strong',
              radius,
            )}
          >
            <Camera className="h-6 w-6" />
            {size >= 72 && <span className="text-[11px] font-bold leading-none">Adaugă poză</span>}
          </button>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </span>
        )}
      </span>
      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {/* One control per state: the dashed placeholder uploads when empty;
              the camera FAB only appears over an existing photo (audit L-5). */}
          {src && (
            <button
              type="button"
              title={UPLOAD_TITLE}
              aria-label={UPLOAD_TITLE}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className={cn(
                btn,
                '-bottom-2 -right-2 bg-primary text-primary-foreground hover:bg-primary-pressed',
              )}
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
          {value && (
            <button
              type="button"
              title="Șterge poza"
              aria-label="Șterge poza"
              disabled={busy}
              onClick={() => void handleRemove()}
              className={cn(
                btn,
                '-left-2 -top-2 bg-card text-destructive ring-1 ring-border hover:bg-muted',
              )}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
