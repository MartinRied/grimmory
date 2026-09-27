# Design: Configurable Table Columns (Defaults + Per-Entity Overrides)

This document designs the implementation for the requirements in
`02-requirements.md`, building on `01-analysis.md`. It favours folding into
the existing sort/view-mode override mechanism over introducing a parallel
one, since — per user direction — column overrides are naturally edited
together with sort and view-mode overrides for the same entity.

## 1. Data model

### 1.1 Frontend (`frontend/src/app/features/settings/user-management/user.service.ts`)

```ts
export interface EntityViewPreference {
  sortKey: string;
  sortDir: 'ASC' | 'DESC';
  sortCriteria?: SortCriterion[];
  view: 'GRID' | 'TABLE';
  columns?: string[];          // NEW — ordered, visible-only field names
  coverSize: number;
  seriesCollapsed: boolean;
  overlayBookType: boolean;
}

// Fields become independently optional: an override may set any subset of
// {sortKey/sortDir/sortCriteria, view, columns}. Unset fields fall back to
// `global` for that same field (see §2). coverSize/seriesCollapsed/
// overlayBookType are untouched by this feature and keep their current
// always-populated behavior.
export interface OverrideDetails {
  sortKey?: string;
  sortDir?: 'ASC' | 'DESC';
  sortCriteria?: SortCriterion[];
  view?: 'GRID' | 'TABLE';
  columns?: string[];          // NEW
  coverSize: number;
  seriesCollapsed: boolean;
  overlayBookType: boolean;
}

export interface EntityViewPreferenceOverride {
  entityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF';
  entityId: number;
  preferences: OverrideDetails;
}

export interface EntityViewPreferences {
  global: EntityViewPreference;
  overrides: EntityViewPreferenceOverride[];
}
```

A new constant `DEFAULT_VISIBLE_COLUMNS: string[]` is added next to
`DEFAULT_VISIBLE_SORT_FIELDS`, listing all 21 known fields in their current
canonical order — this is today's implicit "everything visible, canonical
order" fallback, made explicit.

The existing `TableColumnPreference` interface (`{field, visible, order}`)
is kept **only** as the read type for the legacy `tableColumnPreference`
user setting (migration fallback, see §5) — the app never writes it again.

### 1.2 Backend (`backend/.../model/dto/BookLoreUser.java`)

Mirrors the frontend 1:1:

- `GlobalPreferences` gains `private List<String> columns;`.
- `OverrideDetails` gains `private List<String> columns;`. Its existing
  fields (`sortKey`, `sortDir`, `sortCriteria`, `view`) are already
  non-final POJO fields with no `@NonNull`/Bean Validation annotations, so
  they already tolerate being left `null` — no type change is needed
  there, only the frontend TS types need the explicit `?`.
- `TableColumnPreference` DTO class and `UserSettingKey.TABLE_COLUMN_PREFERENCE`
  are left exactly as-is (read fallback only).

**Confirmed via exploration, no further backend work needed:**
- `EntityViewPreferences` is stored as one opaque JSON column
  (`user_settings.setting_value`, from `V14__Create_user_settings_table.sql`);
  adding a field requires no migration.
- `BookLoreUserTransformer.toDTO` deserializes the whole object in a single
  Jackson `readValue` call — a new field is picked up automatically.
- There is no Bean Validation or allowlist checking on `GlobalPreferences`/
  `OverrideDetails` content today, so no new validation is required to
  match existing rigor.

## 2. Resolution logic

### 2.1 Sort & view mode (`book-browser-query-params.service.ts::parseQueryParams`)

Today, the whole `preferences` object is chosen or discarded as a unit:

```ts
const effectivePrefs = override?.preferences ?? globalPrefs ?? <fallback>;
```

This changes to **per-field** fallback, so an entity's override can define
just one of {sort, view, columns} while the others still inherit from
`global`:

```ts
const effectiveView = override?.preferences?.view ?? globalPrefs?.view ?? 'GRID';

const effectiveSortCriteria =
  override?.preferences?.sortCriteria?.length ? override.preferences.sortCriteria
  : override?.preferences?.sortKey ? [{field: override.preferences.sortKey, direction: override.preferences.sortDir ?? 'ASC'}]
  : globalPrefs?.sortCriteria?.length ? globalPrefs.sortCriteria
  : globalPrefs?.sortKey ? [{field: globalPrefs.sortKey, direction: globalPrefs.sortDir ?? 'ASC'}]
  : <hardcoded addedOn/DESC fallback, as today>;
```

