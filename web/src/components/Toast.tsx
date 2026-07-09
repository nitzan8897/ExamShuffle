import { useEffect } from "react";

interface Props {
  message: string;
  onClose: () => void;
}

export function Toast({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 4500);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;
  return (
    <div className="toast" role="alert" onClick={onClose}>
      <span className="toast-icon">⚠️</span>
      <span>{message}</span>
    </div>
  );
}
