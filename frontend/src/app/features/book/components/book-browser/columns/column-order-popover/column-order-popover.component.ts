import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {Select} from '@openng/optimus-ui/select';
import {FormsModule} from '@angular/forms';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {Button} from '@openng/optimus-ui/button';
import {TranslocoDirective} from '@jsverse/transloco';

export interface TableColumnOption {
  field: string;
  header: string;
}

@Component({
  selector: 'app-column-order-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Select,
    FormsModule,
    Tooltip,
    Button,
    TranslocoDirective
  ],
  templateUrl: './column-order-popover.component.html',
  styleUrl: './column-order-popover.component.scss'
})
export class ColumnOrderPopoverComponent {
  readonly selectedColumns = input<TableColumnOption[]>([]);
  readonly availableColumns = input<TableColumnOption[]>([]);
  readonly showSaveButton = input(false);
  readonly saveButtonLabel = input<string | undefined>(undefined);

  readonly columnsChange = output<TableColumnOption[]>();
  readonly saveColumnConfig = output<TableColumnOption[]>();

  selectedField: string | null = null;

  get unusedOptions(): TableColumnOption[] {
    const usedFields = new Set(this.selectedColumns().map(c => c.field));
    return this.availableColumns().filter(opt => !usedFields.has(opt.field));
  }

  onDrop(event: CdkDragDrop<TableColumnOption[]>): void {
    const columns = [...this.selectedColumns()];
    moveItemInArray(columns, event.previousIndex, event.currentIndex);
    this.columnsChange.emit(columns);
  }

  onRemove(index: number): void {
    this.columnsChange.emit(this.selectedColumns().filter((_, i) => i !== index));
  }

  onAddField(): void {
    if (!this.selectedField) return;
    const option = this.availableColumns().find(o => o.field === this.selectedField);
    if (!option) return;
    this.columnsChange.emit([...this.selectedColumns(), option]);
    this.selectedField = null;
  }

  onSave(): void {
    this.saveColumnConfig.emit(this.selectedColumns());
  }
}
