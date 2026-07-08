import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

interface SampleQuestion {
  q: string;
  opts: string[];
  spacerBefore?: number;
}

const LONG = "זוהי אפשרות ארוכה במיוחד שנועדה לבדוק גלישה לשורה שנייה ושלישית וכן המשך של תוכן שאלה בין שני עמודים שונים בקובץ ה-PDF, ולכן היא מכילה טקסט רב.";

const QUESTIONS: SampleQuestion[] = [
  { q: "מהי בירת צרפת?", opts: ["פריז", "לונדון", "ברלין", "מדריד"] },
  { q: "מהו היסוד הכימי שסימנו O?", opts: ["חמצן", "זהב", "מימן", "פחמן"] },
  { q: "באיזו שנה הוקמה מדינת ישראל?", opts: ["1948", "1967", "1939", "1956"] },
  {
    q: `לפי הטבלה הבאה, איזה מוצר הוא הזול ביותר?
      <table border="1" cellpadding="4" style="border-collapse:collapse;margin:8px 0">
        <tr><th>מוצר</th><th>מחיר (₪)</th><th>מלאי</th></tr>
        <tr><td>לחם</td><td>7.90</td><td>120</td></tr>
        <tr><td>חלב</td><td>6.50</td><td>85</td></tr>
        <tr><td>גבינה</td><td>12.30</td><td>40</td></tr>
      </table>`,
    opts: ["חלב", "לחם", "גבינה", "כל המוצרים באותו מחיר"],
  },
  {
    q: 'מהם הפתרונות של המשוואה <span dir="ltr">x<sup>2</sup> − 9 = 0</span>?',
    opts: ["x = ±3", "x = 3 בלבד", "x = 9", "x = ±9"],
  },
  {
    q: `איזו צורה גיאומטרית מוצגת באיור שלפניכם?
      <svg width="110" height="95" style="display:block;margin:8px 0">
        <polygon points="55,8 8,88 102,88" fill="#4a90d9" stroke="#1a1a1a" stroke-width="2"/>
      </svg>`,
    opts: ["משולש", "ריבוע", "עיגול", "מחומש"],
  },
  {
    q: "הסבירו בקצרה מדוע השמיים נראים כחולים ביום בהיר.",
    opts: [],
  },
  {
    // Pushed near the bottom so its long options continue onto the next page —
    // exercises cross-page question support.
    spacerBefore: 520,
    q: "איזה מהמשפטים מתאר בצורה הנכונה ביותר את תהליך הפוטוסינתזה בצמחים ירוקים?",
    opts: [
      `הצמח קולט אנרגיית אור באמצעות הכלורופיל שבעלים וממיר פחמן דו-חמצני ומים לסוכר וחמצן. ${LONG}`,
      `הצמח קולט חמצן מהאוויר בלילה ופולט פחמן דו-חמצני, בתהליך הפוך לנשימה. ${LONG}`,
      `הצמח שואב סוכר ישירות מהקרקע דרך השורשים ואינו זקוק לאור כלל. ${LONG}`,
      `הצמח ממיר חלבונים לשומנים באמצעות אנרגיית חום מהשמש. ${LONG}`,
    ],
  },
];

const LETTERS = ["א", "ב", "ג", "ד"];

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 12pt; padding: 40px; direction: rtl; }
  h1 { text-align: center; }
  .intro { text-align: center; margin-top: 120px; page-break-after: always; }
  .q { margin: 18px 0; }
  .q b { display: block; margin-bottom: 6px; }
  .spacer { display: block; }
  .trailer { margin-top: 60px; text-align: center; font-weight: bold; }
</style></head>
<body>
  <div class="intro">
    <h1>האוניברסיטה הפתוחה - ידע כללי</h1>
    <p>תשפ"ו סמסטר א' מועד ב'</p>
    <p>עמוד הוראות: קראו כל שאלה בעיון וסמנו את התשובה הנכונה.</p>
    <p>משך הבחינה: שעה וחצי. אין להשתמש בחומר עזר.</p>
    <p>בהצלחה!</p>
  </div>
  ${QUESTIONS.map(
    (item, i) => `
  ${item.spacerBefore ? `<div class="spacer" style="height:${item.spacerBefore}px"></div>` : ""}
  <div class="q">
    <b>${i + 1}. ${item.q}</b>
    ${item.opts.map((o, j) => `<div>${LETTERS[j]}. ${o}</div>`).join("")}
  </div>`
  ).join("")}
  <div class="trailer">--- סוף הבחינה ---</div>
</body>
</html>`;

const samplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples");
await mkdir(samplesDir, { recursive: true });

const browser = await puppeteer.launch({ headless: "shell" });
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: path.join(samplesDir, "sample-exam.pdf"), format: "A4" });
await browser.close();
console.log("samples/sample-exam.pdf written");
