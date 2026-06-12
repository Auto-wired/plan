import './RecurrenceScopeDialog.css'

export type RecurrenceScopeChoice = 'this' | 'all'

interface RecurrenceScopeDialogProps {
  mode: 'edit' | 'delete'
  onSelect: (scope: RecurrenceScopeChoice) => void
  onClose: () => void
}

export function RecurrenceScopeDialog({ mode, onSelect, onClose }: RecurrenceScopeDialogProps) {
  const title = mode === 'delete' ? '반복 일정 삭제' : '반복 일정 수정'

  return (
    <div className="modal-overlay scope-overlay" onClick={onClose}>
      <div className="scope-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="scope-description">어떤 일정에 적용할까요?</p>
        <div className="scope-options">
          <button type="button" className="scope-option" onClick={() => onSelect('this')}>
            이 일정만
          </button>
          <button type="button" className="scope-option" onClick={() => onSelect('all')}>
            전체 반복 일정
          </button>
        </div>
        <button type="button" className="scope-cancel" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  )
}
