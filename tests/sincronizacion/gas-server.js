// Corre backend-AppsScript.gs REAL sobre un Google Sheet simulado en memoria.
const http=require('http'), fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'../../backend-AppsScript.gs'),'utf8').replace(/const SECRET = '[^']*';/, "const SECRET = 'test';");
class Range{constructor(sh,r,c,nr,nc){Object.assign(this,{sh,r,c,nr,nc});}
  getValues(){const out=[];for(let i=0;i<this.nr;i++){const row=[];for(let j=0;j<this.nc;j++){const v=(this.sh.data[this.r-1+i]||[])[this.c-1+j];row.push(v===undefined?'':v);}out.push(row);}return out;}
  setValues(v){v.forEach((row,i)=>row.forEach((x,j)=>{const R=this.r-1+i;this.sh.data[R]=this.sh.data[R]||[];this.sh.data[R][this.c-1+j]=(x===null||x===undefined)?'':x;}));return this;}
  clearContent(){for(let i=0;i<this.nr;i++){const R=this.r-1+i;if(this.sh.data[R])for(let j=0;j<this.nc;j++)this.sh.data[R][this.c-1+j]='';}return this;}}
class Sheet{constructor(n){this.name=n;this.data=[];}
  getLastRow(){for(let i=this.data.length-1;i>=0;i--){if((this.data[i]||[]).some(x=>x!==''&&x!==undefined))return i+1;}return 0;}
  getRange(r,c,nr,nc){return new Range(this,r,c,nr||1,nc||1);} setFrozenRows(){}}
const sheets={};
const ss={getSheetByName:n=>sheets[n]||null, insertSheet:n=>(sheets[n]=new Sheet(n))};
const ctx={SpreadsheetApp:{getActiveSpreadsheet:()=>ss,getUi:()=>({alert(){},ButtonSet:{}})},
 Session:{getScriptTimeZone:()=>'America/Argentina/Buenos_Aires'},
 Utilities:{formatDate:(d)=>d.toISOString().slice(0,10)},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:(t)=>({t,setMimeType(){return this;}})},
 Logger:{log(){}}, console};
vm.createContext(ctx); vm.runInContext(src,ctx);
// estado inicial opcional
if(process.argv[2]){ const st=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); st.rev=0; const b={secret:'test',state:st}; ctx.doPost({postData:{contents:JSON.stringify(b)}}); }
let posts=0;
http.createServer((q,r)=>{r.setHeader('Access-Control-Allow-Origin','*');
 if(q.url.startsWith('/dump')){ return r.end(ctx.doGet({parameter:{secret:'test'}}).t); }
 if(q.url.startsWith('/sheet')){ const n=decodeURIComponent(q.url.split('/')[2]); return r.end(JSON.stringify(sheets[n]?sheets[n].data:null)); }
 if(q.url.startsWith('/raw-post')){ let b='';q.on('data',c=>b+=c);q.on('end',()=>r.end(ctx.doPost({postData:{contents:b}}).t));return; }
 if(q.method==='POST'){let b='';q.on('data',c=>b+=c);q.on('end',()=>{posts++;r.end(ctx.doPost({postData:{contents:b}}).t);});return;}
 const u=new URL(q.url,'http://x'); r.end(ctx.doGet({parameter:{secret:u.searchParams.get('secret')}}).t);
}).listen(+process.env.PORT||8770,()=>console.log('gas listo'));