(The exact fallback chain preserves today's legacy-single-sort-field
compatibility step for step, just re-anchored to per-field lookup instead
of whole-object lookup.)

### 2.2 Columns

A new resolution helper lives in `TableColumnPreferenceService` (it already
owns `allAvailableFields`, header translation, and is the natural home for
the legacy-fallback step):

```ts
resolveVisibleFields(
  prefs: EntityViewPreferences | undefined,
  entityType: EntityType | undefined,
  entityId: number | undefined,
  legacyTableColumnPreference: TableColumnPreference[] | undefined
): string[] {
  const override = prefs?.overrides?.find(o => matches(o, entityType, entityId));
  return override?.preferences?.columns
    ?? prefs?.global?.columns
    ?? legacyToFieldList(legacyTableColumnPreference)   // migration fallback, §5
    ?? DEFAULT_VISIBLE_COLUMNS;
}
```

Called from `book-browser.component.ts`'s existing
`setupQueryParamSubscription()`, alongside the existing sort/view
resolution — it already depends on `entityInfo()` and re-runs on every
route/entity change, so no new reactivity plumbing is needed:

```ts
this.visibleColumns.set(
  this.columnPreferenceService
    .resolveVisibleFields(this.entityViewPreferences, entityType, entityId, currentUser.userSettings?.tableColumnPreference)
    .map(field => ({field, header: this.columnPreferenceService.headerFor(field)}))
);
```

## 3. `TableColumnPreferenceService` changes

- Internal signal changes from `TableColumnPreference[]` to `string[]`
  (ordered, visible field names only) — this directly mirrors the existing
  `visibleSortFields: string[]`/`DEFAULT_VISIBLE_SORT_FIELDS` pattern
  already in the codebase, and removes the `visible` boolean and the
  merge-with-all-known-fields logic (`mergeWithAllColumns`) that exists
  today only because the old shape tracked *every* field, not just visible
  ones.
- `allColumns` getter is unchanged: translated `{field, header}[]` for the
  "available to add" list in the new column-order component.
- `saveVisibleColumns`/`initPreferences` are replaced by the resolution
  helper above (read side) plus direct `updateUserSetting('entityViewPreferences', ...)`
  calls from the calling component (write side) — the service no longer
  owns persistence itself, matching how sort criteria persistence is
  already owned by the calling component rather than by a sort-focused
  service.

## 4. New shared component: `ColumnOrderPopoverComponent`

Structured to directly mirror the existing `MultiSortPopoverComponent`
(`frontend/.../sorting/multi-sort-popover/multi-sort-popover.component.*`),
which is already reused three times today (settings global sort editor,
settings per-override "Edit Sort" popover, toolbar sort popover) — the
exact reuse shape this feature needs for columns.

New location:
`frontend/src/app/features/book/components/book-browser/columns/column-order-popover/column-order-popover.component.{ts,html,scss}`

```ts
@Input() visibleColumns: {field: string; header: string}[] = [];
@Input() availableColumns: {field: string; header: string}[] = [];   // all known columns, for the "add" dropdown
@Input() showSaveButton = false;

@Output() columnsChange = new EventEmitter<{field: string; header: string}[]>();
@Output() saveColumnConfig = new EventEmitter<{field: string; header: string}[]>();
```

Template mirrors `multi-sort-popover.component.html`: a `cdkDropList` of
draggable rows (drag handle via `cdkDragHandle`, rank number, label, a
remove button) built with `moveItemInArray` on drop — identical mechanics
to `onDrop`/`onRemove`/`onAddField` in `MultiSortPopoverComponent`, minus
the direction-toggle button (columns have no direction concept). An "add
column" `p-select` lists `availableColumns` minus `visibleColumns`. An
optional save button (shown via `showSaveButton`) mirrors `onSave`.

Reused in exactly three places, matching `MultiSortPopoverComponent`'s three
usages:

