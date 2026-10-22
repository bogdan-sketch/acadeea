'use client';

import { createElement, useCallback, useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Confirmation dialog shown when the user tries to leave a form with unsaved
 * changes. Built on `components/ui/dialog` (there is no alert-dialog primitive).
 */
export function ConfirmLeaveDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}): ReactElement {
  return createElement(
    Dialog,
    { open, onOpenChange },
    createElement(
      DialogContent,
      { showCloseButton: false, className: 'sm:max-w-sm' },
      createElement(
        DialogHeader,
        null,
        createElement(DialogTitle, null, 'Ai modificări nesalvate'),
        createElement(
          DialogDescription,
          null,
          'Sigur vrei să ieși? Modificările nu vor fi salvate.',
        ),
      ),
      createElement(
        DialogFooter,
        null,
        createElement(
          Button,
          { variant: 'outline', onClick: () => onOpenChange(false) },
          'Continuă editarea',
        ),
        createElement(Button, { variant: 'destructive', onClick: onConfirm }, 'Renunță'),
      ),
    ),
  );
}

/**
 * Guards navigation away from a dirty form.
 *
 * While `isDirty` is true a `beforeunload` listener warns on tab close / reload.
 * `guardedNavigate(fn)` runs `fn` immediately when clean, or opens a confirm
 * dialog when dirty (running `fn` only if the user chooses to discard).
 *
 * Render the returned `dialog` element once anywhere in the page.
 */
export function useUnsavedChanges(isDirty: boolean): {
  guardedNavigate: (fn: () => void) => void;
  dialog: ReactElement;
} {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers require returnValue to be set to trigger the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const guardedNavigate = useCallback(
    (fn: () => void) => {
      if (isDirty) {
        // Store the deferred navigation as state (updater form keeps the fn itself).
        setPending(() => fn);
        setOpen(true);
      } else {
        fn();
      }
    },
    [isDirty],
  );

  const handleConfirm = useCallback(() => {
    setOpen(false);
    setPending(null);
    pending?.();
  }, [pending]);

  const dialog = createElement(ConfirmLeaveDialog, {
    open,
    onOpenChange: setOpen,
    onConfirm: handleConfirm,
  });

  return { guardedNavigate, dialog };
}

/**
 * Same guard, for a form that lives inside a `Dialog` (raw material, consumable,
 * supplier, location create/edit) rather than a full page.
 *
 * Pass `handleOpenChange` as the dialog's `onOpenChange`: an attempt to close
 * (X / Esc / backdrop / cancel button) while `isDirty` pops the confirm instead
 * of discarding the form. `onClose` is the real close (flip the `open` state +
 * reset the form) — call it directly after a successful save, where there is
 * nothing to lose. Render the returned `confirmDialog` once inside the page.
 */
export function useDialogUnsavedGuard({
  isDirty,
  onClose,
}: {
  isDirty: boolean;
  onClose: () => void;
}): {
  handleOpenChange: (open: boolean) => void;
  confirmDialog: ReactElement;
} {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // Opening is driven by the parent's own state setter; only guard closing.
      if (open) return;
      if (isDirty) setConfirmOpen(true);
      else onClose();
    },
    [isDirty, onClose],
  );

  const confirmDialog = createElement(ConfirmLeaveDialog, {
    open: confirmOpen,
    onOpenChange: setConfirmOpen,
    onConfirm: () => {
      setConfirmOpen(false);
      onClose();
    },
  });

  return { handleOpenChange, confirmDialog };
}
