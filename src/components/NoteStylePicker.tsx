import type { NoteStyle } from '../lib/types';
import { isNoteStyle, NOTE_STYLE_OPTIONS } from '../lib/noteStyles';
import ServicePicker, { type ServicePickerOption } from './ServicePicker';

const pickerOptions: ServicePickerOption[] = NOTE_STYLE_OPTIONS.map((option) => ({
  id: option.id,
  name: option.label,
  meta: option.description,
  group: '笔记风格',
}));

type Props = {
  value: NoteStyle;
  onChange: (value: NoteStyle) => void;
  disabled?: boolean;
};

export default function NoteStylePicker({ value, onChange, disabled = false }: Props) {
  return (
    <div className="note-style-picker">
      <ServicePicker
        label="笔记风格"
        prefix="风格"
        value={value}
        options={pickerOptions}
        onSelect={(id) => { if (isNoteStyle(id)) onChange(id); }}
        disabled={disabled}
        searchable={false}
      />
    </div>
  );
}
