import './ConfirmDialog.css'

export interface ConfirmAction {
  label: string
  onClick: () => void
  variant?: 'danger' | 'default'
}

interface ConfirmDialogProps {
  title: string
  description?: string
  actions: ConfirmAction[]
  cancelLabel?: string
  onClose: () => void
}

export function ConfirmDialog({
  title,
  description,
  actions,
  cancelLabel = '취소',
  onClose,
}: ConfirmDialogProps) {
  const stacked = actions.length >= 2

  return (
    <div className="modal-overlay confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {description && <p className="confirm-description">{description}</p>}
        <div className={`confirm-actions${stacked ? ' confirm-actions--stacked' : ''}`}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`confirm-action${
                action.variant === 'danger' ? ' confirm-action--danger' : ''
              }`}
              onClick={() => {
                action.onClick()
                onClose()
              }}
            >
              {action.label}
            </button>
          ))}
          <button type="button" className="confirm-cancel" onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
