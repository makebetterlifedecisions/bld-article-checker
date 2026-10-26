import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const inputUrl = (process.env.ARTICLE_URL || '').trim();
const urlsText = inputUrl || (await fs.readFile('article-url.txt', 'utf8').catch(() => ''));
const url = urlsText.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'));
if (!url) throw new Error('No ARTICLE_URL or public BLD article URL was supplied.');
const parsed = new URL(url);
const handle = parsed.pathname.split('/').filter(Boolean).at(-1);
if (parsed.protocol !== 'https:' || !['www.betterlifedecisions.com.au','betterlifedecisions.com.au'].includes(parsed.hostname) || !parsed.pathname.startsWith('/blogs/')) {
  throw new Error('Only public BLD article URLs are allowed');
}
const resultsDir = process.env.RESULTS_DIR || 'results';
await fs.mkdir(resultsDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
const checks = [
  ...[360,390,480,680,1280,1366].map(width => ({ width })),
  { width: 1366, column: 280 },
  { width: 1366, column: 320 }
];
try {
  for (const test of checks) {
    const name = String(test.width) + (test.column ? '-column-' + test.column : '');
    console.log('Starting ' + name + ' for ' + url);
    const context = await browser.newContext({
      viewport: { width: test.width, height: 900 },
      locale: 'en-AU',
      timezoneId: 'Australia/Sydney'
    });
    const page = await context.newPage();
    const record = { ...test, name, url, status: 'CHECK_INCOMPLETE', errors: [], screenshots: [] };
    results.push(record);
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (!response || !response.ok()) throw new Error('Article HTTP ' + (response && response.status()));
      const article = page.locator('article.bld-best-picks, article.bld-article').first();
      await article.waitFor({ state: 'visible', timeout: 20000 });
      record.routeType = await article.evaluate(el => el.classList.contains('bld-best-picks') ? 'best-picks-or-buying-guide' : 'troubleshooting');
      if (test.column) {
        await article.evaluate((el,width) => {
          const column = el.parentElement;
          column.style.setProperty('width', width + 'px', 'important');
          column.style.setProperty('max-width', width + 'px', 'important');
          column.style.setProperty('min-width', '0', 'important');
          el.style.setProperty('width', '100%', 'important');
          el.style.setProperty('max-width', '100%', 'important');
        }, test.column);
      }
      await page.evaluate(() => document.fonts.ready);
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < documentHeight; y += 700) {
        await page.evaluate(y => scrollTo(0, y), y);
        await page.waitForTimeout(90);
      }
      await article.locator('img').evaluateAll(async imgs => {
        await Promise.race([
          Promise.all(imgs.filter(im => im.getClientRects().length > 0).map(im => im.decode().catch(() => {}))),
          new Promise(resolve => setTimeout(resolve, 15000))
        ]);
      });
      record.geometry = await article.evaluate(root => {
        const rect = e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}; };
        const groups = selector => [...root.querySelectorAll(selector)].map(e => ({text:e.textContent.trim(),...rect(e)}));
        const controls = [...root.querySelectorAll('a.quick-button,a.buy-button,.quick-status,.buy-status')].map(e => ({
          text:e.innerText || e.textContent.trim(), ...rect(e),
          color:getComputedStyle(e).color, background:getComputedStyle(e).backgroundColor,
          href:e.href || '', rel:e.rel || '', target:e.target || ''
        }));
        return {
          innerWidth:window.innerWidth,
          article:rect(root),
          pageWidth:document.documentElement.scrollWidth,
          labels:groups('.quick-label-row'),
          primary:groups('.quick-actions .retailer-primary'),
          secondary:groups('.quick-actions .retailer-secondary,.quick-actions .quick-status'),
          controls,
          images:[...root.querySelectorAll('img')].map(e=>({
            src:e.currentSrc||e.src, loaded:e.complete&&e.naturalWidth>0,
            naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,
            alt:e.alt,visible:e.getClientRects().length>0
          })),
          overflow:[...root.querySelectorAll('*')].filter(e=>
            e.getBoundingClientRect().height>1 && e.getBoundingClientRect().width>1 &&
            !e.closest('thead') && e.clientWidth>0 && e.scrollWidth>e.clientWidth+2 &&
            !e.matches('.table-scroll,.scroll')
          ).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,100)})),
          sources:[...root.querySelectorAll('.sources a')].map(e=>({
            text:e.textContent,color:getComputedStyle(e).color,
            background:getComputedStyle(e).backgroundColor
          })),
          links:[...root.querySelectorAll('a[href]')].map(e=>({href:e.href,rel:e.rel,target:e.target}))
        };
      });
      const g = record.geometry;
      const check = (ok,message) => { if (!ok) record.errors.push(message); };
      check(g.innerWidth === test.width, 'Requested viewport was not achieved');
      if (test.column) check(Math.abs(g.article.w-test.column)<=1, 'Requested article-column width was not achieved');
      check(g.pageWidth <= g.innerWidth+1, 'Horizontal page overflow');
      check(g.overflow.length===0, 'Article contains overflowing elements');
      check(g.images.filter(e=>e.visible).every(e=>e.loaded&&e.alt.trim()), 'Visible article image failed loading or alt check');
      if (record.routeType === 'best-picks-or-buying-guide') {
        check(g.labels.length===3, 'Canonical three-card labels missing');
        for (const [key,fields] of [['labels',['w','h','y','bottom']],['primary',['h','y']],['secondary',['h','y']]]) {
          const items=g[key];
          check(items.length===3, key+': expected three peers');
          for (const field of fields) if(items.length) {
            check(Math.max(...items.map(e=>e[field]))-Math.min(...items.map(e=>e[field]))<=1, key+': unequal '+field);
          }
        }
        const expectedControls = ({'best-travel-esims-australians': 9, 'travel-esim-buying-guide-australia': 6})[handle] ?? 18;
        check(g.controls.length===expectedControls, 'Expected '+expectedControls+' purchase/status controls for this article route');
      } else {
        check(await article.evaluate(el=>el.innerText.trim().length>0), 'Troubleshooting article content is empty');
      }
      for (const control of g.controls) check(Math.abs(control.h-64)<=1, 'Control is not 64px high: '+control.text);
      for (const control of g.controls.filter(e=>e.href)) {
        check(control.color==='rgb(255, 255, 255)', 'Purchase text is not white: '+control.text);
      }
      for (const link of g.links.filter(e=>/^https?:/.test(e.href) && new URL(e.href).hostname!==parsed.hostname)) {
        check(link.target==='_blank', 'External target missing: '+link.href);
        check(link.rel.includes('noopener')&&link.rel.includes('noreferrer'), 'External rel missing: '+link.href);
        if(/link\.amazon\/|[?&](tag|campid)=/.test(link.href)) check(link.rel.includes('sponsored'), 'Affiliate sponsored missing: '+link.href);
      }
      record.states=[];
      const buttons=article.locator('a.quick-button,a.buy-button,.sources a');
      for(let i=0;i<await buttons.count();i++){
        const b=buttons.nth(i);
        await b.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
        const states={label:await b.innerText()};
        const expected=await b.evaluate(e=>e.matches('a.quick-button,a.buy-button')?'rgb(255, 255, 255)':getComputedStyle(e).color);
        await b.hover();
        states.hover=await b.evaluate(e=>({color:getComputedStyle(e).color,height:e.getBoundingClientRect().height}));
        await b.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        states.focus=await b.evaluate(e=>({focused:document.activeElement===e,color:getComputedStyle(e).color,outline:getComputedStyle(e).outlineStyle}));
        await b.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
        const box=await b.evaluate(e=>{const r=[...e.getClientRects()].find(r=>r.width>0&&r.height>0);return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;});
        if(box){
          await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
          await page.mouse.down();
          states.active=await b.evaluate(e=>({active:e.matches(':active'),color:getComputedStyle(e).color}));
          await page.mouse.move(1,1);
          await page.mouse.up();
        }
        if(b) {
          check(states.active?.active===true, 'Active state was not actually achieved');
          check(states.focus.focused&&states.focus.outline!=='none', 'Keyboard-focus visibility needs review');
          if(await b.evaluate(e=>e.matches('a.quick-button,a.buy-button'))) {
            check(states.hover?.color==='rgb(255, 255, 255)', 'Purchase text color changed on hover: '+states.label);
            check(states.focus.color==='rgb(255, 255, 255)', 'Purchase text color changed on focus: '+states.label);
            check(states.active?.color==='rgb(255, 255, 255)', 'Purchase text color changed on active: '+states.label);
          }
        }
        record.states.push(states);
      }
      await page.evaluate(()=>{getSelection()?.removeAllRanges();scrollTo(0,0);});
      const bounds=await article.boundingBox();
      if(bounds){
        const pageHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
        for(let y=0,index=0;y<pageHeight;y+=800,index++){
          await page.evaluate(y=>scrollTo(0,y),y);
          await page.waitForTimeout(60);
          const filename=resultsDir+'/'+name+'-'+String(index).padStart(3,'0')+'.png';
          await page.screenshot({path:filename});
          record.screenshots.push(filename);
        }
      }
      record.notChecked=[
        'Visited-link appearance requires actual visual review',
        'Screenshot evidence requires visual review',
        'Exact product identity, stock, warranty and commission eligibility require separate research'
      ];
      record.status=record.errors.length?'FAIL':'AUTOMATED_ASSERTIONS_PASSED_VISUAL_REVIEW_REQUIRED';
    } catch(e) {
      record.errors.push(String(e));
      record.status='FAIL';
    } finally {
      console.log(name+': '+record.status,record.errors);
      await context.close();
      await fs.writeFile(resultsDir+'/report-'+name+'.json',JSON.stringify({url,results},null,2));
    }
  }
} finally {
  await browser.close();
}
const failed=results.some(r=>r.errors.length);
await fs.writeFile(resultsDir+'/SUMMARY.txt',results.map(r=>r.name+': '+r.status+'\n'+r.errors.join('\n')).join('\n\n'));
console.log(await fs.readFile(resultsDir+'/SUMMARY.txt','utf8'));
if(failed)process.exitCode=1;

