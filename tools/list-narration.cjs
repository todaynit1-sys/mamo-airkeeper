const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const ex=JSON.parse(source.match(/^var EX=(.*);$/m)[1]);
const fn=source.slice(source.indexOf('function chunksOf('),source.indexOf('function speakText('));
const scope={};vm.createContext(scope);vm.runInContext(fn,scope);
process.stdout.write(JSON.stringify([...new Set(Object.values(ex).flatMap(e=>e.shots.flatMap(s=>scope.chunksOf(s.sub))))]));
