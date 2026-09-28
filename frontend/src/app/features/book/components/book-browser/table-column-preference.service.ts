import {inject, Injectable} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {
  DEFAULT_VISIBLE_COLUMNS,
  EntityViewPreferences,
  findEntityOverride,
  TableColumnPreference,
} from '../../../settings/user-management/user.service';
import {EntityType} from './book-browser.component';

@Injectable({
  providedIn: 'root'
})
export class TableColumnPreferenceService {
  private readonly t = inject(TranslocoService);

  private readonly allAvailableFields = DEFAULT_VISIBLE_COLUMNS;

  get allColumns(): { field: string; header: string }[] {
    return this.allAvailableFields.map(field => ({
      field,
      header: this.headerFor(field)
    }));
  }

  headerFor(field: string): string {
    return this.t.translate(`book.columnPref.columns.${field}`);
  }

  /**
   * Resolves the visible, ordered column fields for the given entity:
   * the entity's own override wins if it defines `columns`, else the
   * global default, else the legacy global-only `tableColumnPreference`
   * setting (pre-dates per-entity overrides), else the built-in default.
   */
  resolveVisibleFields(
    prefs: EntityViewPreferences | undefined,
    entityType: EntityType | undefined,
    entityId: number | undefined,
    legacyTableColumnPreference: TableColumnPreference[] | undefined
  ): string[] {
    const override = findEntityOverride(prefs?.overrides, entityType?.toString(), entityId);
    return override?.preferences?.columns
      ?? prefs?.global?.columns
      ?? this.legacyToFieldList(legacyTableColumnPreference)
      ?? DEFAULT_VISIBLE_COLUMNS;
  }

  private legacyToFieldList(legacy: TableColumnPreference[] | undefined): string[] | undefined {
    if (!legacy?.length) return undefined;
    return [...legacy]
      .filter(pref => pref.visible)
      .sort((a, b) => a.order - b.order)
      .map(pref => pref.field);
  }
}
