import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const request=(await fs.readFile('article-url.txt','utf8').catch(()=>'' )).split('\n')[0].trim();
const url=process.env.ARTICLE_URL || request || 'https://www.betterlifedecisions.com.au/blogs/buying-guides/apple-tv-4k-vs-google-tv-streamer';
const parsed=new URL(url);
if(parsed.protocol!=='https:' || !['www.betterlifedecisions.com.au','betterlifedecisions.com.au'].includes(parsed.hostname) || !parsed.pathname.startsWith('/blogs/')) throw Error('Only public BLD article URLs are allowed');
await fs.mkdir('results',{recursive:true});
const browser=await chromium.launch();
const results=[];
const checks=[...[360,390,480,680,1366].map(width=>({width})),{width:1366,column:280},{width:1366,column:320}];
try {
 for(const test of checks){
  const name=`${test.width}${test.column?'-column-'+test.column:''}`;
  const context=await browser.newContext({viewport:{width:test.width,height:900},locale:'en-AU',timezoneId:'Australia/Sydney'});
  const page=await context.newPage();
  const record={...test,name,url,status:'CHECK_INCOMPLETE',errors:[],screenshots:[]};
  results.push(record);
  try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   if(!response?.ok())throw Error(`Article HTTP ${response?.status()}`);
   const article=page.locator('article.bld-best-picks').first();
   await article.waitFor({state:'visible'});
   if(test.column){
    // A disposable browser context tests the existing article in a narrow desktop column.
    await article.evaluate((el,width)=>{el.style.setProperty('width',`${width}px`,'important');el.style.setProperty('max-width',`${width}px`,'important');},test.column);
   }
   await page.evaluate(()=>document.fonts.ready);
   // Scroll every screen so lazy-loaded images really enter the viewport.
   for(let y=0;y<await page.evaluate(()=>document.documentElement.scrollHeight);y+=700){
    await page.evaluate(y=>scrollTo(0,y),y);
    await page.waitForTimeout(90);
   }
   await article.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(im=>im.decode().catch(()=>{})));});
   record.geometry=await article.evaluate(root=>{
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
    const groups=selector=>[...root.querySelectorAll(selector)].map(e=>({text:e.textContent.trim(),...rect(e)}));
    const controls=[...root.querySelectorAll('a.quick-button,a.buy-button,.quick-status,.buy-status')].map(e=>({text:e.innerText,...rect(e),color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,href:e.href,rel:e.rel,target:e.target}));
    return {innerWidth,article:rect(root),pageWidth:document.documentElement.scrollWidth,labels:groups('.quick-label-row'),primary:groups('.quick-actions .retailer-primary'),secondary:groups('.quick-actions .retailer-secondary,.quick-actions .quick-status'),controls,
     images:[...root.querySelectorAll('img')].map(e=>({src:e.currentSrc||e.src,loaded:e.complete&&e.naturalWidth>0,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight,alt:e.alt,visible:e.getClientRects().length>0})),
     overflow:[...root.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().height>1&&e.getBoundingClientRect().width>1&&!e.closest('thead')&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&!e.matches('.table-scroll,.scroll')).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,100)})),
     sources:[...root.querySelectorAll('.sources a')].map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),
     links:[...root.querySelectorAll('a[href]')].map(e=>({href:e.href,rel:e.rel,target:e.target}))};
   });
   const g=record.geometry;
   const check=(ok,message)=>{if(!ok)record.errors.push(message);};
   check(g.innerWidth===test.width,'Requested viewport was not achieved');
   if(test.column)check(Math.abs(g.article.w-test.column)<=1,'Requested article-column width was not achieved');
   check(g.pageWidth<=g.innerWidth+1,'Horizontal page overflow');
   check(g.overflow.length===0,'Article contains overflowing elements');
   check(g.labels.length===3,'Canonical three-card labels missing; route-specific checking is required');
   for(const [key,fields] of [['labels',['w','h','y','bottom']],['primary',['h','y']],['secondary',['h','y']]]){
    const items=g[key];check(items.length===3,`${key}: expected three peers`);
    for(const field of fields)if(items.length)check(Math.max(...items.map(e=>e[field]))-Math.min(...items.map(e=>e[field]))<=1,`${key}: unequal ${field}`);
   }
   check(g.controls.length===18,'Expected 18 purchase controls for this three-product guide');
   for(const b of g.controls){check(Math.abs(b.h-64)<=1,`Control height: ${b.text}`);check(b.color==='rgb(255, 255, 255)',`Control text is not white: ${b.text}`);}
   check(g.images.filter(e=>e.visible).every(e=>e.loaded&&e.alt.trim()),'Visible image failed loading or alt check');
   for(const link of g.links.filter(e=>/^https?:/.test(e.href))){
    check(link.target==='_blank',`External target missing: ${link.href}`);
    check(link.rel.includes('noopener')&&link.rel.includes('noreferrer'),`External rel missing: ${link.href}`);
    if(/link\.amazon\/|[?&](tag|campid)=/.test(link.href))check(link.rel.includes('sponsored'),`Affiliate sponsored missing: ${link.href}`);
   }
   record.states=[];
   const buttons=article.locator('a.quick-button,a.buy-button');
   for(let i=0;i<await buttons.count();i++){
    const b=buttons.nth(i);await b.scrollIntoViewIfNeeded();
    const states={label:await b.innerText()};
    await b.hover();states.hover=await b.evaluate(e=>({color:getComputedStyle(e).color,height:e.getBoundingClientRect().height}));
    await b.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');states.focus=await b.evaluate(e=>({focused:document.activeElement===e,color:getComputedStyle(e).color,outline:getComputedStyle(e).outlineStyle}));
    const box=await b.boundingBox();
    if(box){await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();states.active=await b.evaluate(e=>({active:e.matches(':active'),color:getComputedStyle(e).color}));await page.mouse.move(1,1);await page.mouse.up();}
    for(const state of ['hover','focus','active'])check(states[state]?.color==='rgb(255, 255, 255)',`${state}: button text is not white`);
    check(states.focus.focused&&states.focus.outline!=='none','Keyboard-focus visibility needs review');
    record.states.push(states);
   }
   await page.evaluate(()=>scrollTo(0,0));
   const bounds=await article.boundingBox();
   if(bounds){
    for(let y=Math.max(0,bounds.y);y<bounds.y+bounds.height;y+=800){
     await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(60);
     const filename=`results/${name}-${String(record.screenshots.length).padStart(3,'0')}.png`;
     await page.screenshot({path:filename});record.screenshots.push(filename);
    }
   }
   // Browser privacy hides computed visited styles. Never fabricate that check or a full visual PASS.
   record.notChecked=['Visited-link appearance requires actual visual review','Screenshot evidence requires ChatGPT visual review','Exact product identity, stock, warranty and commission eligibility require the separate research workflow'];
   record.status=record.errors.length?'FAIL':'AUTOMATED_ASSERTIONS_PASSED_VISUAL_REVIEW_REQUIRED';
  }catch(e){record.errors.push(String(e));record.status='FAIL';}
  finally{await context.close();await fs.writeFile('results/report.json',JSON.stringify({url,results},null,2));}
 }
}finally{await browser.close();}
const failed=results.some(r=>r.errors.length);
await fs.writeFile('results/SUMMARY.txt',results.map(r=>`${r.name}: ${r.status}\n${r.errors.join('\n')}`).join('\n\n'));
console.log(await fs.readFile('results/SUMMARY.txt','utf8'));
if(failed)process.exitCode=1;
