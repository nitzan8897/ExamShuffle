// Generates samples/sample-exam.pdf — a small Hebrew exam where option A
// is always the correct answer, matching the raw-exam input contract.
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer";

const QUESTIONS = [
  {
    q: "מהי בירת צרפת?",
    opts: ["פריז", "לונדון", "ברלין", "מדריד"],
  },
  {
    q: "מהו היסוד הכימי שסימנו O?",
    opts: ["חמצן", "זהב", "מימן", "פחמן"],
  },
  {
    q: "באיזו שנה הוקמה מדינת ישראל?",
    opts: ["1948", "1967", "1939", "1956"],
  },
  {
    q: "מהו האיבר הגדול ביותר בגוף האדם?",
    opts: ["העור", "הכבד", "המוח", "הלב"],
  },
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
    q: "מהם הפתרונות של המשוואה x<sup>2</sup> − 9 = 0?",
    opts: ["x = ±3", "x = 3 בלבד", "x = 9", "x = ±9"],
  },
];

const LETTERS = ["א", "ב", "ג", "ד"];

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; font-size: 12pt; padding: 40px; direction: rtl; }
  h1 { text-align: center; }
  .q { margin: 18px 0; }
  .q b { display: block; margin-bottom: 6px; }
</style></head>
<body>
  <h1>מבחן לדוגמה - ידע כללי</h1>
  ${QUESTIONS.map(
    (item, i) => `
  <div class="q">
    <b>${i + 1}. ${item.q}</b>
    ${item.opts.map((o, j) => `<div>${LETTERS[j]}. ${o}</div>`).join("")}
  </div>`
  ).join("")}
</body>
</html>`;

await mkdir("samples", { recursive: true });
const browser = await puppeteer.launch({ headless: "shell" });
const page = await browser.newPage();
await page.setContent(html);
await page.pdf({ path: "samples/sample-exam.pdf", format: "A4" });
await browser.close();
console.log("samples/sample-exam.pdf written");
