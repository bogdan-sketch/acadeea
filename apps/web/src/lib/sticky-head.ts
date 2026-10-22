/**
 * Page head (eyebrow, title, actions, search). Below `md` it sticks under the
 * 48px top bar and COLLAPSES: it slides away while the page scrolls down and
 * comes back as soon as the user scrolls up (`.page-head-collapse` in
 * globals.css, driven by `useHeadCollapse` in the dashboard layout). From `md`
 * it is static. Single-row pill filters go in `<PinnedFilters>` instead —
 * those stay pinned at every width.
 */
export const STICKY_HEAD =
  'page-head-collapse max-md:-mx-4 max-md:px-4 max-md:pb-2 max-md:pt-1 max-md:bg-background/95 max-md:backdrop-blur-md';
