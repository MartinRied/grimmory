import {Component, DestroyRef, effect, ElementRef, inject, Injector, OnInit, viewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Button} from '@openng/optimus-ui/button';

import {MessageService} from '@openng/optimus-ui/api';
import {Select} from '@openng/optimus-ui/select';
import {TableModule} from '@openng/optimus-ui/table';
import {
  DEFAULT_VISIBLE_COLUMNS,
  DEFAULT_VISIBLE_SORT_FIELDS,
  EntityViewPreferences,
  OverrideDetails,
  SortCriterion,
  UserService
} from '../../user-management/user.service';
import {LibraryService} from '../../../book/service/library.service';
import {ShelfService} from '../../../book/service/shelf.service';
import {MagicShelfService} from '../../../magic-shelf/service/magic-shelf.service';
import {FormsModule} from '@angular/forms';

import {Tooltip} from '@openng/optimus-ui/tooltip';
import {ToggleSwitch} from '@openng/optimus-ui/toggleswitch';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {SortDirection, SortOption} from '../../../book/model/sort.model';
import {MultiSortPopoverComponent} from '../../../book/components/book-browser/sorting/multi-sort-popover/multi-sort-popover.component';
import {ColumnOrderPopoverComponent, TableColumnOption} from '../../../book/components/book-browser/columns/column-order-popover/column-order-popover.component';
import {TableColumnPreferenceService} from '../../../book/components/book-browser/table-column-preference.service';
import {Popover} from '@openng/optimus-ui/popover';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';

interface OverrideRow {
  entityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF';
  library: number;
  // undefined means "not overridden for this entity — inherits from global"
  sortCriteria: SortCriterion[] | undefined;
  sortCriteriaAsOptions: SortOption[];
  columns: string[] | undefined;
  columnsAsOptions: TableColumnOption[];
  view: 'GRID' | 'TABLE' | undefined;
}

@Component({
  selector: 'app-view-preferences',
  standalone: true,
  imports: [
    Select,
    FormsModule,
    Button,
    TableModule,
    Tooltip,
    ToggleSwitch,
    TranslocoDirective,
    MultiSortPopoverComponent,
    ColumnOrderPopoverComponent,
    Popover,
    CdkDropList,
    CdkDrag,
    CdkDragHandle
  ],
  templateUrl: './view-preferences.component.html',
  styleUrl: './view-preferences.component.scss'
})
export class ViewPreferencesComponent implements OnInit {
  private t = inject(TranslocoService);

  private readonly sortOptionDefs: {field: string; translationKey: string}[] = [
    {field: 'title', translationKey: 'sortTitle'},
    {field: 'fileName', translationKey: 'sortFileName'},
    {field: 'filePath', translationKey: 'sortFilePath'},
    {field: 'author', translationKey: 'sortAuthor'},
    {field: 'authorSurnameVorname', translationKey: 'sortAuthorSurname'},
    {field: 'seriesName', translationKey: 'sortSeriesName'},
    {field: 'seriesNumber', translationKey: 'sortSeriesNumber'},
    {field: 'lastReadTime', translationKey: 'sortLastRead'},
    {field: 'personalRating', translationKey: 'sortPersonalRating'},
    {field: 'addedOn', translationKey: 'sortAddedOn'},
    {field: 'fileSizeKb', translationKey: 'sortFileSize'},
    {field: 'locked', translationKey: 'sortLocked'},
    {field: 'publisher', translationKey: 'sortPublisher'},
    {field: 'publishedDate', translationKey: 'sortPublishedDate'},
    {field: 'readStatus', translationKey: 'sortReadStatus'},
    {field: 'dateFinished', translationKey: 'sortDateFinished'},
    {field: 'readingProgress', translationKey: 'sortReadingProgress'},
    {field: 'bookType', translationKey: 'sortBookType'},
    {field: 'amazonRating', translationKey: 'sortAmazonRating'},
    {field: 'amazonReviewCount', translationKey: 'sortAmazonCount'},
    {field: 'goodreadsRating', translationKey: 'sortGoodreadsRating'},
    {field: 'goodreadsReviewCount', translationKey: 'sortGoodreadsCount'},
    {field: 'hardcoverRating', translationKey: 'sortHardcoverRating'},
    {field: 'hardcoverReviewCount', translationKey: 'sortHardcoverCount'},
    {field: 'ranobedbRating', translationKey: 'sortRanobedbRating'},
    {field: 'narrator', translationKey: 'sortNarrator'},
    {field: 'pageCount', translationKey: 'sortPages'},
    {field: 'random', translationKey: 'sortRandom'},
  ];

