'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTutorial } from '@/contexts/tutorial-context';
import { GraduationCap, PlayCircle } from 'lucide-react';

/**
 * Centru de ajutor — static, searchable read-along for every tutorial flow,
 * plus a "Pornește turul" button that launches the same content as a live
 * coachmark overlay (tutorial-overlay.tsx) when this platform has anchors
 * wired for it. Only linked from the sidebar when tutorial mode is on.
 */
export default function HelpCenterPage() {
  const { enabled, flows, start } = useTutorial();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flows;
    return flows.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.steps.some((s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)),
    );
  }, [flows, query]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, typeof filtered>();
    for (const flow of filtered) {
      const list = byCategory.get(flow.category) ?? [];
      list.push(flow);
      byCategory.set(flow.category, list);
    }
    return Array.from(byCategory.entries());
  }, [filtered]);

  if (!enabled) {
    return (
      <div>
        <PageHeader title="Centru de ajutor" />
        <EmptyState
          icon={GraduationCap}
          title="Modul tutorial e oprit"
          description="Pornește-l din Profil › Preferințe › Tutorial și ghidurile apar aici."
          actionLabel="Deschide profilul"
          actionHref="/profil"
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Ajutor"
        title="Centru de ajutor"
        description="Ghiduri pas-cu-pas pentru fiecare funcție a aplicației"
        search={{ value: query, onChange: setQuery, placeholder: 'Caută în ghiduri...' }}
      />

      {grouped.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title="Niciun rezultat"
          description="Încearcă alți termeni de căutare."
        />
      )}

      <div className="space-y-8">
        {grouped.map(([category, categoryFlows]) => (
          <div key={category}>
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.4px] text-muted-foreground">
              {category}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {categoryFlows.map((flow) => (
                <Card key={flow.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-[15px]">
                      {flow.title}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => start(flow.id)}
                      >
                        <PlayCircle className="h-3.5 w-3.5" /> Pornește turul
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="list-decimal space-y-2 pl-4 text-[13px]">
                      {flow.steps.map((step) => (
                        <li key={step.id}>
                          <span className="font-semibold">{step.title}.</span>{' '}
                          <span className="text-muted-foreground">{step.body}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
