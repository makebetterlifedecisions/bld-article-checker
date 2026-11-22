import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const fixtures=JSON.parse(await fs.readFile('pets-feeder-fixtures.json','utf8'));
await fs.mkdir('results',{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),results=[];
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
try { for(const f of fixtures)for(const t of [...[360,390,480,680,1280,1366].map(width=>({width})),{width:1366,column:280},{width:1366,column:320}]){
 const name=f.id.split('/').at(-1)+'-'+t.width+(t.column?'-column-'+t.column:'');
 const result={name,title:f.title,...t,mode:'Exact saved unpublished body fixture; not live Shopify theme QA',errors:[],screenshots:[],visitedAndActive:'NOT CHECKED: no affiliate navigation or artificial clicks'};results.push(result);
 const context=await browser.newContext({viewport:{width:t.width,height:900},locale:'en-AU',timezoneId:'Australia/Sydney'}),page=await context.newPage();
 try{
  const hero='<figure class="fixture-hero"><img src="'+esc(f.image.url)+'" alt="'+esc(f.image.altText)+'"><figcaption>'+esc(f.image.altText)+'</figcaption></figure>';
  await page.setContent('<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;background:#f6f8f7;color:#222;font:18px/1.55 Arial}main{width:100%;max-width:1040px;margin:auto;min-width:0}h1{font-size:30px;line-height:1.2;overflow-wrap:break-word}figure.fixture-hero{margin:0 0 24px}.fixture-hero img{display:block;width:100%;height:auto}.fixture-hero figcaption{font-size:14px}</style><main'+(t.column?' style="width:'+t.column+'px"':'')+'><h1>'+esc(f.title)+'</h1>'+hero+f.body+'</main></html>',{waitUntil:'load',timeout:60000});
  await page.locator('.bld-faq details').evaluateAll(es=>es.forEach(e=>e.open=true));
  for(let y=0;y<await page.evaluate(()=>document.documentElement.scrollHeight);y+=650){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(20);}
  await page.locator('img').evaluateAll(es=>Promise.all(es.filter(e=>e.getClientRects().length).map(e=>e.complete?null:new Promise(resolve=>{e.onload=e.onerror=resolve;setTimeout(resolve,10000)}))));
  result.measurements=await page.evaluate(()=>{
   const root=document.querySelector('article.bld-best-picks'),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
   const cards=[...root.querySelectorAll('.quick-pick')].map(e=>({rect:rect(e),name:e.querySelector('.quick-name').textContent,actions:[...e.querySelectorAll('.quick-button,.quick-status')].map(a=>({rect:rect(a),text:a.innerText,clipped:a.scrollHeight>a.clientHeight+2||a.scrollWidth>a.clientWidth+2}))}));
   const rangeOverflow=[];const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
   while(node=walk.nextNode()){const p=node.parentElement;if(!node.textContent.trim()||!p.getClientRects().length||p.closest('style,script,.table-wrap'))continue;const rg=document.createRange();rg.selectNodeContents(node);for(const r of rg.getClientRects()){if(r.width&&((r.left<root.getBoundingClientRect().left-2)||(r.right>root.getBoundingClientRect().right+2)))rangeOverflow.push({text:node.textContent.slice(0,100),left:r.left,right:r.right});}}
   return{viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,article:rect(root),cards,buyRows:[...root.querySelectorAll('.buy-row')].map(e=>({rect:rect(e),actions:[...e.children].map(rect)})),brokenImages:[...document.querySelectorAll('img')].filter(e=>e.getClientRects().length&&(!e.complete||!e.naturalWidth)).map(e=>e.src),overflowText:rangeOverflow,links:[...root.querySelectorAll('a.quick-button,a.buy-button')].map(e=>({href:e.href,rel:e.rel})),mobileChecklist:[...root.querySelectorAll('.mobile-checklist li,.diagram-mobile li')].filter(e=>e.getClientRects().length).map(e=>({display:getComputedStyle(e).display,font:getComputedStyle(e).fontSize,width:e.clientWidth})),bodySizes:[...root.querySelectorAll('section p,.product p')].map(e=>getComputedStyle(e).fontSize),sourceColors:[...root.querySelectorAll('.sources a,nav a')].map(e=>getComputedStyle(e).color)};
  });
  const m=result.measurements;
  if(m.pageWidth>t.width+2)result.errors.push('Page overflow');
  if(m.cards.length!==3||m.cards.some(c=>Math.abs(c.rect.y-m.cards[0].rect.y)>1))result.errors.push('Three-across card row');
  for(let i=0;i<3;i++)if(m.cards.some(c=>c.actions.length!==3||Math.abs(c.actions[i]?.rect.y-m.cards[0].actions[i]?.rect.y)>1))result.errors.push('Shared action row');
  if(m.cards.some(c=>c.actions.some(a=>Math.abs(a.rect.h-64)>1||a.clipped)))result.errors.push('Quick control sizing/text');
  if(m.buyRows.some(r=>r.rect.w>320.5||r.actions.some(a=>Math.abs(a.h-64)>1)))result.errors.push('Detail stack sizing');
  if(m.brokenImages.length)result.errors.push('Broken visible image');
  if(m.overflowText.length)result.errors.push('Text outside article');
  if(m.links.length!==9||m.links.some(l=>!l.rel.includes('sponsored')||!(l.href.startsWith('https://link.amazon/')||l.href.includes('tag=betterlifedec-22'))))result.errors.push('Purchase mapping');
  if(m.mobileChecklist.some(x=>x.display!=='list-item'||parseFloat(x.font)<16||x.width<70))result.errors.push('Mobile checklist flow');
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'results/'+name+'-full.jpg',fullPage:true,type:'jpeg',quality:70});result.screenshots.push(name+'-full.jpg');
  for(const [label,selector]of[['cards','.quick-picks'],['details','.product'],['table','table'],['faq','.bld-faq'],['sources','ul.sources']]){const e=page.locator(selector).first();if(await e.count()){await e.scrollIntoViewIfNeeded();const file=name+'-'+label+'.jpg';await page.screenshot({path:'results/'+file,type:'jpeg',quality:80});result.screenshots.push(file);}}
  result.buttonStates=[];for(const selector of ['a.quick-button','a.buy-button']){const a=page.locator(selector).first();await a.hover();result.buttonStates.push(await a.evaluate(e=>({state:'hover',color:getComputedStyle(e).color,textFill:getComputedStyle(e).webkitTextFillColor})));await a.focus();result.buttonStates.push(await a.evaluate(e=>({state:'focus',color:getComputedStyle(e).color,outline:getComputedStyle(e).outlineStyle})));}
  result.status=result.errors.length?'FAIL':'FIXTURE_ASSERTIONS_PASS';
 }catch(e){result.status='CHECK_INCOMPLETE';result.errors.push(String(e));}
 await context.close();await fs.writeFile('results/results.json',JSON.stringify(results,null,2));console.log(name,result.status,result.errors.join('; '));
 }} finally{await browser.close();}
if(results.some(r=>r.status!=='FIXTURE_ASSERTIONS_PASS'))process.exitCode=1;