  sortOptions: {label: string; field: string; translationKey: string}[] = [];

  entityTypeOptions: {label: string; value: string; translationKey: string}[] = [];

  // Default view mode select (Grid/Table only — the per-row override select
  // below has its own separate options with a third "(Use Default)" entry).
  viewModeOptions: {label: string; value: 'GRID' | 'TABLE'}[] = [];

  // Options for the per-row override view-mode select — includes a third
  // "(Use Default)" option (value: undefined) alongside Grid/Table, since an
  // override row's view mode is now independently optional.
  overrideViewModeOptions: {label: string; value: 'GRID' | 'TABLE' | undefined}[] = [];

  get libraryOptions(): { label: string; value: number }[] {
    return this.libraryService.libraries()
      .filter(library => library.id !== undefined)
      .map(library => ({label: library.name, value: library.id!}));
  }
  get shelfOptions(): { label: string; value: number }[] {
    return this.shelfService.shelves()
      .filter(shelf => shelf.id !== undefined)
      .map(shelf => ({label: shelf.name, value: shelf.id!}));
  }
  get magicShelfOptions(): { label: string; value: number }[] {
    return this.magicShelfService.shelves()
      .filter(shelf => shelf.id !== undefined)
      .map(shelf => ({label: shelf.name, value: shelf.id!}));
  }

  selectedSort: string = 'title';
  selectedSortDir: 'ASC' | 'DESC' = 'ASC';
  selectedView: 'GRID' | 'TABLE' = 'GRID';
  autoSaveMetadata = false;
  sortCriteria: SortCriterion[] = [];

  // SortOption[] versions for the multi-sort-popover component
  globalSortAsOptions: SortOption[] = [];
  allSortAsOptions: SortOption[] = [];

  // Global default columns configuration
  columns: string[] = [];
  columnsAsOptions: TableColumnOption[] = [];

  // Visible sort fields configuration
  visibleSortFields: string[] = [];
  selectedAddSortField: string | null = null;
  readonly minSortFields = 3;
  readonly maxSortFields = 27;

  // Collapsible state for the three Book Browser Preferences sub-sections
  // (collapsed by default; each header shows a live "(x of y selected)" summary regardless of state)
  defaultColumnsExpanded = false;
  defaultSortExpanded = false;
  visibleSortFieldsExpanded = false;

  // Override Management is collapsed by default only when there are no overrides yet;
  // once overrides exist, start expanded so the table is immediately visible.
  overrideManagementExpanded = false;

  private readonly sortFieldList = viewChild<ElementRef<HTMLElement>>('sortFieldList');

  overrides: OverrideRow[] = [];

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private libraryService = inject(LibraryService);
  private shelfService = inject(ShelfService);
  private magicShelfService = inject(MagicShelfService);
  private userService = inject(UserService);
  private messageService = inject(MessageService);
  protected columnPreferenceService = inject(TableColumnPreferenceService);
  private readonly currentUser = this.userService.currentUser;
  private hasInitializedPreferences = false;

