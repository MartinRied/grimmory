# Analysis: Configurable Table Columns (Defaults + Per-Library Overrides)

This document analyzes the current state of the code relevant to extending
column configuration with default values and per-library/shelf overrides,
analogous to the existing default-sort mechanism.

## 1. Where books are listed (`book-browser`)

`frontend/src/app/features/book/components/book-browser/book-browser.component.*`
is the single component behind all book-listing entry points:

- All Books (`EntityType.ALL_BOOKS`)
- Unshelved Books (`EntityType.UNSHELVED`)
- a specific Library (`EntityType.LIBRARY`)
- a specific regular Shelf (`EntityType.SHELF`)
- a specific Magic Shelf (`EntityType.MAGIC_SHELF`)

```ts
export enum EntityType {
  LIBRARY = 'Library',
  SHELF = 'Shelf',
  MAGIC_SHELF = 'Magic Shelf',
  ALL_BOOKS = 'All Books',
  UNSHELVED = 'Unshelved Books',
}
```

There is no separate entity type for "by author" / "by series" / other
criteria — those are implemented as filtered views of `ALL_BOOKS` (see
`app-book-filter`), not as distinct entities. Only `LIBRARY`, `SHELF`, and
`MAGIC_SHELF` currently support per-entity preference overrides.

The component renders either a grid (`app-book-card` virtualized grid) or a
table (`app-book-table`), toggled by `currentViewMode()`. The table columns
that are actually displayed are driven by `visibleColumns()`, which is passed
into `app-book-table` as `[visibleColumns]`.

## 2. Existing column visibility mechanism (global only, already implemented)

### 2.1 Frontend

`TableColumnPreferenceService`
(`frontend/src/app/features/book/components/book-browser/table-column-preference.service.ts`)
owns:

- `allAvailableFields`: a fixed, hardcoded list of 21 possible column fields
  (`readStatus`, `title`, `authors`, `publisher`, `seriesName`,
  `seriesNumber`, `categories`, `publishedDate`, `lastReadTime`, `addedOn`,
  `fileName`, `fileSizeKb`, `language`, `isbn`, `pageCount`,
  `amazonRating`, `amazonReviewCount`, `goodreadsRating`,
  `goodreadsReviewCount`, `hardcoverRating`, `hardcoverReviewCount`,
  `ranobedbRating`).
- `preferences` signal: `TableColumnPreference[]` = `{field, visible, order}[]`.
- `allColumns` getter: all fields with translated headers (used to populate
  the multiselect of selectable columns).
- `visibleColumns` getter: only the `visible` ones, sorted by `order`, with
  translated headers — this is what is actually rendered.
- `initPreferences(savedPrefs)`: merges saved prefs with
  `allAvailableFields` (adds new fields not yet in saved prefs, drops
  unknown ones implicitly by always mapping over `allAvailableFields`).
- `saveVisibleColumns(selectedColumns)`: rebuilds the full preference array
  (order = index in the selected list) and persists it via
  `userService.updateUserSetting(userId, 'tableColumnPreference', ...)`.

There is **one single, global** `TableColumnPreference[]` per user. It is
loaded once per user in `book-browser.component.ts`:

```ts
this.columnPreferenceService.initPreferences(currentUser.userSettings?.tableColumnPreference);
this.visibleColumns.set(this.columnPreferenceService.visibleColumns);
```

This happens inside the `setupQueryParamSubscription()` subscription, which
re-runs on every route/entity change — but since the source data
(`currentUser.userSettings?.tableColumnPreference`) does not vary by entity,
the resulting `visibleColumns` is identical everywhere (Library A, Library B,
a Shelf, All Books, etc. all show the same columns).

The book-browser toolbar exposes an "eye" icon that opens a `p-multiSelect`
popover (`book-browser.component.html` lines 64-97) letting the user
temporarily change `visibleColumns()` for the current session
(`onVisibleColumnsChange`), plus a "Save as default" button that calls
`columnPreferenceService.saveVisibleColumns(...)`, persisting it globally as
described above. This popover is only shown when `currentViewMode() === 'table'`.

