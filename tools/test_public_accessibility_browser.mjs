import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const root=process.cwd(), out=path.join(root,'artifacts/public-accessibility');
await fs.mkdir(out,{recursive:true});
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.html':'text/html;charset=utf-8','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+'/'))throw Error('path');if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end('not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const urls=[...((await fs.readFile(root+'/sitemap.xml','utf8')).matchAll(/<loc>(.*?)<\/loc>/g))].map(x=>new URL(x[1]).pathname);
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});const report=[];
try{
 for(const width of [360,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin+'/')&&route.request().method()==='GET')return route.continue();if(u==='https://mc.yandex.ru/metrika/tag.js')return route.fulfill({status:200,contentType:'text/javascript',body:'/* isolated audit */'});return route.abort()});
  for(const url of urls){
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+url,{waitUntil:'load'});await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   const data=await page.evaluate(async()=>{
    const axe=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});
    return {overflow:document.documentElement.scrollWidth>innerWidth,scrollWidth:document.documentElement.scrollWidth,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,5).map(n=>({target:n.target,summary:n.failureSummary,html:n.html.slice(0,200)}))})),brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.getAttribute('src'))};
   });
   report.push({path:url,width,errors,...data});
   if(['/','/uslugi.html','/prices.html','/vizitki-borisoglebsk.html'].includes(url)||data.overflow)await page.screenshot({path:out+'/page-'+(url.replaceAll('/','_')||'home')+'-'+width+'.png'});
   await page.close();
  }
  await context.close();console.log(JSON.stringify({width,pages:urls.length,completed:true}));
 }
}finally{await browser.close();server.close()}
await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));
const counts={};for(const r of report)for(const v of r.violations)counts[v.id]=(counts[v.id]||0)+1;
console.log(JSON.stringify({pages:report.length,overflow:report.filter(x=>x.overflow).map(x=>({path:x.path,width:x.width,scrollWidth:x.scrollWidth})),brokenImages:report.filter(x=>x.brokenImages.length),errors:report.filter(x=>x.errors.length),axe:counts,examples:report.filter(x=>x.violations.length).slice(0,4)},null,2));

assert.equal(report.filter(x=>x.overflow||x.brokenImages.length||x.errors.length||x.violations.some(v=>["serious","critical"].includes(v.impact))).length,0,"Public pages must have no overflow, failed images, script errors or serious WCAG violations; inspect report.json");
