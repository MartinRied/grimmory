# Status: Backend implementation of configurable table columns

This documents what has been implemented on the backend for the
"configurable columns" feature described in `01-analysis.md`,
`02-requirements.md`, and designed in `03-design.md`. It covers only the
backend slice of `03-design.md` §1.2; it does not speculate about the
frontend work described in §2–§6 of that document, which is out of scope
for this task and not covered here.

## What was implemented

Per `03-design.md` §1.2 ("Backend"), the only backend change needed was
adding the new `columns` field to the two DTO classes that back
`entityViewPreferences`'s global default and per-entity override shape:

- `backend/src/main/java/org/booklore/model/dto/BookLoreUser.java`:
  - `UserSettings.GlobalPreferences` gained `private List<String> columns;`
    (placed after `view`, matching the field ordering used in
    `03-design.md` §1.1's TypeScript interfaces).
  - `UserSettings.OverrideDetails` gained `private List<String> columns;`
    (also placed after `view`).

No other production code was changed. This matches the design's explicit
conclusion (§1.2) that no further backend work is needed, which was
verified by inspection before implementing:

- `EntityViewPreferences` is persisted as one opaque JSON value in the
  generic `user_settings` table (`setting_value` column, JSON type, from
  `V14__Create_user_settings_table.sql`) — a new field on a nested object
  requires no database migration.
- `BookLoreUserTransformer.toDTO` deserializes the whole
  `EntityViewPreferences` object in a single Jackson `readValue` call
  (`ENTITY_VIEW_PREFERENCES` case) — no per-field mapping code exists that
  would need to learn about the new field.
- Neither `GlobalPreferences` nor `OverrideDetails` carry Bean Validation
  or any other content validation today, so no new validation was added
  for `columns` (consistent with the existing fields on those classes).
- `UserService.updateUserSetting` serializes whatever `Object value` it is
  given via `objectMapper.writeValueAsString(value)` for any key marked
  `isJson()` in `UserSettingKey` — it has no per-field knowledge of
  `EntityViewPreferences`'s shape, so it required no changes either.
- `UserSettingKey.TABLE_COLUMN_PREFERENCE` and the `TableColumnPreference`
  DTO class were left untouched, as designed (§1.2, §7) — they remain the
  read type for the legacy, global-only column preference that the
  frontend will use as a one-time migration fallback. The backend does not
  implement or need to implement that fallback logic itself; it never
  interprets `entityViewPreferences` content, so there is nothing for it
  to fall back on the backend side.

## Tests added

`backend/src/test/java/org/booklore/mapper/custom/BookLoreUserTransformerTest.java`
is a new test class (none existed for `BookLoreUserTransformer` before).
It follows the patterns already established in this codebase for testing
Jackson-based (de)serialization directly against a real `ObjectMapper`
(e.g. `JpaJsonConverterTest`) combined with Mockito for the transformer's
other collaborator (`LibraryMapper`), similar in structure to
`UserServiceTest`. Two cases:

1. `toDTO_deserializesColumnsOnGlobalAndOverridePreferences` — feeds a
   `UserSettingEntity` with an `entityViewPreferences` JSON value that sets
   `columns` on both `global` and on one entity's override `preferences`,
   and asserts both are read back correctly as ordered `List<String>`, and
   that an override field not present in the JSON (`view`, in this fixture)
   deserializes as `null` rather than some default — this is the assumption
   the frontend's per-field-fallback resolution (`03-design.md` §2.1) design
   depends on.
2. `toDTO_missingColumnsField_deserializesAsNull` — feeds old-shaped JSON
   without any `columns` key at all (representing data saved before this
   change) and asserts it still deserializes without error, with
   `columns` simply `null` — this is the regression guard for the
   "no migration needed" claim in `03-design.md` §1.2/§7.

Existing tests that touch related code were re-run and pass unchanged:
`BookLoreUserEntityTest`, `DefaultUserSettingsProviderTest`,
`UserServiceTest`.

The full backend test suite was also run. It has 8 pre-existing failures,
all in `BookDownloadServiceTest`, `LibraryFileHelperTest`,
`BookFilePersistenceServiceTest$FindMatchingLibraryPath`, and
`FileServiceTest$PathUtilitiesTests$FindSystemFileTest` — all Windows-path
related (POSIX permission attributes, `/` vs `\` separators, `;`-splitting
of Windows paths) and unrelated to `BookLoreUser`, `entityViewPreferences`,
or `BookLoreUserTransformer`. These failures pre-exist this change and were
not introduced by it.

## Deliberately left open (not part of this task)

Everything in `03-design.md` §2–§6 is frontend work and was not started:

- Making `EntityViewPreference`/`OverrideDetails`/`EntityViewPreferenceOverride`
  optional per-field on the TypeScript side, and the corresponding
  per-field fallback resolution in
  `book-browser-query-params.service.ts::parseQueryParams` (§2.1).
- The new column-resolution helper and `DEFAULT_VISIBLE_COLUMNS` constant,
  and the `TableColumnPreferenceService` internal-shape change to
  `string[]` (§2.2, §3).
- The new `ColumnOrderPopoverComponent` and its three call sites (§4).
- `book-browser.component.ts`'s `onSaveColumnConfig` and toolbar popover
  changes (§5).
- The settings-page restructuring into `general-view-preferences` and the
  reworked `view-preferences` ("Sort & Columns") component, including the
  "Edit Columns" popover in the overrides table (§6).

No frontend code (including `user.service.ts`'s TypeScript interfaces) was
changed as part of this task — the backend DTO now supports the `columns`
field, but nothing yet sends or reads it.
