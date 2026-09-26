const PORT=9247;
const BASE='http://172.25.47.62:3047';
const paths=(process.argv[2]||'/').split(',');
let bad=0;
for(const path of paths){
  const rr=await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE+path)}`,{method:'PUT'});
  const t=await rr.json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);
  let id=0;const pend=new Map();
  await new Promise(r=>ws.onopen=r);
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
  const send=(me,p={})=>new Promise(res=>{const i=++id;const to=setTimeout(()=>{pend.delete(i);res({});},40000);
   pend.set(i,m=>{clearTimeout(to);res(m);});ws.send(JSON.stringify({id:i,method:me,params:p}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
   if(r.result?.exceptionDetails)console.log('EXC',JSON.stringify(r.result.exceptionDetails).slice(0,250));
   return r.result?.result?.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:BASE+path});
  for(let i=0;i<90;i++){const ok=await ev('document.readyState==="complete"');if(ok)break;await new Promise(r=>setTimeout(r,700));}
  await new Promise(r=>setTimeout(r,4000));
  const res=await ev(`(()=>{
    const BROKEN=["'",'"','$','&','4','@','-','!','(',')','*','+','/','=','#','%'];
    const hits=[];
    const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n;
    while(n=walk.nextNode()){
      const txt=n.textContent||'';
      if(!txt.trim()) continue;
      const el=n.parentElement; if(!el) continue;
      const cs=getComputedStyle(el);
      if(!/instrument-serif|Apparel/i.test(cs.fontFamily)) continue;
      if(cs.display==='none'||cs.visibility==='hidden') continue;
      const found=BROKEN.filter(c=>txt.includes(c));
      if(found.length) hits.push(JSON.stringify(found.join(''))+'  in  '+JSON.stringify(txt.replace(/\\s+/g,' ').trim().slice(0,90)));
    }
    return hits.length?hits.join('\\n'):'clean';
  })()`);
  if(res==='clean') console.log(path+': serif text clean');
  else { bad++; console.log(path+': WATERMARKED GLYPHS IN SERIF TEXT\n'+res); }
  ws.close();
}
process.exit(bad?1:0);
