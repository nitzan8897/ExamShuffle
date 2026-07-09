import type { ShuffleSettings } from "../api";

interface Props {
  settings: ShuffleSettings;
  onChange: (settings: ShuffleSettings) => void;
  disabled: boolean;
}

// Light, fast Gemini models suited to this extraction task.
const LIGHT_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
];

const CUSTOM = "__custom__";

export function SettingsPanel({ settings, onChange, disabled }: Props) {
  const set = <K extends keyof ShuffleSettings>(key: K, value: ShuffleSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const isKnown = settings.model === "" || LIGHT_MODELS.includes(settings.model);

  return (
    <details className="settings">
      <summary>הגדרות מתקדמות</summary>
      <fieldset disabled={disabled} className="settings-body">
        <label className="field">
          <span>מודל Gemini</span>
          <select
            value={isKnown ? settings.model : CUSTOM}
            onChange={(e) => set("model", e.target.value === CUSTOM ? " " : e.target.value)}
            dir="ltr"
          >
            <option value="">ברירת מחדל מהשרת</option>
            {LIGHT_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={CUSTOM}>אחר (הקלדה ידנית)</option>
          </select>
          {!isKnown && (
            <input
              value={settings.model.trim()}
              onChange={(e) => set("model", e.target.value)}
              placeholder="שם מודל מותאם אישית"
              dir="ltr"
              autoFocus
            />
          )}
        </label>

        <label className="field">
          <span>מפתח Gemini API</span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => set("apiKey", e.target.value)}
            placeholder="ברירת מחדל מקובץ ‎.env בשרת"
            dir="ltr"
            autoComplete="off"
          />
        </label>

        <div className="field">
          <span>חומר עזר להסברים (למשל ייצוא מ-NotebookLM)</span>
          <input
            type="url"
            value={settings.contextUrl}
            onChange={(e) => set("contextUrl", e.target.value)}
            placeholder="קישור למקור ציבורי"
            dir="ltr"
          />
          <label className="context-file">
            <input
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              onChange={(e) => set("contextFile", e.target.files?.[0] ?? null)}
            />
            <span className="hint">
              {settings.contextFile ? settings.contextFile.name : "או העלאת קובץ PDF/TXT/MD"}
            </span>
          </label>
        </div>

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.openMode !== ""}
              onChange={(e) => set("openMode", e.target.checked ? "convert" : "")}
            />
            <span>המבחן כולל שאלות שאינן אמריקאיות</span>
          </label>
          {settings.openMode !== "" && (
            <select
              value={settings.openMode}
              onChange={(e) => set("openMode", e.target.value as ShuffleSettings["openMode"])}
            >
              <option value="convert">המרה לשאלות אמריקאיות</option>
              <option value="keep">השארה כפי שהן (עם תשובה במפתח)</option>
              <option value="remove">הסרה מהפלט</option>
            </select>
          )}
        </div>
      </fieldset>
    </details>
  );
}
