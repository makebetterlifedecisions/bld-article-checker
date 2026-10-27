import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const url = 'https://www.betterlifedecisions.com.au/blogs/buying-guides/do-you-need-rear-speakers-with-a-soundbar';
const tests = [
  {width:1366,column:280},{width:1366,column:320},
  {width:360},{width:390},{width:480},{width:680},{width:1280},{width:1366}
];
const browser = await chromium.launch();
const results = [];
await fs.mkdir('results',{recursive:true});
try {
  for (const test of tests) {
    const name = String(test.width) + (test.column ? '-column-' + test.column : '');
    const context = await browser.newContext({viewport:{width:test.width,height:900},locale:'en-AU',timezoneId:'Australia/Sydney'});
    const page = await context.newPage();
    const record = {name,...test,errors:[],status:'CHECK_INCOMPLETE'};
    results.push(record);
    try {
      const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      if(!response || !response.ok()) throw new Error('Public article HTTP '+(response&&response.status()));
      const root = page.locator('#bld-rear-guide');
      await root.waitFor({state:'visible',timeout:20000});
      if(test.column) await root.evaluate((el,w)=>{
        for(const [key,value] of Object.entries({boxSizing:'border-box',width:w+'px',maxWidth:w+'px',minWidth:'0',marginLeft:'0',marginRight:'0'}))
          el.style.setProperty(key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()),value,'important');
      },test.column);
      await page.evaluate(()=>document.fonts.ready);
      const docHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
      for(let y=0;y<docHeight;y+=700){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(80);}
      await page.evaluate(()=>scrollTo(0,0));
      const allImages=await root.locator('img').evaluateAll(async imgs=>Promise.all(imgs.map(im=>im.decode().then(()=>({src:im.currentSrc||im.src,loaded:true,naturalWidth:im.naturalWidth,naturalHeight:im.naturalHeight,alt:im.alt})).catch(()=>({src:im.currentSrc||im.src,loaded:false,alt:im.alt})))));
      record.images=allImages;
      record.metrics=await root.evaluate(el=>{
        const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
        const children=[...el.querySelectorAll('.quick-pick')].map(card=>[...card.children].slice(0,5).map(e=>({class:e.className,...box(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight})));
        const cards=[...el.querySelectorAll('.quick-pick')].map(box);
        const controls=[...el.querySelectorAll('a.quick-button,a.buy-button,.quick-status,.buy-status')].map(e=>({text:(e.innerText||e.textContent).trim(),...box(e),color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,href:e.href,rel:e.rel,target:e.target,nearestCard:(()=>{const c=e.closest('.quick-pick');return c?box(c):null})(),action:(()=>{const a=e.closest('.quick-actions');return a?box(a):null})()}));
        const tables=[...el.querySelectorAll('.table-scroll, .scroll, .table-wrapper')].map(e=>({class:e.className,...box(e),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,overflowX:getComputedStyle(e).overflowX,table:e.querySelector('table')?box(e.querySelector('table')):null}));
        const winner=el.querySelector('.winner');
        const winnerData=winner?{...box(winner),children:[...winner.children].map(e=>({class:e.className,...box(e)})),text:winner.innerText}:null;
        const stacks=[...el.querySelectorAll('.buy-row')].map(e=>({class:e.className,...box(e),controls:[...e.querySelectorAll('.buy-button')].map(box)}));
        const sourceLinks=[...el.querySelectorAll('.sources a')].map(e=>({text:e.textContent.trim(),href:e.href,color:getComputedStyle(e).color,decoration:getComputedStyle(e).textDecorationLine,outline:getComputedStyle(e).outlineStyle}));
        const inTableScroll=e=>{for(let n=e;n;n=n.parentElement)if(n.matches('.table-scroll,.scroll,.table-wrapper')&&['auto','scroll'].includes(getComputedStyle(n).overflowX))return true;return false};
        const overflow=[...el.querySelectorAll('*')].filter(e=>e.clientWidth>0&&e.clientHeight>0&&e.scrollWidth>e.clientWidth+2&&!inTableScroll(e)).map(e=>{const cs=getComputedStyle(e),p=e.parentElement,pr=p?.getBoundingClientRect();return {tag:e.tagName,class:typeof e.className==='string'?e.className:'',text:(e.textContent||'').trim().slice(0,90),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,overflowBy:e.scrollWidth-e.clientWidth,box:box(e),font:cs.font,fontSize:cs.fontSize,whiteSpace:cs.whiteSpace,wordBreak:cs.wordBreak,overflowWrap:cs.overflowWrap,parent:p?{class:p.className,clientWidth:p.clientWidth,scrollWidth:p.scrollWidth,box:{x:pr.x,y:pr.y,w:pr.width,h:pr.height}}:null}});
        return {innerWidth:innerWidth,pageWidth:document.documentElement.scrollWidth,article:box(el),cards,rows:children,labels:[...el.querySelectorAll('.quick-label-row')].map(box),controls,tables,winner:winnerData,stacks,sourceLinks,overflow};
      });
      const m=record.metrics, err=message=>record.errors.push(message);
      if(m.pageWidth>m.innerWidth+1)err('Horizontal page overflow');
      if(m.overflow.length)err('Content descendants exceed their boxes outside responsive table regions');
      if(m.cards.length!==3)err('Expected three cards');
      if(m.rows.some(r=>r.length!==5))err('Each card must contain the canonical five intrinsic rows');
      for(let row=0;row<5;row++){
        const rs=m.rows.map(c=>c[row]);
        if(Math.max(...rs.map(x=>x.y))-Math.min(...rs.map(x=>x.y))>1)err('Shared row '+row+' does not align');
        if(row===1&&Math.max(...rs.map(x=>x.h))-Math.min(...rs.map(x=>x.h))>1)err('Shaded label DIV heights differ');
      }
      const cardLabels=m.labels;
      if(cardLabels.length!==3)err('Expected three shaded label DIVs');
      if(cardLabels.length===3&&(Math.max(...cardLabels.map(x=>x.x))-Math.min(...cardLabels.map(x=>x.x))>1||Math.max(...cardLabels.map(x=>x.w))-Math.min(...cardLabels.map(x=>x.w))>1))err('Label DIVs do not share equal width and alignment');
      if(m.controls.length!==18)err('Expected 18 product controls across cards, detailed sections and final stacks');
      for(const c of m.controls){
        if(Math.abs(c.h-64)>1)err('Control not 64px high: '+c.text);
        if(c.color!=='rgb(255, 255, 255)')err('Control text not white: '+c.text);
        if(c.nearestCard&&(c.x<c.nearestCard.x-1||c.right>c.nearestCard.right+1))err('Card control spills outside card: '+c.text);
        if(c.action&&c.nearestCard&&(Math.abs(c.x-c.action.x)>1||Math.abs(c.w-c.action.w)>1))err('Quick control does not fill its action row: '+c.text);
      }
      for(const s of m.stacks){
        if(s.w>320.5||Math.abs((s.x+s.w/2)-(m.article.x+m.article.w/2))>1)err('Detailed/final purchase stack width or centring failed');
        for(const c of s.controls)if(Math.abs(c.h-64)>1)err('Detailed/final control not 64px high');
      }
      if(!m.winner||!m.winner.text.trim())err('Winner/recommendation content missing');
      if(m.winner&&m.winner.children.some(c=>c.x<m.winner.x-1||c.right>m.winner.right+1))err('Winner child spills outside its box');
      for(const t of m.tables){
        if(!['auto','scroll'].includes(t.overflowX)&&t.scrollWidth>t.clientWidth+1)err('Responsive table wrapper cannot scroll horizontally');
      }
      if(!m.sourceLinks.length)err('Sources list is missing');
      if(m.sourceLinks.some(s=>!s.href.startsWith('https://')||s.decoration==='none'))err('Source link is not HTTPS and underlined');
      if(allImages.some(i=>!i.loaded||!i.alt.trim()))err('An article image failed loading or lacks alt text');
      record.status=record.errors.length?'FAIL':'AUTOMATED_ASSERTIONS_PASSED_VISUAL_REVIEW_REQUIRED';

      if(test.width===1366&&!test.column){
        const visitUrl='https://www.thegoodguys.com.au/samsung-q-series-914-ch-soundbar-with-subwoofer-and-rear-speaker-2026-hw-q930hxy';
        const visitPage=await context.newPage();
        const visitResponse=await visitPage.goto(visitUrl,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>null);
        await visitPage.waitForTimeout(500);
        await visitPage.close();
        const visitedLink=root.locator('a.quick-button[href="'+visitUrl+'"]').first();
        await visitedLink.scrollIntoViewIfNeeded();
        record.actualHistoryVisit={url:visitUrl,httpStatus:visitResponse?visitResponse.status():null,method:'Navigated to retailer in a second page within the same browser context, then returned to the article.'};
        await visitedLink.screenshot({path:'results/1366-history-visited-link.png'});
        record.actualHistoryVisit.computedColor=await visitedLink.evaluate(e=>getComputedStyle(e).color);
      }
      const links=root.locator('a.quick-button,a.buy-button,.sources a');
      record.states=[];
      for(let i=0;i<await links.count();i++){
        const link=links.nth(i);
        await link.scrollIntoViewIfNeeded();
        await link.hover();
        const hover=await link.evaluate(e=>({color:getComputedStyle(e).color,height:e.getBoundingClientRect().height}));
        await link.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const focus=await link.evaluate(e=>({focused:document.activeElement===e,color:getComputedStyle(e).color,outline:getComputedStyle(e).outlineStyle}));
        const r=await link.boundingBox();
        await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
        await page.mouse.down();
        const active=await link.evaluate(e=>({active:e.matches(':active'),color:getComputedStyle(e).color}));
        await page.mouse.move(1,1);await page.mouse.up();
        record.states.push({text:(await link.innerText()).trim(),hover,focus,active});
        if(!active.active)err('Could not reach active state for '+(await link.innerText()).trim());
        if(!focus.focused)err('Actual keyboard Tab focus was not achieved: '+(await link.innerText()).trim());
        if(focus.outline==='none')err('Keyboard focus has no visible outline: '+(await link.innerText()).trim());
      }
      const cdp=await context.newCDPSession(page);
      await cdp.send('DOM.enable');await cdp.send('CSS.enable');
      const doc=await cdp.send('DOM.getDocument');
      const nodes=await cdp.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:'#bld-rear-guide a.quick-button,#bld-rear-guide a.buy-button,#bld-rear-guide .sources a'});
      for(const nodeId of nodes.nodeIds)await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['visited']});
      record.visitedForced=await root.locator('a.quick-button,a.buy-button,.sources a').evaluateAll(es=>es.map(e=>({text:(e.innerText||e.textContent).trim(),color:getComputedStyle(e).color,forcedPseudoState:true})));
      await cdp.detach();
      await page.evaluate(()=>{getSelection()?.removeAllRanges();scrollTo(0,0)});
      await page.screenshot({path:'results/'+name+'-details.png',fullPage:true});
      await fs.writeFile('results/details-'+name+'.json',JSON.stringify(record,null,2));
    } catch(e) {record.errors.push(String(e));record.status='FAIL';}
    finally {console.log(name+': '+record.status+' '+JSON.stringify(record.errors));await context.close();}
  }
} finally {await browser.close();}
await fs.writeFile('results/details-summary.json',JSON.stringify(results,null,2));
if(results.some(x=>x.errors.length))process.exitCode=1;
