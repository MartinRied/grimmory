import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {vi, describe, beforeEach, afterEach, expect, it} from 'vitest';

import {TableColumnPreferenceService} from './table-column-preference.service';
import {EntityType} from './book-browser.component';
import {DEFAULT_VISIBLE_COLUMNS, EntityViewPreferences, TableColumnPreference} from '../../../settings/user-management/user.service';

describe('TableColumnPreferenceService', () => {
  let service: TableColumnPreferenceService;
  let translocoService: { translate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    translocoService = {
      translate: vi.fn((key: string) => `t:${key}`)
    };

    TestBed.configureTestingModule({
      providers: [
        TableColumnPreferenceService,
        {provide: TranslocoService, useValue: translocoService}
      ]
    });

    service = TestBed.inject(TableColumnPreferenceService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('exposes all available columns with translated headers, in canonical order', () => {
    expect(service.allColumns[0]).toEqual({
      field: 'readStatus',
      header: 't:book.columnPref.columns.readStatus'
    });
    expect(service.allColumns.map(c => c.field)).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it('headerFor translates a single field', () => {
    expect(service.headerFor('title')).toBe('t:book.columnPref.columns.title');
  });

  it('resolves an entity override\'s columns over the global default', () => {
    const prefs: EntityViewPreferences = {
      global: {
        sortKey: 'title', sortDir: 'ASC', view: 'GRID',
        columns: ['title', 'authors'],
        coverSize: 1, seriesCollapsed: false, overlayBookType: true
      },
      overrides: [
        {
          entityType: 'LIBRARY',
          entityId: 7,
          preferences: {
            columns: ['fileName', 'fileSizeKb'],
            coverSize: 1, seriesCollapsed: false, overlayBookType: true
          }
        }
      ]
    };

    expect(service.resolveVisibleFields(prefs, EntityType.LIBRARY, 7, undefined)).toEqual(['fileName', 'fileSizeKb']);
  });

  it('falls back to the global default when the entity has no column override', () => {
    const prefs: EntityViewPreferences = {
      global: {
        sortKey: 'title', sortDir: 'ASC', view: 'GRID',
        columns: ['title', 'authors'],
        coverSize: 1, seriesCollapsed: false, overlayBookType: true
      },
      overrides: [
        {
          entityType: 'LIBRARY',
          entityId: 7,
          preferences: {
            sortKey: 'authors', sortDir: 'DESC',
            coverSize: 1, seriesCollapsed: false, overlayBookType: true
          }
        }
      ]
    };

    expect(service.resolveVisibleFields(prefs, EntityType.LIBRARY, 7, undefined)).toEqual(['title', 'authors']);
    expect(service.resolveVisibleFields(prefs, EntityType.SHELF, 7, undefined)).toEqual(['title', 'authors']);
  });

  it('falls back to the legacy global-only tableColumnPreference when global.columns is absent', () => {
    const legacy: TableColumnPreference[] = [
      {field: 'title', visible: false, order: 4},
      {field: 'authors', visible: true, order: 1},
      {field: 'fileName', visible: true, order: 0}
    ];

    expect(service.resolveVisibleFields(undefined, undefined, undefined, legacy)).toEqual(['fileName', 'authors']);
  });

  it('falls back to the built-in default when nothing is saved anywhere', () => {
    expect(service.resolveVisibleFields(undefined, undefined, undefined, undefined)).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(service.resolveVisibleFields(undefined, undefined, undefined, [])).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });
});
