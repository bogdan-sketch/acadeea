'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface BentoCardProps {
  icon?: LucideIcon;
  title: string;
  href?: string;
  children: ReactNode;
  className?: string;
}

export function BentoCard({ icon: Icon, title, href, children, className = '' }: BentoCardProps) {
  const content = (
    <Card
      className={`hover:shadow-md transition-shadow ${href ? 'cursor-pointer' : ''} ${className}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
        {href && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