**Note on column order:** `TableColumnPreference.order` is honored on
*read* — `visibleColumns` getter sorts by it before the columns reach
`app-book-table`. However, no UI path today lets a user actually produce a
custom order: `onVisibleColumnsChange` immediately re-sorts whatever the
multiselect returns back into the fixed canonical `allAvailableFields`
order —

```ts
onVisibleColumnsChange(selected: { field: string; header: string }[]): void {
  const allFields = this.columnPreferenceService.allColumns.map(column => column.field);
  this.visibleColumns.set(selected.sort(
    (a, b) => allFields.indexOf(a.field) - allFields.indexOf(b.field)
  ));
}
```

— so whatever order is subsequently saved via `saveVisibleColumns` just
reproduces canonical order for the visible subset. In other words, **only
visibility is actually configurable today; order is not** — the `order`
field exists in the model and is respected on read, but there is no working
mechanism to set it to anything other than canonical order. Reordering
columns is therefore a real gap, not something already implemented.

`app-book-table` (`book-table.component.ts`) simply takes `visibleColumns`
as an `input()` and builds its TanStack column defs from it, in the given
order — it has no awareness of persistence or entity scoping. It also stores
column *sizing* (`columnSizing` signal), which is transient/local and out of
scope for this feature.

### 2.2 Backend

`UserSettings.tableColumnPreference: List<TableColumnPreference>` on
`BookLoreUser` (`backend/.../model/dto/BookLoreUser.java`), where
`TableColumnPreference = {field, visible, order}`. It is a plain,
flat, single value under the generic per-key user-settings mechanism
(`UserSettingKey.TABLE_COLUMN_PREFERENCE`), with no default value
(`DefaultUserSettingsProvider` maps it to `() -> null`) and no per-entity
structure at all — unlike `entityViewPreferences`, there is no "global +
overrides" shape for columns.

## 3. Existing sort/view default + override mechanism (the pattern to mirror)

### 3.1 Data model

`EntityViewPreferences` (`user.service.ts`, mirrored in `BookLoreUser.java`
as `UserSettings.EntityViewPreferences`):

```ts
interface EntityViewPreferences {
  global: EntityViewPreference;
  overrides: EntityViewPreferenceOverride[];
}
interface EntityViewPreference {
  sortKey: string;
  sortDir: 'ASC' | 'DESC';
  sortCriteria?: SortCriterion[];
  view: 'GRID' | 'TABLE';
  coverSize: number;
  seriesCollapsed: boolean;
  overlayBookType: boolean;
}
interface EntityViewPreferenceOverride {
  entityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF';
  entityId: number;
  preferences: EntityViewPreference; // (backend: OverrideDetails, same shape minus sortKey/sortDir being optional-ish)
}
```

So `view` (grid/table) and sort are already stored together, once globally
and once per `(entityType, entityId)` override, inside the *same* record.
Column visibility is not part of this record at all today.

### 3.2 Resolution at runtime

`BookBrowserQueryParamsService.parseQueryParams()` computes the "effective"
preference for the current page:

```ts
const override = userPrefs?.overrides?.find(o =>
  o.entityType?.toUpperCase() === currentEntityTypeStr &&
  o.entityId === entityId
);
const effectivePrefs = override?.preferences ?? globalPrefs ?? <hardcoded fallback>;
```

Sort/view URL query params take precedence over this when present (so a
user can override the resolved default transiently via URL, without saving
it). The resolved `viewMode` and `sortCriteria` are applied in
`book-browser.component.ts`'s `setupQueryParamSubscription()`.

Note this resolution key uses `entityType` + `entityId`; it re-runs whenever
`entityInfo()` (route) changes, which is what makes per-library/shelf
overrides possible for sort/view — this is the mechanism column overrides
would need to plug into (or mirror).

### 3.3 Saving overrides (settings page)

