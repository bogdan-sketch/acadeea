'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Public stakeholder page: interactive Claude Design prototypes + anchored
 * feedback. Pins are anchored to the DOM ELEMENT clicked inside the
 * same-origin prototype iframe (short text signature + occurrence index +
 * pixel offset), so a comment left on a modal only shows while that modal is
 * open, and follows its element as the prototype re-renders. A tracking loop
 * re-resolves anchors ~3x/second; unmatched pins are listed under "pe alt
 * ecran". Legacy pins without an anchor fall back to viewport percentages.
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.horae.ca';

const TABS = [
  { id: 'web', label: 'Prototip Web', src: '/design-system/web.html' },
  { id: 'ios', label: 'Prototip iOS', src: '/design-system/ios.html' },
  { id: 'android', label: 'Prototip Android', src: '/design-system/android.html' },
  { id: 'doc', label: 'Design System (doc)', src: '/design-system/design.html' },
] as const;

interface Anchor {
  anchorText: string;
  anchorIndex: number;
  dx: number; // px offset from the element's top-left, relative to its size (0..1)
  dy: number;
}

interface DesignComment {
  id: string;
  page: string;
  x: number;
  y: number;
  author: string;
  text: string;
  resolved: boolean;
  anchor?: Anchor | null;
  createdAt: string;
}

/** Short, stable-ish text signature for an element (walk up until some text). */
function signatureFor(el: Element | null): { el: Element; text: string } | null {
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 5; depth++) {
    const text = (cur as HTMLElement).innerText?.trim().replace(/\s+/g, ' ').slice(0, 60) ?? '';
    if (text.length >= 2) return { el: cur, text };
    cur = cur.parentElement;
  }
  return null;
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** All visible elements in doc whose signature matches `text`, in DOM order. */
function matchAnchor(doc: Document, text: string): Element[] {
  const out: Element[] = [];
  const all = doc.body?.querySelectorAll('*') ?? [];
  for (const el of Array.from(all)) {
    if (!isVisible(el)) continue;
    const t = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ').slice(0, 60) ?? '';
    if (t === text) out.push(el);
  }
  return out;
}

