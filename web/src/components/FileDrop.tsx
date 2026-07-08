import { useRef, useState, type DragEvent } from "react";

interface Props {
  disabled: boolean;
  onFile: (file: File) => void;
}

export function FileDrop({ disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file || disabled) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files[0]);
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
      <span className="file-drop-text">גררו לכאן קובץ PDF של המבחן</span>
      <span className="file-drop-hint">או לחצו לבחירת קובץ</span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