1. **Toolbar popover** (`book-browser.component.html`'s eye-icon popover):
   replaces today's `p-multiSelect` entirely with
   `<app-column-order-popover [showSaveButton]="true" (saveColumnConfig)="onSaveColumnConfig($event)">`.
2. **Settings page global default** (Sort & Columns section): rendered
   inline (no trigger button needed — full width available), no save
   button (saved via that section's own explicit "Save" action, matching
   how the global sort editor works today).
3. **Settings page per-entity override** ("Edit Columns" button + popover
   in the overrides table row, mirroring the existing "Edit Sort"
   button + popover), no save button (same reason as #2).

## 5. `book-browser.component.ts` / toolbar changes

- `visibleColumns()` signal is now populated via §2.2's resolution instead
  of the purely-global `columnPreferenceService.initPreferences(currentUser.userSettings?.tableColumnPreference)`.
- New `onSaveColumnConfig(columns)`, structurally identical to the existing
  `onSaveSortConfig` (`book-browser.component.ts` today): writes
  `global.columns` when `entityType` is `ALL_BOOKS`/`UNSHELVED`; otherwise
  finds-or-creates the entity's `EntityViewPreferenceOverride` and sets
  just its `preferences.columns` field, leaving any existing `sortKey`/
  `sortDir`/`sortCriteria`/`view` on that same record untouched.
- The toolbar's save button is shown unconditionally, mirroring
  `canSaveSort` (which is already unconditionally `true` for every entity
  type today) — no new "can save" computed is needed.

## 6. Settings page restructuring

`frontend/src/app/features/settings/view-preferences-parent/`:

- **New `general-view-preferences` component**: default view-mode
  `p-select` + the `autoSaveMetadata` toggle, extracted from today's
  `view-preferences` component. Includes a short description note that
  per-entity view-mode overrides are managed in the Sort & Columns section
  below (since they now live in the same override record as sort/columns).
- **Reworked `view-preferences` component → "Sort & Columns" section**:
  keeps the default sort editor (`app-multi-sort-popover`, unchanged) and
  the visible-sort-fields editor (unchanged), and adds:
  - A default columns editor: `<app-column-order-popover>` rendered
    inline, plus a "reset to defaults" button that resets to
    `DEFAULT_VISIBLE_COLUMNS`.
  - The overrides table gains an "Edit Columns" button + popover per row
    (next to the existing "Edit Sort" button), using the same
    `ColumnOrderPopoverComponent`. The existing view-mode `p-select`
    column and delete button are unchanged in behavior, except delete now
    explicitly clears the row's sort *and* column overrides together
    (full-record delete, not per-field).
  - `addOverride()` creates a new row with all of `sortKey`/`sortDir`/
    `sortCriteria`/`view`/`columns` left `undefined` (pure inherit from
    global) until the user edits one of them — a change from today's
    behavior of stamping full defaults (`title`/`ASC`/`GRID`) on creation,
    made possible by the fields now being independently optional.
- `view-preferences-parent.component.html` swaps `<app-view-preferences>`
  for `<app-general-view-preferences>` followed by the reworked component.

## 7. Migration / compatibility summary

- `tableColumnPreference` (legacy, global-only): read once as a fallback
  when `global.columns` is absent (see §2.2's `resolveVisibleFields`);
  never written again going forward. Can be removed in a later cleanup
  once confidence is high no other consumer depends on it.
- Existing per-entity `view` overrides need no migration — they already
  live inside the same `OverrideDetails` record this feature extends; only
  the *resolution* of that field changes from whole-object to per-field
  fallback (§2.1), which is a superset of today's behavior for records that
  already fully specify sort+view (no observable change for them).
- No backend schema/migration changes; no new backend validation.

## 8. Out of scope (explicit non-goals for this iteration)

- Per-field clearing of an override (e.g. "un-override just the sort, keep
  the column override") — the overrides table's delete action removes the
  whole row (sort + view + columns together), consistent with requirement
  §4.3's "removing the row... clears all of that entity's overridden
  fields together."
- Changes to the fixed set of available column fields (still the existing
  21 fields).
- Any change to column *sizing* (`book-table.component.ts`'s
  `columnSizing` signal) — unrelated, transient, and untouched.
