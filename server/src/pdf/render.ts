import puppeteer from "puppeteer";

export async function renderPdf(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({
    headless: "shell",
    // Required in containers (Railway/Docker): Chromium runs as root with a
    // tiny /dev/shm, so the sandbox and shm-backed shared memory both fail.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
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
