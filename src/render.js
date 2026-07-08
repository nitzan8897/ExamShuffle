import puppeteer from "puppeteer";

/**
 * Render an HTML string to a PDF file via headless Chromium.
 * @param {string} html full HTML document
 * @param {string} outputPath destination .pdf path
 */
export async function renderPdf(html, outputPath) {
  const browser = await puppeteer.launch({ headless: "shell" });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
