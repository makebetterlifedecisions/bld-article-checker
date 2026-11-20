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
const browser = await chromium.launch({channel:'chrome'});
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
      const route = parsed.pathname.split('/')[2];
      record.routeType = route === 'troubleshooting'
        ? 'troubleshooting'
        : ['best-picks','buying-guides'].includes(route)
          ? 'best-picks-or-buying-guide'
          : 'other';
      const article = record.routeType === 'best-picks-or-buying-guide'
        ? page.locator('article.bld-best-picks').first()
        : page.locator('article.bld-article[id$="-esim-troubleshooting-r7"]').first();
      await article.waitFor({ state: 'visible', timeout: 20000 });
      if (test.column) {
        await article.evaluate((el,width) => {
          for (const [key,value] of Object.entries({'box-sizing':'border-box','width':width+'px','max-width':width+'px','min-width':'0'})) el.parentElement.style.setProperty(key,value,'important');
          for (const [name,value] of Object.entries({
            'box-sizing':'border-box',
            'width':width+'px',
            'max-width':width+'px',
            'min-width':'0',
            'margin-left':'0',
            'margin-right':'0'
          })) el.style.setProperty(name,value,'important');
        }, test.column);
      }
      await article.locator('details').evaluateAll(es=>es.forEach(e=>e.open=true));
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
          href:e.href || '', rel:e.rel || '', target:e.target || '',
          card:(()=>{const c=e.closest('.quick-pick');if(!c)return null;const r=c.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}})(),
          action:(()=>{const a=e.closest('.quick-actions');if(!a)return null;const r=a.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}})()
        }));
        const inHorizontalScrollRegion = el => {
          for(let n=el;n;n=n.parentElement) {
            const classes=typeof n.className==='string'?n.className:'';
            if(/table-wrapper|table-inner|table-scroll|(^|\\s)scroll(\\s|$)/.test(classes) &&
              ['auto','scroll'].includes(getComputedStyle(n).overflowX)) return true;
          }
          return false;
        };
        return {
          innerWidth:window.innerWidth,
          article:rect(root),
          pageWidth:document.documentElement.scrollWidth,
          labels:groups('.quick-label-row'),
          primary:groups('.quick-actions .retailer-primary'),
          secondary:groups('.quick-actions > :nth-child(2)'),
          tertiary:groups('.quick-actions > :nth-child(3)'),
          controls,
          images:[...root.querySelectorAll('img')].map(e=>({
            src:e.currentSrc||e.src, loaded:e.complete&&e.naturalWidth>0,
            naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,
            alt:e.alt,decorative:e.getAttribute('aria-hidden')==='true'||!!e.closest('[aria-hidden="true"]')||e.classList.contains('note-mascot'),
            visible:e.getClientRects().length>0
          })),
          overflow:[...root.querySelectorAll('*')].filter(e=>
            e.getBoundingClientRect().height>1 && e.getBoundingClientRect().width>1 &&
            !e.closest('thead') && e.clientWidth>0 && e.scrollWidth>e.clientWidth+2 &&
            !e.matches('.tile-arrow') &&
            !inHorizontalScrollRegion(e)
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
      const textRows = await page.locator('article.bld-best-picks .quick-pick').evaluateAll(cards=>cards.map(c=>{
        const n=c.querySelector('.quick-name'),r=c.querySelector('.quick-reason'),a=c.querySelector('.quick-actions');
        const ink=e=>{const range=document.createRange();range.selectNodeContents(e);return range.getBoundingClientRect()};
        return {nameBottom:ink(n).bottom,reasonTop:ink(r).top,reasonBottom:ink(r).bottom,actionsTop:a.getBoundingClientRect().top};
      }));
      record.textRows=textRows;
      record.cardStyles=await page.locator('article.bld-best-picks .quick-picks, article.bld-best-picks .quick-pick, article.bld-best-picks .quick-name, article.bld-best-picks .quick-reason').evaluateAll(es=>es.map(e=>({cls:e.className,inline:e.getAttribute('style'),rows:getComputedStyle(e).gridTemplateRows,height:getComputedStyle(e).height,min:getComputedStyle(e).minHeight})));
      check(textRows.every(t=>t.nameBottom<=t.reasonTop+1&&t.reasonBottom<=t.actionsTop+1),'Card name, reason or buying controls overlap');
      check(g.innerWidth === test.width, 'Requested viewport was not achieved');
      if (test.column) check(Math.abs(g.article.w-test.column)<=1, 'Requested article-column width was not achieved');
      check(g.pageWidth <= g.innerWidth+1, 'Horizontal page overflow');
      check(g.overflow.length===0, 'Article contains overflowing elements');
      check(g.images.filter(e=>e.visible).every(e=>e.loaded&&(e.alt.trim()||e.decorative)), 'Visible article image failed loading or alt check');
      if (record.routeType === 'best-picks-or-buying-guide') {
        if(handle!=='package-holiday-vs-booking-yourself') check(g.labels.length===3, 'Canonical three-card labels missing');
        for (const [key,fields] of [['labels',['w','h','y','bottom']],['primary',['h','y']],['secondary',['h','y']],['tertiary',['h','y']]]) {
          const items=g[key];
          if(handle!=='package-holiday-vs-booking-yourself') check(items.length===(key==='secondary'||key==='tertiary'?0:3), key+': incorrect provider control peers');
          for (const field of fields) if(items.length) {
            check(Math.max(...items.map(e=>e[field]))-Math.min(...items.map(e=>e[field]))<=1, key+': unequal '+field);
          }
        }
        const expectedControls = ({'package-holiday-vs-booking-yourself':6, 'best-bluetooth-tv-transmitters-australia': 30, 'best-travel-esims-australians': 7, 'travel-esim-buying-guide-australia': 7})[handle] ?? 18;
        check(g.controls.length===expectedControls, 'Expected '+expectedControls+' purchase/status controls for this article route');
      } else {
        check(await article.evaluate(el=>el.innerText.trim().length>0), 'Troubleshooting article content is empty');
        check(g.controls.length===(handle==='zensim-esim-not-working-troubleshooting'?1:3),'Unexpected tracked future-trip control count');
        check(!g.links.some(l=>l.href==='https://esim.holafly.com/'),'Untracked Holafly promotional destination remains');
        const content=await article.innerText();
        check(handle==='zensim-esim-not-working-troubleshooting' ? content.includes('Start with these free checks')&&content.includes('When to contact ZenSim') : content.includes('Safe eSIM check order')&&content.includes('Contact Holafly'),'Original free troubleshooting guidance missing');
      }
      for (const control of g.controls) check(Math.abs(control.h-64)<=1, 'Control is not 64px high: '+control.text);
      for (const control of g.controls.filter(e=>e.card)) {
        check(control.x>=control.card.x-1 && control.x+control.w<=control.card.x+control.card.w+1,
          'Quick control spills outside its card: '+control.text);
        if(control.action) check(Math.abs(control.x-control.action.x)<=1 && Math.abs(control.w-control.action.w)<=1,
          'Quick control does not fill its action row: '+control.text);
      }
      for (const control of g.controls.filter(e=>e.href)) {
        check(control.color==='rgb(255, 255, 255)', 'Purchase text is not white: '+control.text);
        check(control.rel.includes('sponsored'),'Buying button lacks sponsored attribution');
        check(/helloroam\.com\/\?via=betterlifedecisions|iwantthatflight\.com\.au\/(?:\?afid=4660|(?:hotels|carhire)\.aspx\?afid=4660)|expedia\.com\/affiliate\?|wotif\.com\/affiliate\?|stayz\.com\.au\/affiliate\?|zensim\.com\/\?via=better-life-decisions-7qjh|thesimshop\.com\.au\/partner\/better-life-decisions\/|simbye\.com\/\?ref=hgbielyd|roamza\.com\.au\/\?ref=betterlifedelbs/.test(control.href),'Unexpected untracked buying destination');
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
        await b.evaluate(e=>{
          const r=e.getBoundingClientRect();
          const sticky=document.querySelector('#shopify-section-bld-header');
          const stickyBottom=sticky?Math.max(0,sticky.getBoundingClientRect().bottom):0;
          const targetY=Math.max(stickyBottom+24,window.innerHeight*.38);
          window.scrollTo({top:window.scrollY+r.top-targetY,behavior:'instant'});
        });
        await page.waitForTimeout(100);
        const states={label:await b.innerText()};
        const expected=await b.evaluate(e=>e.matches('a.quick-button,a.buy-button')?'rgb(255, 255, 255)':getComputedStyle(e).color);
        await b.hover({timeout:10000});
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


