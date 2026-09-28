# Status: Frontend implementation of configurable table columns

This documents what was implemented on the frontend for the "configurable
columns" feature described in `01-analysis.md`, `02-requirements.md`, and
designed in `03-design.md`. The backend slice is covered separately in
`04-status-backend.md`. This covers `03-design.md` §2–§6 as amended during
this implementation session (see "Deviations from `03-design.md`" below).

## What was implemented

### 1. Data model — `frontend/src/app/features/settings/user-management/user.service.ts`

- `EntityViewPreference` (global) gained `columns?: string[]`.
- A new `OverrideDetails` interface was introduced for
  `EntityViewPreferenceOverride.preferences`: `sortKey`, `sortDir`,
  `sortCriteria`, `view`, and `columns` are all independently optional on
  it (an override can set any subset of {sort, view, columns} and each
  falls back to `global`'s same field independently); `coverSize`,
  `seriesCollapsed`, `overlayBookType` stay required and untouched, out of
  scope for this feature.
- Added `DEFAULT_VISIBLE_COLUMNS: string[]`, the single source of truth for
  the 21 known column fields in canonical order (previously duplicated
  inline in `TableColumnPreferenceService`).
- Added an exported `findEntityOverride(overrides, entityType, entityId)`
  helper implementing the case-insensitive entity match that was
  previously inlined only in `parseQueryParams` — now shared by
  `parseQueryParams`, `TableColumnPreferenceService.resolveVisibleFields`,
  and `book-browser.component.ts`'s new `onSaveColumnConfig`.

### 2. Resolution logic

- `book-browser-query-params.service.ts::parseQueryParams`: changed from a
  whole-object `override?.preferences ?? globalPrefs ?? <fallback>` choice
  to per-field fallback for `view` and for the sort chain (multi-criteria →
  legacy sortKey/sortDir → hardcoded default), so an override that only
  sets `columns` still inherits `global`'s sort and view mode. Verified by
  a new test in `book-browser-query-params.service.spec.ts`
  ("falls back to global sort/view per-field when an override only sets
  columns"); all pre-existing tests in that file pass unchanged.
- `table-column-preference.service.ts` was rewritten to be stateless (no
  more `_preferences` signal, `initPreferences`, `saveVisibleColumns`, or
  `mergeWithAllColumns`): it now exposes `allColumns` (translated,
  canonical-order list for "add" dropdowns), `headerFor(field)`, and
  `resolveVisibleFields(prefs, entityType, entityId,
  legacyTableColumnPreference)`, which resolves — in order — the entity's
  override columns, the global default, the legacy global-only
  `tableColumnPreference` setting, then `DEFAULT_VISIBLE_COLUMNS`.
  Persistence moved to the calling components (`book-browser.component.ts`,
  `view-preferences.component.ts`), matching how sort persistence already
  worked. Fully covered in the rewritten
  `table-column-preference.service.spec.ts`.

### 3. New shared component — `ColumnOrderPopoverComponent`

`frontend/src/app/features/book/components/book-browser/columns/column-order-popover/`
mirrors `sorting/multi-sort-popover/multi-sort-popover.component.*`
structurally (drag-to-reorder list with a drag handle/rank/label/remove
button, an "add column" `p-select`, an optional save button), minus the
sort-direction toggle (columns have no direction). It's the first working
UI for reordering columns — previously the `order` field existed in the
data model but no code path ever produced anything but canonical order
(see `01-analysis.md` §2.1's "Note on column order").

Reused in three places, exactly mirroring `MultiSortPopoverComponent`'s
three existing usages:
1. The book-browser toolbar's column popover (replacing the old
   `p-multiSelect`), with `showSaveButton`.
2. The settings page's "Book Browser Preferences" section's global default
   columns editor, rendered inline, no save button (saved via that
   section's own "Save Settings" button).
3. That same section's per-entity override table, behind a new
   "Edit Columns" popover button next to the existing "Edit Sort" one, no
   save button (same reason as #2).

New translation keys added under `book.columnPref.*` in `frontend/src/i18n/en.json`
only (`columnOrder`, `removeTooltip`, `addColumnPlaceholder`,
`saveAsDefault`) — no evidence of a cross-locale key-completeness check in
this repo, and the other 20 locale files are clearly filled in by a
separate translation process.

Its spec file (`column-order-popover.component.spec.ts`) is a documented
`describe.skip`, verbatim in structure and rationale to
`multi-sort-popover.component.spec.ts`'s existing skip (needs an Optimus UI
overlay/drag-drop test harness that doesn't exist yet in this codebase) —
this component is structurally identical to one already deliberately left
untested for that reason.

### 4. `book-browser.component.ts` / toolbar

- `visibleColumns()` is now populated via
  `TableColumnPreferenceService.resolveVisibleFields(...)`, entity-aware,
  inside the existing `setupQueryParamSubscription()` (which already
  re-runs on every route/entity change for sort/view, so no new reactivity
  plumbing was needed).
- New `onSaveColumnConfig(columns)`, structurally mirroring the existing
  `onSaveSortConfig`: writes `global.columns` for `ALL_BOOKS`/`UNSHELVED`,
  otherwise finds-or-creates the entity's override record and sets only
  its `preferences.columns` field (preserving any existing sort/view
  already on that record). A brand-new override created this way only sets
  `columns` plus the three always-required fields
  (`coverSize`/`seriesCollapsed`/`overlayBookType`); `sortKey`/`sortDir`/
  `sortCriteria`/`view` are left `undefined` (pure inherit from global).
  Covered by a new test in `book-browser.component.spec.ts` ("saves column
  configuration as an entity override for a library").
- The toolbar's eye-icon popover markup now embeds
  `<app-column-order-popover>` instead of the `p-multiSelect` + separate
  save-button footer.
- **Save button label clarity (follow-up)**: both toolbar "Save as
  Default" buttons (sort and columns) actually save to different places
  depending on context — the global default on All Books/Unshelved, or an
  override for the current library/shelf/magic-shelf otherwise — which
  wasn't obvious from a static "Save as Default" label. Added a
  `saveButtonLabel` computed to `book-browser.component.ts` that returns
  the translated "Save as Default" (`book.browser.labels.saveAsGlobalDefault`)
  on All Books/Unshelved, or "Save Override for this {entityType}"
  (`book.browser.labels.saveOverrideForEntity`, entity type lowercased,
  matching the existing save-toast phrasing) otherwise. Passed as a new
  optional `saveButtonLabel` input to both `ColumnOrderPopoverComponent`
  (signal `input<string | undefined>(undefined)`) and
  `MultiSortPopoverComponent` (`@Input() saveButtonLabel?: string`, added
  in its own existing decorator style since that component wasn't
  otherwise touched) — both fall back to their generic translated
  "Save as Default" label when the input isn't provided, so the
  settings-page usages (which don't pass it) are unaffected.

### 5. `ColumnOrderPopoverComponent` follow-ups

- **Signal-based inputs/outputs**: converted from `@Input()`/`@Output()`/
  `EventEmitter` to `input()`/`output()`. Checked via `git log
  --diff-filter=A` that every recently-added component in this codebase
  (the `shared/ui/menu/*` family, `library-shelf-menu.component.ts`,
  `shelf-membership-menu.component.ts`, etc.) already uses the
  signal-based functions exclusively — this component had inherited the
  older decorator style only because it was structurally mirrored from
  `MultiSortPopoverComponent` (itself an older, unconverted component, left
  as-is since it predates this feature). Internal handlers
  (`onDrop`/`onRemove`/`onAddField`/`onSave`) became "controlled": they
  read the current value via `this.selectedColumns()` and emit a computed
  array rather than assigning back to the (now read-only) input signal — no
  template changes were needed at either call site
  (`book-browser.component.html`, `view-preferences.component.html`),
  since Angular's `[prop]="expr"`/`(event)="handler($event)"` binding
  syntax is identical for both APIs.
- **Renamed `visibleColumns` → `selectedColumns`** (input, and the
  corresponding internal references in the `.ts`/`.html`): "selected" is
  the more accurate term for what the list actually represents — the
  user's current choice of which columns to show *and* their order —
  whereas "visible" only speaks to the first half. Both call sites'
  bindings were updated (`[selectedColumns]="visibleColumns()"` in the
  toolbar, `[selectedColumns]="columnsAsOptions"` /
  `[selectedColumns]="override.columnsAsOptions"` in the settings page).
  `BookTableComponent`'s own, unrelated, pre-existing `visibleColumns`
  input (a different component) and `book-browser.component.ts`'s own
  `visibleColumns` signal field (correctly named for *its* purpose — the
  columns actually rendered in the table) were deliberately left
  unchanged; this rename was scoped to the popover component only.

### 6. Settings page: one section, not two

An earlier iteration of this work split the settings page into two
sibling sections — a new `general-view-preferences` component (default
view mode + auto-save) and a reworked `view-preferences` ("Sort &
Columns"). The user later asked to revert that split: everything now
lives back in a single section, and it was renamed again. The
`general-view-preferences` component (and its `settingsView.generalView.*`
translation namespace) was deleted entirely; its content was folded back
into `view-preferences.component.ts/html`, which now renders, in order:

1. Default View Mode (`defaultViewMode`)
2. Default Shown Columns (`defaultColumns`, renamed from "Default Columns")
3. Default Sort Columns (`defaultPreferences`, renamed from "Default Sort")
4. Available Sort Columns (`visibleSortFields`, renamed from "Visible Sort Fields")
5. Auto-save on Navigation toggle (`autoSave`)
6. Override Management + the overrides table (unchanged: entity type/name
   selects, "Edit Sort" popover, "Edit Columns" popover, the per-row View
   Mode select with its "(Use Default)" option, delete)

The section itself (selector/folder still `app-view-preferences`, no
rename) is titled **"Book Browser Preferences"**
(`settingsView.librarySort.sectionTitle`, previously "Columns & Sort
Preferences" during the split, and "Library and Shelf View & Sort
Preferences" before this feature at all). `view-preferences-parent.component.html`/`.ts`
no longer reference `general-view-preferences` at all.

Because there's only one component owning `entityViewPreferences` again,
the "fetch the current user fresh at save time" workaround (added during
the split to prevent one section's save from clobbering the other's) is
no longer a live risk — `saveSettings()` still fetches
`this.userService.getCurrentUser()` at save time (harmless either way),
but the stale comment explaining the cross-component staleness concern was
removed since that concern no longer applies.

`view-preferences.component.spec.ts` remains the same pre-existing
`describe.skip` (unaffected by this reshuffle — its rationale already
covered sort/columns/view together).

### 7. Tests / verification

Full frontend suite (`npx ng test --watch=false`) re-run after each round
of changes in this session; final state: 1729 passed, 1 pre-existing
failure unrelated to this change (`metadata-viewer.component.spec.ts`'s
rating-tooltip test, a locale/number-formatting mismatch — `1.234` vs
`1,234` — in a file this feature never touched), 136 skipped (one fewer
than before §6, since `general-view-preferences.component.spec.ts`'s
`describe.skip` no longer exists).

## Deviations from `03-design.md`

The design was revised mid-implementation after further discussion (this
happened in the design session, before this implementation session began,
and both `02-requirements.md` and `03-design.md` already reflect the
revised, final direction — nothing here contradicts those documents as
they now stand). Called out here only because someone reading `03-design.md`'s
prose closely might expect the "three independent override lists"
phrasing from an earlier draft; the actual approved and implemented design
is: **one shared per-entity override record with independently-optional
fields**, exactly as `03-design.md` §1.1 specifies.

One implementation detail not pinned down by `03-design.md` was resolved
directly with the user during this session: the per-row **View Mode**
`<p-select>` in the overrides table needed a way to represent "not
overridden" now that `view` is independently optional per row. Resolved as
a third **"(Use Default)"** option (value `undefined`) alongside Grid/Table
— new override rows start on this option, translated as
`settingsView.librarySort.useDefault`.

## Deliberately left open

- **Pre-existing quirk, not fixed**: `onSaveSortConfig` (unchanged by this
  task) still stamps `view: 'GRID'` on a newly-created override even when
  only sort is being saved from the book-browser toolbar. This predates
  this feature and was out of `03-design.md`'s scope, which only adds a
  new, separate `onSaveColumnConfig` — touching `onSaveSortConfig`'s
  existing behavior was deliberately avoided to keep this change's blast
  radius limited to what the design specifies. Net effect: saving *only*
  sort for a library from the toolbar still forces that library's view
  mode to Grid, even though saving *only* columns (the new code path) does
  not force anything about sort or view. Fixing this consistently would
  mean also making `onSaveSortConfig` leave `view` untouched on a new
  override, which is a reasonable follow-up but was not part of this task.
- Everything listed as out of scope in `03-design.md` §8 remains out of
  scope: no changes to the fixed set of 21 available column fields, and no
  changes to column *sizing* (`book-table.component.ts`'s `columnSizing`
  signal is unrelated and untouched).
- The old translation keys `book.browser.placeholder.selectColumns` and
  `book.browser.labels.setAsDefault`/`labels.save`, used only by the
  removed `p-multiSelect` markup, were left in `en.json` rather than
  removed — harmless but now unused; not cleaned up as it wasn't part of
  the design's scope.
- No cross-locale translation-key sync was performed (only `en.json` was
  updated) — consistent with there being no existing tooling/test in this
  repo enforcing key parity across the other 20 locale files.
