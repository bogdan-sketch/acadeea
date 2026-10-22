'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Ignore jitter smaller than this (px) before deciding a direction. */
const DELTA = 8;

/**
 * "Hide on scroll down, reveal on scroll up" for the page head (see
 * `lib/sticky-head.ts`). Mounted once in the dashboard layout: toggles
 * `html[data-head-hidden]` and keeps `--page-head-h` (height of the visible
 * `.page-head-collapse`) up to date so `.pinned-filters` sit right under it.
 * Near the top (within the head's own height) the head is always shown;
 * focusing something inside it reveals it too. Only phones act on it (CSS).
 */
export function useHeadCollapse() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    let hidden = false;
    let headH = -1;
    let lastY = Math.max(0, window.scrollY);
    let frame = 0;

    const setHidden = (h: boolean) => {
      if (h === hidden) return;
      hidden = h;
      if (h) root.setAttribute('data-head-hidden', '');
      else root.removeAttribute('data-head-hidden');
    };
    const measure = () => {
      let h = 0;
      for (const el of document.querySelectorAll<HTMLElement>('.page-head-collapse')) {
        if (el.offsetHeight > 0) {
          h = el.offsetHeight;
          break;
        }
      }
      if (h !== headH) {
        headH = h;
        root.style.setProperty('--page-head-h', `${h}px`);
      }
    };
    const tick = () => {
      frame = 0;
      measure();
      const y = Math.max(0, window.scrollY);
      if (y <= headH + 24) {
        setHidden(false);
        lastY = y;
        return;
      }
      const dy = y - lastY;
      if (Math.abs(dy) < DELTA) return;
      setHidden(dy > 0);
      lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.closest('.page-head-collapse')) setHidden(false);
    };

    setHidden(false);
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('focusin', onFocus);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('focusin', onFocus);
      root.removeAttribute('data-head-hidden');
    };
  }, [pathname]);
}
