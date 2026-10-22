/**
 * Shared theming for recharts <Tooltip> — the library default is a white box
 * with light-gray text, unreadable in dark mode. Spread these props on every
 * chart Tooltip so it renders on popover tokens in both themes:
 *
 *   <Tooltip {...chartTooltipProps} formatter={...} />
 */
export const chartTooltipProps = {
  contentStyle: {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--popover-foreground)',
    fontSize: 12.5,
    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
  },
  labelStyle: { color: 'var(--muted-foreground)', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: 'var(--popover-foreground)' },
  cursor: { stroke: 'var(--border)' },
} as const;
