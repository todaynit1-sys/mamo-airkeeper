const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),C=require('../core.js');
let n=0;
function check(actual,expected){assert.equal(actual,expected);n++;}
check(C.scope('civil',['900','',''],'','no',false).state,'na');
check(C.scope('civil',['900','900','199'],'','no',false).state,'ok');
check(C.scope('civil',['1000','',''],'','',false).state,'bad');
check(C.scope('civil',['','1000',''],'','',false).state,'bad');
check(C.scope('civil',['','','200'],'','',false).state,'bad');
check(C.scope('civil',['900','900','199'],'','yes',false).state,'na');
check(C.scope('civil',['900','900','199'],'','',false).state,'na');
check(C.scope('civil',['900','900','199'],'','no',true).state,'na');
check(C.scope('civil',['-1','',''],'','no',false).state,'na');
check(C.scope('build',['Infinity'],'','no',false).state,'na');
check(C.scope('farm',['1000'],'','no',false).state,'na');
check(C.scope('farm',['1000'],'no','no',false).state,'na');
check(C.scope('farm',['1000'],'yes','no',false).state,'bad');
check(C.scope('paint',[],'','no',false).state,'na');
check(C.scope('paint',[],'yes','no',false).state,'bad');
check(C.wall('yard','4','1.33',false).state,'bad');
check(C.wall('yard','4','1.334',false).state,'ok');
check(C.wall('yard','-4','1.5',false).state,'na');
check(C.wall('site','','1.8',false).state,'ok');
check(C.wall('site','','1.8',true).state,'bad');
check(C.wind('load','','','7.9').state,'ok');
check(C.wind('load','','','8').state,'bad');
check(C.wind('cut','ship','','9.9').state,'ok');
check(C.wind('cut','ship','','10').state,'bad');
check(C.wind('rust','general','','8').state,'bad');
check(C.wind('grind','','','8').state,'na');
check(C.wind('paint','','5','5').state,'bad');
check(C.wind('paint','','4.99','5').state,'ok');
check(C.wind('paint','','4.99','8').state,'bad');
check(C.wind('paint','','','8').state,'na');
check(C.wind('paint','','-1','8').state,'na');
check(C.wind('load','','','-8').state,'na');
check(C.wind('building','','','10').state,'na');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const aud=JSON.parse(source.match(/^var AUD=(.*);$/m)[1]),ph=JSON.parse(source.match(/^var PH=(.*);$/m)[1]);
for(const file of [...Object.values(aud),...Object.values(ph)]){assert.ok(fs.statSync(path.join(root,file)).size>1000);n++;}
const captions=JSON.parse(require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'list-narration.cjs')],{encoding:'utf8'}));
check(captions.filter(text=>!aud[text]).length,0);
const worker={self:{addEventListener(){},PRECACHE_VERSION:'test'},importScripts(){},Response,Request};vm.createContext(worker);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),worker);
(async()=>{
  for(const [range,want,text] of [['bytes=2-4',206,'234'],['bytes=7-',206,'789'],['bytes=-3',206,'789'],['bytes=50-',416,'']]){
    const response=await worker.rangeResponse(new Request('https://example.test/a.mp3',{headers:{Range:range}}),new Response('0123456789'));
    check(response.status,want);check(await response.text(),text);
  }
  console.log(n+' regression checks passed (calculators, media, captions, offline audio ranges)');
})().catch(e=>{console.error(e);process.exitCode=1;});
