'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One or two sentences: what happens and what cannot be undone. */
  description?: ReactNode;
  /** Verb on the confirm button ("Șterge", "Anulează comanda"); defaults to "Confirmă". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` = red confirm button for destructive actions. */
  tone?: 'default' | 'danger';
  /** When set, the user must type this word before the confirm button enables. */
  confirmWord?: string;
  /** Shows a spinner and locks the dialog while the action runs. */
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * The in-app replacement for `window.confirm()`: Romanian buttons, our
 * dialog chrome, optional typed confirmation word (QA m1).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmă',
  cancelLabel = 'Renunță',
  tone = 'default',
  confirmWord,
  busy,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const locked = !!confirmWord && typed.trim() !== confirmWord;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) setTyped('');
        onOpenChange(o);
      }}
    >
      <DialogContent className="rounded-2xl p-6 sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle
            className={cn('text-base font-bold', tone === 'danger' && 'text-destructive')}
          >
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-[13px] leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!locked && !busy) void onConfirm();
          }}
          className="flex flex-col"
        >
          {confirmWord && (
            <>
              <Label htmlFor="confirm-word" className="text-xs font-semibold text-muted-foreground">
                Scrie {confirmWord} pentru a confirma
              </Label>
              <Input
                id="confirm-word"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
                autoFocus
                autoComplete="off"
                placeholder={confirmWord}
                className="mt-1.5"
              />
            </>
          )}
          <DialogFooter className="mx-0 mb-0 mt-5 border-0 bg-transparent p-0">
            <Button
              type="button"
              variant="secondary"
              className="h-[42px]"
              disabled={busy}
              onClick={() => {
                setTyped('');
                onOpenChange(false);
              }}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              className="h-[42px]"
              disabled={locked || busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ConfirmRequest = Pick<
  ConfirmDialogProps,
  'title' | 'description' | 'confirmLabel' | 'cancelLabel' | 'tone' | 'confirmWord'
>;

/**
 * Promise-style helper so a handler reads like the old `confirm()`:
 *
 *   const { ask, dialog } = useConfirmDialog();
 *   if (!(await ask({ title: 'Ștergi rolul?', tone: 'danger', confirmLabel: 'Șterge' }))) return;
 *   …render {dialog} once in the page.
 */
export function useConfirmDialog() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setReq(null);
  }, []);

  const ask = useCallback(
    (r: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setReq(r);
      }),
    [],
  );

  const dialog = (
    <ConfirmDialog
      open={req !== null}
      onOpenChange={(o) => !o && settle(false)}
      title={req?.title ?? ''}
      description={req?.description}
      confirmLabel={req?.confirmLabel}
      cancelLabel={req?.cancelLabel}
      tone={req?.tone}
      confirmWord={req?.confirmWord}
      onConfirm={() => settle(true)}
    />
  );

  return { ask, dialog };
}
