import Modal from './Modal'
export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel='Confirmar', danger=false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="p-5">
        <p className="text-gray-400 text-sm mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className={danger?'btn-danger':'btn-primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  )
}
