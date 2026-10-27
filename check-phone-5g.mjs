import {chromium} from 'playwright';
import fs from 'node:fs/promises';
await fs.mkdir('results',{recursive:true});
const url='https://www.betterlifedecisions.com.au/blogs/buying-guides/do-you-need-a-5g-phone';
const browser=await chromium.launch();
const records=[];
// Recheck the corrected named table query, 25 October.
try{
const cases=[...[360,390,480,680,1280,1366].map(width=>({width})),{width:1366,column:280},{width:1366,column:320}];
const runTest=async test=>{
 const name=test.width+(test.column?'-column-'+test.column:'');
 const context=await browser.newContext({viewport:{width:test.width,height:900},locale:'en-AU',timezoneId:'Australia/Sydney'});
 const page=await context.newPage();const record={...test,name,errors:[]};records.push(record);
 try{
 const response=await page.goto(url+"?bldqa=20261027-1114",{waitUntil:'domcontentloaded',timeout:60000});
 if(!response?.ok())throw Error('HTTP '+response?.status());
 const article=page.locator('#bld-phone-5g');await article.waitFor();if(await article.locator('[data-bld-revision="phone-fix-20261027"]').count()!==1)throw Error('Stale article revision');
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
 controls:[...root.querySelectorAll('.quick-button,.buy-button,.quick-status,.buy-status')].map(e=>({...rect(e),text:e.innerText,classes:e.className,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})),
 images:[...document.querySelectorAll('img')].filter(e=>root.contains(e)||e.currentSrc.includes('samsung-galaxy-a57-5g-cafe-featured-3x2')).map(e=>({src:e.currentSrc,loaded:e.complete&&e.naturalWidth>0,w:e.naturalWidth,h:e.naturalHeight,alt:e.alt})),
 tableDisplay:root.querySelector('.comparison-table')?getComputedStyle(root.querySelector('.comparison-table')).display:null,tableTextOverflow:[...root.querySelectorAll('td')].filter(e=>{const b=e.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(e);return [...range.getClientRects()].some(r=>r.left<b.left-1||r.right>b.right+1);}).map(e=>e.innerText),productGrids:[...root.querySelectorAll('.product-layout')].map(e=>getComputedStyle(e).gridTemplateColumns),contentWidth:root.querySelector('.bld-content').clientWidth,blockOverflow,textOverflow,headings:[...root.querySelectorAll('h2,h3')].map(e=>e.innerText),
 detailButtons:[...root.querySelectorAll('.buy-button,.buy-status')].map(e=>({...rect(e),font:getComputedStyle(e).fontSize,stack:rect(e.parentElement)})),
 labelCenters:[...root.querySelectorAll('.quick-label-row')].map(e=>{const r=e.getBoundingClientRect(),t=e.firstElementChild?.getBoundingClientRect();return t?Math.abs((r.y+r.height/2)-(t.y+t.height/2)):999}),
 links:[...root.querySelectorAll('a[href]')].map(e=>({href:e.href,rel:e.rel})),
 outside:[...root.querySelectorAll('p,h2,h3,figure,.quick-picks,.buy-row,.sources')].filter(e=>{const r=e.getBoundingClientRect();return r.left<rr.left-1||r.right>rr.right+1;}).map(e=>e.className||e.tagName)};
 });
 const g=record.geometry,check=(ok,s)=>{if(!ok)record.errors.push(s);};
 check(g.viewport===test.width,'Viewport mismatch');check(g.pageWidth<=g.viewport+1,'Horizontal page overflow');
 check(g.cards.length===3,'Missing top cards');check(g.winnerCopy.length===1&&g.winnerCopy[0].w>=g.winnerPanel[0].inner-1,'Winner copy squeezed into narrow column');
 check(g.cards.length===3&&Math.max(...g.cards.map(e=>e.y))-Math.min(...g.cards.map(e=>e.y))<=1,'Cards not side by side');
 for(const key of ['labels','primary','secondary']){const a=g[key];check(a.length===3,key+' peer count');for(const f of ['w','h','y','bottom'])if(a.length)check(Math.max(...a.map(e=>e[f]))-Math.min(...a.map(e=>e[f]))<=1,key+' unequal '+f);}
 check(g.labelCenters.every(e=>e<=1),'Labels not vertically centered');for(const c of g.detailButtons){check(c.w<=320.5&&c.stack.w<=320.5,'Detail controls exceed 320px');check(c.font===(g.contentWidth<=680?'17px':'18px'),'Detail button typography '+c.font);}check(g.controls.length===18,'Expected 18 controls including unavailable statuses');
 for(const c of g.controls){check(Math.abs(c.h-64)<=1,'Control height: '+c.text);check(c.color==='rgb(255, 255, 255)','Control text color: '+c.text);}
 if(g.contentWidth<=680)check(g.tableDisplay==='block','Mobile table must stack');for(const c of g.controls){const secondary=/secondary|status/.test(c.classes);check(c.background===(secondary?'rgb(45, 122, 85)':'rgb(24, 116, 166)'),'Control background: '+c.text);}check(!g.tableTextOverflow.length,'Table cell text overlap: '+g.tableTextOverflow.join(';'));if(g.contentWidth<=620)check(g.productGrids.every(s=>s.trim().split(/\s+/).length===1),'Product details must stack in narrow article columns');
 check(!g.blockOverflow.length,'Body text outside block: '+g.blockOverflow.join(';'));check(!g.textOverflow.length,'Text overflow: '+g.textOverflow.join(';'));check(!g.outside.length,'Elements outside article: '+g.outside.join(';'));
 check(g.images.length>=7&&g.images.every(e=>e.loaded&&e.alt),'Missing/broken images or alt');
 const hero=g.images.find(e=>e.src.includes('samsung-galaxy-a57-5g-cafe-featured-3x2'));check(hero&&Math.abs(hero.w/hero.h-1.5)<.01,'Hero ratio not3:2');
 for(const l of g.links.filter(e=>e.href.includes('campid=')))check(l.href.includes('campid=5339204720')&&l.rel.includes('sponsored'),'Affiliate tracking/rel');
 record.states=[];
 for(const b of await article.locator('a.quick-button,a.buy-button').all()){
 await b.scrollIntoViewIfNeeded();await b.hover();const hover=await b.evaluate(e=>getComputedStyle(e).color);
 await b.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
 const focus=await b.evaluate(e=>({color:getComputedStyle(e).color,focused:document.activeElement===e,outline:getComputedStyle(e).outlineStyle}));
 record.states.push({text:await b.innerText(),hover,focus});
 check(hover==='rgb(255, 255, 255)'&&focus.color==='rgb(255, 255, 255)','Button hover/focus text');check(focus.focused&&focus.outline!=='none','Keyboard focus not visible');
 }
 record.screenshots=[];
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);
 const heroPath='results/'+name+'-hero.jpg';await page.screenshot({path:heroPath,quality:85});record.screenshots.push(heroPath);
 const heroImage=page.locator('img[src*="samsung-galaxy-a57-5g-cafe-featured-3x2"]').first();await heroImage.scrollIntoViewIfNeeded();await page.waitForTimeout(300);await page.screenshot({path:'results/'+name+'-hero-full.jpg',quality:85});record.screenshots.push('results/'+name+'-hero-full.jpg');
 const bounds=await article.boundingBox();
 for(let y=Math.max(0,bounds.y),i=0;y<bounds.y+bounds.height;y+=750,i++){
 await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(200);const path='results/'+name+'-'+String(i).padStart(3,'0')+'.jpg';await page.screenshot({path,quality:85});record.screenshots.push(path);
 }
 if(!test.column&&[390,1366].includes(test.width)){
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');const doc=await cdp.send('DOM.getDocument');record.linkStates=[];
 for(const [kind,selector] of [['primary','a.quick-button.retailer-primary'],['secondary','a.quick-button.retailer-secondary'],['source','.bld-source-list a']]){
 const el=article.locator(selector).first();await el.scrollIntoViewIfNeeded();const node=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#bld-phone-5g '+selector});await cdp.send('CSS.enable');
 for(const state of ['normal','hover','focus-visible','active','visited']){
 await cdp.send('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:state==='normal'?[]:[state]});
 const computed=await el.evaluate(e=>({color:getComputedStyle(e).color,fill:getComputedStyle(e).webkitTextFillColor}));record.linkStates.push({kind,state,...computed});
 check(computed.color===(kind==='source'?'rgb(20, 86, 128)':'rgb(255, 255, 255)'),'Link state '+kind+' '+state);
 await el.screenshot({path:'results/state-'+name+'-'+kind+'-'+state+'.png'});
 }
 }
 }
 record.status=record.errors.length?'FAIL':'AUTOMATED_CHECKS_PASSED_VISUAL_REVIEW_REQUIRED';
 }catch(e){record.errors.push(String(e));record.status='FAIL';}
 await context.close();
 console.log('BLD_RESULT '+JSON.stringify(record));
 await fs.writeFile('results/report.json',JSON.stringify({url,checkedAt:new Date().toISOString(),records},null,2));
};
for(let i=0;i<cases.length;i+=4)await Promise.all(cases.slice(i,i+4).map(runTest));
}finally{await browser.close();}
if(records.some(r=>r.errors.length))process.exitCode=1;


// Recheck narrow shortlist and responsiveness text after correction.
// Check two natural word breaks in the narrowest column.
