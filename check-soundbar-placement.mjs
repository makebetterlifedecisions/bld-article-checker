import {chromium} from 'playwright';
import fs from 'node:fs/promises';
await fs.mkdir('results',{recursive:true});
const url='https://www.betterlifedecisions.com.au/blogs/buying-guides/soundbar-subwoofer-placement-guide';
const browser=await chromium.launch();
const records=[];
try{
const cases=[...[360,390,480,680,1280,1366].map(width=>({width})),{width:1366,column:280},{width:1366,column:320}];
const runTest=async test=>{
 const name=test.width+(test.column?'-column-'+test.column:'');
 const context=await browser.newContext({viewport:{width:test.width,height:900},locale:'en-AU',timezoneId:'Australia/Sydney'});
 const page=await context.newPage();const record={...test,name,errors:[]};records.push(record);
 try{
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 if(!response?.ok())throw Error('HTTP '+response?.status());
 const article=page.locator('#bld-soundbar-placement');await article.waitFor();
 await page.evaluate(()=>document.documentElement.style.setProperty('scroll-behavior','auto','important'));
 if(test.column)await article.evaluate((e,w)=>{e.style.setProperty('width',w+'px','important');e.style.setProperty('max-width',w+'px','important');},test.column);
 await page.evaluate(()=>document.fonts.ready);
 for(let y=0;y<await page.evaluate(()=>document.documentElement.scrollHeight);y+=650){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(100);}
 await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(im=>Promise.race([im.decode().catch(()=>{}),new Promise(r=>setTimeout(r,10000))])));});
 record.geometry=await article.evaluate(root=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
 const group=s=>[...root.querySelectorAll(s)].map(e=>({text:e.innerText,...rect(e)}));
 const rr=root.getBoundingClientRect();
 const textOverflow=[];
 const blockOverflow=[...root.querySelectorAll('p,li,h2,h3,h4,td')].filter(e=>{const b=e.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].some(t=>t.left<b.left-1||t.right>b.right+1)}).map(e=>e.innerText);
 for(const e of root.querySelectorAll('.quick-name,.quick-label,.quick-reason,.button-product,.button-store')){
 const parent=e.closest('.quick-pick,.quick-button,.buy-button'),b=parent?.getBoundingClientRect();
 if(!b)continue;const range=document.createRange();range.selectNodeContents(e);
 for(const t of range.getClientRects())if(t.left<b.left-1||t.right>b.right+1||t.top<b.top-1||t.bottom>b.bottom+1){textOverflow.push(e.innerText);break;}
 }
 return{viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,article:rect(root),
 winnerPanel:[...root.querySelectorAll('.winner')].map(e=>({...rect(e),inner:e.clientWidth-parseFloat(getComputedStyle(e).paddingLeft)-parseFloat(getComputedStyle(e).paddingRight)})),winnerCopy:group('.winner-copy'),cards:group('.quick-pick'),labels:group('.quick-label-row'),primary:group('.quick-actions>.retailer-primary'),secondary:group('.quick-actions>.retailer-secondary,.quick-actions>.quick-status'),
 controls:[...root.querySelectorAll('.quick-button,.buy-button,.quick-status,.buy-status')].map(e=>({...rect(e),text:e.innerText,color:getComputedStyle(e).color})),
 images:[...document.querySelectorAll('img')].filter(e=>root.contains(e)||e.currentSrc.includes('samsung-q800h-placement-hero-3x2')).map(e=>({src:e.currentSrc,loaded:e.complete&&e.naturalWidth>0,w:e.naturalWidth,h:e.naturalHeight,alt:e.alt})),
 tableTextOverflow:[...root.querySelectorAll('td')].filter(e=>{const b=e.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].some(r=>r.left<b.left-1||r.right>b.right+1);}).map(e=>e.innerText),productGrids:[...root.querySelectorAll('.product-layout')].map(e=>getComputedStyle(e).gridTemplateColumns),contentWidth:root.querySelector('.bld-content').clientWidth,blockOverflow,textOverflow,headings:[...root.querySelectorAll('h2,h3')].map(e=>e.innerText),
 links:[...root.querySelectorAll('a[href]')].map(e=>({href:e.href,rel:e.rel})),
 outside:[...root.querySelectorAll('p,h2,h3,figure,.quick-picks,.buy-row,.sources')].filter(e=>{const r=e.getBoundingClientRect();return r.left<rr.left-1||r.right>rr.right+1;}).map(e=>e.className||e.tagName)};
 });
 const g=record.geometry,check=(ok,s)=>{if(!ok)record.errors.push(s);};
 check(g.viewport===test.width,'Viewport mismatch');check(g.pageWidth<=g.viewport+1,'Horizontal page overflow');
 check(g.cards.length===3,'Missing top cards');check(g.winnerCopy.length===1&&g.winnerCopy[0].w>=g.winnerPanel[0].inner-1,'Winner copy squeezed into narrow column');
 check(g.cards.length===3&&Math.max(...g.cards.map(e=>e.y))-Math.min(...g.cards.map(e=>e.y))<=1,'Cards not side by side');
 for(const key of ['labels','primary','secondary']){const a=g[key];check(a.length===3,key+' peer count');for(const f of ['w','h','y','bottom'])if(a.length)check(Math.max(...a.map(e=>e[f]))-Math.min(...a.map(e=>e[f]))<=1,key+' unequal '+f);}
 check(g.controls.length===18,'Expected 18 controls including unavailable statuses');
 for(const c of g.controls){check(Math.abs(c.h-64)<=1,'Control height: '+c.text);check(c.color==='rgb(255, 255, 255)','Control text color: '+c.text);}
 check(!g.tableTextOverflow.length,'Table cell text overlap: '+g.tableTextOverflow.join(';'));if(g.contentWidth<=620)check(g.productGrids.every(s=>s.trim().split(/\s+/).length===1),'Product details must stack in narrow article columns');
 check(!g.blockOverflow.length,'Body text outside block: '+g.blockOverflow.join(';'));check(!g.textOverflow.length,'Text overflow: '+g.textOverflow.join(';'));check(!g.outside.length,'Elements outside article: '+g.outside.join(';'));
 check(g.images.length>=7&&g.images.every(e=>e.loaded&&e.alt),'Missing/broken images or alt');
 const hero=g.images.find(e=>e.src.includes('samsung-q800h-placement-hero-3x2'));check(hero&&Math.abs(hero.w/hero.h-1.5)<.01,'Hero ratio not3:2');
 for(const l of g.links.filter(e=>e.href.includes('campid=')))check(l.href.includes('campid=5339204720')&&l.rel.includes('sponsored'),'Affiliate tracking/rel');
 record.states=[];
 for(const b of await article.locator('a.quick-button,a.buy-button').all()){
 await b.scrollIntoViewIfNeeded();await b.hover();const hover=await b.evaluate(e=>getComputedStyle(e).color);
 await b.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
 const focus=await b.evaluate(e=>({color:getComputedStyle(e).color,focused:document.activeElement===e,outline:getComputedStyle(e).outlineStyle}));
 record.states.push({text:await b.innerText(),hover,focus});
 check(hover==='rgb(255, 255, 255)'&&focus.color==='rgb(255, 255, 255)','Button hover/focus text');check(focus.focused&&focus.outline!=='none','Keyboard focus not visible');
 }
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1200);await page.screenshot({path:'results/'+name+'-top-0.png'});
 await page.evaluate(()=>scrollTo(0,700));await page.waitForTimeout(1200);await page.screenshot({path:'results/'+name+'-top-700.png'});
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1200);
 const bounds=await article.boundingBox();record.screenshots=[];
 for(let y=Math.max(0,bounds.y),i=0;y<bounds.y+bounds.height;y+=700,i++){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(1200);const path='results/'+name+'-'+String(i).padStart(3,'0')+'.png';await page.screenshot({path});record.screenshots.push(path);}
 record.status=record.errors.length?'FAIL':'AUTOMATED_CHECKS_PASSED_VISUAL_REVIEW_REQUIRED';
 }catch(e){record.errors.push(String(e));record.status='FAIL';}
 await context.close();
 console.log('BLD_RESULT '+JSON.stringify(record));
 await fs.writeFile('results/report.json',JSON.stringify({url,checkedAt:new Date().toISOString(),records},null,2));
};
for(let i=0;i<cases.length;i+=2)await Promise.all(cases.slice(i,i+2).map(runTest));
}finally{await browser.close();}
if(records.some(r=>r.errors.length))process.exitCode=1;
