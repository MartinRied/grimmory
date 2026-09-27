# Requirements: Configurable Table Columns (Defaults + Per-Entity Overrides)

## 1. Goal

Users can configure which columns are shown by default in the book table
view, and can override that default per Library, per Shelf, and per Magic
Shelf — analogous to how default sort order already works today.

## 2. Column visibility & order defaults

1. There is a single **global default** column configuration: which columns
   are visible, and in what order, in the book table view. Users can
   explicitly reorder the visible columns (not just toggle their
   visibility), and that order is saved as part of the configuration.
2. The global default applies to any book-listing view that does not have a
   more specific override (All Books, Unshelved Books, and any
   Library/Shelf/Magic Shelf without its own override).
3. The set of columns available to choose from is the existing fixed list
   (no changes to which fields can become columns).

## 3. Per-entity overrides

1. Users can configure a column override for individual Libraries, Shelves,
   and Magic Shelves.
2. A column override is one of several independent fields on that entity's
   override record (alongside its existing sort and view-mode override
   fields — see §4). An entity may have a column override without having a
   sort or view-mode override, and vice versa. When an entity's column
   override *is* set, it fully replaces the global default column list for
   that entity — i.e. it specifies the complete visible/ordered column
   list, not a partial adjustment merged with the global default. Its sort
   and view-mode, if not separately overridden, still fall back to the
   global default independently.
3. An entity without a column override on its record (whether or not it
   has other overridden fields) uses the global default column
   configuration.
4. Changing the global default must not retroactively change any existing
   per-entity override — overrides are independent snapshots once created.
5. All Books and Unshelved Books are not entities that can have a column
   override; they always use the global default.

## 4. Settings page

1. The current "Library & Shelf View & Sort Preferences" settings UI is
   restructured into two sections:
   - **General view preferences**: the default view mode (grid/table)
     picker and any other non-column, non-sort settings currently in that
     area (e.g. auto-save metadata). This section holds only *default*
     pickers, not per-entity overrides.
   - **Sort & Columns**: default sort, the available/visible sort fields
     configuration, the global default column visibility/order, and a
     single unified per-entity overrides table (see below). This section
     also owns per-entity view-mode overrides, even though the *default*
     view-mode picker itself lives in General — a short note in General
     points here for that.
2. Per-entity overrides live in one shared table/list, not three separate
   lists: each row is one entity (Library/Shelf/Magic Shelf) with
   independent controls for its sort override, its column override, and
   its view-mode override. A row may have any subset of these three set —
   e.g. a row with only a column override, inheriting sort and view mode
   from the global default. This mirrors §3.2's per-field independence.
3. The "Sort & Columns" section provides:
   - Configuration of the global default column visibility and order,
     including reordering the selected columns (not just toggling
     visibility), with a "reset to defaults" action.
   - The existing default sort and visible-sort-fields configuration, as
     today.
   - A single overrides table: adding a row for a chosen
     Library/Shelf/Magic Shelf, editing that row's sort configuration,
     column configuration (visibility and order, including reordering),
     and/or view mode independently, and removing the row (which clears
     all of that entity's overridden fields together).

## 5. Book-browser toolbar (ad-hoc / quick configuration)

1. The existing column-visibility popover (eye icon) in the book table
   toolbar continues to allow ad-hoc, session-only changes to the columns
   shown in the current view.
2. In addition to choosing which columns are visible, this popover must let
   the user reorder the currently-visible columns, and the resulting order
   is saved together with the visibility selection.
3. Its "save" action persists the current column selection and order as:
   - the entity's column override, when the current view is a specific
     Library, Shelf, or Magic Shelf;
   - the global default, when the current view is All Books or Unshelved
     Books.
   This mirrors the existing behavior of the sort "save" action in the same
   toolbar.

## 6. Migration / compatibility

1. Users' existing saved global column preference (today's single flat
   value) becomes their initial global default column configuration after
   this change ships — no visible change in their table columns on upgrade.
2. No existing per-entity column overrides exist prior to this feature
   (not previously possible), so no override migration is needed.