  ngOnInit(): void {
    this.rebuildTranslatedLabels();
    this.t.langChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.rebuildTranslatedLabels();
      this.allSortAsOptions = this.sortOptions.map(o => ({
        label: this.t.translate('settingsView.librarySort.' + o.translationKey),
        field: o.field,
        direction: SortDirection.ASCENDING
      }));
      this.globalSortAsOptions = this.toSortOptions(this.sortCriteria);
      this.columnsAsOptions = this.toColumnOptions(this.columns);
      this.overrides.forEach(o => {
        o.sortCriteriaAsOptions = this.toSortOptions(o.sortCriteria ?? []);
        o.columnsAsOptions = this.toColumnOptions(o.columns ?? []);
      });
    });

    effect(() => {
      const user = this.currentUser();
      if (this.hasInitializedPreferences || !user) {
        return;
      }

      this.hasInitializedPreferences = true;
      const prefs = user.userSettings?.entityViewPreferences;
      const global = prefs?.global;
      this.selectedSort = global?.sortKey ?? 'title';
      this.selectedSortDir = global?.sortDir ?? 'ASC';
      this.selectedView = global?.view ?? 'GRID';
      this.autoSaveMetadata = user.userSettings?.autoSaveMetadata ?? false;

      if (global?.sortCriteria && global.sortCriteria.length > 0) {
        this.sortCriteria = [...global.sortCriteria];
      } else {
        this.sortCriteria = [{field: this.selectedSort, direction: this.selectedSortDir}];
      }

      this.allSortAsOptions = this.sortOptions.map(option => ({
        label: this.t.translate('settingsView.librarySort.' + option.translationKey),
        field: option.field,
        direction: SortDirection.ASCENDING
      }));
      this.globalSortAsOptions = this.toSortOptions(this.sortCriteria);

      this.columns = global?.columns ?? [...DEFAULT_VISIBLE_COLUMNS];
      this.columnsAsOptions = this.toColumnOptions(this.columns);

      this.visibleSortFields = user.userSettings?.visibleSortFields
        ? [...user.userSettings.visibleSortFields]
        : [...DEFAULT_VISIBLE_SORT_FIELDS];

      this.overrides = (prefs?.overrides ?? []).map(override => {
        const sortCriteria = override.preferences.sortCriteria?.length
          ? [...override.preferences.sortCriteria]
          : override.preferences.sortKey
            ? [{field: override.preferences.sortKey, direction: override.preferences.sortDir ?? 'ASC'} as SortCriterion]
            : undefined;
        const columns = override.preferences.columns ? [...override.preferences.columns] : undefined;
        return {
          entityType: override.entityType,
          library: override.entityId,
          sortCriteria,
          sortCriteriaAsOptions: this.toSortOptions(sortCriteria ?? []),
          columns,
          columnsAsOptions: this.toColumnOptions(columns ?? []),
          view: override.preferences.view
        };
      });
      this.overrideManagementExpanded = this.overrides.length > 0;
    }, {injector: this.injector});
  }

  private rebuildTranslatedLabels(): void {
    this.sortOptions = this.sortOptionDefs.map(o => ({
      label: this.t.translate('settingsView.librarySort.' + o.translationKey),
      field: o.field,
      translationKey: o.translationKey
    }));
    this.entityTypeOptions = [
      {label: this.t.translate('settingsView.librarySort.entityLibrary'), value: 'LIBRARY', translationKey: 'entityLibrary'},
      {label: this.t.translate('settingsView.librarySort.entityShelf'), value: 'SHELF', translationKey: 'entityShelf'},
      {label: this.t.translate('settingsView.librarySort.entityMagicShelf'), value: 'MAGIC_SHELF', translationKey: 'entityMagicShelf'}
    ];
    this.overrideViewModeOptions = [
      {label: this.t.translate('settingsView.librarySort.useDefault'), value: undefined},
      {label: this.t.translate('settingsView.librarySort.viewGrid'), value: 'GRID'},
      {label: this.t.translate('settingsView.librarySort.viewTable'), value: 'TABLE'}
    ];
    this.viewModeOptions = [
      {label: this.t.translate('settingsView.librarySort.viewGrid'), value: 'GRID'},
      {label: this.t.translate('settingsView.librarySort.viewTable'), value: 'TABLE'}
    ];
  }

  getAvailableEntities(index: number, type: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF') {
    const selected = this.overrides.map((o, i) => i !== index ? o.library : null);
    let source: { label: string; value: number }[];
    switch (type) {
      case 'LIBRARY':
        source = this.libraryOptions;
        break;
      case 'SHELF':
        source = this.shelfOptions;
        break;
      case 'MAGIC_SHELF':
        source = this.magicShelfOptions;
        break;
      default:
        source = [];
    }
    return source.filter(opt => !selected.includes(opt.value) || this.overrides[index]?.library === opt.value);
  }

  get availableLibraries() {
    const used = new Set(this.overrides.map(o => `${o.entityType}_${o.library}`));

    const withEntityType = (options: { label: string; value: number }[], entityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF') =>
      options.map(opt => ({...opt, entityType}));

    return [...withEntityType(this.libraryOptions, 'LIBRARY'),
      ...withEntityType(this.shelfOptions, 'SHELF'),
      ...withEntityType(this.magicShelfOptions, 'MAGIC_SHELF')]
      .filter(opt => !used.has(`${opt.entityType}_${opt.value}`));
  }

  addOverride(): void {
    const next = this.availableLibraries[0];
    if (next) {
      this.overrides.push({
        entityType: next.entityType,
        library: next.value,
        sortCriteria: undefined,
        sortCriteriaAsOptions: [],
        columns: undefined,
        columnsAsOptions: [],
        view: undefined
      });
    }
  }

  removeOverride(index: number): void {
    this.overrides.splice(index, 1);
  }

  // Conversion helpers
  private toSortOptions(criteria: SortCriterion[]): SortOption[] {
    return criteria.map(c => ({
      label: this.t.translate('settingsView.librarySort.' + (this.sortOptions.find(o => o.field === c.field)?.translationKey ?? c.field)),
      field: c.field,
      direction: c.direction === 'ASC' ? SortDirection.ASCENDING : SortDirection.DESCENDING
    }));
  }

  private toSortCriteria(options: SortOption[]): SortCriterion[] {
    return options.map(o => ({
      field: o.field,
      direction: o.direction === SortDirection.ASCENDING ? 'ASC' as const : 'DESC' as const
    }));
  }

  private toColumnOptions(fields: string[]): TableColumnOption[] {
    return fields.map(field => ({field, header: this.columnPreferenceService.headerFor(field)}));
  }

  onGlobalSortCriteriaChange(criteria: SortOption[]): void {
    this.globalSortAsOptions = criteria;
    this.sortCriteria = this.toSortCriteria(criteria);
    this.syncLegacySort();
  }

  onOverrideSortCriteriaChange(index: number, criteria: SortOption[]): void {
    this.overrides[index].sortCriteriaAsOptions = criteria;
    this.overrides[index].sortCriteria = this.toSortCriteria(criteria);
  }

  onGlobalColumnsChange(columns: TableColumnOption[]): void {
    this.columnsAsOptions = columns;
    this.columns = columns.map(c => c.field);
  }

  onOverrideColumnsChange(index: number, columns: TableColumnOption[]): void {
    this.overrides[index].columnsAsOptions = columns;
    this.overrides[index].columns = columns.map(c => c.field);
  }

  // Clears just this row's sort-criteria override back to "inherit from global"
  // (undefined), without touching its columns or view override.
  resetOverrideSort(index: number): void {
    this.overrides[index].sortCriteria = undefined;
    this.overrides[index].sortCriteriaAsOptions = [];
  }

  // Clears just this row's columns override back to "inherit from global"
  // (undefined), without touching its sort or view override.
  resetOverrideColumns(index: number): void {
    this.overrides[index].columns = undefined;
    this.overrides[index].columnsAsOptions = [];
  }

  resetColumnsToDefaults(): void {
    this.columns = [...DEFAULT_VISIBLE_COLUMNS];
    this.columnsAsOptions = this.toColumnOptions(this.columns);
  }

  private syncLegacySort(): void {
    if (this.sortCriteria.length > 0) {
      this.selectedSort = this.sortCriteria[0].field;
      this.selectedSortDir = this.sortCriteria[0].direction;
    }
  }

  // Visible sort fields management
  getSortFieldLabel(field: string): string {
    const key = this.sortOptions.find(opt => opt.field === field)?.translationKey;
    return key ? this.t.translate('settingsView.librarySort.' + key) : field;
  }

  get availableSortFieldsToAdd(): {label: string; value: string}[] {
    const used = new Set(this.visibleSortFields);
    return this.sortOptions
      .filter(opt => !used.has(opt.field))
      .map(opt => ({label: this.t.translate('settingsView.librarySort.' + opt.translationKey), value: opt.field}));
  }

  get sortFieldSelectionCountText(): string {
    return this.t.translate('settingsView.librarySort.sortFieldCount', {
      count: this.visibleSortFields.length,
      total: this.sortOptions.length
    });
  }

  // "(x of y selected)" summary for the Default Shown Columns section header —
  // x = currently selected default columns, y = total columns available to choose from.
  get columnSelectionCountText(): string {
    return this.t.translate('settingsView.librarySort.sortFieldCount', {
      count: this.columns.length,
      total: this.columnPreferenceService.allColumns.length
    });
  }

  // "(x of y selected)" summary for the Default Sort Columns section header —
  // x = active sort criteria, y = total sortable fields available to add as a criterion.
  // Sort criteria are drawn from the same bounded pool as visible sort fields (each field can
  // only appear once per criteria list), so the "selected out of total" framing still holds.
  get sortCriteriaSelectionCountText(): string {
    return this.t.translate('settingsView.librarySort.sortFieldCount', {
      count: this.sortCriteria.length,
      total: this.sortOptions.length
    });
  }

  // "(n overrides configured)" summary for the Override Management section header.
  get overrideCountText(): string {
    return this.t.translate('settingsView.librarySort.overrideCount', {
      count: this.overrides.length
    });
  }

  onSortFieldDrop(event: CdkDragDrop<string[]>): void {
    moveItemInArray(this.visibleSortFields, event.previousIndex, event.currentIndex);
  }

  addSortField(): void {
    if (this.selectedAddSortField) {
      this.visibleSortFields.push(this.selectedAddSortField);
      this.selectedAddSortField = null;
      requestAnimationFrame(() => {
        const el = this.sortFieldList()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }

  removeSortField(index: number): void {
    if (this.visibleSortFields.length > this.minSortFields) {
      this.visibleSortFields.splice(index, 1);
    }
  }

  resetSortFieldsToDefaults(): void {
    this.visibleSortFields = [...DEFAULT_VISIBLE_SORT_FIELDS];
  }

  saveSettings(): void {
    const user = this.userService.getCurrentUser();
    if (!user) return;

    const prefs: EntityViewPreferences = structuredClone(
      user.userSettings.entityViewPreferences ?? {global: {sortKey: 'title', sortDir: 'ASC', view: 'GRID', coverSize: 1.0, seriesCollapsed: false, overlayBookType: true}, overrides: []}
    );

    prefs.global = {
      ...prefs.global,
      sortKey: this.selectedSort,
      sortDir: this.selectedSortDir,
      sortCriteria: [...this.sortCriteria],
      columns: [...this.columns],
      view: this.selectedView
    };

    prefs.overrides = this.overrides.map(o => {
      const existing = prefs.overrides?.find(p =>
        p.entityId === o.library && p.entityType === o.entityType
      )?.preferences;

      const preferences: OverrideDetails = {
        coverSize: existing?.coverSize ?? 1.0,
        seriesCollapsed: existing?.seriesCollapsed ?? false,
        overlayBookType: existing?.overlayBookType ?? true
      };

      if (o.sortCriteria !== undefined) {
        preferences.sortKey = o.sortCriteria[0]?.field;
        preferences.sortDir = o.sortCriteria[0]?.direction;
        preferences.sortCriteria = [...o.sortCriteria];
      }
      if (o.columns !== undefined) {
        preferences.columns = [...o.columns];
      }
      if (o.view !== undefined) {
        preferences.view = o.view;
      }

      return {
        entityType: o.entityType,
        entityId: o.library,
        preferences
      };
    });

    this.userService.updateUserSetting(user.id, 'entityViewPreferences', prefs);
    this.userService.updateUserSetting(user.id, 'visibleSortFields', this.visibleSortFields);
    this.userService.updateUserSetting(user.id, 'autoSaveMetadata', this.autoSaveMetadata);

    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('settingsView.librarySort.saveSuccess'),
      detail: this.t.translate('settingsView.librarySort.saveSuccessDetail')
    });
  }
}