export default function DesignSystemPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [comments, setComments] = useState<DesignComment[]>([]);
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number; anchor: Anchor | null } | null>(null);
  const [openPin, setOpenPin] = useState<string | null>(null);
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showPins, setShowPins] = useState(true);
  // id -> live position (%) for anchored pins; absent = anchor not on screen now
  const [livePos, setLivePos] = useState<Record<string, { x: number; y: number }>>({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const load = useCallback(() => {
    fetch(`${API}/api/v1/design-feedback?page=${tab.id}`)
      .then((r) => r.json())
      .then((d) => setComments(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [tab.id]);

  useEffect(() => {
    load();
    setDraft(null);
    setOpenPin(null);
    setShowHidden(false);
  }, [load]);

  useEffect(() => {
    setAuthor(localStorage.getItem('ds-feedback-author') || '');
    setShowPins(localStorage.getItem('ds-feedback-visible') !== '0');
  }, []);

  // Anchor tracking loop: re-resolve every anchored pin against the iframe DOM.
  useEffect(() => {
    const timer = setInterval(() => {
      const frame = iframeRef.current;
      const doc = frame?.contentDocument;
      if (!frame || !doc?.body) return;
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const next: Record<string, { x: number; y: number }> = {};
      for (const c of comments) {
        if (!c.anchor?.anchorText) continue;
        const matches = matchAnchor(doc, c.anchor.anchorText);
        const el = matches[Math.min(c.anchor.anchorIndex, matches.length - 1)];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const px = r.left + r.width * c.anchor.dx;
        const py = r.top + r.height * c.anchor.dy;
        if (px < 0 || py < 0 || px > fw || py > fh) continue;
        next[c.id] = { x: (px / fw) * 100, y: (py / fh) * 100 };
      }
      setLivePos(next);
    }, 350);
    return () => clearInterval(timer);
  }, [comments]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Anchor to the element under the click inside the same-origin iframe.
    let anchor: Anchor | null = null;
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      const hit = doc.elementFromPoint(px, py);
      const sig = signatureFor(hit);
      if (sig) {
        const matches = matchAnchor(doc, sig.text);
        const idx = Math.max(0, matches.indexOf(sig.el));
        const r = sig.el.getBoundingClientRect();
        anchor = {
          anchorText: sig.text,
          anchorIndex: idx,
          dx: r.width > 0 ? (px - r.left) / r.width : 0.5,
          dy: r.height > 0 ? (py - r.top) / r.height : 0.5,
        };
      }
    }

    setDraft({ x: (px / rect.width) * 100, y: (py / rect.height) * 100, anchor });
    setOpenPin(null);
  };

  const submit = async () => {
    if (!draft || !author.trim() || !text.trim()) return;
    setSaving(true);
    try {
      localStorage.setItem('ds-feedback-author', author.trim());
      await fetch(`${API}/api/v1/design-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: tab.id,
          x: draft.x,
          y: draft.y,
          author: author.trim(),
          text: text.trim(),
          ...(draft.anchor ? { anchor: draft.anchor } : {}),
        }),
      });
      setText('');
      setDraft(null);
      setCommentMode(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleResolved = async (c: DesignComment) => {
    await fetch(`${API}/api/v1/design-feedback/${c.id}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: !c.resolved }),
    }).catch(() => {});
    setOpenPin(null);
    load();
  };

  /** Where should this pin render right now? null = not on the current screen. */
  const positionOf = (c: DesignComment): { x: number; y: number } | null => {
    if (c.anchor?.anchorText) return livePos[c.id] ?? null;
    return { x: c.x, y: c.y }; // legacy viewport pin — always shown
  };

  const openComments = comments.filter((c) => !c.resolved);
  const hiddenNow = openComments.filter((c) => positionOf(c) === null);

  return (
    <div className="flex h-screen flex-col bg-[#F5F5F7] text-[#1C1C1E]">
      <header className="flex flex-wrap items-center gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-bold tracking-[-0.3px] text-[#D4527B]">Horae</span>
          <span className="text-[13px] text-[#8E8E93]">Design system & prototipuri</span>
          {API.includes('api-test') && (
            <a
              href="/changelog"
              className="ml-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-[#1C1C1E] hover:bg-[#ECECF0]"
            >
              Noutăți
            </a>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                tab.id === t.id
                  ? 'bg-[#D4527B] text-white'
                  : 'bg-white text-[#1C1C1E] hover:bg-[#ECECF0]'
              }`}
            >
              {t.label}
              {t.id === tab.id && openComments.length ? ` · ${openComments.length}` : ''}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const next = !showPins;
              setShowPins(next);
              localStorage.setItem('ds-feedback-visible', next ? '1' : '0');
              if (!next) setOpenPin(null);
            }}
            title={showPins ? 'Ascunde bulele de comentarii' : 'Arată bulele de comentarii'}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              showPins
                ? 'bg-white text-[#1C1C1E] hover:bg-[#ECECF0]'
                : 'bg-[#E4E4E9] text-[#8E8E93]'
            }`}
          >
            {showPins ? `👁 Comentarii (${openComments.length})` : '🙈 Comentarii ascunse'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCommentMode((v) => !v);
              setDraft(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              commentMode
                ? 'bg-[#2E9E4F] text-white'
                : 'bg-[rgba(212,82,123,.12)] text-[#D4527B] hover:bg-[rgba(212,82,123,.2)]'
            }`}
          >
            {commentMode ? 'Alege locul comentariului…' : '+ Comentează'}
          </button>
        </div>
      </header>
      <div className="flex items-center gap-3 px-6 pb-2">
        <p className="text-[12px] text-[#8E8E93]">
          {commentMode
            ? 'Navighează întâi prototipul la ecranul/modalul vizat, apoi click exact pe zona comentată.'
            : 'Prototipurile sunt interactive. Pentru feedback: „Comentează", apoi click pe zonă — comentariul rămâne legat de acel element (apare doar pe ecranul lui).'}
        </p>
        {showPins && hiddenNow.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="rounded-full bg-[rgba(255,149,0,.14)] px-3 py-1 text-[11.5px] font-semibold text-[#E07C00]"
          >
            {hiddenNow.length} pe alt ecran {showHidden ? '▴' : '▾'}
          </button>
        )}
      </div>

      {showPins && showHidden && hiddenNow.length > 0 && (
        <div className="mx-6 mb-2 max-h-40 overflow-y-auto rounded-[10px] bg-white p-3 text-[12.5px] shadow-sm">
          {hiddenNow.map((c) => (
            <div
              key={c.id}
              className="flex items-baseline gap-2 border-b border-[rgba(60,60,67,.06)] py-1.5 last:border-0"
            >
              <span className="font-semibold">{c.author}</span>
              <span className="flex-1 text-[#636366]">
                {c.text}
                {c.anchor?.anchorText ? (
                  <em className="text-[#8E8E93]"> — pe „{c.anchor.anchorText}&rdquo;</em>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => toggleResolved(c)}
                className="shrink-0 text-[11.5px] font-semibold text-[#2E9E4F]"
              >
                Rezolvat
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative mx-4 mb-4 flex-1 overflow-hidden rounded-[10px] bg-white">
        <iframe
          ref={iframeRef}
          key={tab.id}
          src={tab.src}
          title={tab.label}
          className="h-full w-full border-0"
        />

        {commentMode && (
          <div
            className="absolute inset-0 cursor-crosshair bg-[rgba(212,82,123,.04)]"
            onClick={handleOverlayClick}
          />
        )}

        {showPins &&
          comments.map((c, i) => {
            const pos = positionOf(c);
            if (!pos) return null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenPin(openPin === c.id ? null : c.id)}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                className={`absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-md ${
                  c.resolved ? 'bg-[#8E8E93] opacity-60' : 'bg-[#D4527B]'
                }`}
                title={c.author}
              >
                {i + 1}
              </button>
            );
          })}

        {showPins &&
          openPin &&
          (() => {
            const c = comments.find((x) => x.id === openPin);
            const pos = c ? positionOf(c) : null;
            if (!c || !pos) return null;
            return (
              <div
                style={{
                  left: `min(max(${pos.x}%, 10%), 78%)`,
                  top: `min(max(${pos.y + 3}%, 6%), 70%)`,
                }}
                className="absolute z-20 w-72 -translate-x-1/2 rounded-[10px] bg-white p-3.5 shadow-[0_8px_30px_rgba(0,0,0,.18)]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold">{c.author}</span>
                  <span className="text-[11px] text-[#8E8E93]">
                    {new Date(c.createdAt).toLocaleDateString('ro-RO')}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px]">{c.text}</p>
                <button
                  type="button"
                  onClick={() => toggleResolved(c)}
                  className={`mt-2.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                    c.resolved
                      ? 'bg-[#F2F2F7] text-[#636366]'
                      : 'bg-[rgba(46,158,79,.14)] text-[#2E9E4F]'
                  }`}
                >
                  {c.resolved ? 'Redeschide' : 'Marchează rezolvat'}
                </button>
              </div>
            );
          })()}

        {draft && (
          <>
            <div
              style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
              className="absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[#D4527B] shadow-md"
            />
            <div
              style={{
                left: `min(max(${draft.x}%, 12%), 75%)`,
                top: `min(max(${draft.y + 3}%, 6%), 60%)`,
              }}
              className="absolute z-30 w-80 -translate-x-1/2 rounded-[10px] bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,.18)]"
            >
              <div className="text-[13px] font-bold">Comentariu nou</div>
              {draft.anchor?.anchorText && (
                <div className="mt-1 truncate text-[11.5px] text-[#8E8E93]">
                  ancorat de: „{draft.anchor.anchorText}&rdquo;
                </div>
              )}
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Numele tău"
                className="mt-2.5 w-full rounded-[8px] bg-[#F2F2F7] px-3 py-2 text-[13px] outline-none"
              />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ce ai schimba aici?"
                rows={3}
                autoFocus
                className="mt-2 w-full resize-none rounded-[8px] bg-[#F2F2F7] px-3 py-2 text-[13px] outline-none"
              />
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-[#636366]"
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving || !author.trim() || !text.trim()}
                  className="rounded-lg bg-[#D4527B] px-4 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  Trimite
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
