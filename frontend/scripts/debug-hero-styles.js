import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const widths = [375, 768, 1024];
  
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    
    const computed = await page.evaluate(() => {
      const section = document.querySelector('.hero-section');
      if (!section) return null;
      const styles = window.getComputedStyle(section);
      return {
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        paddingLeft: styles.paddingLeft,
        paddingRight: styles.paddingRight,
        height: section.offsetHeight + 'px'
      };
    });
    
    console.log(`${width}px:`, computed);
  }

  await browser.close();
})();
