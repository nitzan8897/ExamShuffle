import { useRef, useState, type DragEvent } from "react";

interface Props {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

const isPdf = (file: File): boolean =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

export function FileDrop({ disabled, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (list: FileList | null) => {
    if (!list || disabled) return;
    const files = Array.from(list).filter(isPdf);
    if (files.length > 0) onFiles(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files);
  };

  return (
    <div
      className={`file-drop ${dragOver ? "drag-over" : ""} ${disabled ? "disabled" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
    >
      <span className="file-drop-icon">📄</span>
      <span className="file-drop-text">גררו לכאן קובץ PDF אחד או יותר</span>
      <span className="file-drop-hint">או לחצו לבחירת קבצים — כל מבחן יעובד בנפרד</span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
