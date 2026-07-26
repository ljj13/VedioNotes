/**
 *CipherTalk 风格设置ui模块——VedioNotes 的设置页面 UI 组件。
 */

interface FloatingSaveButtonProps {
  hasChanges: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** FloatingSaveButton */
export default function FloatingSaveButton({ hasChanges, onClick, disabled }: FloatingSaveButtonProps) {
  if (!hasChanges) return null;
  return (
    <button
      className="cipher-floating-save"
      onClick={onClick}
      disabled={disabled}
      aria-label="保存设置"
    >
      保存设置
    </button>
  );
}
