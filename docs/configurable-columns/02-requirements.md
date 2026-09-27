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
2. An override, when present for a given entity, fully replaces the global
   default for that entity — i.e. it specifies the complete visible/ordered
   column list for that entity, not a partial adjustment merged with the
   global default.
3. An entity without an explicit column override uses the global default.
4. Changing the global default must not retroactively change any existing
   per-entity override — overrides are independent snapshots once created.
5. All Books and Unshelved Books are not entities that can have a column
   override; they always use the global default.

## 4. Settings page

1. The current "Library & Shelf View & Sort Preferences" settings UI is
   restructured into three sections:
   - **General view preferences**: default view mode (grid/table) and any
     other non-column, non-sort settings currently in that area (e.g.
     auto-save metadata).
   - **Visible columns & overrides**: configuring the global default column
     visibility/order, and managing per-entity column overrides.
   - **Sort preferences**: default sort, default sort overrides, and the
     available/visible sort fields configuration — as today.
2. The three sections are independent of each other in the UI: an entity
   can have a column override without needing a sort override, and vice
   versa. Each section manages its own list of entity overrides for its own
   concern.
3. The "Visible columns & overrides" section provides:
   - Configuration of the global default column visibility and order,
     including reordering the selected columns (not just toggling
     visibility).
   - A "reset to defaults" action for the global default column
     configuration.
   - Management of per-entity overrides: adding an override for a chosen
     Library/Shelf/Magic Shelf, configuring that override's column
     visibility and order (including reordering), and removing an override.
   - A "reset to defaults" action for an individual override's column
     configuration.

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
