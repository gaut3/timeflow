# Changelog

All notable changes to **Timeflow** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This log begins with `2.0.0`. Everything below summarizes what changed since the
last `1.x` release (`1.3.13`); earlier history is tracked in the git tags and the
[Releases page](https://github.com/gaut3/timeflow/releases).

## [2.0.3] - 2026-06-16

A small follow-up: CSS-compatibility and README image fixes.

### Fixed

- **Taller calendar days in the sidebar / on phone** — narrow-layout day cells
  had no minimum height, so on a phone (where the columns are wide) they read as
  flat, too-wide boxes. They now get the same ≥44px height as the wide layout.
- **Heatmap CSS compatibility** — replaced the heatmap grid's `column-gap` with
  the `gap` shorthand so it no longer trips the Obsidian CSS review's
  "multicolumn only partially supported" warning (it was only grid spacing).
- **README logos load on the Obsidian plugin page** — the header wordmark and
  footer lockup used repo-relative paths that only resolve on GitHub; switched
  to absolute image URLs (like the screenshots), so they render everywhere
  instead of showing alt text.

### Docs

- Heatmap screenshot updated to the redesigned, combined light/dark view.

## [2.0.2] - 2026-06-16

UI polish and localization fixes from a design review, plus refreshed
screenshots. No change to the minimum Obsidian version (1.7.2).

### Changed

- **Heatmap redesigned** — the work-history heatmap is now a GitHub-style
  contribution grid: weeks run as columns, weekdays (Mon–Sun) as rows, with
  **month labels** across the top, **weekday anchors** down the left, and a
  **color legend** that maps each color to its meaning, so it's readable without
  hovering. It scales with the window width like the rest of the dashboard.
- **Weekly-hours chart** — value labels are pinned on a single line above a
  fixed-height bar track, instead of floating at each bar's top and grazing the
  bars at inconsistent heights.
- **Wide history "Comment" column** is hidden when nothing in the visible range
  has a comment (it stays in inline-edit mode), instead of showing a full column
  of "-".
- **Even spacing between wide stats sections** — each section had more space below
  it than above (a stacked margin + gap); top and bottom are now balanced.

### Added

- **Compliance-dot key** — a clickable "?" above the calendar's week-number
  column opens a popover explaining the green / orange / red week-status dots
  (on target / under / over); the same key is also in the status-bar info panel.
- **Goal vs limit tooltips** — the daily "goal" and weekly "limit" stats now
  carry a one-line tooltip clarifying daily target vs weekly ceiling.

### Fixed

- **English uses "h" for hours.** The hour unit now follows the interface
  language (English → "h", Norwegian → "t") until you set it explicitly, so an
  English dashboard no longer shows the Norwegian "t". Existing English setups
  are corrected automatically on load, and a few spots that hard-coded "t" were
  fixed to respect the setting.
- **Pluralization.** A count of one no longer reads as plural — "1 active timer"
  (not "1 active timers"), "1 day" (not "1 days"), in both languages, via a
  shared `plural()` helper with per-language forms.

### Docs

- README screenshots refreshed: new combined light/dark home shots for the wide
  and sidebar layouts, plus updated history and heatmap images.

### Internal

- The release workflow now pulls this changelog's matching `## [version]` section
  into the GitHub release notes automatically, so releases and the changelog stay
  in sync.

## [2.0.1] - 2026-06-16

Maintenance release — clears the outstanding Obsidian community-plugin review
recommendations and a Dependabot security advisory. No user-facing changes; the
dashboard, settings, and minimum Obsidian version (1.7.2) are unchanged.

### Security

- **esbuild upgraded to 0.28.1** (from 0.25.x) to resolve Dependabot advisory
  GHSA-67mh-4wv8-2f99 (esbuild dev server). esbuild is a build-time dependency
  only and was never shipped inside the plugin, but this clears the alert.

### Internal

- Replaced the deprecated `ButtonComponent.setWarning()` calls with a
  version-safe equivalent (identical warning styling) — clears the deprecation
  without raising the minimum Obsidian version.
- Removed an unused import and cleaned up two unnecessary type assertions flagged
  by the Obsidian community-plugin review.

## [2.0.0] - 2026-06-16

A ground-up redesign of the dashboard. The old day / week / month / stats **card
grid** is gone; in its place is a single, calmer dashboard built around one
question — *where's my flextime balance?* The same layout now adapts from a wide
two-column view down to a narrow sidebar **without dropping any features**, and
structural colors come straight from Obsidian's own theme variables, so it looks
at home in any light or dark theme.

> **⚠️ Requires Obsidian 1.7.2 or newer.** The minimum supported version was
> raised from `0.15.0` to `1.7.2`. If you're on an older Obsidian, update the app
> before installing 2.0.0.

### The redesigned dashboard

- **Flextime balance hero** — your balance is now the centerpiece: a large,
  color-coded number with a live clock, today's contribution, and Start/Stop
  timer controls in one place (replaces the old summary cards and badge row).
- **Weekly progress strip** — at-a-glance bars showing this week's hours against
  your goal, colored by compliance status.
- **Interactive bar calendar** — a month grid where each day carries a thin,
  type-colored bar; **today** is outlined rather than filled, future days are
  dimmed (planned absences stay visible), and week numbers + per-week compliance
  dots are optional. Each compliance dot has a hover tooltip.
- **Inline day drawer** — click any calendar day to open an in-place drawer to
  view the day, add or edit work time, register an absence, or create a note —
  no separate context-menu dialog.
- **Statistics grid** — switch between month / year / total for hours logged,
  daily and weekly averages, workload %, work days, and comp-time used.
- **Trends** — "vs last week / vs last month" deltas with direction arrows.
- **Weekly chart** — recent weeks at a glance.
- **Upcoming planned days** — consecutive same-type days now collapse into clean
  date-range rows (e.g. `6.–16. July · 8 days · Vacation`) instead of one row per
  day.
- **Leave tracking panel** — per-type usage against each yearly quota (days for
  leave types, hours for comp time); quota-less types show the value with no bar.

### Added

- **Two-lane color system** — color now does one job at a time: your theme
  **accent** drives chrome (Start button, today's outline) while a separate
  **status palette** (green / amber / red) signals work-hour compliance, so a
  normal state never looks like an alarm.
- **Accessibility floor on bars** — progress/leave bars are at least 8px and
  calendar bars at least 4px, and status is carried by fill *color*, not bar
  height.
- **Optional background override** — set a custom dashboard background per light
  and dark theme (off by default; the only sanctioned theme override — everything
  else defers to your theme).
- **Sidebar / mobile parity** — the narrow layout keeps the full feature stack
  (balance, calendar, leave tracking, history); nothing is dropped on mobile.
- **"See all / Show less"** — long history and leave sections expand and collapse
  in place instead of rebuilding the whole dashboard. Expanded history is now
  grouped by month.
- **Brand assets** — added a full set of Timeflow icon / wordmark / lockup logos
  (SVG + PNG, in light/dark/black/white) under `brand/`.

### Changed

- **Minimum Obsidian version raised to 1.7.2** (was 0.15.0).
- **Responsive layout reworked** — one layout that switches between wide
  (two-column, with the stats grid, weekly chart, and bulk history editing) and
  narrow/sidebar at 600px, instead of two divergent experiences.
- **Calendar, history, leave, and stats moved onto theme variables** — structural
  colors follow Obsidian's own light/dark variables, so any theme works with zero
  setup; per-type colors stay fully customizable.
- **Trend "down" is no longer alarm-red** — fewer hours isn't an error, so the
  down-arrow uses a muted color; red is reserved for real threshold breaches.
- **Zero values are muted** — empty comp-time and leave counts read as quiet
  rather than using a behavior accent color.
- **Documentation refreshed** — the README was rewritten around the new dashboard
  (balance hero, progress strip, bar calendar, inline drawer, trends, upcoming
  ranges, leave tracking) with new light/dark screenshots, and the color-coding
  and requirements sections were corrected.

### Fixed

- **History dates** now format per locale everywhere; entries use type chips
  tinted from the day type's color, with signed and color-coded flextime.
- **Calendar compliance dots** are gated to finished workweeks only (no premature
  "incomplete week" warnings).
- **Filter chips, "See all" buttons, and other controls** were reworked to flat,
  non-accent styling that matches the rest of the UI (they previously inherited
  Obsidian's default button box and accent text).
- **Quota-less leave rows** render value-only instead of an empty bar that read as
  "failed to load."
- Addressed items from the Obsidian community-plugin review (unused imports,
  redundant type assertions, and release-packaging fixes).

### Removed

- **The legacy v1.x "cards" UI** — the old day/week/month/stats card renderers,
  badge row, and status bar were removed along with their hardcoded green/blue
  gradient legend (replaced wholesale by the new dashboard).
- **Decorative emoji in chrome** that shipped with the old card layer (your own
  per-type icons are unaffected — those are your data).

### Internal

- Removed a large orphaned render layer left over from the redesign (~1,100 lines
  of dead code), shrinking the bundle.
- Release workflow now triggers on a plain `x.y.z` tag (no `v` prefix), so the
  release tag matches `manifest.json` exactly as Obsidian requires.
- i18n expanded with new strings and a date "range" format for the collapsed
  upcoming rows. (Known gap: the settings tab is still largely English.)

[2.0.3]: https://github.com/gaut3/timeflow/releases/tag/2.0.3
[2.0.2]: https://github.com/gaut3/timeflow/releases/tag/2.0.2
[2.0.1]: https://github.com/gaut3/timeflow/releases/tag/2.0.1
[2.0.0]: https://github.com/gaut3/timeflow/releases/tag/2.0.0
