interface FloatingSaveButtonProps {
  hasChanges: boolean;
  onClick: () => void;
  disabled?: boolean;
}

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
