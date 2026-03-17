const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture browser console logs
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[BROWSER_ERROR]', msg.text());
    } else if (msg.type() === 'warning') {
      console.log('[BROWSER_WARN]', msg.text());
    } else {
      console.log('[BROWSER_LOG]', msg.text());
    }
  });
  
  // Capture unhandled page errors (e.g. React crashes)
  page.on('pageerror', err => {
    console.log('[PAGE_CRASH_ERROR]', err.message);
  });

  console.log('Navigating to http://13.211.128.167 ...');
  
  try {
    // Navigate and wait for DOM completely
    await page.goto('http://13.211.128.167', { waitUntil: 'networkidle0', timeout: 15000 });
    console.log('Navigated successfully. Waiting 3 seconds for React to mount...');
    await new Promise(r => setTimeout(r, 3000));
  } catch(e) {
    console.log('Navigation or timeout error:', e.message);
  }
  
  await browser.close();
  console.log('Done rendering.');
})();
