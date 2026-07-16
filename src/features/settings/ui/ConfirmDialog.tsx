import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  children: ReactNode;
}

export default function ConfirmDialog({ title, message, children }: ConfirmDialogProps) {
  return (
    <div className="cipher-confirm-overlay" role="alertdialog" aria-label={title}>
      <div className="cipher-confirm-dialog">
        <h3 className="cipher-confirm-title">{title}</h3>
        <p className="cipher-confirm-message">{message}</p>
        <div className="cipher-confirm-actions">{children}</div>
      </div>
    </div>
  );
}
