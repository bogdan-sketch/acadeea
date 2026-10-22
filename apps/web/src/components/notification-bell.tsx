'use client';

import { useCallback, useEffect, useState } from 'react';
import { Hint } from '@/components/hint';
import { Bell, CheckCheck } from 'lucide-react';
import { notifications as notificationsApi } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ro } from 'date-fns/locale';

// Web has no websockets — poll the unread count on an interval (app convention).
const POLL_MS = 60_000;

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  // Poll the unread count.
  useEffect(() => {
    let active = true;
    const tick = () => {
      notificationsApi
        .unreadCount()
        .then((c) => {
          if (active) setUnread(c);
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    notificationsApi
      .list({ limit: 15 })
      .then((res) => setItems(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Refresh the list (and count) each time the popover opens.
  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  const markRead = async (n: Notification) => {
    if (n.readAt) return;
    try {
      const updated = await notificationsApi.markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? updated : x)));
      setUnread((c) => Math.max(0, c - 1));
    } catch {
      // best-effort — leave state as-is on failure
    }
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => (x.readAt ? x : { ...x, readAt: now })));
      setUnread(0);
    } catch {
      // best-effort
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label="Notificări" detail="Notificările tale: comenzi, stoc, taskuri">
        <PopoverTrigger
          aria-label="Notificări"
          className="relative inline-flex h-[42px] w-[42px] items-center justify-center rounded-[var(--radius-ctl)] text-muted-foreground transition-colors outline-none hover:bg-primary/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-primary/8"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-sm font-semibold">Notificări</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              marchează toate ca citite
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto border-t border-border">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Se încarcă...</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nicio notificare</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n)}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                  !n.readAt && 'bg-primary/[.05]',
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.readAt && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'flex-1 truncate text-[13px]',
                      n.readAt ? 'font-medium' : 'font-semibold',
                    )}
                  >
                    {n.title}
                  </span>
                </div>
                {n.body && (
                  <span className="line-clamp-2 text-[12px] text-muted-foreground">{n.body}</span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ro })}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
