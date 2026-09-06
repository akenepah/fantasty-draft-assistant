# Fantasy Hockey Draft Assistant

A manual-first assistant for running a live fantasy hockey draft from imported analyst
projections. You record every pick as it happens in the room; the app keeps the board, the
rosters, the standings and one recommendation in step with it.

It is a working application, not a mockup: the draft you record is real state that survives
a refresh, and every number on screen is computed from it.

Nothing here talks to Yahoo. There is no API integration, no scraping, and no live sync —
picks are recorded by hand, which is the point of the product.

## Screens

| Route | What it does |
| ----- | ------------ |
| `/league-setup` | League name, team count, franchise names, roster slots, categories-or-points scoring, rounds and the round-one draft order. Every field is authoritative — changing it regenerates the pick schedule and re-scores the league. |
| `/import-rankings` | Read an .xlsx/.csv/.tsv analyst file in the browser, pick a sheet, map its columns, and save it as an independent projection source |
| `/draft-room` | Record each pick from the live draft, undo, correct, and read one recommendation |
| `/team-comparisons` | Projected standings, category comparison and ranks, team detail and rosters, updating as the draft proceeds |
| `/draft-results` | Completed-draft summary, board, final rosters, highlights, CSV export and a post-draft free-agent watchlist |

## One source of truth

`components/AppStateProvider.tsx` holds the entire application state — league, imported
sources, projection configuration and draft — behind a single reducer. No screen keeps its
own copy. Recording one pick is one state transition, and rosters, availability, standings
and recommendations all fall out of it.

```
lib/domain/
  types.ts         # League, Franchise, Player + PlayerEligibility, Draft, DraftPick,
                   # DraftPickSchedule, ProjectionSource/Dataset/Configuration, totals
  state.ts         # AppState + reducer: every legal transition, and nothing else
  selectors.ts     # everything derived, split into draft facts and analytics
  persistence.ts   # PersistenceAdapter + localStorage implementation
  schedule.ts      # frozen snake schedule, pointer, "picks until your turn", phases
  roster.ts        # slot occupancy as bipartite matching under multi-position eligibility
  scoring.ts       # category and points engines
  standings.ts     # league-wide projected totals, category ranks, standings
  recommend.ts     # replacement level, scarcity, category needs, return risk, watchlist
  projections.ts   # matching players across sources; single / consensus / primary blends
  workbook.ts      # spreadsheet parsing, column auto-detection, row mapping
  results.ts       # post-draft highlights and CSV export
  sample.ts        # the bundled sample sources

components/
  AppShell.tsx     # 58px masthead + 212px sidebar, identical on every screen
  SidebarNav.tsx   # persistent navigation
  ui/              # Button, SectionCard, Fields, SegmentedControl, StatusPill, DataTable,
                   # ProgressBar, TeamBadge, PlayerSearch, RecommendationCard,
                   # RosterCapacityRow, CategoryMetric, Toast, Modal, FileUpload,
                   # ColumnMappingRow, Unavailable
```

## Decisions worth knowing

**A missing projection is unknown, never zero.** Sources publish different stats; folding a
gap in as `0` would quietly punish players whose coverage happens to be thinner and corrupt
every total, rank and recommendation downstream. Totals carry a contributor count, blended
values average only the sources that supplied a number, and the UI prints `—` rather than a
made-up figure.

**Positions are a set, not a label.** A team with three LW/RW wingers and three open RW
slots is not short at RW, so slot occupancy is solved as a maximum bipartite matching
between players and individual slots — dedicated slots first, then the flex slot, then the
bench. Counting players by primary position gives the wrong answer as soon as anyone is
dual-eligible.

**Value over replacement is an input, not the answer.** A pick is scored against the player
you could still get at that position one turn from now, weighted by where the managed team
is actually losing categories, then adjusted for whether the player can even be used and how
scarce the position is. Each category is weighted by the share of the roster that feeds it —
without that, one goalie collects four categories' worth of standardised edge from two
roster spots and wins every first pick. Opportunity cost is applied as a choice, not a fudge
factor: among candidates close enough in value to be real alternatives, the one least likely
to come back wins.

**A percentage needs something to derive it from.** Return risk is a survival probability
computed from the player's ADP against the managed team's next pick. With only a consensus
rank the level stays qualitative — *Likely to return* / *Risk increasing* / *Unlikely to
return* — rather than inventing a number.

**The real draft is authoritative.** A name that cannot be matched is recorded as an
unresolved placeholder so the draft keeps moving, and every pick can later be re-pointed at a
different player, reassigned to another franchise, resolved, or removed — including picks in
the middle of the board.

**Analytics may fail; tracking may not.** Derived state is split so that the schedule, the
picks and the rosters cannot be taken down by a projection error. If the analytics throw, the
Draft Room shows a Tracking-Only Recovery banner and keeps recording picks.

## Design system

Deliberately grayscale for now: hierarchy comes from surface value, border weight, spacing
and type, never from hue. State that would normally need a colour uses a pill, an icon or a
stronger surface instead. Tokens live in `app/globals.css` under the `fh-` namespace, and the
primitives in `components/ui/` are the only place those tokens are spent. Desktop-first,
targeting 1440px and usable to about 1280px; below that the layout wraps and dense tables
scroll inside their own panels.

## Persistence

State is written on every transition through a `PersistenceAdapter`, so a draft survives a
refresh, an accidental close, and navigating away. The shipped adapter is `localStorage`:
writes are synchronous, need no network, and keep working in a draft room with bad wifi —
which is what matters mid-draft. The interface is three methods, so a server-backed adapter
drops in behind it without the UI changing.

Because storage is per-browser, a draft is currently tied to the machine it was recorded on.
Moving it between devices, or letting more than one person record picks, is the main reason
to add a server adapter.

## Sample data

Two sample projection sources ship so the app is usable before you have a workbook to hand.
They are ordinary `ProjectionDataset`s travelling the same import, merge and scoring path as
a real upload, and are labelled **Sample** everywhere they appear. The second deliberately
omits shots and faceoffs, so the missing-data handling is exercised rather than assumed.
Delete them and import your own; nothing else changes.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

### Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint, including the React Compiler rules |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | Vitest — the domain suite |

## Testing

`lib/domain/domain.test.ts` covers the parts where being wrong is expensive and invisible:
roster matching under multi-position eligibility, missing-data handling in totals and blends,
the three source-blending modes, workbook parsing, the snake schedule, undo and corrections
including unresolved placeholders, standings agreeing with their own category ranks, and the
recommendation engine.

It is a domain suite by design. The screens are thin — they read from the store and render —
so the logic worth protecting all lives under `lib/domain`.

## Accessibility

Semantic HTML throughout, labels on every control, visible focus states, `aria-label` on
icon-only buttons, proper table header semantics, and keyboard paths for the interactions
that matter mid-draft: the player search is a combobox driven entirely by arrow keys and
Enter, and the draft order reorders with arrow keys as well as drag.

## Out of scope

- Yahoo integration of any kind — import, sync, scraping, or availability monitoring
- Custom numeric source weighting (e.g. 70/30); consensus is equal-weight
- Mobile layouts; this pass is desktop-first
