import { X } from "lucide-react";
import { useToastStore } from "../../stores/useToastStore";

export function Toast() {
  const toast = useToastStore((s) => s.toast);
  if (!toast) return null;

  return (
    <div className="toast" role="status">
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action!.onAction();
            useToastStore.getState().dismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast__close"
        title="Dismiss"
        onClick={() => useToastStore.getState().dismiss()}
      >
        <X size={14} />
      </button>
    </div>
  );
}
