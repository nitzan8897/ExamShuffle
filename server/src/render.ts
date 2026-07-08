import puppeteer from "puppeteer";

export async function renderPdf(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: "shell" });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
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
