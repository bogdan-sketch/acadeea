'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Eraser, Loader2, X } from 'lucide-react';

interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (signature: Blob, signedByName: string) => void | Promise<void>;
  submitting?: boolean;
}

/** Freehand signature capture on an HTML canvas (pointer events) + signer name. */
export function SignatureDialog({
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: SignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [signedByName, setSignedByName] = useState('');
  const [empty, setEmpty] = useState(true);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const c = ctx();
    if (!c) return;
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pointerPos(e);
    c.beginPath();
    c.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = ctx();
    if (!c) return;
    const { x, y } = pointerPos(e);
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.strokeStyle = '#111827';
    c.lineTo(x, y);
    c.stroke();
    hasDrawn.current = true;
    if (empty) setEmpty(false);
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const c = ctx();
    if (canvas && c) c.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    setEmpty(true);
  };

  const handleConfirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !signedByName.trim() || !hasDrawn.current) return;
    await new Promise<void>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (blob) await onConfirm(blob, signedByName.trim());
        resolve();
      }, 'image/png');
    });
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSignedByName('');
      clear();
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Semnează avizul</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nume semnatar *</Label>
            <Input
              value={signedByName}
              onChange={(e) => setSignedByName(e.target.value)}
              placeholder="Numele persoanei care semnează"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Semnătură *</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={clear}
                title="Șterge semnătura"
                aria-label="Șterge semnătura"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            </div>
            <canvas
              ref={canvasRef}
              width={500}
              height={200}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              className="w-full touch-none rounded-md border border-input bg-white"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleOpenChange(false)}
            title="Anulează"
            aria-label="Anulează"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            onClick={handleConfirm}
            disabled={submitting || !signedByName.trim() || empty}
            title="Confirmă semnătura"
            aria-label="Confirmă semnătura"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