`ViewPreferencesComponent`
(`frontend/src/app/features/settings/view-preferences-parent/view-preferences/*`)
is the settings-page UI for this. Its template
(`view-preferences.component.html`) currently renders, all in one
`app-view-preferences` card titled "Library & Shelf View & Sort Preferences":

1. **Default view mode** (`GRID`/`TABLE` select) + **default sort**
   (`app-multi-sort-popover` bound to `globalSortAsOptions`) — saved into
   `entityViewPreferences.global`.
2. **Visible sort fields** — a *separate, unrelated* concept: which sort
   *options* are offered anywhere in the app's sort pickers (not which
   columns are shown). Backed by `UserSettings.visibleSortFields` (plain
   `string[]`, no per-entity override), with a fixed min (3) / max (27),
   drag-to-reorder list, add/remove, and "reset to defaults"
   (`DEFAULT_VISIBLE_SORT_FIELDS`).
3. **Auto-save metadata** toggle — unrelated setting bundled into the same
   component/save button.
4. **Override management** — a table of overrides. Each row: entity type
   select (Library/Shelf/Magic Shelf), entity select (filtered to
   not-already-used entities), sort editor (popover with
   `app-multi-sort-popover`), view-mode select, delete button. An "Add
   override" button appends a new row defaulted to the first available
   entity, sort by title asc, grid view.

Everything in `ViewPreferencesComponent` is saved together by one
`saveSettings()` method, which writes three separate user settings keys
(`entityViewPreferences`, `autoSaveMetadata`, `visibleSortFields`) at once —
there is no per-section save.

`view-preferences-parent.component.html` is a simple parent that stacks
several independent settings-section components (`app-display-preferences`,
`app-dashboard-preferences`, `app-view-preferences`,
`app-filter-preferences`, `app-sidebar-sorting-preferences`,
`app-meta-center-view-mode-component`) plus one inline "Layout" section
(sidebar width slider), separated by `<hr>` dividers. Each section is its
own standalone component with its own `.html`/`.ts`/`.scss`, so the proposed
restructuring (general / columns / sort) would follow this existing
convention — likely splitting `ViewPreferencesComponent` into multiple
sibling components rather than sections within one component.

Note: `TableColumnPreferenceService`'s "visible columns" (what's shown in
the table) and `ViewPreferencesComponent`'s "visible sort fields" (what's
offered in sort pickers) are two independent, similarly-named but unrelated
concepts. This existing naming ambiguity is worth being deliberate about in
any requirements/design language to avoid confusion.

## 4. Summary of the gap

| Aspect | Sort | View mode | Table columns |
|---|---|---|---|
| Global default | ✅ `entityViewPreferences.global` | ✅ `entityViewPreferences.global` | ✅ `tableColumnPreference` (flat array, no wrapper) |
| Per-library/shelf/magic-shelf override | ✅ `entityViewPreferences.overrides[]` | ✅ `entityViewPreferences.overrides[]` | ❌ none |
| Settings-page UI | ✅ in `ViewPreferencesComponent` | ✅ in `ViewPreferencesComponent` | ❌ only ad-hoc, in the book-browser toolbar popover (global save only) |
| Resolved by entityType+entityId at render time | ✅ `parseQueryParams` | ✅ `parseQueryParams` | ❌ always global, entity-agnostic |

Extending column configuration to support per-library-style overrides means:
- Deciding how column overrides are keyed/stored (e.g., folding into
  `EntityViewPreference`/`EntityViewPreferenceOverride` alongside sort/view,
  vs. a new parallel `global`+`overrides` structure dedicated to columns).
- Adding override resolution by `(entityType, entityId)` for columns,
  mirroring `parseQueryParams`'s override lookup, into
  `book-browser.component.ts`'s consumption of `TableColumnPreferenceService`.
- Adding a settings-page UI section for default columns + per-entity column
  overrides, consistent with the existing override-table pattern used for
  sort/view.
- The requested restructuring of `ViewPreferencesComponent` into
  "General view preferences" / "Visible columns & overrides" / "Sort
  preferences" sub-components, following the existing pattern in
  `view-preferences-parent.component.html` of one component per section.
