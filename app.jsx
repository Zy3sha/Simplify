const { useState, useEffect, useRef } = React;

const STORAGE_KEY = "babyTracker_v6";
const params = new URLSearchParams(window.location.search);
const quickAction = params.get("action");

const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const fmt12 = t => { if(!t)return""; const[h,m]=t.split(":").map(Number); return`${h%12||12}:${String(m).padStart(2,"0")}${h>=12?"pm":"am"}`; };
const minDiff = (s,e) => { if(!s||!e)return 0; const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number); let d=eh*60+em-sh*60-sm; if(d<0)d+=1440; return d; };
const timeVal = e => { const t=e.time||e.start||"00:00"; const[h,m]=t.split(":").map(Number); return h*60+m; };
const fmtDate = d => { if(!d)return""; const[y,mo,day]=d.split("-"); return`${day}/${mo}/${y.slice(2)}`; };
const fmtLong = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
const nowTime = () => { const n=new Date(); return`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`; };
const sleepDefault = () => { const h=new Date().getHours(); return (h>=6 && h<20) ? "nap" : "bed"; };
const todayStr = () => new Date().toISOString().split("T")[0];
const hm = m => { if(!m||m<=0)return"—"; return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`; };
const fmtSec = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const fmtCountdown = s => {
  if(s <= 0) return "Now!";
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  if(h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  return `${m}m`;
};
const avgArr = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;

// ── Fluid unit conversion (always store ml internally) ──
const ML_PER_OZ = 29.5735;
const mlToOz = ml => Math.round(ml / ML_PER_OZ * 10) / 10;
const ozToMl = oz => Math.round(oz * ML_PER_OZ);
const mlToDisplay = (ml, unit) => unit === "oz" ? mlToOz(ml) : Math.round(ml);
const displayToMl = (val, unit) => unit === "oz" ? ozToMl(parseFloat(val) || 0) : parseInt(val) || 0;
const volLabel = (unit) => unit === "oz" ? "oz" : "ml";
const fmtVol = (ml, unit) => ml ? `${mlToDisplay(ml, unit)}${volLabel(unit)}` : "";

// Global time parser for use in TimeInput component (outside App scope)
function parseTimeFree(str, previousMinutes=null) {
  if (!str) return null;
  str = str.trim().toLowerCase();
  str = str.replace(/(\d+)(st|nd|rd|th)/g,"$1");
  let m = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const suffix = m[3];
    if (suffix==="pm" && h<12) h+=12;
    if (suffix==="am" && h===12) h=0;
    // No suffix: if ambiguous, use previousMinutes to resolve
    if (!suffix && previousMinutes!==null && h*60+min <= previousMinutes) {
      const total0 = h*60+min;
      const crossedMidnight = previousMinutes >= 1080 && total0 < 720;
      let total = total0;
      if (!crossedMidnight) { while(total <= previousMinutes && total < 24*60) total+=12*60; }
      total = total % (24*60);
      return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
    }
    // No suffix, no context: if h<8 assume pm (afternoon), otherwise keep as-is
    if (!suffix && h>0 && h<=6 && previousMinutes===null) h+=12;
    const total = (h*60+min) % (24*60);
    return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
  }
  m = str.match(/^(\d{1,2})\s*(am|pm)$/);
  if (m) {
    let h = parseInt(m[1]), min = 0;
    const suffix = m[2];
    if (suffix==="pm" && h<12) h+=12;
    if (suffix==="am" && h===12) h=0;
    return `${String(h).padStart(2,"0")}:00`;
  }
  // bare number: e.g. "7" or "14"
  m = str.match(/^(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2,"0")}:00`;
  }
  return null;
}

function getAwakeWindows(entries) {

  const sorted=[...entries].filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
  const wins=[]; let last=null;
  sorted.forEach(e=>{
    if(e.type==="wake") last=e.time;
    if(e.type==="nap"){
      if(last && e.start) wins.push({from:last,to:e.start,mins:minDiff(last,e.start)});

      if(e.end) last=e.end;
      else last=null;
    }
    if(e.type==="sleep"&&last){wins.push({from:last,to:e.time,mins:minDiff(last,e.time),bed:true});last=null;}
  });
  return wins.filter(w=>w.mins>0);
}

function getNightWindows(thisDayEntries, nextDayEntries) {

  const next = nextDayEntries || [];

  // Bedtime from current day
  const bedEntry = [...thisDayEntries]
    .filter(e => e.type==="sleep" && !e.night)
    .sort((a,b) => timeVal(a)-timeVal(b))
    .pop();

  // Morning wake from next day
  const morningWake = [...next]
    .filter(e => e.type==="wake" && !e.night)
    .sort((a,b) => timeVal(a)-timeVal(b))[0];
  const morningMins = morningWake ? timeVal(morningWake) : 7*60;

  // Night wakes: combine those stored on this day (night:true, time after bedtime or before morning)
  // AND those on the next day (night:true). Deduplicate by id.
  const bedMins = bedEntry ? timeVal(bedEntry) : 22*60;
  const nightWakesThisDay = [...thisDayEntries]
    .filter(e => e.night && (e.type==="wake" || e.type==="feed"))
    .filter(e => {
      // Include wakes that are after bedtime (cross-midnight on same day) or very early morning (00:00-07:00)
      const t = timeVal(e);
      return t >= bedMins || t < morningMins;
    });
  const nightWakesNextDay = [...next]
    .filter(e => e.night && timeVal(e) < morningMins);

  // Merge, sort by absolute time (thisDay wakes after midnight wrap around)
  const allNightWakes = [...nightWakesThisDay, ...nightWakesNextDay];
  // Assign sort key: thisDay entries with t >= bedMins are "early night" (same night),
  // entries with t < 12*60 are "late night / early morning"
  const sortKey = (e, isThisDay) => {
    const t = timeVal(e);
    if(isThisDay && t >= bedMins) return t; // e.g. 22:00 → 1320
    return t + 1440; // wrap-around: e.g. 02:00 → 1560
  };
  const taggedWakes = [
    ...nightWakesThisDay.map(e=>({...e, _sk: sortKey(e, true)})),
    ...nightWakesNextDay.map(e=>({...e, _sk: sortKey(e, false)}))
  ];
  // Deduplicate by id
  const seenIds = new Set();
  const nightWakes = taggedWakes
    .filter(e => { if(seenIds.has(e.id)) return false; seenIds.add(e.id); return true; })
    .sort((a,b) => a._sk - b._sk);

  const wins=[];

  // bedtime → first night wake
  if(bedEntry && nightWakes.length>0){
    let mins = nightWakes[0]._sk - bedMins;
    if(mins<=0) mins+=1440;
    if(mins>0) wins.push({from:bedEntry.time, to:nightWakes[0].time, mins, night:true});
  }

  // between night wakes — account for soothing duration
  for(let i=1;i<nightWakes.length;i++){
    const prevWake = nightWakes[i-1];
    const dur = parseInt(prevWake.assistedDuration) || 0;
    let fromSk = prevWake._sk + dur; // sleep resumes after soothing
    let mins = nightWakes[i]._sk - fromSk;
    if(mins<=0) mins+=1440;
    if(mins>0) wins.push({from:prevWake.time, to:nightWakes[i].time, mins, night:true});
  }

  // last night wake → morning wake — account for soothing duration
  if(nightWakes.length>0 && morningWake){
    const last = nightWakes[nightWakes.length-1];
    const dur = parseInt(last.assistedDuration) || 0;
    let fromSk = last._sk + dur;
    let mins = morningMins + 1440 - fromSk;
    if(morningMins > fromSk) mins = morningMins - fromSk;
    if(mins<=0) mins+=1440;
    if(mins>0) wins.push({from:last.time, to:morningWake.time, mins, night:true});
  }

  // no wakes at all — full bedtime to morning
  if(wins.length===0 && bedEntry && morningWake){
    let mins = morningMins + 1440 - bedMins;
    if(morningMins > bedMins) mins = morningMins - bedMins;
    if(mins<=0) mins+=1440;
    if(mins>0) wins.push({from:bedEntry.time, to:morningWake.time, mins, night:true});
  }

  return wins;
}

const ICONS={feed:"🍼",nap:"😴",wake:"☀️",sleep:"🌙",poop:"💩"};
const NAMES={feed:"Feed",nap:"Nap",wake:"Wake Up",sleep:"Bedtime",poop:"Nappy"};
const POOP_TYPES=["Yellow/seedy","Mustard","Green","Brown","Dark green","Orange","Black/tarry","White/pale","Mucousy","Watery","Formed/solid","Pellet-like","Frothy","Bloody/streaked","Other"];
// Theme-aware colors — reads CSS custom properties so dark mode works
function getC(){
  const s=getComputedStyle(document.body);
  const v=n=>s.getPropertyValue(n).trim();
  return{
    ter:v('--ter')||"#C07088",
    mid:v('--text-mid')||"#7A6B7E",
    lt:v('--text-lt')||"#A898AC",
    blush:v('--blush')||"#F0D0C8",
    rose:v('--rose')||"#E8B4C0",
    cream:v('--cream')||"#FFF8F2",
    warm:v('--warm')||"#FFFAF6",
    mint:v('--mint')||"#6fa898",
    sky:v('--sky')||"#7aabc4",
    gold:v('--gold')||"#d4a855",
    deep:v('--text-deep')||"#5B4F5F"
  };
}
let C=getC();
// Theme re-render trigger — called by React App on mount

const _origToggle=window.toggleTheme;
window.toggleTheme=function(){
  _origToggle();
  // Force synchronous layout so CSS vars are applied NOW
  void document.body.offsetHeight;
  C=getC();
  // Trigger React re-render immediately
  if(window._themeCallback) window._themeCallback();
};
const _fM="monospace",_fI="inherit",_cP="pointer",_bBB="border-box",_ls1="0.1em",_ls08="0.08em",_bN="none",_oN="none";


function Sheet({onClose,title,children}){
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"var(--sheet-overlay)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--sheet-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:"24px 24px 0 0",padding:"18px 18px 52px",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{width:48,height:4,background:C.blush,borderRadius:99,margin:"0 auto 16px"}}/>
        {title&&<div style={{fontFamily:"'Playfair Display',serif",fontSize:20,marginBottom:16}}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

function Inp({label,...p}){
  return(
    <div style={{marginBottom:12}}>
      {label&&<label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>{label}</label>}
      <input {...p} style={{width:"100%",padding:"9px 12px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:15,fontFamily:_fI,outline:_oN,boxSizing:_bBB,...(p.style||{})}}/>
    </div>
  );
}

// TimeInput: free-text time entry with live parsing preview
// value = stored HH:MM string, onChange(parsedHHMM) called on blur/enter
function TimeInput({label, value, onChange, previousMinutes=null, nightOnly=false, style={}, inputStyle={}}){
  const [parsed, setParsed] = React.useState(value || null);
  const [showPicker, setShowPicker] = React.useState(false);
  const [typeBuf, setTypeBuf] = React.useState("");
  const [typeErr, setTypeErr] = React.useState(false);
  const tRef = React.useRef(null);

  React.useEffect(()=>{
    if(value && value !== parsed){ setParsed(value); }
    else if(!value){ setParsed(null); }
  },[value]);

  function tryParse(str){
    if(!str || !str.trim()) return null;
    const result = parseTimeFree(str, previousMinutes);
    if(!result) return null;
    if(nightOnly){ const [h] = result.split(":").map(Number); if(h >= 8 && h < 18) return null; }
    return result;
  }

  function openPicker(){
    setTypeBuf("");
    setTypeErr(false);
    setShowPicker(true);
    setTimeout(()=>{ if(tRef.current) tRef.current.focus(); }, 150);
  }

  function handleDone(){
    const r = tryParse(typeBuf);
    if(r){ setParsed(r); onChange(r); setShowPicker(false); }
    else if(typeBuf && typeBuf.trim()){ setTypeErr(true); }
    else { setParsed(null); onChange(""); setShowPicker(false); }
  }

  function handleWheel(e){
    const v = e.target.value; if(!v) return;
    setParsed(v); setTypeBuf(fmt12(v)); setTypeErr(false);
    onChange(v); setShowPicker(false);
  }

  function handleType(str){
    setTypeBuf(str); setTypeErr(false);
    const r = tryParse(str);
    if(r){ setParsed(r); onChange(r); }
  }

  const borderColor = parsed ? C.ter : C.blush;
  const bgColor = parsed ? "var(--chip-bg-active)" : C.warm;

  return(
    <div style={{marginBottom:12,...style}}>
      {label&&<label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>{label}</label>}
      <button onClick={openPicker} type="button"
        style={{width:"100%",padding:"9px 12px",borderRadius:12,border:`1.5px solid ${borderColor}`,background:bgColor,fontSize:15,fontFamily:_fI,textAlign:"left",cursor:_cP,display:"flex",alignItems:"center",justifyContent:"space-between",boxSizing:_bBB,...inputStyle}}>
        <span style={{color:parsed?C.deep:"#c8beb8"}}>{parsed ? fmt12(parsed) : fmt12(nowTime())}</span>
        <span style={{fontSize:14,opacity:0.5}}>🕐</span>
      </button>

      {showPicker && ReactDOM.createPortal(
        <div onClick={()=>setShowPicker(false)} style={{position:"fixed",inset:0,background:"rgba(44,31,26,0.5)",backdropFilter:"blur(3px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--picker-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:20,padding:"20px",width:"100%",maxWidth:300,boxShadow:"0 12px 40px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:14,textAlign:"center"}}>Set Time</div>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:C.mid,fontFamily:_fM,marginBottom:5,textTransform:"uppercase",letterSpacing:_ls08}}>✏️ Type a time</div>
              <input
                ref={tRef}
                type="text"
                inputMode="text"
                placeholder={fmt12(nowTime())}
                value={typeBuf}
                onChange={e=>handleType(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter") handleDone();}}
                style={{width:"100%",padding:"11px 14px",borderRadius:12,border:`2px solid ${typeErr?"#e8574a":tryParse(typeBuf)?C.ter:C.blush}`,background:tryParse(typeBuf)?"var(--chip-bg-active)":"var(--card-bg-alt)",fontSize:18,fontFamily:_fI,outline:_oN,boxSizing:_bBB,textAlign:"center",caretColor:C.ter,letterSpacing:"0.02em"}}
              />
              {typeErr&&<div style={{fontSize:11,color:"#e8574a",marginTop:3,fontFamily:_fM,textAlign:"center"}}>Couldn't parse — try "7:30am" or "19:00"</div>}
              {tryParse(typeBuf)&&<div style={{fontSize:12,color:C.ter,marginTop:4,fontFamily:_fM,textAlign:"center"}}>→ {fmt12(tryParse(typeBuf))}</div>}
            </div>

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{flex:1,height:1,background:C.blush}}/>
              <span style={{fontSize:11,color:C.lt,fontFamily:_fM}}>or scroll</span>
              <div style={{flex:1,height:1,background:C.blush}}/>
            </div>

            <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
              <input type="time" value={parsed||""} onChange={handleWheel}
                style={{fontSize:28,fontFamily:"'Playfair Display',serif",padding:"8px 20px",borderRadius:14,border:`2px solid ${C.blush}`,background:"var(--card-bg-alt)",color:C.deep,textAlign:"center",outline:_oN,width:"100%",maxWidth:200,boxSizing:_bBB}}/>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{onChange("");setParsed(null);setShowPicker(false);}}
                style={{flex:1,padding:"10px",borderRadius:99,border:`1px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.lt,fontSize:13,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                Clear
              </button>
              <button onClick={handleDone}
                style={{flex:1,padding:"10px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:13,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
                Done
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

function PBtn({children,onClick,v="pri",style={}}){
  const vs={pri:{background:C.ter,color:"white"},ghost:{background:C.blush,color:C.mid},danger:{background:"#e8574a",color:"white"}};
  return <button onClick={onClick} style={{width:"100%",padding:"12px",borderRadius:99,border:_bN,fontSize:14,fontWeight:600,cursor:_cP,fontFamily:_fI,marginTop:6,...vs[v],...style}}>{children}</button>;
}

function Badge({type,children}){
  const bg={feed:"#f5e0d8",nap:"#d4ede6",sleep:"#d5e7f2",wake:"#f5eccb",poop:"#e8e0d4"};
  const fg={feed:C.ter,nap:C.mint,sleep:C.sky,wake:"#b88a20",poop:"#8a7060"};
  return <span style={{display:"inline-block",padding:"3px 9px",borderRadius:99,fontSize:15,fontFamily:_fM,background:bg[type]||bg.feed,color:fg[type]||fg.feed}}>{children}</span>;
}

function PinPad({value, onChange, onComplete}){
  const digits = [1,2,3,4,5,6,7,8,9,null,0,"⌫"];
  function tap(d){
    if(d==="⌫"){ onChange(value.slice(0,-1)); return; }
    if(d===null) return;
    const next = value + String(d);
    if(next.length > 4) return;
    onChange(next);
    if(next.length===4 && onComplete) onComplete(next);
  }
  return (
    <div>
      <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:24}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:18,height:18,borderRadius:"50%",background:value.length>i?C.ter:C.blush,transition:"background 0.15s"}}/>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,maxWidth:240,margin:"0 auto"}}>
        {digits.map((d,i)=>(
          <button key={i} onClick={()=>tap(d)}
            disabled={d===null}
            style={{height:56,borderRadius:16,border:`1.5px solid ${C.blush}`,
              background:d===null?"transparent":d==="⌫"?"var(--card-bg-alt)":"var(--card-bg-solid)",
              fontSize:d==="⌫"?20:22,fontWeight:600,color:C.deep,cursor:d===null?"default":"pointer",
              fontFamily:_fI,opacity:d===null?0:1,
              boxShadow:d===null?"none":"0 1px 4px rgba(44,31,26,0.08)"}}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function TrendLine({vals,keys,color,unit=""}){
  const max=Math.max(...vals,1);
  const W=280,H=70;
  const pts=vals.map((v,i)=>({x:vals.length===1?W/2:(i/(vals.length-1))*W,y:H-(v/max)*H,v}));
  const path=pts.map((p,i)=>`${i===0?"M":"L"}${p.x},${p.y}`).join(" ");
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H+20}`} style={{overflow:"visible"}}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round"/>
      {pts.map((p,i)=>(
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={color}/>
          {(i===pts.length-1||pts.length<=6)&&<text x={p.x} y={p.y-8} textAnchor="middle" fontSize={9} fill={C.mid} fontFamily="monospace">{p.v}{unit}</text>}
          <text x={p.x} y={H+16} textAnchor="middle" fontSize={8} fill={C.lt} fontFamily="monospace">{fmtDate(keys[i]).slice(0,2)}</text>
        </g>
      ))}
    </svg>
  );
}

const WHO_LMS_BOYS = [
  [0,0.3487,3.3464,0.14602],[1,0.2297,4.4709,0.13395],[2,0.1970,5.5675,0.12979],
  [3,0.1738,6.3762,0.12703],[4,0.1553,7.0023,0.12512],[5,0.1395,7.5105,0.12357],
  [6,0.1257,7.9340,0.12232],[7,0.1134,8.2970,0.12138],[8,0.1021,8.6151,0.12060],
  [9,0.0917,8.9014,0.12007],[10,0.0822,9.1649,0.11972],[11,0.0734,9.4122,0.11953],
  [12,0.0650,9.6479,0.11953],[13,0.0569,9.8749,0.11961],[14,0.0492,10.0953,0.11980],
  [15,0.0417,10.3108,0.12007],[16,0.0345,10.5228,0.12039],[17,0.0275,10.7319,0.12076],
  [18,0.0208,10.9385,0.12118],[19,0.0143,11.1430,0.12164],[20,0.0079,11.3462,0.12214],
  [21,0.0017,11.5480,0.12268],[22,-0.0043,11.7490,0.12326],[23,-0.0102,11.9493,0.12386],
  [24,-0.0160,12.1515,0.12450]
];

const WHO_LMS_GIRLS = [
  [0,0.3809,3.2322,0.14171],[1,0.1714,4.1873,0.13724],[2,0.0962,5.1282,0.13000],
  [3,0.0402,5.8458,0.12619],[4,-0.0050,6.4237,0.12402],[5,-0.0430,6.8985,0.12274],
  [6,-0.0756,7.2970,0.12204],[7,-0.1039,7.6422,0.12178],[8,-0.1288,7.9487,0.12181],
  [9,-0.1507,8.2254,0.12211],[10,-0.1700,8.4800,0.12262],[11,-0.1872,8.7192,0.12331],
  [12,-0.2024,8.9481,0.12418],[13,-0.2158,9.1699,0.12519],[14,-0.2278,9.3870,0.12632],
  [15,-0.2384,9.6008,0.12757],[16,-0.2478,9.8124,0.12893],[17,-0.2562,10.0226,0.13039],
  [18,-0.2637,10.2315,0.13193],[19,-0.2703,10.4393,0.13354],[20,-0.2762,10.6464,0.13522],
  [21,-0.2814,10.8534,0.13696],[22,-0.2860,11.0608,0.13875],[23,-0.2902,11.2688,0.14058],
  [24,-0.2941,11.4775,0.14244]
];

// WHO Length/Height-for-age LMS (0–24 months, boys)
const WHO_LENGTH_LMS_BOYS = [
  [0,1,49.8842,0.03795],[1,1,54.7244,0.03557],[2,1,58.4249,0.03424],
  [3,1,61.4292,0.03328],[4,1,63.8860,0.03257],[5,1,65.9026,0.03204],
  [6,1,67.6236,0.03165],[7,1,69.1645,0.03139],[8,1,70.5994,0.03124],
  [9,1,71.9687,0.03117],[10,1,73.2812,0.03118],[11,1,74.5388,0.03125],
  [12,1,75.7488,0.03137],[13,1,76.9186,0.03154],[14,1,78.0497,0.03174],
  [15,1,79.1458,0.03197],[16,1,80.2113,0.03222],[17,1,81.2487,0.03248],
  [18,1,82.2587,0.03277],[19,1,83.2418,0.03307],[20,1,84.1996,0.03337],
  [21,1,85.1348,0.03369],[22,1,86.0477,0.03401],[23,1,86.9412,0.03433],
  [24,1,87.8161,0.03466]
];

const WHO_LENGTH_LMS_GIRLS = [
  [0,1,49.1477,0.03790],[1,1,53.6872,0.03614],[2,1,57.0673,0.03508],
  [3,1,59.8029,0.03428],[4,1,62.0899,0.03362],[5,1,64.0301,0.03310],
  [6,1,65.7311,0.03272],[7,1,67.2873,0.03246],[8,1,68.7498,0.03229],
  [9,1,70.1435,0.03222],[10,1,71.4818,0.03222],[11,1,72.7710,0.03229],
  [12,1,74.0153,0.03241],[13,1,75.2172,0.03259],[14,1,76.3817,0.03280],
  [15,1,77.5099,0.03305],[16,1,78.6055,0.03331],[17,1,79.6713,0.03360],
  [18,1,80.7079,0.03390],[19,1,81.7182,0.03422],[20,1,82.7065,0.03455],
  [21,1,83.6742,0.03489],[22,1,84.6235,0.03524],[23,1,85.5573,0.03560],
  [24,1,86.4767,0.03596]
];

function getHeightPercentile(cm, ageMonths, sex) {
  const table = sex === "girl" ? WHO_LENGTH_LMS_GIRLS : WHO_LENGTH_LMS_BOYS;
  const mo = Math.min(Math.round(ageMonths), 24);
  if (mo < 0) return null;
  const row = table[mo];
  if (!row) return null;
  const [, L, M, S] = row;
  let z;
  if (Math.abs(L) < 0.0001) {
    z = Math.log(cm / M) / S;
  } else {
    z = (Math.pow(cm / M, L) - 1) / (L * S);
  }
  z = Math.max(-3.5, Math.min(3.5, z));
  const pct = normalCDF(z) * 100;
  return Math.round(pct * 10) / 10;
}

function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t*(0.319381530 + t*(-0.356563782 + t*(1.781477937 + t*(-1.821255978 + t*1.330274429))));
  const p = 1 - (1/Math.sqrt(2*Math.PI)) * Math.exp(-0.5*z*z) * poly;
  return z >= 0 ? p : 1 - p;
}

function getPercentile(kg, ageMonths, sex) {
  const table = sex === "girl" ? WHO_LMS_GIRLS : WHO_LMS_BOYS;
  const mo = Math.min(Math.round(ageMonths), 24);
  if (mo < 0) return null;
  const row = table[mo];
  if (!row) return null;
  const [, L, M, S] = row;
  let z;
  if (Math.abs(L) < 0.0001) {
    z = Math.log(kg / M) / S;
  } else {
    z = (Math.pow(kg / M, L) - 1) / (L * S);
  }
  z = Math.max(-3.5, Math.min(3.5, z));
  const pct = normalCDF(z) * 100;
  return Math.round(pct * 10) / 10;
}


function invNormalCDF(p) {
  if (p<=0) return -3.5; if (p>=1) return 3.5;
  const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
  const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
  const c2=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
  const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
  const pL=0.02425,pH2=1-pL;
  let q,r;
  if(p<pL){q=Math.sqrt(-2*Math.log(p));return(((((c2[0]*q+c2[1])*q+c2[2])*q+c2[3])*q+c2[4])*q+c2[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  else if(p<=pH2){q=p-0.5;r=q*q;return(((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
  else{q=Math.sqrt(-2*Math.log(1-p));return-(((((c2[0]*q+c2[1])*q+c2[2])*q+c2[3])*q+c2[4])*q+c2[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
}
function weightForPercentile(ageMonths,pct,sex){
  const table=sex==="girl"?WHO_LMS_GIRLS:WHO_LMS_BOYS;
  const mo=Math.min(Math.round(ageMonths),24);if(mo<0)return null;
  const row=table[mo];if(!row)return null;const[,L,M,S]=row;
  const z=invNormalCDF(pct/100);
  if(Math.abs(L)<0.0001)return M*Math.exp(S*z);
  return M*Math.pow(1+L*S*z,1/L);
}

function lengthForPercentile(ageMonths,pct,sex){
  const table=sex==="girl"?WHO_LENGTH_LMS_GIRLS:WHO_LENGTH_LMS_BOYS;
  const mo=Math.min(Math.round(ageMonths),24);if(mo<0)return null;
  const row=table[mo];if(!row)return null;const[,L,M,S]=row;
  const z=invNormalCDF(pct/100);
  if(Math.abs(L)<0.0001)return M*Math.exp(S*z);
  return M*Math.pow(1+L*S*z,1/L);
}

function percentileColor(p) {
  if (p == null) return C.lt;
  if (p < 2 || p > 98) return "#e8574a";
  if (p < 9 || p > 91) return C.ter;
  if (p < 25 || p > 75) return C.gold;
  return C.mint;
}

function ordinal(p) {
  if (p == null) return "—";
  const n = Math.round(p);
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function percentileNote(p) {
  if (p == null) return "";
  if (p < 2) return "Below 2nd — worth mentioning at your next health visitor check";
  if (p < 9) return "Between 2nd–9th — monitor with your health visitor";
  if (p > 98) return "Above 98th — worth mentioning at your next health visitor check";
  if (p > 91) return "Between 91st–98th — mention at next check-up";
  return "Within normal range ✓";
}

// ── WHO Growth Chart (SVG) ──
function GrowthChart({lmsTable, babyData, yLabel, unit, sex, color}) {
  const W=320, H=200, PAD={t:20,r:16,b:32,l:36};
  const cW=W-PAD.l-PAD.r, cH=H-PAD.t-PAD.b;
  const maxMo=Math.min(24, Math.max(12, ...babyData.map(d=>d.mo+2)));
  const pctLines=[3,15,50,85,97];
  const pctZ=[-1.881,-1.036,0,1.036,1.881];
  const pctColors=["rgba(192,112,136,0.15)","rgba(192,112,136,0.25)","rgba(192,112,136,0.5)","rgba(192,112,136,0.25)","rgba(192,112,136,0.15)"];
  const pctLabels=["3rd","15th","50th","85th","97th"];

  // Calculate value at given month and z-score from LMS
  function lmsVal(mo,z){
    if(mo<0)mo=0;if(mo>24)mo=24;
    const idx=Math.floor(mo); const frac=mo-idx;
    const getRow=(i)=>lmsTable[Math.min(i,lmsTable.length-1)];
    const r0=getRow(idx), r1=getRow(Math.min(idx+1,lmsTable.length-1));
    const L=r0[1]+(r1[1]-r0[1])*frac;
    const M=r0[2]+(r1[2]-r0[2])*frac;
    const S=r0[3]+(r1[3]-r0[3])*frac;
    if(L===0) return M*Math.exp(S*z);
    return M*Math.pow(1+L*S*z,1/L);
  }

  // Y range from P1 to P99
  const yMin=lmsVal(0,-2.326)*0.95;
  const yMax=lmsVal(maxMo,2.326)*1.02;
  const x=mo=>PAD.l+(mo/maxMo)*cW;
  const y=v=>PAD.t+cH-(((v-yMin)/(yMax-yMin))*cH);

  // Generate curve path
  function curvePath(zScore){
    let pts=[];
    for(let m=0;m<=maxMo;m+=0.5){
      pts.push(`${m===0?"M":"L"}${x(m).toFixed(1)},${y(lmsVal(m,zScore)).toFixed(1)}`);
    }
    return pts.join(" ");
  }

  // Baby data path
  const sorted=[...babyData].sort((a,b)=>a.mo-b.mo);
  const babyPath=sorted.map((d,i)=>`${i===0?"M":"L"}${x(d.mo).toFixed(1)},${y(d.val).toFixed(1)}`).join(" ");

  // Grid lines
  const yTicks=[];
  const yStep=yLabel==="Weight"?1:5;
  for(let v=Math.ceil(yMin/yStep)*yStep;v<=yMax;v+=yStep) yTicks.push(v);
  const xTicks=[];
  for(let m=0;m<=maxMo;m+=3) xTicks.push(m);

  return React.createElement("svg",{viewBox:`0 0 ${W} ${H}`,style:{width:"100%",height:"auto",display:"block"}},
    // Grid
    yTicks.map(v=>React.createElement("g",{key:"gy"+v},
      React.createElement("line",{x1:PAD.l,y1:y(v),x2:W-PAD.r,y2:y(v),stroke:"var(--card-border)",strokeWidth:0.5}),
      React.createElement("text",{x:PAD.l-4,y:y(v)+3,textAnchor:"end",fontSize:8,fill:"var(--text-lt)",fontFamily:"monospace"},v+(unit==="kg"?"":""))
    )),
    xTicks.map(m=>React.createElement("g",{key:"gx"+m},
      React.createElement("line",{x1:x(m),y1:PAD.t,x2:x(m),y2:H-PAD.b,stroke:"var(--card-border)",strokeWidth:0.5}),
      React.createElement("text",{x:x(m),y:H-PAD.b+12,textAnchor:"middle",fontSize:8,fill:"var(--text-lt)",fontFamily:"monospace"},m+"mo")
    )),
    // Percentile fills (shaded bands)
    [0,1,2,3].map(i=>{
      const top=curvePath(pctZ[i+1]);
      const botPts=[];
      for(let m=maxMo;m>=0;m-=0.5) botPts.push(`L${x(m).toFixed(1)},${y(lmsVal(m,pctZ[i])).toFixed(1)}`);
      return React.createElement("path",{key:"band"+i,d:top+" "+botPts.join(" ")+"Z",fill:i===1||i===2?"rgba(246,221,227,0.20)":"rgba(217,207,243,0.12)",stroke:"none"});
    }),
    // Percentile curves
    pctZ.map((z,i)=>React.createElement("path",{key:"pct"+i,d:curvePath(z),fill:"none",stroke:pctColors[i],strokeWidth:i===2?1.5:0.8})),
    // Percentile labels on right
    pctZ.map((z,i)=>React.createElement("text",{key:"pl"+i,x:W-PAD.r+2,y:y(lmsVal(maxMo,z))+3,fontSize:7,fill:"var(--text-lt)",fontFamily:"monospace"},pctLabels[i])),
    // Baby data line
    sorted.length>1 && React.createElement("path",{d:babyPath,fill:"none",stroke:color||"var(--ter)",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"}),
    // Baby data points
    sorted.map((d,i)=>React.createElement("circle",{key:"bp"+i,cx:x(d.mo),cy:y(d.val),r:4,fill:color||"var(--ter)",stroke:"white",strokeWidth:1.5})),
    // Baby data labels
    sorted.map((d,i)=>React.createElement("text",{key:"bl"+i,x:x(d.mo),y:y(d.val)-8,textAnchor:"middle",fontSize:8,fill:"var(--text-deep)",fontWeight:700,fontFamily:"monospace"},d.val+unit))
  );
}

// ── CSV Export ──
/* exportCSV moved inside App component for state access */












































const MILESTONE_CATS = [
  { key:"social",    label:"Social & Emotional",      icon:"💛" },
  { key:"language",  label:"Language & Communication", icon:"💬" },
  { key:"motor",     label:"Movement & Physical",      icon:"🌿" },
  { key:"cognitive", label:"Cognitive & Play",         icon:"🔆" },
];

const MILESTONES = [

  { id:"m1",  cat:"social",    label:"First smile (social)",            weeks:[4,  6,  12] },
  { id:"m2",  cat:"social",    label:"Recognises your face & voice",    weeks:[4,  8,  16] },
  { id:"m3",  cat:"social",    label:"Calms when picked up",            weeks:[2,  4,  10] },
  { id:"m4",  cat:"social",    label:"Laughs out loud",                 weeks:[10, 16, 24] },
  { id:"m5",  cat:"social",    label:"Enjoys looking in a mirror",      weeks:[12, 20, 28] },
  { id:"m6",  cat:"social",    label:"Shows excitement (kicks, waves)", weeks:[12, 18, 26] },
  { id:"m7",  cat:"social",    label:"Reaches out to be held",          weeks:[16, 22, 30] },
  { id:"m8",  cat:"social",    label:"Stranger anxiety begins",         weeks:[24, 32, 44] },
  { id:"m9",  cat:"social",    label:"Plays peek-a-boo",                weeks:[24, 32, 44] },
  { id:"m10", cat:"social",    label:"Shows affection (hugs, kisses)",  weeks:[30, 38, 52] },
  { id:"m11", cat:"social",    label:"Waves bye-bye",                   weeks:[32, 40, 52] },
  { id:"m12", cat:"social",    label:"Separation anxiety peaks",        weeks:[32, 40, 56] },
  { id:"m13", cat:"social",    label:"Plays alongside other children",  weeks:[40, 52, 68] },

  { id:"m14", cat:"language",  label:"Coos and gurgles",                weeks:[4,  8,  16] },
  { id:"m15", cat:"language",  label:"Turns toward sounds & voices",    weeks:[4,  8,  16] },
  { id:"m16", cat:"language",  label:"Reacts to loud noises",           weeks:[2,  5,  12] },
  { id:"m17", cat:"language",  label:"Squeals and laughs aloud",        weeks:[12, 18, 26] },
  { id:"m18", cat:"language",  label:"Babbles (ba-ba, da-da, ma-ma)",   weeks:[16, 24, 36] },
  { id:"m19", cat:"language",  label:"Responds to own name",            weeks:[20, 28, 40] },
  { id:"m20", cat:"language",  label:"Imitates sounds and tones",       weeks:[24, 32, 44] },
  { id:"m21", cat:"language",  label:"Uses gestures (shaking head)",    weeks:[30, 38, 52] },
  { id:"m22", cat:"language",  label:"Says mama or dada (with meaning)", weeks:[36, 44, 60] },
  { id:"m23", cat:"language",  label:"First real word",                 weeks:[36, 48, 64] },
  { id:"m24", cat:"language",  label:"Points to things they want",      weeks:[36, 44, 56] },
  { id:"m25", cat:"language",  label:"Follows simple instructions",     weeks:[40, 52, 68] },
  { id:"m26", cat:"language",  label:"Uses 2–3 words with meaning",     weeks:[48, 60, 78] },

  { id:"m27", cat:"motor",     label:"Holds head up briefly (tummy)",   weeks:[2,  6,  12] },
  { id:"m28", cat:"motor",     label:"Steady head control",             weeks:[8,  12, 20] },
  { id:"m29", cat:"motor",     label:"Grasps objects placed in hand",   weeks:[8,  12, 20] },
  { id:"m30", cat:"motor",     label:"Pushes up on arms (tummy time)",  weeks:[8,  14, 22] },
  { id:"m31", cat:"motor",     label:"Reaches for objects",             weeks:[12, 16, 24] },
  { id:"m32", cat:"motor",     label:"Rolls front to back",             weeks:[12, 16, 24] },
  { id:"m33", cat:"motor",     label:"Rolls back to front",             weeks:[16, 20, 28] },
  { id:"m34", cat:"motor",     label:"Sits with support",               weeks:[16, 24, 32] },
  { id:"m35", cat:"motor",     label:"Transfers objects hand to hand",  weeks:[20, 28, 36] },
  { id:"m36", cat:"motor",     label:"Sits without support",            weeks:[24, 28, 40] },
  { id:"m37", cat:"motor",     label:"Bears weight on legs (supported)",weeks:[20, 28, 38] },
  { id:"m38", cat:"motor",     label:"Crawls or bottom shuffles",       weeks:[28, 36, 52] },
  { id:"m39", cat:"motor",     label:"Pulls to stand",                  weeks:[32, 40, 52] },
  { id:"m40", cat:"motor",     label:"Cruises along furniture",         weeks:[36, 44, 56] },
  { id:"m41", cat:"motor",     label:"Stands alone briefly",            weeks:[38, 48, 60] },
  { id:"m42", cat:"motor",     label:"First steps",                     weeks:[40, 52, 72] },
  { id:"m43", cat:"motor",     label:"Picks up small objects (pincer)", weeks:[28, 36, 48] },

  { id:"m44", cat:"cognitive", label:"Tracks moving objects with eyes", weeks:[4,  8,  16] },
  { id:"m45", cat:"cognitive", label:"Stares at faces intently",        weeks:[2,  4,  10] },
  { id:"m46", cat:"cognitive", label:"Explores with hands & mouth",     weeks:[12, 20, 28] },
  { id:"m47", cat:"cognitive", label:"Reaches for and shakes toys",     weeks:[14, 20, 30] },
  { id:"m48", cat:"cognitive", label:"Bangs objects together",          weeks:[24, 32, 44] },
  { id:"m49", cat:"cognitive", label:"Looks for dropped objects",       weeks:[24, 32, 44] },
  { id:"m50", cat:"cognitive", label:"Object permanence (finds toy)",   weeks:[28, 36, 48] },
  { id:"m51", cat:"cognitive", label:"Imitates actions (clapping)",     weeks:[32, 40, 52] },
  { id:"m52", cat:"cognitive", label:"Puts objects in and takes out",   weeks:[32, 40, 52] },
  { id:"m53", cat:"cognitive", label:"Stacks two objects / rings",      weeks:[44, 52, 68] },
  { id:"m54", cat:"cognitive", label:"Understands cause and effect",    weeks:[28, 36, 50] },
  { id:"m55", cat:"cognitive", label:"Pretend play begins",             weeks:[44, 56, 72] },

  { id:"m56", cat:"motor",     label:"Walks independently",             weeks:[44, 52, 78] },
  { id:"m57", cat:"motor",     label:"Walks up steps with hand held",   weeks:[52, 65, 84] },
  { id:"m58", cat:"motor",     label:"Runs (toddling)",                 weeks:[56, 70, 90] },
  { id:"m59", cat:"motor",     label:"Kicks a ball",                    weeks:[60, 78, 104] },
  { id:"m60", cat:"motor",     label:"Climbs onto furniture",           weeks:[52, 65, 84] },
  { id:"m61", cat:"motor",     label:"Scribbles with a crayon",         weeks:[52, 60, 78] },
  { id:"m62", cat:"motor",     label:"Builds tower of 3+ blocks",       weeks:[56, 70, 90] },
  { id:"m63", cat:"motor",     label:"Uses spoon to self-feed",         weeks:[52, 65, 84] },
  { id:"m64", cat:"motor",     label:"Walks up and down stairs (holding rail)", weeks:[78, 96, 120] },
  { id:"m65", cat:"motor",     label:"Jumps with both feet",            weeks:[84, 104, 130] },
  { id:"m66", cat:"motor",     label:"Pedals a tricycle",               weeks:[104, 130, 156] },
  { id:"m67", cat:"motor",     label:"Catches a large ball",            weeks:[96, 120, 156] },

  { id:"m68", cat:"language",  label:"Uses 6–10 words",                 weeks:[52, 65, 78] },
  { id:"m69", cat:"language",  label:"Understands simple questions",     weeks:[52, 65, 84] },
  { id:"m70", cat:"language",  label:"Uses 20+ words",                  weeks:[65, 78, 96] },
  { id:"m71", cat:"language",  label:"Puts two words together",         weeks:[72, 90, 110] },
  { id:"m72", cat:"language",  label:"Names body parts",                weeks:[72, 90, 110] },
  { id:"m73", cat:"language",  label:"Uses 50+ words",                  weeks:[84, 96, 120] },
  { id:"m74", cat:"language",  label:"Short sentences (2–3 words)",     weeks:[84, 104, 130] },
  { id:"m75", cat:"language",  label:"Asks what and why questions", weeks:[104, 120, 150] },
  { id:"m76", cat:"language",  label:"Speaks in sentences of 3–5 words", weeks:[104, 130, 156] },
  { id:"m77", cat:"language",  label:"Strangers can understand most speech", weeks:[130, 144, 168] },

  { id:"m78", cat:"social",    label:"Shows empathy (comforts others)", weeks:[52, 65, 84] },
  { id:"m79", cat:"social",    label:"Begins parallel play",            weeks:[52, 65, 84] },
  { id:"m80", cat:"social",    label:"Asserts independence — says no",    weeks:[56, 70, 90] },
  { id:"m81", cat:"social",    label:"Tantrums when frustrated",        weeks:[52, 65, 90] },
  { id:"m82", cat:"social",    label:"Plays simple pretend games",      weeks:[72, 90, 110] },
  { id:"m83", cat:"social",    label:"Takes turns (with help)",         weeks:[84, 104, 130] },
  { id:"m84", cat:"social",    label:"Plays cooperatively with others", weeks:[104, 130, 156] },
  { id:"m85", cat:"social",    label:"Shows a wide range of emotions",  weeks:[96, 110, 130] },

  { id:"m86", cat:"cognitive", label:"Matches shapes and colours",      weeks:[72, 90, 110] },
  { id:"m87", cat:"cognitive", label:"Simple jigsaw puzzles (2–4 pcs)", weeks:[78, 96, 120] },
  { id:"m88", cat:"cognitive", label:"Understands mine and yours",  weeks:[78, 96, 120] },
  { id:"m89", cat:"cognitive", label:"Sorts objects by shape or colour",weeks:[84, 104, 130] },
  { id:"m90", cat:"cognitive", label:"Counts to 3 (with objects)",      weeks:[104, 120, 150] },
  { id:"m91", cat:"cognitive", label:"Knows own name and age",          weeks:[96, 110, 130] },
  { id:"m92", cat:"cognitive", label:"Engages in pretend play with storylines", weeks:[104, 130, 156] },

  // 3–4 years (weeks 156–208)
  { id:"m93",  cat:"motor",     label:"Walks up stairs alternating feet",          weeks:[156, 182, 208] },
  { id:"m94",  cat:"motor",     label:"Hops on one foot",                           weeks:[156, 182, 208] },
  { id:"m95",  cat:"motor",     label:"Draws a person with 2–4 body parts",         weeks:[156, 182, 208] },
  { id:"m96",  cat:"motor",     label:"Uses scissors with help",                    weeks:[156, 195, 221] },
  { id:"m97",  cat:"language",  label:"Speaks in sentences of 4–6 words",           weeks:[156, 175, 208] },
  { id:"m98",  cat:"language",  label:"Tells a simple story about their day",       weeks:[156, 182, 221] },
  { id:"m99",  cat:"language",  label:"Understands same and different",         weeks:[156, 182, 208] },
  { id:"m100", cat:"language",  label:"Uses plurals and past tense in speech",      weeks:[156, 182, 208] },
  { id:"m101", cat:"social",    label:"Plays cooperatively and takes turns",         weeks:[156, 182, 208] },
  { id:"m102", cat:"social",    label:"Has preferred friendships",                   weeks:[156, 195, 221] },
  { id:"m103", cat:"social",    label:"Separates from parents more easily",          weeks:[156, 182, 208] },
  { id:"m104", cat:"cognitive", label:"Names most colours correctly",                weeks:[156, 175, 208] },
  { id:"m105", cat:"cognitive", label:"Counts 5–10 objects with understanding",     weeks:[156, 182, 221] },
  { id:"m106", cat:"cognitive", label:"Understands today and tomorrow",             weeks:[156, 195, 221] },
  { id:"m107", cat:"cognitive", label:"Completes 4–6 piece puzzles independently",  weeks:[156, 182, 208] },

  // 4–5 years (weeks 208–260)
  { id:"m108", cat:"motor",     label:"Runs, skips and hops with coordination",     weeks:[208, 234, 260] },
  { id:"m109", cat:"motor",     label:"Draws recognisable pictures of things",      weeks:[208, 234, 260] },
  { id:"m110", cat:"motor",     label:"Dresses and undresses mostly independently", weeks:[208, 234, 260] },
  { id:"m111", cat:"language",  label:"Retells a story from a book in sequence",    weeks:[208, 234, 260] },
  { id:"m112", cat:"language",  label:"Speech mostly understood by strangers",      weeks:[208, 234, 260] },
  { id:"m113", cat:"language",  label:"Asks and answers why and how questions",     weeks:[208, 234, 260] },
  { id:"m114", cat:"social",    label:"Follows simple rules of games",              weeks:[208, 234, 260] },
  { id:"m115", cat:"social",    label:"Shows empathy and concern for friends",      weeks:[208, 234, 260] },
  { id:"m116", cat:"cognitive", label:"Recognises own name in writing",             weeks:[208, 234, 260] },
  { id:"m117", cat:"cognitive", label:"Counts reliably to 20",                      weeks:[208, 234, 260] },
  { id:"m118", cat:"cognitive", label:"Sorts objects by two attributes",            weeks:[208, 234, 260] },
];

const DEV_PHASES = [
  { phase:1, windowStart:4,  windowEnd:5,  peakWeek:5,  name:"Sensory Awareness",
    fussy:"Extra crying, wants constant holding, hard to settle — this is the very first development phase.",
    skills:["Notices differences in light, sound and smell","Reacts to new tastes","Startles at loud noises"] },
  { phase:2, windowStart:7,  windowEnd:9,  peakWeek:8,  name:"Pattern Recognition",
    fussy:"Clingy and cranky for several days, feeds more often, hard to put down.",
    skills:["Recognises simple patterns and shapes","Follows moving objects smoothly","First social smiles"] },
  { phase:3, windowStart:11, windowEnd:12, peakWeek:12, name:"Movement Control",
    fussy:"Fussy in the evenings, wakes more at night, wants feeding for comfort.",
    skills:["Movements become smoother and more fluid","Talks back with coos","More aware of their own body"] },
  { phase:4, windowStart:14, windowEnd:19, peakWeek:17, name:"Cause & Effect",
    fussy:"Longest phase so far (up to 5 weeks). Sleep regression very common, extremely clingy.",
    skills:["Understands sequences of events","Starts to roll","Grabs objects deliberately","Babbles back and forth"] },
  { phase:5, windowStart:22, windowEnd:26, peakWeek:24, name:"Spatial Awareness",
    fussy:"Separation anxiety begins — cries when you leave the room, very clingy.",
    skills:["Understands distance and space","Sits with support","Stranger awareness develops","Reaches for everything"] },
  { phase:6, windowStart:33, windowEnd:37, peakWeek:35, name:"Object Grouping",
    fussy:"Early temper tantrums, tests limits, fussy and unpredictable.",
    skills:["Groups things by colour, shape and size","Pulls to stand","Waves bye-bye","Understands the word no"] },
  { phase:7, windowStart:41, windowEnd:46, peakWeek:44, name:"Action Planning",
    fussy:"Clingy around sleep times, may refuse foods, testing independence.",
    skills:["Understands simple sequences","First steps approaching","Points to things","Says first words"] },
  { phase:8, windowStart:51, windowEnd:54, peakWeek:52, name:"Goal Directed Behaviour",
    fussy:"Cranky around the 1-year mark, big sleep disruption, strong separation anxiety.",
    skills:["Plans simple actions to reach a goal","Stacks objects","Follows instructions","Uses a few words with meaning"] },
];

const DEV_ACTIVITIES = [

  { id:"a1",  weeks:[0,8],  cat:"visual",   title:"Object Tracking",        how:"Hold a high-contrast card or toy about 25cm from their face and slowly move it side to side. Follow their eyes.", why:"Trains eye muscles and builds early focus and visual tracking skills." },
  { id:"a2",  weeks:[0,8],  cat:"social",   title:"Face Time",              how:"Hold your face 20-30cm away and make slow, exaggerated expressions. Pause and wait for a reaction.", why:"Encourages early social smiling and teaches babies about emotional cues." },
  { id:"a3",  weeks:[0,8],  cat:"motor",    title:"Tummy Time",             how:"Place baby on their tummy on a firm surface for 1-2 minutes, 2-3 times a day. Be right next to them.", why:"Builds neck, shoulder and core strength needed for rolling and crawling." },
  { id:"a4",  weeks:[0,8],  cat:"language", title:"Sound Mapping",          how:"Call their name softly from slightly to the left, then right. Watch for head turning toward your voice.", why:"Builds sound localisation — an early foundation of language development." },

  { id:"a5",  weeks:[8,16], cat:"motor",    title:"Supported Sitting",      how:"Sit baby on your lap facing outward with your hands loosely supporting their torso. Let them find their balance.", why:"Builds core stability and balance in preparation for independent sitting." },
  { id:"a6",  weeks:[8,16], cat:"visual",   title:"Colour Contrast Play",   how:"Show bright, single-colour objects one at a time — red, then yellow. Hold still and let them look for 30 seconds.", why:"Stimulates colour perception and sustained attention." },
  { id:"a7",  weeks:[8,16], cat:"social",   title:"Serve & Return",         how:"When baby coos or makes a sound, respond with the same sound back. Wait for them to respond, then reply again.", why:"Models turn-taking and lays the groundwork for conversation." },
  { id:"a8",  weeks:[8,16], cat:"motor",    title:"Grasp & Reach",          how:"Hold a light rattle near their open hand. Let them feel it, then move it just out of reach. Encourage reaching.", why:"Develops intentional reaching and hand-eye coordination." },

  { id:"a9",  weeks:[16,26], cat:"motor",   title:"Roll Support",           how:"Place baby on their back on a mat. Gently bend one knee across their body to prompt a roll. Go slowly.", why:"Teaches the rotation pattern needed for rolling front-to-back." },
  { id:"a10", weeks:[16,26], cat:"language","title":"Name Everything",      how:"As you move through the day, name objects clearly: spoon, cup, dog. Pause after each word.", why:"Builds vocabulary and links words to objects before they can speak." },
  { id:"a11", weeks:[16,26], cat:"cognitive","title":"Peek-a-Boo",          how:"Hold a cloth in front of your face, pause, then drop it and say boo. Start slow, then speed up.", why:"Introduces object permanence — the idea that things exist when hidden." },
  { id:"a12", weeks:[16,26], cat:"social",  title:"Mirror Play",            how:"Hold baby in front of a baby-safe mirror. Point to their reflection and say their name. Make faces together.", why:"Builds self-recognition and identity awareness." },

  { id:"a13", weeks:[26,40], cat:"motor",   title:"Supported Standing",     how:"Hold baby upright with feet flat on your lap or a firm surface. Let them push down and bear their own weight.", why:"Strengthens leg muscles and reinforces the motor pattern for standing." },
  { id:"a14", weeks:[26,40], cat:"cognitive","title":"Object Hide & Seek",  how:"Show baby a toy, then hide it under a cup while they watch. Encourage them to lift the cup to find it.", why:"Directly develops object permanence — a key cognitive milestone." },
  { id:"a15", weeks:[26,40], cat:"language","title":"Simple Signs",         how:"Use consistent hand signs for more, milk and all done every time you say the word. Be patient.", why:"Gives babies a way to communicate before speech develops, reducing frustration." },
  { id:"a16", weeks:[26,40], cat:"motor",   title:"Pincer Practice",        how:"Scatter small puffs or cereal on a highchair tray. Encourage picking them up one at a time.", why:"Develops the pincer grip needed for fine motor skills and self-feeding." },

  { id:"a17", weeks:[40,54], cat:"motor",   title:"Cruising Practice",      how:"Position yourself a step away along the sofa and hold out a favourite toy, encouraging them to side-step toward it.", why:"Builds confidence in weight-shifting — a key step before independent walking." },
  { id:"a18", weeks:[40,54], cat:"cognitive","title":"Stacking Rings",      how:"Stack the rings together, then take them off one by one naming each. Let baby take them off and attempt to replace.", why:"Develops size discrimination, sequencing, and problem-solving." },
  { id:"a19", weeks:[40,54], cat:"language","title":"Book Pointing",        how:"Open a simple picture book and say where is the dog? Wait, then point and label. Do this with 3-4 pictures.", why:"Builds receptive language, pointing, and joint attention skills." },
  { id:"a20", weeks:[40,54], cat:"social",  title:"Cause & Effect Toys",    how:"Offer a pop-up toy or anything with a button that makes something happen. Let them experiment freely.", why:"Reinforces goal-directed thinking and the satisfaction of cause-and-effect." },

  { id:"a21", weeks:[54,78], cat:"motor",    title:"Walking Practice",       how:"Hold both hands and walk together on different surfaces — grass, carpet, pavement. Gradually move to one hand.", why:"Builds balance and confidence across terrains. NHS expects independent walking by 18 months." },
  { id:"a22", weeks:[54,78], cat:"language",  title:"Name & Point",          how:"Throughout the day, point to objects and name them clearly. Ask where is the ball? and pause for them to point.", why:"NHS recommends this to build the 10+ word vocabulary expected by 18 months." },
  { id:"a23", weeks:[54,78], cat:"cognitive", title:"Shape Sorter",          how:"Offer a simple shape sorter with 3–4 shapes. Show how one fits, then hand them a piece and let them try.", why:"Develops spatial reasoning and problem-solving — key skills assessed at NHS 1-year review." },
  { id:"a24", weeks:[54,78], cat:"social",    title:"Doll & Teddy Care",     how:"Give them a doll or teddy and show feeding, cuddling, putting to bed. Let them copy in their own time.", why:"Early pretend play is a key WHO cognitive milestone. It develops empathy and imitation." },

  { id:"a25", weeks:[78,104], cat:"motor",    title:"Climbing & Jumping",    how:"Visit a soft play area or use sofa cushions on the floor. Encourage climbing up and jumping off low surfaces.", why:"WHO physical activity guidelines recommend 180 min of activity daily for 1–2 year olds, including energetic play." },
  { id:"a26", weeks:[78,104], cat:"language",  title:"Two-Word Phrases",     how:"Model two-word phrases: more milk, big dog, bye daddy. Expand what they say — if they say ball, say yes, red ball.", why:"NHS expects two-word combinations by age 2. Expanding their words is the best way to build sentences." },
  { id:"a27", weeks:[78,104], cat:"cognitive", title:"Simple Puzzles",       how:"Offer 2–4 piece inset puzzles with knobs. Show where one piece goes, then let them complete the rest.", why:"Puzzle-solving builds problem-solving, fine motor control and spatial awareness." },
  { id:"a28", weeks:[78,104], cat:"social",    title:"Turn-Taking Games",    how:"Roll a ball back and forth saying my turn, your turn. Build to simple board games with taking turns.", why:"Turn-taking is a foundation of social skills. NHS 2-year check looks for interactive play." },

  { id:"a29", weeks:[104,156], cat:"motor",    title:"Obstacle Course",      how:"Set up cushions, boxes and tunnels to climb over, through and around. Time them for added fun.", why:"WHO recommends at least 60 min of energetic physical activity daily for 2–3 year olds." },
  { id:"a30", weeks:[104,156], cat:"language",  title:"Storytelling Together", how:"Tell simple stories using toys or puppets. Pause and ask what happens next or where did teddy go.", why:"NHS guidelines for 2–3 years emphasise narrative skills and asking questions to build 3–5 word sentences." },
  { id:"a31", weeks:[104,156], cat:"cognitive", title:"Counting Games",      how:"Count stairs as you climb, count grapes on the plate, count toes. Use fingers to show numbers.", why:"WHO early learning goals include counting to 3–5 with objects by age 3. Daily counting makes it natural." },
  { id:"a32", weeks:[104,156], cat:"social",    title:"Feelings & Emotions",  how:"Name emotions as they happen: you look frustrated, that made you happy. Use picture books about feelings.", why:"Emotional literacy is a key NHS developmental focus for 2–3 year olds. Naming feelings helps self-regulation." },

  // 3–4 years (weeks 156–208)
  { id:"a33", weeks:[156,208], cat:"motor",    title:"Hopscotch & Balance",   how:"Draw a simple hopscotch grid with chalk. Show how to hop on one foot and jump with two. Take turns.", why:"Builds single-leg balance, coordination and gross motor confidence — key milestones for this age." },
  { id:"a34", weeks:[156,208], cat:"language", title:"Story Sequencing",      how:"After reading a favourite book, ask what happened first and what came next Use 3 simple picture cards to re-order.", why:"Narrative sequencing builds language, memory and early literacy — an NHS focus for 3–4 year olds." },
  { id:"a35", weeks:[156,208], cat:"cognitive",title:"Colour Sorting Games",  how:"Mix buttons, pompoms or blocks of 4–5 colours. Ask them to sort into groups, then count each pile together.", why:"Sorting and counting consolidates early maths concepts aligned with EYFS numeracy goals." },
  { id:"a36", weeks:[156,208], cat:"social",   title:"Role Play Corner",      how:"Set up a simple shop or kitchen with props. Take a role yourself — be the customer. Let them lead.", why:"Imaginative role play develops empathy, language and social understanding — a WHO early learning goal." },

  // 4–5 years (weeks 208–260)
  { id:"a37", weeks:[208,260], cat:"motor",    title:"Cutting Practice",      how:"Provide child-safe scissors and strips of paper. Start with single snips, progress to cutting along a line.", why:"Scissor use develops fine motor control, bilateral coordination and school-readiness skills." },
  { id:"a38", weeks:[208,260], cat:"language", title:"Rhyming & Word Play",   how:"Read rhyming books together and pause before the last word. Make up silly rhymes: cat, bat, hat, splat.", why:"Phonological awareness — recognising rhyme and sound patterns — is a key foundation for learning to read." },
  { id:"a39", weeks:[208,260], cat:"cognitive",title:"Counting Stories",      how:"Weave counting into stories — e.g. three bears and three bowls: if one bear finishes, how many bowls are left? Use fingers to count together.", why:"Simple number problems build early maths reasoning aligned with EYFS and school-readiness expectations." },
  { id:"a40", weeks:[208,260], cat:"social",   title:"Cooperative Building",  how:"Work together to build a tower or Duplo structure with a shared goal. Talk through decisions together — which piece next, which colour, how tall?", why:"Collaborative problem-solving builds communication, negotiation and turn-taking — core reception skills." },
];

const ACT_CATS = [
  { key:"visual",    label:"Visual",    icon:"👁" },
  { key:"motor",     label:"Movement",  icon:"🌿" },
  { key:"social",    label:"Social",    icon:"💛" },
  { key:"language",  label:"Language",  icon:"💬" },
  { key:"cognitive", label:"Thinking",  icon:"🔆" },
];

function calcAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  const totalDays = Math.floor((today - birth) / (1000*60*60*24));
  if (totalDays < 0) return null;
  const totalWeeks = Math.floor(totalDays / 7);
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  let afterMonths = new Date(birth);
  afterMonths.setMonth(afterMonths.getMonth() + months);
  if (afterMonths > today) { months--; afterMonths.setMonth(afterMonths.getMonth() - 1); }
  const daysAfterMonths = Math.floor((today - afterMonths) / (1000*60*60*24));
  const weeksAfterMonths = Math.floor(daysAfterMonths / 7);
  const remainingDays = daysAfterMonths % 7;
  const years = Math.floor(months / 12);
  const monthsAfterYears = months % 12;
  return { months, weeksAfterMonths, remainingDays, totalWeeks, totalDays, years, monthsAfterYears };
}

function fmtAge(age) {
  if (!age) return "";
  if (age.years >= 1) {
    const parts = [`${age.years}y`];
    if (age.monthsAfterYears > 0) parts.push(`${age.monthsAfterYears}mo`);
    return parts.join(" ");
  }
  const parts = [];
  if (age.months > 0) parts.push(`${age.months}mo`);
  if (age.weeksAfterMonths > 0) parts.push(`${age.weeksAfterMonths}w`);
  return parts.join(" ") || "Newborn";
}

function UsernameSetForm({ normaliseUsername, reserveUsername, C }) {
  const [u, setU] = React.useState("");
  const [st, setSt] = React.useState("idle");
  const ref = React.useRef(null);
  return (
    <div>
      <div style={{position:"relative",marginBottom:6}}>
        <input value={u} onChange={e=>{
          setU(e.target.value); setSt("checking");
          clearTimeout(ref.current);
          if(e.target.value.trim().length<3){setSt("invalid");return;}
          ref.current=setTimeout(async()=>{
            if(!window._fb){setSt("idle");return;}
            const {db,doc,getDoc}=window._fb;
            const snap=await getDoc(doc(db,"usernames",normaliseUsername(e.target.value)));
            setSt(snap.exists()?"taken":"available");
          },600);
        }} placeholder="e.g. TeamSmith"
        style={{width:"100%",padding:"9px 36px 9px 12px",borderRadius:10,border:`1.5px solid ${st==="available"?"#50c878":st==="taken"?C.ter:C.blush}`,fontSize:15,fontFamily:_fI,outline:_oN,boxSizing:_bBB}}/>
        <span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:14}}>
          {st==="checking"?"⏳":st==="available"?"✅":st==="taken"?"❌":""}
        </span>
      </div>
      {st==="taken"&&<div style={{fontSize:12,color:C.ter,marginBottom:6}}>That username is taken — try another</div>}
      <button onClick={async()=>{
        if(st!=="available"||!u.trim()) return;
        const ok = await reserveUsername(u);
        if(!ok) setSt("taken");
      }} disabled={st!=="available"} style={{width:"100%",padding:"9px",borderRadius:99,border:_bN,background:st==="available"?C.ter:"#f2d9cc",color:st==="available"?"white":"#b89890",fontSize:14,fontWeight:700,cursor:st==="available"?"pointer":"not-allowed",fontFamily:_fI}}>
        Save username
      </button>
    </div>
  );
}

function LinkChildForm({ joinChildByCode, C }) {
  const [linkCode, setLinkCode] = React.useState("");
  const [linkStatus, setLinkStatus] = React.useState("");
  const [linkError, setLinkError] = React.useState("");
  const [linkName, setLinkName] = React.useState("");
  return (
    <div style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"14px",border:`1px solid ${C.blush}`,marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:700,color:C.mid,marginBottom:4}}>Link a child</div>
      <div style={{fontSize:13,color:C.lt,marginBottom:10}}>Enter a sync code from another parent to add their child to your app.</div>
      <input value={linkCode} onChange={e=>setLinkCode(e.target.value.toUpperCase())}
        placeholder="e.g. AB3X7Y" maxLength={6}
        style={{width:"100%",fontSize:22,fontFamily:_fM,fontWeight:700,letterSpacing:"0.18em",textAlign:"center",padding:"11px",borderRadius:10,border:`1.5px solid ${linkStatus==="error"?C.ter:C.blush}`,background:"var(--bg-solid)",color:C.ter,outline:_oN,marginBottom:8,boxSizing:_bBB}}/>
      {linkStatus==="error" && <div style={{fontSize:13,color:C.ter,marginBottom:8,textAlign:"center"}}>{linkError}</div>}
      {linkStatus==="ok" && <div style={{fontSize:13,color:C.mint,marginBottom:8,textAlign:"center"}}>✓ {linkName} added to your app!</div>}
      <button onClick={async()=>{
        setLinkStatus("loading");
        const result = await joinChildByCode(linkCode);
        if(result.ok) { setLinkStatus("ok"); setLinkName(result.childName); setLinkCode(""); setTimeout(()=>setLinkStatus(""),2500); }
        else { setLinkStatus("error"); setLinkError(result.error); }
      }} disabled={linkCode.length<6||linkStatus==="loading"} style={{width:"100%",padding:"12px",borderRadius:99,border:_bN,background:linkCode.length===6?C.mint:"#e0f0ea",color:linkCode.length===6?"white":"#a0c8b0",fontSize:15,fontWeight:700,cursor:linkCode.length===6?"pointer":"not-allowed",fontFamily:_fI,transition:"all 0.2s"}}>
        {linkStatus==="loading"?"⏳ Linking…":"Link child"}
      </button>
    </div>
  );
}

function RestoreDataForm({ restoreFromBackup, setShowFamilyModal, familyUsername, backupCode, C }) {
  const [restoreMode, setRestoreMode] = React.useState(false);
  const [restoreInput, setRestoreInput] = React.useState("");
  const [restoreStatus, setRestoreStatus] = React.useState("");


  if (familyUsername) {
    return (
      <div style={{borderRadius:12,border:"1px dashed var(--card-border)",overflow:"hidden",background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",boxShadow:"var(--card-shadow)"}}>
        <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>🔄</span>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--mint)",marginBottom:2}}>Data restores automatically</div>
            <div style={{fontSize:13,color:"var(--mint)",lineHeight:1.4}}>
              {backupCode
                ? <>Signed in as <strong>{familyUsername}</strong> — your data is linked to your account and restores automatically on any device when you sign in.</>
                : <>Signed in as <strong>{familyUsername}</strong> — connecting to your backup… this takes a few seconds.</>
              }
            </div>
          </div>
        </div>
        {!restoreMode && (
          <button onClick={()=>setRestoreMode(true)} style={{width:"100%",padding:"8px 16px",background:_bN,border:_bN,borderTop:"1px dashed #b0e8cc",textAlign:"left",cursor:_cP,fontSize:13,color:"var(--mint)",fontFamily:_fI}}>
            ↗ Restore from a different account instead…
          </button>
        )}
        {restoreMode && (
          <div style={{padding:"0 16px 16px",borderTop:"1px dashed #b0e8cc"}}>
            <div style={{fontSize:13,color:C.lt,marginBottom:8,marginTop:10}}>Enter an account code from another device to import that data.</div>
            <input value={restoreInput} onChange={e=>setRestoreInput(e.target.value.toUpperCase())}
              placeholder="Enter account code"
              style={{width:"100%",fontSize:16,fontFamily:_fM,fontWeight:700,letterSpacing:_ls1,textAlign:"center",padding:"10px",borderRadius:10,border:`1.5px solid ${C.blush}`,background:"var(--bg-solid)",color:C.ter,outline:_oN,marginBottom:8,boxSizing:_bBB}}/>
            {restoreStatus==="fail" && <div style={{fontSize:13,color:C.ter,marginBottom:8,textAlign:"center"}}>Code not found — check and try again</div>}
            {restoreStatus==="ok" && <div style={{fontSize:13,color:"#50c878",marginBottom:8,textAlign:"center"}}>✓ Data restored successfully!</div>}
            <button onClick={async()=>{
              setRestoreStatus("loading");
              const ok = await restoreFromBackup(restoreInput);
              setRestoreStatus(ok?"ok":"fail");
              if(ok) setTimeout(()=>setShowFamilyModal(false),1200);
            }} style={{width:"100%",padding:"12px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:14,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
              {restoreStatus==="loading"?"⏳ Restoring…":"Restore data"}
            </button>
          </div>
        )}
      </div>
    );
  }


  return (
    <div style={{borderRadius:12,border:`1px dashed ${C.blush}`,overflow:"hidden"}}>
      <button onClick={()=>setRestoreMode(m=>!m)} style={{width:"100%",padding:"12px 16px",background:_bN,border:_bN,textAlign:"left",cursor:_cP,fontSize:14,color:C.lt,fontFamily:_fI,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>🔄 Restore data from backup</span>
        <span style={{fontSize:12}}>{restoreMode?"▲":"▼"}</span>
      </button>
      {restoreMode && (
        <div style={{padding:"0 16px 16px"}}>
          <div style={{fontSize:13,color:C.lt,marginBottom:8}}>Enter an account code from another device to restore all data.</div>
          <input value={restoreInput} onChange={e=>setRestoreInput(e.target.value.toUpperCase())}
            placeholder="Enter account code"
            style={{width:"100%",fontSize:16,fontFamily:_fM,fontWeight:700,letterSpacing:_ls1,textAlign:"center",padding:"10px",borderRadius:10,border:`1.5px solid ${C.blush}`,background:"var(--bg-solid)",color:C.ter,outline:_oN,marginBottom:8,boxSizing:_bBB}}/>
          {restoreStatus==="fail" && <div style={{fontSize:13,color:C.ter,marginBottom:8,textAlign:"center"}}>Code not found — check and try again</div>}
          {restoreStatus==="ok" && <div style={{fontSize:13,color:C.mint,marginBottom:8,textAlign:"center"}}>✓ Data restored successfully!</div>}
          <button onClick={async()=>{
            setRestoreStatus("loading");
            const ok = await restoreFromBackup(restoreInput);
            setRestoreStatus(ok?"ok":"fail");
            if(ok) setTimeout(()=>setShowFamilyModal(false),1200);
          }} style={{width:"100%",padding:"12px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:14,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
            {restoreStatus==="loading"?"⏳ Restoring…":"Restore data"}
          </button>
        </div>
      )}
    </div>
  );
}

function LeapBanner({ l, ageWeeks, C }) {
  const isActive  = ageWeeks >= l.windowStart && ageWeeks <= l.windowEnd;
  const weeksAway = l.windowStart - ageWeeks;
  const [open, setOpen] = React.useState(isActive);
  return (
    <div style={{borderRadius:14,overflow:"hidden",margin:"8px 0 6px",border:isActive?`2px solid #7b68ee`:`1px solid #e0dbf5`,background:isActive?"linear-gradient(135deg,#f0eeff,#e8e4ff)":"#f8f7ff"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:_cP}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:isActive?"#7b68ee":"#c5bef5",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:13,color:"white",fontWeight:700}}>{l.phase}</span>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,color:isActive?"#4a3cb5":"#7060c0",letterSpacing:"0.05em",textTransform:"uppercase"}}>Phase {l.phase}</span>
            <span style={{fontSize:13,fontWeight:600,color:isActive?"#2d2060":"#5040a0"}}>{l.name}</span>
            {isActive && <span style={{fontSize:10,background:"#7b68ee",color:"white",borderRadius:99,padding:"2px 7px",fontWeight:700}}>NOW</span>}
            {!isActive && weeksAway > 0 && weeksAway <= 4 && <span style={{fontSize:10,background:"var(--card-bg-alt)",color:"#8878d0",borderRadius:99,padding:"2px 7px",fontWeight:700}}>in {weeksAway}w</span>}
          </div>
          <div style={{fontSize:11,color:"var(--text-lt)",marginTop:1,fontFamily:_fM}}>{isActive?`wk ${l.windowStart}\u2013${l.windowEnd} \u00b7 happening now`:`around wk ${l.peakWeek}`}</div>
        </div>
        <span style={{fontSize:12,color:"var(--text-lt)"}}>{open?"\u25b2":"\u25bc"}</span>
      </div>
      {open && (
        <div style={{padding:"0 14px 12px",borderTop:"1px solid #d8d2f0"}}>
          <div style={{fontSize:13,color:"var(--text-mid)",background:"var(--chip-bg)",borderRadius:10,padding:"8px 11px",marginBottom:9,lineHeight:1.5,marginTop:2}}>
            <span style={{fontWeight:700}}>What to expect: </span>{l.fussy}
          </div>
          <div style={{fontSize:12,color:"#7b68ee",fontWeight:700,marginBottom:5}}>Skills that emerge</div>
          {l.skills.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:7,marginBottom:4}}>
              <span style={{color:"#7b68ee",flexShrink:0,marginTop:1}}>{"\u2192"}</span>
              <span style={{fontSize:13,color:"var(--text-mid)",lineHeight:1.4}}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App(){
  const timerRef = React.useRef(null);
  const[isDark,setIsDark]=useState(()=>document.body.classList.contains('dark-mode'));
  const[themeKey,setThemeKey]=useState(0);
  useEffect(()=>{
    // Dismiss splash screen once React has mounted
    const splash=document.getElementById("splash");
    if(splash){splash.classList.add("hide");setTimeout(()=>{splash.remove();},600);}
  },[]);

  useEffect(()=>{
    // Register callback so toggleTheme can trigger instant re-render
    window._themeCallback = ()=>{
      void document.body.offsetHeight; // force layout
      C=getC();
      setIsDark(document.body.classList.contains('dark-mode'));
      setThemeKey(k=>k+1);
    };
    const obs=new MutationObserver(()=>{
      void document.body.offsetHeight;
      C=getC();
      setIsDark(document.body.classList.contains('dark-mode'));
      setThemeKey(k=>k+1);
    });
    obs.observe(document.body,{attributes:true,attributeFilter:['class']});
    return()=>{obs.disconnect();window._themeCallback=null;};
  },[]);


  const[children,setChildren]=useState(()=>{
    try {
      const saved = localStorage.getItem("children_v1");
      if(saved) return JSON.parse(saved);

      const oldDays = localStorage.getItem(STORAGE_KEY);
      const oldWeights = localStorage.getItem("bw_v2");
      const oldName = localStorage.getItem("bn_v2");
      const oldDob = localStorage.getItem("dob_v1");
      const oldSex = localStorage.getItem("sex_v1");
      const oldUnborn = localStorage.getItem("unborn_v1");
      const oldMilestones = localStorage.getItem("ms_v1");
      const cid = uid();
      let daysData = {};
      try{ daysData = oldDays ? JSON.parse(oldDays) : {}; }catch{}
      if(!daysData[todayStr()]) daysData[todayStr()] = [];
      return { [cid]: {
        id: cid,
        name: oldName||"",
        dob: oldDob||"",
        sex: oldSex||"",
        unborn: oldUnborn==="1",
        days: daysData,
        weights: oldWeights ? JSON.parse(oldWeights) : [],
        milestones: oldMilestones ? JSON.parse(oldMilestones) : {}
      }};
    } catch(e) {
      const cid = uid();
      const d = {}; d[todayStr()] = [];
      return { [cid]: { id:cid, name:"", dob:"", sex:"", unborn:false, days:d, weights:[], heights:[], photos:[], milestones:{} }};
    }
  });
  const[activeChildId,setActiveChildId]=useState(()=>{
    try{
      const saved = localStorage.getItem("children_v1");
      const act = localStorage.getItem("active_child");
      if(saved && act && JSON.parse(saved)[act]) return act;
      if(saved) return Object.keys(JSON.parse(saved))[0];
    }catch{}
    return null;
  });


  const childIds = Object.keys(children);
  const resolvedActiveId = (activeChildId && children[activeChildId]) ? activeChildId : childIds[0];
  const activeChild = children[resolvedActiveId] || { id:"", name:"", dob:"", sex:"", unborn:false, days:{}, weights:[], heights:[], photos:[], milestones:{} };


  const babyName    = activeChild.name;
  const babyDob     = activeChild.dob;
  const babySex     = activeChild.sex;
  const babyUnborn  = activeChild.unborn;
  const days        = activeChild.days || {};
  const weights     = activeChild.weights;
  const heights     = activeChild.heights || [];
  const milestones  = activeChild.milestones;


  const updateChild = (patch) => setChildren(prev => ({
    ...prev,
    [resolvedActiveId]: { ...prev[resolvedActiveId], ...patch }
  }));
  const setBabyName    = (v) => updateChild({name: v});
  const setBabyDob     = (v) => updateChild({dob: v});
  const setBabySex     = (v) => updateChild({sex: v});
  const setBabyUnborn  = (v) => updateChild({unborn: v});
  const setDays        = (fn) => setChildren(prev => {
    const cur = prev[resolvedActiveId];
    const next = typeof fn === "function" ? fn(cur.days) : fn;
    return {...prev, [resolvedActiveId]: {...cur, days: next}};
  });
  const setWeights     = (fn) => setChildren(prev => {
    const cur = prev[resolvedActiveId];
    const next = typeof fn === "function" ? fn(cur.weights) : fn;
    return {...prev, [resolvedActiveId]: {...cur, weights: next}};
  });
  const setHeights     = (fn) => setChildren(prev => {
    const cur = prev[resolvedActiveId];
    const next = typeof fn === "function" ? fn(cur.heights || []) : fn;
    return {...prev, [resolvedActiveId]: {...cur, heights: next}};
  });
  const photos = activeChild.photos || [];
  const setPhotos = (fn) => setChildren(prev => {
    const cur = prev[resolvedActiveId];
    const next = typeof fn === "function" ? fn(cur.photos || []) : fn;
    return {...prev, [resolvedActiveId]: {...cur, photos: next}};
  });
  const photoInputRef = useRef(null);

  function exportCSV(){
    const rows=[["Date","Time","Type","Detail","Amount","Duration","Note"]];
    Object.keys(days).sort().forEach(date=>{
      (days[date]||[]).forEach(e=>{
        const time=e.time||e.start||"";
        let detail="",amount="",duration="",note=e.note||"";
        if(e.type==="feed"){
          detail=e.feedType||"milk";
          amount=e.feedType==="breast"?`L:${e.breastL||0}m R:${e.breastR||0}m`:(e.amount?fmtVol(e.amount,FU):"");
        }else if(e.type==="poop"){
          detail=e.poopType||"wet";
        }else if(e.type==="nap"){
          detail="nap";duration=e.duration?e.duration+"min":"";
          if(e.end) amount=`${e.start||""}-${e.end}`;
        }else if(e.type==="sleep"){
          detail=e.night?"night wake":"bedtime";
        }else if(e.type==="wake"){
          detail="wake";
        }
        rows.push([date,time,e.type||"",detail,amount,duration,note].map(v=>'"'+String(v).replace(/"/g,'""')+'"'));
      });
    });
    // Add weight/height
    rows.push([]);rows.push(["Date","Weight (kg)","Height (cm)","Weight %ile","Height %ile"]);
    const allDates=[...new Set([...weights.map(w=>w.date),...heights.map(h=>h.date)])].sort();
    allDates.forEach(d=>{
      const w=weights.find(x=>x.date===d);
      const h=heights.find(x=>x.date===d);
      let wp="",hp="";
      if(w&&babyDob){const mo=Math.floor((new Date(d)-new Date(babyDob))/(1000*60*60*24*30.44));wp=getPercentile(w.kg,mo,babySex)||"";}
      if(h&&babyDob){const mo=Math.floor((new Date(d)-new Date(babyDob))/(1000*60*60*24*30.44));hp=getHeightPercentile(h.cm,mo,babySex)||"";}
      rows.push([d,w?w.kg:"",h?h.cm:"",wp,hp].map(v=>'"'+String(v)+'"'));
    });
    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`${babyName||"baby"}-data-${todayStr()}.csv`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    trackEvent("data_exported",{format:"csv"});
  }

  function capturePhoto(forMilestone){
    if(photoInputRef.current){
      photoInputRef.current._forMilestone=forMilestone||null;
      photoInputRef.current.click();
    }
  }
  function handlePhotoCapture(e){
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=function(ev){
      // Resize to max 300px and compress to 50% quality for storage
      const img=new Image();
      img.onload=function(){
        const max=300;
        let w=img.width,h=img.height;
        if(w>max||h>max){const r=Math.min(max/w,max/h);w*=r;h*=r;}
        const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,w,h);
        const dataUrl=canvas.toDataURL("image/jpeg",0.5);
        const milestoneId=photoInputRef.current._forMilestone;
        if(milestoneId){
          // Attach to milestone
          setMilestones(prev=>({...prev,[milestoneId]:{...prev[milestoneId],photo:dataUrl}}));
        }else{
          // Add to photo diary
          setPhotos(prev=>[...prev,{id:uid(),date:selDay||todayStr(),time:nowTime(),dataUrl,note:""}]);
        }
        try{navigator.vibrate&&navigator.vibrate(30);}catch{}
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value="";
  }
  const setMilestones  = (fn) => setChildren(prev => {
    const cur = prev[resolvedActiveId];
    const next = typeof fn === "function" ? fn(cur.milestones) : fn;
    return {...prev, [resolvedActiveId]: {...cur, milestones: next}};
  });

  const[selDay,setSelDay]=useState(todayStr);
  const[tab,setTab]=useState("day");
  const[msFilter,setMsFilter]=useState("all");
  const[msShowPastPhases,setMsShowPastPhases]=useState(false);
  const[msShowPastMs,setMsShowPastMs]=useState(false);
  const[msShowUpcoming,setMsShowUpcoming]=useState(false);
    const[growthLogOpen,setGrowthLogOpen]=useState(false);
  const[insightSection,setInsightSection]=useState({trends:true,sleep:false,reports:false});
  const toggleInsight=(k)=>setInsightSection(p=>({...p,[k]:!p[k]}));
  const[heightForm,setHeightForm]=useState({date:todayStr(),cm:""});
  const[devActFilter,setDevActFilter]=useState("all");
  const[modal,setModal]=useState(null);
  const[logPanel,setLogPanel]=useState(null);
  const[nappyMode,setNappyMode]=useState(null);
  const[nappyTime,setNappyTime]=useState("");
  const[logForm,setLogForm]=useState({feedType:"bottle",amount:"",breastL:"",breastR:"",pumpL:"",pumpR:"",pumpTotal:"",pumpDuration:"",pumpStart:"",note:"",poopType:"wet",sleepType:"auto",napStart:"",napEnd:"",bedTime:"",feedTime:"",feedTimeSet:false});
  const[eType,setEType]=useState("feed");
  const[showWakeInline,setShowWakeInline]=useState(false);
  const[showNightWake,setShowNightWake]=useState(false);
  const[showWakePrompt,setShowWakePrompt]=useState(false);
  const[showWakeEditPrompt,setShowWakeEditPrompt]=useState(false);
  const[wakeEditEntry,setWakeEditEntry]=useState(null);
  // Bridge nap: tracks whether user added bridge nap to schedule (keyed by selDay)
  const[bridgeNapDays,setBridgeNapDays]=useState(()=>{try{return JSON.parse(localStorage.getItem("bridge_nap_days_v1")||"{}");} catch{return {};}});
  const bridgeNapScheduled = bridgeNapDays[selDay]===true;
  function setBridgeNap(val){
    setBridgeNapDays(prev=>{
      const next={...prev,[selDay]:val};
      // Prune entries older than 30 days to prevent localStorage bloat
      const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);
      const pruned=Object.fromEntries(Object.entries(next).filter(([d])=>new Date(d)>=cutoff));
      try{localStorage.setItem("bridge_nap_days_v1",JSON.stringify(pruned));}catch{}
      return pruned;
    });
  }
  const[nwForm,setNwForm]=useState({time:"",ml:"",selfSettled:false,assisted:false,assistedType:"milk",assistedNote:"",assistedDuration:"",note:""});
  const[inlineWakeTime,setInlineWakeTime]=useState("");

  React.useEffect(()=>{
    if(!showWakeInline) return;
    const todayWake = (days[selDay]||[]).some(e=>e.type==="wake"&&!e.night);
    if(todayWake) setShowWakeInline(false);
  },[days, selDay, showWakeInline]);
  const[form,setForm]=useState({amount:"",time:nowTime(),start:nowTime(),end:nowTime(),note:"",night:"no",poopType:"",breastL:"",breastR:"",pumpL:"",pumpR:""});
  const[newDate,setNewDate]=useState(todayStr());
  const[menuDay,setMenuDay]=useState(null);
  const[editDate,setEditDate]=useState("");
  const[confirmDeleteDay,setConfirmDeleteDay]=useState(false);
  const[napOn,setNapOn]=useState(()=>{try{return localStorage.getItem("nap_on")==="1";}catch{return false;}});
  const[napStartT,setNapStartT]=useState(()=>{try{return localStorage.getItem("nap_startT")||null;}catch{return null;}});
  const[napSec,setNapSec]=useState(()=>{
    try{
      const on=localStorage.getItem("nap_on")==="1";
      const startT=localStorage.getItem("nap_startT");
      const savedSec=parseInt(localStorage.getItem("nap_sec"))||0;
      if(on && startT){

        const now=new Date();
        const [sh,sm]=startT.split(":").map(Number);
        const startDate=new Date(); startDate.setHours(sh,sm,0,0);
        const elapsed=Math.floor((now-startDate)/1000);
        // Cap at 23h — if negative (start was yesterday), fall back to savedSec
        if(elapsed<0||elapsed>23*3600) return savedSec;
        return elapsed>0?elapsed:savedSec;
      }
      return savedSec;
    }catch{return 0;}
  });
  const[napCountdown,setNapCountdown]=useState(null);

  const[breastSide,setBreastSide]=useState(()=>{try{return localStorage.getItem("breast_side")||null;}catch{return null;}});
  const[breastSec,setBreastSec]=useState(()=>{try{const s=localStorage.getItem("breast_sec");return s?JSON.parse(s):{L:0,R:0};}catch{return {L:0,R:0};}});
  const[breastActive,setBreastActive]=useState(()=>{try{return localStorage.getItem("breast_active")==="1";}catch{return false;}});
  const[breastStartTime,setBreastStartTime]=useState(()=>{try{return localStorage.getItem("breast_startTime")||null;}catch{return null;}});
  const breastRef=React.useRef(null);
  const[bedCountdown,setBedCountdown]=useState(null);
  const[timerEndPrompt,setTimerEndPrompt]=useState(null); // {start, end, durMins} when timer stopped
  // Bug 1: explicit timer mode — 'prediction' | 'activeSleep'
  const[timerMode,setTimerMode]=useState(()=> {
    try { return localStorage.getItem("timer_mode_v1") || (localStorage.getItem("nap_on")==="1" ? "activeSleep" : "prediction"); } catch { return "prediction"; }
  });
  const[copied,setCopied]=useState(false);
  const[nameEdit,setNameEdit]=useState(false);
  const[nameIn,setNameIn]=useState("");
  const theme = babySex==="girl"
    ? {primary:isDark?"rgba(45,31,42,0.8)":"#fde7e4",secondary:isDark?"rgba(61,42,56,0.8)":"#f5ccc7",grad:isDark?"linear-gradient(135deg,rgba(45,31,42,0.9),rgba(61,42,56,0.9))":"linear-gradient(135deg,#fde7e4,#f5ccc7)"}
    : babySex==="boy"
    ? {primary:isDark?"rgba(26,42,61,0.8)":"#eaf3fb",secondary:isDark?"rgba(30,52,80,0.8)":"#d0e6f5",grad:isDark?"linear-gradient(135deg,rgba(26,42,61,0.9),rgba(30,52,80,0.9))":"linear-gradient(135deg,#eaf3fb,#d0e6f5)"}
    : {primary:isDark?"#c9705a":"#c9705a",secondary:isDark?"#7a5c52":"#7a5c52",grad:"linear-gradient(135deg,#c9705a,#a85a44)"};
  const[growthForm,setGrowthForm]=useState({date:todayStr(),kg:""});
  const[onboarded,setOnboarded]=useState(()=>{
    try{
      const done = localStorage.getItem("onboarded_v2");
      const saved = localStorage.getItem("children_v1");
      if(done) return true;

      const hasName = localStorage.getItem("bn_v2");
      const hasDob = localStorage.getItem("dob_v1");
      if(hasName && hasDob) return true;

      if(saved) {
        const ch = JSON.parse(saved);
        return Object.values(ch).some(c => c.name);
      }
      return false;
    }catch{return false;}
  });
  const[obStep,setObStep]=useState(0);
  const[obName,setObName]=useState("");
  const[obDob,setObDob]=useState("");
  const[obSex,setObSex]=useState("");
  const[needsChildSetup,setNeedsChildSetup]=useState(false);
  const[obUsername,setObUsername]=useState("");
  const[obUsernameStatus,setObUsernameStatus]=useState("idle");
  const[familyUsername,setFamilyUsername]=useState(()=>{try{return localStorage.getItem("family_username")||null;}catch{return null;}});
  const[authScreen,setAuthScreen]=useState(()=>{try{const v=localStorage.getItem("auth_verified"),u=localStorage.getItem("family_username");return(u&&!v)?"login":null;}catch{return null;}});
  const[authMode,setAuthMode]=useState("login");
  const[authUsername,setAuthUsername]=useState(()=>{try{return localStorage.getItem("family_username")||"";}catch{return "";}});
  const[authUsernameStatus,setAuthUsernameStatus]=useState("idle");
  const[authPin,setAuthPin]=useState("");
  const[authPin2,setAuthPin2]=useState("");
  const[authError,setAuthError]=useState("");
  const[authLoading,setAuthLoading]=useState(false);
  const[agreedToTerms,setAgreedToTerms]=useState(false);
  const authUsernameCheckRef = React.useRef(null);
  const[showForgotPin,setShowForgotPin]=useState(false);
  const[forgotPinStep,setForgotPinStep]=useState("word");
  const[forgotPinWord,setForgotPinWord]=useState("");
  const[forgotPinNewPin,setForgotPinNewPin]=useState("");
  const[forgotPinLoading,setForgotPinLoading]=useState(false);
  const[forgotPinError,setForgotPinError]=useState("");
  const[obPin,setObPin]=useState("");
  const[obPin2,setObPin2]=useState("");
  const[obLinkCode,setObLinkCode]=useState("");
  const[obLinkStatus,setObLinkStatus]=useState("");
  const[obLinkError,setObLinkError]=useState("");
  const[obChildMode,setObChildMode]=useState("new");
  const obUsernameCheckRef = React.useRef(null);
  const[editEntry,setEditEntry]=useState(null);
  const[insightDismissed,setInsightDismissed]=useState(()=>{try{return!!localStorage.getItem("ins_v1");}catch{return false;}});
    const[showPersonalPopup,setShowPersonalPopup]=useState(()=>{
    try{const v=localStorage.getItem("use_personal_recs_v1");return v===null;}catch{return true;}
  });


  const[usePersonalRecs,setUsePersonalRecs]=useState(()=>{
    try{const v=localStorage.getItem("use_personal_recs_v1");return v===null?null:JSON.parse(v);}catch{return null;}
  });
  const[fluidUnit,setFluidUnit]=useState(()=>{
    try{return localStorage.getItem("fluid_unit_v1")||"ml";}catch{return "ml";}
  });
  const FU=fluidUnit; // shorthand for templates
    const[pasteText,setPasteText]=useState("");
  const[parsedEntries,setParsedEntries]=useState(null);
  const parsedEntriesRef = React.useRef(null);
  const _setParsedEntries = (v) => { parsedEntriesRef.current = v; setParsedEntries(v); };
  const[parseError,setParseError]=useState("");
  const[feedType,setFeedType]=useState("milk");
  const[dragId,setDragId]=useState(null);
  const[dragOver,setDragOver]=useState(null);
  const touchDragRef = React.useRef({active:false, id:null, overEntry:null});
  const logListRef = React.useRef(null);
  const reorderRef = React.useRef(reorderEntry);
  React.useEffect(()=>{ reorderRef.current = reorderEntry; });


  const logListCallbackRef = React.useCallback((el) => {
    logListRef.current = el;
    if (!el) return;

    function onTouchStart(ev){
      const handle = ev.target.closest('[data-drag-handle]');
      if(!handle) return;
      const entryEl = handle.closest('[data-entry-id]');
      if(!entryEl) return;
      touchDragRef.current.active = true;
      touchDragRef.current.id = entryEl.dataset.entryId;
      touchDragRef.current.overEntry = null;
      ev.preventDefault();
    }

    function onTouchMove(ev){
      if(!touchDragRef.current.active) return;
      ev.preventDefault();
      const touch = ev.touches[0];
      const entries = el.querySelectorAll('[data-entry-id]');
      let over = null;
      entries.forEach(node=>{
        const rect = node.getBoundingClientRect();
        if(touch.clientY >= rect.top && touch.clientY <= rect.bottom) over = node.dataset.entryId;
      });
      if(over && over !== touchDragRef.current.id){
        if(over !== touchDragRef.current.overEntry){
          touchDragRef.current.overEntry = over;
          setDragOver(over);
        }
      } else if(!over){
        touchDragRef.current.overEntry = null;
        setDragOver(null);
      }
      setDragId(touchDragRef.current.id);
    }

    function onTouchEnd(){
      if(!touchDragRef.current.active) return;
      const {id, overEntry} = touchDragRef.current;
      touchDragRef.current = {active:false, id:null, overEntry:null};
      setDragId(null);
      setDragOver(null);
      if(id && overEntry && id !== overEntry) reorderRef.current(id, overEntry);
    }

    el.addEventListener('touchstart', onTouchStart, {passive:false});
    el.addEventListener('touchmove', onTouchMove, {passive:false});
    el.addEventListener('touchend', onTouchEnd, {passive:false});

    el._dragCleanup = () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);


  React.useEffect(() => {
    return () => {
      if (logListRef.current && logListRef.current._dragCleanup) {
        logListRef.current._dragCleanup();
      }
    };
  }, []);
  const[tutStep,setTutStep]=useState(-1);

  const[isOnline,setIsOnline]=useState(()=>navigator.onLine);


  const[familyCode,setFamilyCode]=useState(()=>{try{return localStorage.getItem("family_code")||null;}catch{return null;}});

  const[childSyncCodes,setChildSyncCodes]=useState(()=>{
    try{const s=localStorage.getItem("child_sync_codes_v1");return s?JSON.parse(s):{};}catch{return {};}
  });

  const childSubsRef = React.useRef({});
  const[backupCode,setBackupCode]=useState(()=>{try{return localStorage.getItem("backup_code")||null;}catch{return null;}});
  const backupCodeRef = useRef(backupCode);
  useEffect(()=>{backupCodeRef.current=backupCode;},[backupCode]);
  const[syncStatus,setSyncStatus]=useState("idle");
  const[showFamilyModal,setShowFamilyModal]=useState(false);
  const[recoveryWordInput,setRecoveryWordInput]=useState("");
  const[recoveryWordSaving,setRecoveryWordSaving]=useState(false);
  const[recoveryWordStatus,setRecoveryWordStatus]=useState(null);
  const[showChildSettings,setShowChildSettings]=useState(false);
  const[csName,setCsName]=useState("");
  const[csDob,setCsDob]=useState("");
  const[csSex,setCsSex]=useState("");
  const[csConfirmDelete,setCsConfirmDelete]=useState(false);
  const[joinCodeInput,setJoinCodeInput]=useState("");
  const[joinError,setJoinError]=useState("");
  const[fbReady,setFbReady]=useState(false);
  const syncRef = React.useRef(null);

  const possessive = (n) => {
    if (!n) return "";
    return n.endsWith("s") ? `${n}'` : `${n}'s`;
  };


  const lsRef = React.useRef(null);
  useEffect(()=>{
    clearTimeout(lsRef.current);
    lsRef.current = setTimeout(()=>{
      try{localStorage.setItem("children_v1",JSON.stringify(children));}catch(e){
        if(e.name==="QuotaExceededError"||e.code===22){
          console.warn("OBubba: localStorage quota exceeded — photos may be too large. Data is backed up to cloud.");
        }
      }
      try{localStorage.setItem("child_sync_codes_v1",JSON.stringify(childSyncCodes));}catch{}
      if(resolvedActiveId)try{localStorage.setItem("active_child",resolvedActiveId);}catch{}
      if(onboarded)try{localStorage.setItem("onboarded_v2","1");}catch{}
    }, 300);
    return ()=>clearTimeout(lsRef.current);
  },[children, childSyncCodes, resolvedActiveId, onboarded]);

  useEffect(()=>{
    const on=()=>setIsOnline(true);
    const off=()=>setIsOnline(false);
    window.addEventListener("online",on);
    window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);


  useEffect(()=>{
    const check = setInterval(()=>{
      if(window._fb){ setFbReady(true); clearInterval(check); }
    }, 200);
    return ()=>clearInterval(check);
  },[]);


  const pushToCloud = React.useCallback(async(code, allChildren) => {
    if(!window._fb || !code) return;
    const {db, doc, setDoc, serverTimestamp} = window._fb;

    if(!window._fbUid) {
      await new Promise(resolve => {
        let waited = 0;
        const poll = setInterval(() => {
          waited += 200;
          if(window._fbUid || waited >= 5000) { clearInterval(poll); resolve(); }
        }, 200);
      });
    }
    try {
      setSyncStatus("syncing");
      const myUid = window._fbUid || "anon";
      const writeToken = writeTokenRef.current;


      const hasAnyNamedChild = Object.values(allChildren).some(c => c.name);
      const childrenToWrite = hasAnyNamedChild
        ? Object.fromEntries(Object.entries(allChildren).filter(([,c]) => {
            if (c.name) return true;

            const hasEntries = Object.values(c.days||{}).some(d => d && d.length > 0);
            const hasWeights = (c.weights||[]).length > 0;
            return hasEntries || hasWeights;
          }))
        : allChildren;
      await setDoc(doc(db,"families",code), {
        children: JSON.stringify(childrenToWrite),
        updatedAt: serverTimestamp(),
        updatedBy: myUid,
        writeToken
      });

      if(myUid && myUid !== "anon") {
        try{
          await setDoc(doc(db,"uid_to_backup",myUid), {backupCode: code, updatedAt: serverTimestamp()}, {merge:true});
        }catch(e){ console.warn("uid_to_backup write error",e); }
      }
      setSyncStatus("synced");
    } catch(e) {
      console.warn("OBubba pushToCloud error",e);
      setSyncStatus("error");
    }
  },[]);


  const unsubscribeRef = React.useRef(null);
  const subscribeToFamily = React.useCallback((code)=>{
    if(!window._fb || !code) return;
    if(unsubscribeRef.current) unsubscribeRef.current();
    const {db,doc,onSnapshot} = window._fb;
    unsubscribeRef.current = onSnapshot(doc(db,"families",code),(snap)=>{
      if(!snap.exists()) return;
      const d = snap.data();

      const myUid = window._fbUid;
      if(d.writeToken && d.writeToken === writeTokenRef.current) return;
      if(myUid && d.updatedBy === myUid) return;
      try{
        if(d.children) {
          const incoming = JSON.parse(d.children);
          setChildren(prev => {
            const merged = mergeChildren(prev, incoming);

            const incomingCount = countAllEntries(incoming);
            if(incomingCount > cloudEntryCountRef.current) cloudEntryCountRef.current = incomingCount;
            return merged;
          });
        }
      }
      catch(e){ console.warn("Sync apply error",e); }
    });
  },[]);

  useEffect(()=>{


    const codeToWatch = familyCode || backupCode;
    if(fbReady && codeToWatch) subscribeToFamily(codeToWatch);
    return ()=>{ if(unsubscribeRef.current) unsubscribeRef.current(); };
  },[fbReady, familyCode, backupCode]);


  const [restoreDone, setRestoreDone] = React.useState(false);

  const restoreRanRef = React.useRef(false);

  useEffect(()=>{
    if(!fbReady || restoreRanRef.current) return;
    restoreRanRef.current = true;
    const {db, doc, getDoc} = window._fb;

    (async()=>{
      try {

        let code = backupCode || localStorage.getItem("backup_code");
        if(code && !backupCode) setBackupCode(code);

        if(!code) {


          if(!window._fbUid) {
            await new Promise(resolve => {
              let waited = 0;
              const poll = setInterval(() => {
                waited += 200;
                if(window._fbUid || waited >= 5000) { clearInterval(poll); resolve(); }
              }, 200);
            });
          }


          const uname = familyUsername || localStorage.getItem("family_username");
          if(uname) {
            const key = uname.toLowerCase().replace(/[^a-z0-9_]/g,"");
            try {
              const uSnap = await getDoc(doc(db,"usernames",key));
              if(uSnap.exists()) {
                const uData = uSnap.data();
                code = uData.backupCode || uData.familyCode || null;
                if(code) {
                  setBackupCode(code);
                  try{ localStorage.setItem("backup_code",code); }catch{}
                }
              }
            } catch(e){ console.warn("OBubba username lookup error",e); }
          }


          // SECURITY: Only fall back to UID lookup if user has a verified username on this device
          // This prevents a new account from accidentally loading another user's data
          const hasVerifiedUser = localStorage.getItem("auth_verified") && (familyUsername || localStorage.getItem("family_username"));
          if(!code && window._fbUid && hasVerifiedUser) {
            try {
              const uidSnap2 = await getDoc(doc(db,"uid_to_backup",window._fbUid));
              if(uidSnap2.exists()) {
                const ec = uidSnap2.data().backupCode;
                if(ec) {
                  code = ec;
                  setBackupCode(ec);
                  try{ localStorage.setItem("backup_code",ec); }catch{}
                }
              }
            } catch(e){ console.warn("OBubba early uid_to_backup lookup error",e); }
          }
        }


        if(code) {
          try {
            const snap = await getDoc(doc(db,"families",code));
            if(snap.exists()) {
              const d = snap.data();
              if(d.children) {
                let cloud;
                try { cloud = JSON.parse(d.children); } catch(e) { cloud = null; }
                if(cloud) {
                  const cloudIds = Object.keys(cloud);
                  if(cloudIds.length) {


                    setChildren(prev => {
                      const merged = mergeChildren(prev, cloud);
                      const cloudHasNamedChild = cloudIds.some(id => cloud[id] && cloud[id].name);
                      if (cloudHasNamedChild) {

                        Object.keys(merged).forEach(id => {
                          if (!cloud[id]) {
                            const ch = merged[id];
                            const isBlank = !ch.name && !ch.dob &&
                              Object.values(ch.days||{}).every(d => !d || d.length === 0) &&
                              !(ch.weights||[]).length;
                            if (isBlank) delete merged[id];
                          }
                        });
                      }

                      cloudEntryCountRef.current = countAllEntries(merged);
                      return merged;
                    });

                    setChildren(prev => {
                      try{ localStorage.setItem("children_v1",JSON.stringify(prev)); }catch{}
                      return prev;
                    });
                    setActiveChildId(prev=>{
                      if(prev && cloudIds.includes(prev)) return prev;
                      const lsSaved = localStorage.getItem("active_child");
                      if(lsSaved && cloudIds.includes(lsSaved)) return lsSaved;
                      return cloudIds[0];
                    });
                  }
                }
              }
            }
          } catch(e){ console.warn("OBubba cloud pull error",e); }


          const fc = familyCode || localStorage.getItem("family_code");
          if(fc && fc !== code) subscribeToFamily(fc);

        } else {


          let foundExisting = false;
          if(!foundExisting) {
            // SAFETY: Only generate a new backup code for genuinely new users
            // who have no username. If they have a username, verifyLogin will
            // fetch their correct backup code when they sign in.
            const hasUsername = familyUsername || localStorage.getItem("family_username");
            const hasVerified = localStorage.getItem("auth_verified");
            if(!hasUsername && !hasVerified) {
              const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
              let newCode, exists = true;
              while(exists){
                newCode = "BK"+Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
                try{ const s = await getDoc(doc(db,"families",newCode)); exists = s.exists(); }
                catch{ exists = false; }
              }
              setBackupCode(newCode);
              try{ localStorage.setItem("backup_code",newCode); }catch{}
            }
          }
        }

      } catch(e){ console.warn("OBubba restore error",e); }


      setRestoreDone(true);
    })();
  },[fbReady]);


  const syncTimerRef = React.useRef(null);

  const writeTokenRef = React.useRef("tok_" + Math.random().toString(36).slice(2));
  const justRestoredRef = React.useRef(false);


  const cloudEntryCountRef = React.useRef(0);


  const deletedDaysRef = React.useRef(new Set());


  const childrenRef = React.useRef(children);
  React.useEffect(()=>{ childrenRef.current = children; }, [children]);


  const userDeletedCountRef = React.useRef(0);
  function countAllEntries(ch) {
    return Object.values(ch).reduce((total, child) =>
      total + Object.values(child.days||{}).reduce((s,d) => s+(d&&d.length?d.length:0), 0)
    , 0);
  }
  useEffect(()=>{
    if(!fbReady || !restoreDone || !backupCode) return;

    // SAFETY: Don't push until user has authenticated
    if(!localStorage.getItem("auth_verified")) return;

    if(!justRestoredRef.current) { justRestoredRef.current = true; return; }
    clearTimeout(syncTimerRef.current);

    syncTimerRef.current = setTimeout(()=>{
      const hasData = Object.values(children).some(c=>
        (c.name&&c.name.trim()) || c.dob ||
        Object.values(c.days||{}).some(d=>d&&d.length>0) ||
        (c.weights||[]).length>0
      );
      if(!hasData) return;


      const currentCount = countAllEntries(children);

      const adjustedFloor = Math.max(0, cloudEntryCountRef.current - userDeletedCountRef.current);
      if(adjustedFloor > 10 && currentCount < adjustedFloor * 0.8) {
        console.warn("OBubba: push blocked — " + currentCount + " entries vs adjusted floor " + adjustedFloor + ".");
        return;
      }
      pushToCloud(backupCode, children);
    }, 8000);
    return ()=>clearTimeout(syncTimerRef.current);
  },[fbReady, restoreDone, backupCode, children]);


  async function createFamilyCode() {
    if(!window._fb) return;
    const {db, doc, getDoc, logEvent, analytics} = window._fb;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code, exists = true;
    while(exists) {
      code = Array.from({length:6}, ()=>chars[Math.floor(Math.random()*chars.length)]).join("");
      try{ const snap = await getDoc(doc(db,"families",code)); exists = snap.exists(); }
      catch{ exists = false; }
    }
    await pushToCloud(code, children, false);
    setFamilyCode(code);
    try{localStorage.setItem("family_code", code);}catch{}
    subscribeToFamily(code);
    try{ logEvent(analytics, "family_code_created"); }catch{}
  }


  async function joinFamily(code) {
    if(!window._fb) return;
    const {db, doc, getDoc, logEvent, analytics} = window._fb;
    const clean = code.trim().toUpperCase();
    if(clean.length !== 6) { setJoinError("Code must be 6 characters"); return; }
    try {
      const snap = await getDoc(doc(db,"families",clean));
      if(!snap.exists()) { setJoinError("Code not found — check with your partner"); return; }
      const d = snap.data();
      if(d.children) setChildren(prev => mergeChildren(prev, JSON.parse(d.children)));
      setFamilyCode(clean);
      try{localStorage.setItem("family_code", clean);}catch{}
      subscribeToFamily(clean);
      setJoinError("");
      setShowFamilyModal(false);
      try{ logEvent(analytics, "family_code_joined"); }catch{}
    } catch(e) {
      setJoinError("Something went wrong — please try again");
    }
  }


  function logout() {
    try{ localStorage.removeItem("auth_verified"); }catch{}
    try{ localStorage.removeItem("family_username"); }catch{}
    setFamilyUsername(null);
    setAuthScreen("login");
    setAuthMode("login");
    setAuthUsername("");
    setAuthPin("");
    setAuthPin2("");
    setAuthError("");
    setAuthUsernameStatus("idle");
  }

  async function restoreFromBackup(code) {
    if(!window._fb) return false;
    const {db, doc, getDoc} = window._fb;
    const clean = code.trim().toUpperCase();
    try {
      const snap = await getDoc(doc(db,"families",clean));
      if(!snap.exists()) return false;
      const d = snap.data();
      if(d.children) {
        let cloud;
        try { cloud = JSON.parse(d.children); } catch(e) { return false; }


        setChildren(cloud);
        try{ localStorage.setItem("children_v1", JSON.stringify(cloud)); }catch{}
        const cloudIds = Object.keys(cloud);
        if(cloudIds.length) {
          setActiveChildId(cloudIds[0]);
          try{ localStorage.setItem("active_child", cloudIds[0]); }catch{}
        }
      }

      setBackupCode(clean);
      try{ localStorage.setItem("backup_code", clean); }catch{}

      if(!restoreDone) setRestoreDone(true);
      return true;
    } catch(e) {
      console.warn("OBubba restoreFromBackup error",e);
      return false;
    }
  }


  function trackEvent(name, params={}) {
    try {
      if(window._fb) window._fb.logEvent(window._fb.analytics, name, params);
    } catch(e){}
  }


  const normaliseUsername = (u) => u.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"");
  const hashPin = (pin) => { let h=5381; for(let i=0;i<pin.length;i++) h=((h<<5)+h)+pin.charCodeAt(i); return (h>>>0).toString(16); };


  async function verifyLogin(username, pin) {
    if(!window._fb) { setAuthError("Not connected — check your internet"); return false; }
    const {db, doc, getDoc} = window._fb;
    const key = normaliseUsername(username);
    if(!key) { setAuthError("Enter a username"); return false; }
    if(pin.length !== 4) { setAuthError("PIN must be 4 digits"); return false; }
    try {
      const snap = await getDoc(doc(db,"usernames",key));
      if(!snap.exists()) { setAuthError("Username not found"); return false; }
      const data = snap.data();
      if(data.pinHash !== hashPin(pin)) { setAuthError("Incorrect PIN"); return false; }


      const resolvedBackup = data.backupCode || null;
      if(resolvedBackup) {
        setBackupCode(resolvedBackup);
        try{ localStorage.setItem("backup_code", resolvedBackup); }catch{}
      }


      const code = resolvedBackup || data.familyCode;
      if(code) {
        try {
          const fSnap = await getDoc(doc(db,"families",code));
          if(fSnap.exists()) {
            const d = fSnap.data();
            if(d.children) {
              let cloud;
              try { cloud = JSON.parse(d.children); } catch(e) { cloud = null; }
              if(cloud) {
                const cloudIds = Object.keys(cloud);


                setChildren(prev => {
                  const merged = mergeChildren(prev, cloud);
                  const cloudHasNamedChild = cloudIds.some(id => cloud[id] && cloud[id].name);
                  if (cloudHasNamedChild) {
                    Object.keys(merged).forEach(id => {
                      if (!cloud[id]) {
                        const ch = merged[id];
                        const isBlank = !ch.name && !ch.dob &&
                          Object.values(ch.days||{}).every(d => !d || d.length === 0) &&
                          !(ch.weights||[]).length;
                        if (isBlank) delete merged[id];
                      }
                    });
                  }
                  return merged;
                });
                setChildren(prev => {
                  try{ localStorage.setItem("children_v1", JSON.stringify(prev)); }catch{}
                  return prev;
                });
                if(cloudIds.length) {
                  setActiveChildId(cloudIds[0]);
                  try{ localStorage.setItem("active_child", cloudIds[0]); }catch{}
                }
              }
            }
          }
        } catch(e){ console.warn("OBubba verifyLogin cloud pull error",e); }


        if(data.familyCode) {
          setFamilyCode(data.familyCode);
          try{ localStorage.setItem("family_code", data.familyCode); }catch{}
          subscribeToFamily(data.familyCode);
        }
      }

      setFamilyUsername(data.displayName || username.trim());
      try{ localStorage.setItem("family_username", data.displayName || username.trim()); }catch{}
      try{ localStorage.setItem("auth_verified","1"); }catch{}

      if(!restoreDone) setRestoreDone(true);
      return true;
    } catch(e) { setAuthError("Something went wrong — try again"); return false; }
  }


  function checkUsername(raw) {
    const val = raw.trim();
    setObUsername(raw);
    clearTimeout(obUsernameCheckRef.current);
    if(!val) { setObUsernameStatus("idle"); return; }
    if(val.length < 3) { setObUsernameStatus("invalid"); return; }
    setObUsernameStatus("checking");
    obUsernameCheckRef.current = setTimeout(async()=>{
      if(!window._fb) { setObUsernameStatus("idle"); return; }
      const {db, doc, getDoc} = window._fb;
      try {
        const snap = await getDoc(doc(db,"usernames",normaliseUsername(val)));
        setObUsernameStatus(snap.exists() ? "taken" : "available");
      } catch(e) { setObUsernameStatus("idle"); }
    }, 600);
  }

  function checkAuthUsername(raw) {
    const val = raw.replace(/[^a-zA-Z0-9_-]/g,"");
    setAuthUsername(val);
    setAuthError("");
    clearTimeout(authUsernameCheckRef.current);
    if(!val || val.length < 3) { setAuthUsernameStatus("idle"); return; }
    setAuthUsernameStatus("checking");
    authUsernameCheckRef.current = setTimeout(async()=>{
      if(!window._fb) { setAuthUsernameStatus("idle"); return; }
      const {db, doc, getDoc} = window._fb;
      try {
        const snap = await getDoc(doc(db,"usernames",normaliseUsername(val)));
        setAuthUsernameStatus(snap.exists() ? "found" : "notfound");
      } catch(e) { setAuthUsernameStatus("idle"); }
    }, 500);
  }


  async function reserveUsername(username, pin) {
    if(!window._fb || !username.trim()) return false;
    const {db, doc, setDoc, getDoc, serverTimestamp} = window._fb;
    const key = normaliseUsername(username);
    try {
      const snap = await getDoc(doc(db,"usernames",key));
      if(snap.exists()) return false;
      // Generate a fresh backup code for this new account — NEVER reuse existing codes
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let newCode;
      for(let attempt=0;attempt<20;attempt++){
        newCode = "BK"+Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
        const codeSnap = await getDoc(doc(db,"families",newCode));
        if(!codeSnap.exists()) break;
      }
      // Clear any previous account data from this device — CRITICAL for multi-account safety
      const blankChild = {id:uid(),name:"",dob:"",sex:"",unborn:false,days:{},weights:[],heights:[],photos:[],milestones:{}};
      setChildren({[blankChild.id]:blankChild});
      setActiveChildId(blankChild.id);
      try{ localStorage.setItem("children_v1", JSON.stringify({[blankChild.id]:blankChild})); }catch{}
      try{ localStorage.removeItem("family_code"); }catch{}
      setBackupCode(newCode);
      try{ localStorage.setItem("backup_code", newCode); }catch{}
      await setDoc(doc(db,"usernames",key), {
        pinHash: hashPin(pin||"0000"),
        backupCode: newCode,
        familyCode: null,
        createdAt: serverTimestamp(),
        displayName: username.trim()
      });
      setFamilyUsername(username.trim());
      setFamilyCode(null);
      try{ localStorage.setItem("family_username", username.trim()); }catch{}
      try{ localStorage.removeItem("family_code"); }catch{}
      try{ localStorage.setItem("auth_verified","1"); }catch{}
      trackEvent("username_created");
      return true;
    } catch(e) { console.warn("Reserve username error", e); return false; }
  }


  async function saveRecoveryWord(word) {
    if(!window._fb || !familyUsername || !word.trim()) return false;
    const {db, doc, setDoc} = window._fb;
    const key = normaliseUsername(familyUsername);
    try {
      await setDoc(doc(db,"usernames",key), {recoveryHash: hashPin(word.trim().toLowerCase())}, {merge:true});
      return true;
    } catch(e) { console.warn("Save recovery word error", e); return false; }
  }


  async function resetPinWithCode(username, wordOrCode, newPin) {
    if(!window._fb) return {ok:false, error:"Not connected"};
    const {db, doc, getDoc, setDoc} = window._fb;
    const key = normaliseUsername(username);
    try {
      const snap = await getDoc(doc(db,"usernames",key));
      if(!snap.exists()) return {ok:false, error:"Username not found"};
      const data = snap.data();
      const codeMatch = (data.backupCode||data.familyCode||"").toUpperCase() === wordOrCode.trim().toUpperCase();
      const wordMatch = data.recoveryHash && data.recoveryHash === hashPin(wordOrCode.trim().toLowerCase());
      if(!codeMatch && !wordMatch)
        return {ok:false, error:"That doesn't match — check your recovery word"};
      await setDoc(doc(db,"usernames",key), {pinHash: hashPin(newPin)}, {merge:true});
      return {ok:true};
    } catch(e) { return {ok:false, error:"Something went wrong — try again"}; }
  }


  async function joinByUsername(username) {
    if(!window._fb) return {ok:false, error:"Not connected"};
    const {db, doc, getDoc} = window._fb;
    const key = normaliseUsername(username.trim());
    try {
      const uSnap = await getDoc(doc(db,"usernames",key));
      if(!uSnap.exists()) return {ok:false, error:"Username not found — check the spelling"};
      const uData = uSnap.data();

      const codeToJoin = uData.familyCode || uData.backupCode;
      if(!codeToJoin) return {ok:false, error:"No data found for this username"};
      const fSnap = await getDoc(doc(db,"families",codeToJoin));
      if(!fSnap.exists()) return {ok:false, error:"No data found for this username"};
      const d = fSnap.data();
      if(d.children) setChildren(prev => mergeChildren(prev, JSON.parse(d.children)));
      setFamilyCode(codeToJoin);
      setFamilyUsername(uData.displayName || username.trim());
      try{ localStorage.setItem("family_code", codeToJoin); }catch{}
      try{ localStorage.setItem("family_username", uData.displayName || username.trim()); }catch{}
      subscribeToFamily(codeToJoin);
      trackEvent("username_joined");
      return {ok:true};
    } catch(e) { return {ok:false, error:"Something went wrong — please try again"}; }
  }


  useEffect(()=>{
    if(!fbReady || !familyUsername || !familyCode) return;
    (async()=>{
      if(!window._fb) return;
      const {db, doc, setDoc} = window._fb;
      const key = normaliseUsername(familyUsername);
      try {
        await setDoc(doc(db,"usernames",key), {familyCode}, {merge:true});
      } catch(e){}
    })();
  },[fbReady, familyUsername, familyCode]);


  function dedupEntries(entries) {
    const seen = new Set();
    const seenContentKeys = new Set();
    return entries.filter(e => {
      // First: dedup by content signature (catches entries with different IDs but same data)
      let contentKey;
      if (e.type === "nap")  contentKey = `nap|${e.start}|${e.end}`;
      else if (e.type === "feed" && e.feedType === "breast") contentKey = `breast|${e.time}|${e.breastL}|${e.breastR}`;
      else if (e.type === "feed") contentKey = `feed|${e.time}|${e.amount}`;
      else if (e.type === "poop") contentKey = `poop|${e.time}|${e.poopType}`;
      else if (e.type === "wake") contentKey = `wake|${e.time}|${e.night?'n':'d'}`;
      else if (e.type === "sleep") contentKey = `sleep|${e.time}`;
      else contentKey = `${e.type}|${e.time}`;
      if (seenContentKeys.has(contentKey)) return false;
      seenContentKeys.add(contentKey);

      // Second: legacy dedup by structural key
      let key;
      if (e.type === "nap")  key = `nap|${e.start}|${e.end}`;
      else if (e.type === "feed" && e.feedType === "breast") key = `breast|${e.time}|${e.breastL}|${e.breastR}`;
      else if (e.type === "feed") key = `feed|${e.time}|${e.amount}`;
      else if (e.type === "poop") key = `poop|${e.time}|${e.poopType}`;
      else key = `${e.type}|${e.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }


  function mergeChildren(localCh, remoteCh) {
    const merged = {...localCh};
    Object.entries(remoteCh).forEach(([id, child]) => {
      if(!merged[id]) {
        merged[id] = child;
      } else {

        const localDays = merged[id].days || {};
        const remoteDays = child.days || {};
        const mergedDays = {};
        const allDates = new Set([...Object.keys(localDays), ...Object.keys(remoteDays)]);
        allDates.forEach(date => {


          if(deletedDaysRef.current.has(id + ":" + date)) return;
          const lArr = localDays[date] || [];
          const rArr = remoteDays[date] || [];
          if(!lArr.length) { mergedDays[date] = dedupEntries(rArr); return; }
          if(!rArr.length) { mergedDays[date] = dedupEntries(lArr); return; }

          const seen = new Set(lArr.map(e=>e.id));
          const extra = rArr.filter(e=>e.id && !seen.has(e.id));
          mergedDays[date] = dedupEntries([...lArr, ...extra]);
        });

        const mergedWeights = [...(merged[id].weights||[])];
        const remoteWeights = child.weights || [];
        const seenW = new Set(mergedWeights.map(w=>w.date+w.kg));
        remoteWeights.forEach(w=>{ if(!seenW.has(w.date+w.kg)) mergedWeights.push(w); });

        // Merge heights
        const mergedHeights = [...(merged[id].heights||[])];
        const remoteHeights = child.heights || [];
        const seenH = new Set(mergedHeights.map(h=>h.date+h.cm));
        remoteHeights.forEach(h=>{ if(!seenH.has(h.date+h.cm)) mergedHeights.push(h); });

        // Merge photos (dedup by id)
        const mergedPhotos = [...(merged[id].photos||[])];
        const remotePhotos = child.photos || [];
        const seenP = new Set(mergedPhotos.map(p=>p.id));
        remotePhotos.forEach(p=>{ if(p.id && !seenP.has(p.id)) mergedPhotos.push(p); });

        merged[id] = {
          ...child,
          days: mergedDays,
          weights: mergedWeights,
          heights: mergedHeights,
          photos: mergedPhotos,
          milestones: {...(merged[id].milestones||{}), ...(child.milestones||{})}
        };
      }
    });
    return merged;
  }


  async function createChildSyncCode(childId) {
    if(!window._fb) return null;
    const {db, doc, getDoc, setDoc, serverTimestamp} = window._fb;
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code, exists = true;
    while(exists) {
      code = Array.from({length:6}, ()=>chars[Math.floor(Math.random()*chars.length)]).join("");
      try{ const s = await getDoc(doc(db,"child_syncs",code)); exists = s.exists(); }
      catch{ exists = false; }
    }
    const child = children[childId];

    await setDoc(doc(db,"child_syncs",code), {
      childId,
      childName: child?.name || "",
      ownerUid: window._fbUid || "",
      ownerUsername: familyUsername || "",
      child: JSON.stringify(child),
      updatedAt: serverTimestamp(),
      updatedBy: window._fbUid || ""
    });
    setChildSyncCodes(prev => ({...prev, [childId]: code}));
    subscribeToChildSync(childId, code);
    trackEvent("child_sync_created");
    return code;
  }


  async function pushChildSync(childId, code, childData) {
    if(!window._fb || !code) return;
    const {db, doc, setDoc, serverTimestamp} = window._fb;
    const child = childData || children[childId];
    if(!child) return;
    if(!window._fbUid) {
      await new Promise(resolve => {
        let waited = 0;
        const poll = setInterval(() => {
          waited += 200;
          if(window._fbUid || waited >= 5000) { clearInterval(poll); resolve(); }
        }, 200);
      });
    }
    try {
      await setDoc(doc(db,"child_syncs",code), {
        child: JSON.stringify(child),
        childName: child.name || "",
        updatedAt: serverTimestamp(),
        updatedBy: window._fbUid || "anon",
        writeToken: writeTokenRef.current
      }, {merge:true});
    } catch(e) { console.warn("pushChildSync error", e); }
  }


  const subscribeToChildSync = React.useCallback((childId, code) => {
    if(!window._fb || !code) return;

    if(childSubsRef.current[childId]) childSubsRef.current[childId]();
    const {db, doc, onSnapshot} = window._fb;
    const unsub = onSnapshot(doc(db,"child_syncs",code), (snap) => {
      if(!snap.exists()) return;
      const d = snap.data();

      if(d.writeToken && d.writeToken === writeTokenRef.current) return;
      if(d.updatedBy && window._fbUid && d.updatedBy === window._fbUid) return;
      try {
        if(d.child) {
          const remoteChild = JSON.parse(d.child);
          setChildren(prev => {
            const existing = prev[childId];
            if(!existing) {

              return {...prev, [childId]: {...remoteChild, id: childId}};
            }

            const mergedDays = {...(existing.days||{})};
            Object.entries(remoteChild.days||{}).forEach(([date, entries]) => {
              const local = mergedDays[date] || [];
              if(!local.length){ mergedDays[date] = entries; return; }
              const seen = new Set(local.map(e=>e.id));
              const extra = (entries||[]).filter(e=>e.id && !seen.has(e.id));
              if(extra.length) {
                const dt2=new Date(date+"T12:00:00"); dt2.setDate(dt2.getDate()-1);
                const prevD3=dt2.toISOString().slice(0,10);
                mergedDays[date] = autoClassifyNight([...local, ...extra], mergedDays[prevD3]||null);
              }
            });
            return {...prev, [childId]: {...remoteChild, id:childId, days:mergedDays}};
          });
        }
      } catch(e) { console.warn("Child sync apply error", e); }
    });
    childSubsRef.current[childId] = unsub;
  }, []);


  async function joinChildByCode(code) {
    if(!window._fb) return {ok:false, error:"Not connected"};
    const {db, doc, getDoc} = window._fb;
    const clean = code.trim().toUpperCase();
    if(clean.length !== 6) return {ok:false, error:"Code must be 6 characters"};
    try {
      const snap = await getDoc(doc(db,"child_syncs",clean));
      if(!snap.exists()) return {ok:false, error:"Code not found — ask the other parent to check"};
      const d = snap.data();
      const childId = d.childId;
      if(!childId) return {ok:false, error:"Invalid sync code"};

      setChildren(prev => {
        if(prev[childId]) return prev;
        let remoteChild = {};
        try{ remoteChild = d.child ? JSON.parse(d.child) : {}; }catch{}
        return {...prev, [childId]: {...remoteChild, id: childId}};
      });
      setChildSyncCodes(prev => ({...prev, [childId]: clean}));
      subscribeToChildSync(childId, clean);
      trackEvent("child_sync_joined");
      return {ok:true, childName: d.childName || "child"};
    } catch(e) { return {ok:false, error:"Something went wrong — please try again"}; }
  }


  function unlinkChild(childId) {
    if(childSubsRef.current[childId]) {
      childSubsRef.current[childId]();
      delete childSubsRef.current[childId];
    }
    setChildSyncCodes(prev => {const n={...prev};delete n[childId];return n;});
    setChildren(prev => {const n={...prev};delete n[childId];return n;});
  }


  useEffect(()=>{
    if(!fbReady) return;
    Object.entries(childSyncCodes).forEach(([childId, code]) => {
      subscribeToChildSync(childId, code);
    });
    return ()=>{
      Object.values(childSubsRef.current).forEach(unsub=>unsub());
      childSubsRef.current={};
    };
  },[fbReady]);


  useEffect(()=>{
    if(!fbReady) return;
    clearTimeout(syncRef.current);

    const childrenSnapshot = children;
    syncRef.current = setTimeout(()=>{
      Object.entries(childSyncCodes).forEach(([childId, code]) => {
        pushChildSync(childId, code, childrenSnapshot[childId]);
      });
    }, 2000);
    return ()=>clearTimeout(syncRef.current);
  },[fbReady, children, childSyncCodes]);


  function addChild(name, dob, sex, unborn) {
    const cid = uid();
    const d = {}; d[todayStr()] = [];
    setChildren(prev => ({
      ...prev,
      [cid]: { id:cid, name, dob, sex, unborn, days:d, weights:[], heights:[], photos:[], milestones:{} }
    }));
    setActiveChildId(cid);
    trackEvent("child_added");
    return cid;
  }


  function deleteChild(cid) {
    setChildren(prev => {
      const next = {...prev};
      delete next[cid];
      return next;
    });
    const remaining = childIds.filter(id => id !== cid);
    if(remaining.length > 0) setActiveChildId(remaining[0]);
  }


  const swipeStartX = React.useRef(null);
  const swipeStartY = React.useRef(null);
  function handleSwipeStart(e) {
    const t = e.touches ? e.touches[0] : e;
    swipeStartX.current = t.clientX;
    swipeStartY.current = t.clientY;
  }
  function handleSwipeEnd(e) {
    if(swipeStartX.current === null) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dx = swipeStartX.current - t.clientX;
    const dy = Math.abs(swipeStartY.current - t.clientY);
    swipeStartX.current = null; swipeStartY.current = null;
    if(Math.abs(dx) < 80 || dy > Math.abs(dx) * 0.6) return;
    const idx = childIds.indexOf(resolvedActiveId);
    if(dx > 0 && idx < childIds.length-1) setActiveChildId(childIds[idx+1]);
    else if(dx < 0 && idx > 0) setActiveChildId(childIds[idx-1]);
  }


  const[showAddChild,setShowAddChild]=useState(false);
  const[newChildName,setNewChildName]=useState("");
  const[newChildDob,setNewChildDob]=useState("");
  const[newChildSex,setNewChildSex]=useState("");
  const[newChildUnborn,setNewChildUnborn]=useState(false);
  useEffect(()=>{
    if(napOn)timerRef.current=setInterval(()=>setNapSec(s=>s+1),1000);
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[napOn]);


  useEffect(()=>{
    if(breastActive && breastSide){
      breastRef.current=setInterval(()=>{
        setBreastSec(s=>({...s,[breastSide]:s[breastSide]+1}));
      },1000);
    } else {
      clearInterval(breastRef.current);
    }
    return()=>clearInterval(breastRef.current);
  },[breastActive,breastSide]);


  useEffect(()=>{try{localStorage.setItem("nap_on",napOn?"1":"0");}catch{}},[ napOn]);
  useEffect(()=>{try{localStorage.setItem("timer_mode_v1",timerMode);}catch{}},[timerMode]);
  useEffect(()=>{try{if(napStartT)localStorage.setItem("nap_startT",napStartT);else localStorage.removeItem("nap_startT");}catch{}},[ napStartT]);
  useEffect(()=>{try{localStorage.setItem("nap_sec",String(napSec));}catch{}},[napSec]);


  useEffect(()=>{try{if(breastStartTime)localStorage.setItem("breast_startTime",breastStartTime);else localStorage.removeItem("breast_startTime");}catch{}},[breastStartTime]);
  useEffect(()=>{try{if(breastSide)localStorage.setItem("breast_side",breastSide);else localStorage.removeItem("breast_side");}catch{}},[breastSide]);
  useEffect(()=>{try{localStorage.setItem("breast_sec",JSON.stringify(breastSec));}catch{}},[breastSec]);
  useEffect(()=>{try{localStorage.setItem("breast_active",breastActive?"1":"0");}catch{}},[breastActive]);


  const age = React.useMemo(() => calcAge(babyDob), [babyDob]);


  const tickDataRef = React.useRef({});
  React.useEffect(()=>{
    const ageWeeks = age ? age.totalWeeks : null;
    const napProfileTick = getAgeNapProfile(ageWeeks);
    // If bridge nap is scheduled, add 1 to expected naps so countdown shows "Next Nap" instead of "Bedtime in"
    const expectedNaps = napProfileTick.expectedNaps + (bridgeNapScheduled ? 1 : 0);
    const bed = bedtimePrediction();
    const pred = predictNextNap();
    const hasBedtime = (days[selDay]||[]).some(e => e.type==="sleep" && !e.night);
    const napsDone = (days[selDay]||[]).filter(e=>e.type==="nap"&&!e.night).length;
    const bedMins = bed ? (()=>{ const [bh,bm]=bed.time.split(":").map(Number); return bh*60+bm; })() : null;
    tickDataRef.current = { hasBedtime, bed, bedMins, napsDone, expectedNaps, pred };
  },[selDay, days, age, bridgeNapScheduled]);


  const countdownRef = React.useRef(null);
  useEffect(()=>{
    // Bug 1 Fix: timerMode-aware tick
    // activeSleep mode: counts up every second (handled by existing napSec interval)
    // prediction mode: counts down to next nap/bedtime, updates every 60s
    // Both handle midnight rollover and restore from localStorage on reload

    if (timerMode === "activeSleep") {
      // Active sleep tracking — napSec interval handles the upward count
      // Just clear any stale prediction countdowns
      setNapCountdown(null);
      setBedCountdown(null);
      clearInterval(countdownRef.current);
      return;
    }

    // Prediction countdown mode
    function tick(){
      const now = new Date();
      // Bug 1: midnight rollover — compute nowMins fresh each tick
      const nowMins = now.getHours()*60 + now.getMinutes();
      const { hasBedtime, bed, bedMins, napsDone, expectedNaps, pred } = tickDataRef.current;

      const napsComplete = napsDone >= expectedNaps;

      // Bug 1: clamp minsUntilBed to 0 (no negative)
      const minsUntilBed = bedMins !== null ? Math.max(0, bedMins - nowMins) : null;

      const bedtimeConditionMet = napsComplete && !hasBedtime && bed;

      if (hasBedtime) {
        setNapCountdown(null);
        setBedCountdown(null);
        return;
      }

      if (bedtimeConditionMet) {
        setNapCountdown(null);
        // Bug 1: bedtime countdown in seconds, clamped ≥ 0
        setBedCountdown(Math.round(minsUntilBed * 60));
        return;
      }

      setBedCountdown(null);
      if (pred) {
        if (pred.isOverdue) {
          setNapCountdown(0);
        } else {
          const [h,m] = pred.napStart_min.split(":").map(Number);
          const target = new Date();
          target.setHours(h,m,0,0);
          // Bug 1: handle midnight rollover (target may be next day)
          let diff = Math.round((target - now)/1000);
          // Only roll over midnight if target hour is small (genuinely next-day)
          // NOT if prediction is simply overdue — that would show "nap in 20hrs"
          if (diff < 0) {
            const targetH = h;
            const nowH = now.getHours();
            // Only add 24h if target is early morning and now is late night (genuine midnight cross)
            if (targetH < 6 && nowH >= 20) {
              const targetNext = new Date(target.getTime() + 24*60*60*1000);
              diff = Math.round((targetNext - now)/1000);
            } else {
              // Prediction is overdue — show as 0 (Now!)
              diff = 0;
            }
          }
          setNapCountdown(Math.max(0, diff));
        }
      } else {
        setNapCountdown(-1);
      }
    }

    tick();
    // Store target timestamps for drift-free countdown
    let napTarget = null, bedTarget = null;
    const storeTargets = () => {
      const now = Date.now();
      // Capture current countdown values as absolute targets
      // This way, even after screen lock, we calculate correctly from Date.now()
    };
    countdownRef.current = setInterval(()=>{
      tick(); // Full recalculation every second — uses Date.now() internally so no drift
    }, 1000);
    return()=>clearInterval(countdownRef.current);
  },[selDay, days, age, timerMode]);


  function getAgeStage(){
    if(!age) return null;
    const w=age.totalWeeks;
    if(w<6)   return{stage:"newborn",label:"Newborn",weeks:w,feedUnit:"ml",showSolids:false,napGoal:"4-6 naps",feedGoal:"8-12 feeds/day",nightNote:"Wake every 2-3h is normal",tip:"Tiny tummy — feed on demand, log every feed."};
    if(w<13)  return{stage:"infant",label:"Young Infant",weeks:w,feedUnit:"ml",showSolids:false,napGoal:"4-5 naps",feedGoal:"6-8 feeds/day",nightNote:"Stretches of 3-4h emerging",tip:"Watch for wake windows of 45-60 min."};
    if(w<26)  return{stage:"3to6mo",label:"3–6 Months",weeks:w,feedUnit:"ml",showSolids:false,napGoal:"3-4 naps",feedGoal:"5-6 feeds/day",nightNote:"Some babies sleep 5-6h stretches",tip:"Consolidation beginning — longer naps likely."};
    if(w<39)  return{stage:"6to9mo",label:"6–9 Months",weeks:w,feedUnit:"ml",showSolids:true,napGoal:"2-3 naps",feedGoal:"4-5 milk + solids 1-2x",nightNote:"Night feeds reducing",tip:"Starting solids! Log meals separately from milk."};
    if(w<52)  return{stage:"9to12mo",label:"9–12 Months",weeks:w,feedUnit:"ml",showSolids:true,napGoal:"2 naps",feedGoal:"3-4 milk + solids 3x",nightNote:"Most can sleep through",tip:"Nap consolidation to 2 naps likely."};
    if(w<78)  return{stage:"1year",label:"1–1.5 Years",weeks:w,feedUnit:"g/portion",showSolids:true,napGoal:"1-2 naps",feedGoal:"3 meals + 2 snacks",nightNote:"One wake at most is common",tip:"Watch for 2→1 nap transition around 15-18 months."};
    if(w<104) return{stage:"18mo",label:"1.5–2 Years",weeks:w,feedUnit:"portion",showSolids:true,napGoal:"1 nap",feedGoal:"3 meals + 2 snacks",nightNote:"Should sleep through most nights",tip:"Language is exploding — name everything you see together."};
    if(w<156) return{stage:"toddler",label:"2–3 Years",weeks:w,feedUnit:"portion",showSolids:true,napGoal:"1 nap (may drop)",feedGoal:"3 meals + snacks",nightNote:"Should sleep through",tip:"Nap may drop around 2.5–3 years. Imagination and pretend play are taking off."};
    return      {stage:"preschool",label:"3+ Years",weeks:w,feedUnit:"portion",showSolids:true,napGoal:"Quiet time / optional nap",feedGoal:"3 meals + snacks",nightNote:"Sleeping through expected",tip:"Big conversations, big feelings — keep reading together daily."};
  }
  const ageStage = getAgeStage();

  const today_str = todayStr();
  const dayKeys=Object.keys(days).sort().filter(d => d <= today_str);
  const displayDayKeys=[...Object.keys(days).sort()].reverse();
  const entries=days[selDay]||[];
  const _bedtimeCount = entries.filter(e=>e.type==="sleep").length;

  // Auto-reclassify night entries whenever entries or selected day changes
  React.useEffect(()=>{
    if(!entries.length) return;
    const hasBed = entries.some(e=>e.type==="sleep"&&!e.night);
    if(!hasBed) return;
    const prevD = (()=>{const dt=new Date(selDay+"T12:00:00");dt.setDate(dt.getDate()-1);return dt.toISOString().split("T")[0];})();
    const reclassified = autoClassifyNight([...entries], days[prevD]||null);
    let changed = false;
    for(let i=0;i<reclassified.length;i++){
      if(reclassified[i].night !== entries[i]?.night){ changed=true; break; }
    }
    if(changed) setDays(d=>({...d,[selDay]:reclassified}));
  },[selDay, entries.length, _bedtimeCount]);

  const dayE=entries.filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
  const nightE=(()=>{
    const raw=entries.filter(e=>e.night);
    // Sort chronologically from bedtime: PM wakes first, then AM (cross-midnight)
    const bedEntry=entries.find(e=>e.type==="sleep"&&!e.night);
    const bedMins=bedEntry?timeVal(bedEntry):22*60;
    return raw.sort((a,b)=>{
      const ta=timeVal(a), tb=timeVal(b);
      // Assign sort key: times >= bedMins stay as-is (evening), times < 12:00 get +1440 (post-midnight)
      const ka = ta >= bedMins ? ta : (ta < 12*60 ? ta + 1440 : ta);
      const kb = tb >= bedMins ? tb : (tb < 12*60 ? tb + 1440 : tb);
      return ka - kb;
    });
  })();
  const totalMl=entries.filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0);
  const naps=dayE.filter(e=>e.type==="nap");
  const napMins=naps.reduce((s,n)=>s+minDiff(n.start,n.end),0);
  const wins=getAwakeWindows(entries);
  const last7=dayKeys.slice(-7);
  const wStats=last7.map(d=>{
    const es=days[d]||[];
    const ml=es.filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0);
    const ns=es.filter(e=>!e.night&&e.type==="nap");
    return{date:d,ml,napM:ns.reduce((s,n)=>s+minDiff(n.start,n.end),0),naps:ns.length,nightW:es.filter(e=>e.night).length};
  });
  const avgMl=last7.length?Math.round(wStats.reduce((s,x)=>s+x.ml,0)/last7.length):0;
  const maxMl=Math.max(...wStats.map(x=>x.ml),1);
  const maxNapBar=Math.max(...wStats.map(x=>x.napM),1);
  const chunk=(arr,n)=>{const r=[];for(let i=0;i<arr.length;i+=n)r.push(arr.slice(i,i+n));return r;};
  const trendWeeks=chunk(dayKeys,7);
  const weekAvgs=trendWeeks.map(wk=>{
    const mlA=wk.map(d=>(days[d]||[]).filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0));
    const napA=wk.map(d=>{const ns=(days[d]||[]).filter(e=>e.type==="nap"&&!e.night);return ns.reduce((s,n)=>s+minDiff(n.start,n.end),0);});
    const nightA=wk.map(d=>(days[d]||[]).filter(e=>e.night).length);
    return{label:`${fmtDate(wk[0])}–${fmtDate(wk[wk.length-1])}`,days:wk.length,avgMl:avgArr(mlA),avgNap:avgArr(napA),avgNight:avgArr(nightA)};
  });
  const tLast=weekAvgs[weekAvgs.length-1];
  const tPrev=weekAvgs[weekAvgs.length-2];
  const mlVals=dayKeys.map(d=>(days[d]||[]).filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0));
  const napVals=dayKeys.map(d=>{const ns=(days[d]||[]).filter(e=>e.type==="nap"&&!e.night);return ns.reduce((s,n)=>s+minDiff(n.start,n.end),0);});

  function arrow(curr,prev){
    if(prev==null)return null;
    const d=curr-prev;
    if(Math.abs(d)<5)return{icon:"→",color:C.lt};
    return d>0?{icon:"↑",color:C.mint}:{icon:"↓",color:C.ter};
  }

  function getWakeWindow(ageWeeks) {
    // Age-adaptive wake windows with hard guardrails (Bug 3 fix)
    // Returns {min, max, label} in minutes
    const months = ageWeeks / 4.33;
    let min, max, label;
    if (months < 3)       { min=45;  max=75;  label="45–75 min"; }
    else if (months < 5)  { min=75;  max=150; label="1.25–2.5 hrs"; }
    else if (months < 8)  { min=120; max=180; label="2–3 hrs"; }
    else if (months < 11) { min=150; max=210; label="2.5–3.5 hrs"; }
    else if (months < 15) { min=180; max=240; label="3–4 hrs"; }
    else if (months < 19) { min=240; max=300; label="4–5 hrs"; }
    else if (months < 25) { min=300; max=360; label="5–6 hrs"; }
    else                  { min=300; max=420; label="5–7 hrs"; }
    return { min, max, label, midpoint: Math.round((min+max)/2) };
  }


  function getAgeNapProfile(ageWeeks) {
    if (!ageWeeks) return { expectedNaps:3, idealNapDurMin:30, idealNapDurMax:90, idealTotalMin:120, idealTotalMax:240 };
    if (ageWeeks < 6)  return { expectedNaps:5, idealNapDurMin:20, idealNapDurMax:60,  idealTotalMin:240, idealTotalMax:360 };
    if (ageWeeks < 13) return { expectedNaps:4, idealNapDurMin:30, idealNapDurMax:90,  idealTotalMin:180, idealTotalMax:300 };
    if (ageWeeks < 26) return { expectedNaps:3, idealNapDurMin:40, idealNapDurMax:90,  idealTotalMin:150, idealTotalMax:240 };
    if (ageWeeks < 39) return { expectedNaps:2, idealNapDurMin:60, idealNapDurMax:120, idealTotalMin:120, idealTotalMax:210 };
    if (ageWeeks < 52) return { expectedNaps:2, idealNapDurMin:60, idealNapDurMax:120, idealTotalMin:120, idealTotalMax:180 };
    if (ageWeeks < 78) return { expectedNaps:1, idealNapDurMin:60, idealNapDurMax:120, idealTotalMin:60,  idealTotalMax:120 };
    return               { expectedNaps:1, idealNapDurMin:60, idealNapDurMax:90,  idealTotalMin:60,  idealTotalMax:90  };
  }
  function addMinutes(time, mins) {
    if(!time) return "00:00";
    const [h,m] = time.split(":").map(Number);
    const total = h*60 + m + mins;
    const hh = Math.floor(total/60)%24;
    const mm = total%60;
    return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }

  function minutesUntil(timeStr) {
    if (!timeStr) return null;
    const now = new Date();
    const [h,m] = timeStr.split(":").map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    let diff = Math.round((target - now) / 60000);
    if (diff < 0) diff = 0;
    return diff;
  }

  function predictNextNap() {
    const ageWeeks = age ? age.totalWeeks : null;
    if (!ageWeeks || !selDay) return null;

    const hasBedtime = (days[selDay]||[]).some(e => e.type==="sleep" && !e.night);
    if (hasBedtime) return null;

    // Bug 4: check expected nap count by age — if all done, no more naps
    // But if bridge nap is scheduled, allow one extra nap
    const napProfile2 = getAgeNapProfile(ageWeeks);
    const adjustedExpected = napProfile2.expectedNaps + (bridgeNapScheduled ? 1 : 0);
    const napsDoneToday = (days[selDay]||[]).filter(e => e.type==="nap" && !e.night).length;
    if (napsDoneToday >= adjustedExpected) return null;

    // Bug 3: age-appropriate wake window guardrails
    const ww = getWakeWindow(ageWeeks);
    const fallback = ww.midpoint;

    // Bug 3: blend personal average (last 5 days) with age guidance
    let wakeWindowMin, wakeWindowMax, sourceLabel;
    const loggedDays = Object.keys(days).filter(d => (days[d]||[]).some(e=>!e.night)).sort();
    const napDays = loggedDays.filter(d => (days[d]||[]).some(e => e.type==="nap" && !e.night && e.start && e.end));

    if (usePersonalRecs === true && napDays.length >= 5) {
      // Personal mode: blend baby's avg with age guidance
      const recent5 = napDays.slice(-5);
      let windows = [];
      recent5.forEach(d => {
        const ws = getAwakeWindows(days[d]||[]);
        ws.forEach(w => { if (w.mins && w.mins >= 20 && w.mins <= ww.max * 1.3) windows.push(w.mins); });
      });
      if (windows.length >= 3) {
        const sorted2 = [...windows].sort((a,b)=>a-b);
        const trim = Math.max(1, Math.floor(sorted2.length * 0.1));
        const trimmed = sorted2.slice(trim, sorted2.length - trim);
        const babyAvgWW = Math.round(trimmed.reduce((a,b)=>a+b,0) / trimmed.length);
        // Bug 3 Step 4: blend 60% personal + 40% age midpoint, then clamp to [min, max]
        const blended = Math.round(0.6 * babyAvgWW + 0.4 * fallback);
        const clamped = Math.max(ww.min, Math.min(ww.max, blended));
        wakeWindowMin = Math.max(ww.min, Math.round(clamped * 0.9));
        wakeWindowMax = Math.min(ww.max, Math.round(clamped * 1.1));
        sourceLabel = `${possessive(babyName||"Baby")} personal avg (${babyAvgWW}min blended with age guidance)`;
      } else {
        wakeWindowMin = ww.min; wakeWindowMax = ww.max;
        sourceLabel = `age-appropriate wake windows for ${fmtAge(age)}`;
      }
    } else if (usePersonalRecs !== true && napDays.length >= 7) {
      // NHS mode with historical context
      const recent7 = napDays.slice(-7);
      let windows = [];
      recent7.forEach(d => {
        const ws = getAwakeWindows(days[d]||[]);
        ws.forEach(w => { if (w.mins && w.mins >= 20 && w.mins <= ww.max * 1.3) windows.push(w.mins); });
      });
      if (windows.length >= 3) {
        const sorted2 = [...windows].sort((a,b)=>a-b);
        const trim = Math.max(1, Math.floor(sorted2.length * 0.1));
        const trimmed = sorted2.slice(trim, sorted2.length - trim);
        const avgWindow = Math.round(trimmed.reduce((a,b)=>a+b,0) / trimmed.length);
        // Bug 3 Step 5: clamp to age-appropriate range — prevents 9hr window bug
        const clamped = Math.max(ww.min, Math.min(ww.max, avgWindow));
        wakeWindowMin = Math.max(ww.min, Math.round(clamped * 0.88));
        wakeWindowMax = Math.min(ww.max, Math.round(clamped * 1.12));
        sourceLabel = `your avg wake window (${avgWindow}min) · last 7 days`;
      } else {
        wakeWindowMin = ww.min; wakeWindowMax = ww.max;
        sourceLabel = `age-appropriate wake windows for ${fmtAge(age)}`;
      }
    } else {
      wakeWindowMin = ww.min; wakeWindowMax = ww.max;
      sourceLabel = `age-appropriate wake windows for ${fmtAge(age)}`;
    }

    // Bug 5: find last awake start from sorted entries
    const sorted = [...(days[selDay]||[])].filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
    if (!sorted.length) return null;

    // Bug 5: nap cannot be before baby's wake time
    const wakeEntry = sorted.find(e => e.type==="wake");
    if (!wakeEntry) return null; // require wake to be logged for prediction

    let lastAwakeStart = null;
    sorted.forEach(function(e) {
      if (e.type==="wake") lastAwakeStart = e.time;
      if (e.type==="nap" && e.end) lastAwakeStart = e.end;
      // If nap has start but no end (nap currently running), use start as anchor
      // so prediction doesn't revert to morning wake time
      else if (e.type==="nap" && e.start && !e.end) lastAwakeStart = e.start;
    });
    if (!lastAwakeStart) return null;

    // Bug 5: minimum 30 min after waking
    const [law_h, law_m] = lastAwakeStart.split(":").map(Number);
    const lastAwakeMins = law_h*60 + law_m;
    const earliestNapMins = lastAwakeMins + 30;
    const rawMinMins = lastAwakeMins + wakeWindowMin;
    const rawMaxMins = lastAwakeMins + wakeWindowMax;

    // Enforce 30-min minimum
    const finalMinMins = Math.max(rawMinMins, earliestNapMins);
    const finalMaxMins = Math.max(rawMaxMins, finalMinMins + 15);

    const napStart_min = (()=>{ const h=Math.floor(finalMinMins/60)%24; const m=finalMinMins%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; })();
    const napStart_max = (()=>{ const h=Math.floor(finalMaxMins/60)%24; const m=finalMaxMins%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; })();

    const now = new Date();
    const nowMins = now.getHours()*60 + now.getMinutes();
    const isOverdue = nowMins > finalMaxMins;

    if (!isOverdue) {
      const bed = bedtimePrediction();
      if (bed) {
        const [bh, bm] = bed.time.split(":").map(Number);
        const bedMins = bh*60 + bm;
        // Bug 4: if predicted nap is within 90 min of bedtime, skip to bedtime
        if (bedMins - finalMinMins < 90) return null;
        // Bug 4: also skip if nap end would be too close to bedtime
        if (bedMins - finalMinMins < wakeWindowMax) return null;
      }
    }

    // Bug 5: final sanity — nap must not exceed maxWake; fall back to midpoint if violated
    if (wakeWindowMax > ww.max || wakeWindowMin < 30) {
      wakeWindowMin = ww.min;
      wakeWindowMax = ww.max;
      sourceLabel += " (safety fallback)";
    }
    // Age-aware hard cap: predicted nap must not start beyond ww.max + 20% tolerance from last awake
    // This catches erroneous predictions without clipping legitimate long wake windows for older toddlers
    const AGE_CAP = Math.round(ww.max * 1.2);
    if (finalMinMins - lastAwakeMins > AGE_CAP) {
      const safeMid = lastAwakeMins + ww.midpoint;
      const safeMax = lastAwakeMins + ww.max;
      const capStart = (()=>{ const h=Math.floor(safeMid/60)%24; const m=safeMid%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; })();
      return { napStart_min: capStart, napStart_max: (()=>{ const h=Math.floor(safeMax/60)%24; const m=safeMax%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; })(), wakeWindowMin:ww.min, wakeWindowMax:ww.max, sourceLabel: `age-appropriate wake windows for ${fmtAge(age)} (capped)`, lastAwakeStart, isOverdue: true };
    }
    // Extra hard cap: predicted nap window must not start more than ww.max from last awake start
    if (finalMinMins - lastAwakeMins > ww.max) {
      const safeMid = lastAwakeMins + ww.midpoint;
      const safeMin = lastAwakeMins + ww.min;
      const safeMax = lastAwakeMins + ww.max;
      const capStart = (()=>{ const h=Math.floor(safeMid/60)%24; const m=safeMid%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; })();
      return { napStart_min: capStart, napStart_max: (()=>{ const h=Math.floor(safeMax/60)%24; const m=safeMax%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; })(), wakeWindowMin:ww.min, wakeWindowMax:ww.max, sourceLabel: `age-appropriate wake windows for ${fmtAge(age)} (capped)`, lastAwakeStart, isOverdue };
    }

    return { napStart_min, napStart_max, wakeWindowMin, wakeWindowMax, sourceLabel, lastAwakeStart, isOverdue };
  }


  function sleepScore() {
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type === "nap" && !e.night);
    const napMinutes = todayNaps.reduce((s, n) => s + minDiff(n.start, n.end), 0);
    const nightWakes = today.filter(e => e.night).length;
    const ageWeeks = age ? age.totalWeeks : null;
    const ww = ageWeeks ? getWakeWindow(ageWeeks) : null;

    let score = 100;

    const idealNapMin = ww ? Math.min(ww.min * todayNaps.length, 240) : 120;
    if (napMinutes < idealNapMin) score -= 20;
    else if (napMinutes > 240) score -= 10;

    if (nightWakes > 3) score -= 20;
    else if (nightWakes === 0 && todayNaps.length > 0) score += 5;

    const dayWins = getAwakeWindows(today);
    if (dayWins.length > 0) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  function sleepScoreColor(score) {
    if (score >= 80) return C.mint;
    if (score >= 55) return C.gold;
    return C.ter;
  }
  function bedtimePrediction() {
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type === "nap" && !e.night);
    if (!todayNaps.length) return null;
    if (!age) return null;

    const napProfile = getAgeNapProfile(age.totalWeeks);
    const adjustedExpectedBed = napProfile.expectedNaps + (bridgeNapScheduled ? 1 : 0);
    if (todayNaps.length < adjustedExpectedBed) return null;
    const ww = getWakeWindow(age.totalWeeks);
    const lastNap = todayNaps[todayNaps.length - 1];
    if (!lastNap.end) return null;


    const pastDays = Object.keys(days).sort().filter(d => d !== selDay).slice(-14);
    const loggedBedtimes = pastDays
      .map(d => (days[d]||[]).find(e => e.type==="sleep" && !e.night))
      .filter(Boolean)
      .map(e => { const [h,m] = e.time.split(":").map(Number); return h*60+m; });

    let baseBedMins;
    let bedSource;
    if (loggedBedtimes.length >= 3) {

      const sorted = [...loggedBedtimes].sort((a,b)=>a-b);
      const trim = Math.floor(sorted.length * 0.15);
      const trimmed = sorted.slice(trim, sorted.length - trim);
      baseBedMins = Math.round(trimmed.reduce((a,b)=>a+b,0) / trimmed.length);
      bedSource = "avg";
    } else {

      const [lh,lm] = lastNap.end.split(":").map(Number);
      baseBedMins = lh*60+lm + ww.max;
      bedSource = "age";
    }


    const lastNapMins = minDiff(lastNap.start, lastNap.end);
    let adjustMins = 0;
    let adjustReason = null;

    if (lastNapMins < 20) {

      adjustMins = -30;
      adjustReason = `Last nap only ${lastNapMins}min — moved earlier to avoid overtiredness`;
    } else if (lastNapMins < 40) {
      adjustMins = -15;
      adjustReason = `Short last nap (${lastNapMins}min) — slightly earlier bedtime`;
    } else if (lastNapMins > 90) {

      adjustMins = +15;
      adjustReason = `Long last nap (${lastNapMins}min) — bedtime shifted slightly later`;
    }


    const [lh2,lm2] = lastNap.end.split(":").map(Number);
    const lastNapEndMins = lh2*60+lm2;
    const earliestBed = lastNapEndMins + ww.min;
    const latestBed   = lastNapEndMins + ww.max;
    const finalMins = Math.min(latestBed, Math.max(earliestBed, baseBedMins + adjustMins));

    const hh = Math.floor(finalMins/60)%24;
    const mm = finalMins%60;
    const bedTime = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;

    return { time: bedTime, adjustReason, bedSource, baseBedMins, adjustMins };
  }

  function sleepAdvice() {
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type === "nap" && !e.night);
    const napMinutes = todayNaps.reduce((s, n) => s + minDiff(n.start, n.end), 0);
    if (napMinutes === 0) return "No naps logged yet today.";
    if (!age) {
      const hrs = (napMinutes / 60).toFixed(1);
      return `Baby napped ${hrs}h today.`;
    }
    const p = getAgeNapProfile(age.totalWeeks);
    const adjustedExpectedAdv = p.expectedNaps + (bridgeNapScheduled ? 1 : 0);
    const hrs = (napMinutes / 60).toFixed(1);
    const napsDone = todayNaps.length;
    const napsComplete = napsDone >= adjustedExpectedAdv;


    const shortNaps = todayNaps.filter(n => minDiff(n.start, n.end) < p.idealNapDurMin && minDiff(n.start, n.end) > 0);
    const longNaps  = todayNaps.filter(n => minDiff(n.start, n.end) > p.idealNapDurMax);

    if (!napsComplete) {
      const remaining = adjustedExpectedAdv - napsDone;
      return `${napsDone} of ${adjustedExpectedAdv} naps done (${hrs}h). ${remaining} more nap${remaining>1?"s":""} expected${bridgeNapScheduled?" (incl. bridge nap)":""} — keep going before bedtime.`;
    }


    if (napMinutes < p.idealTotalMin) {
      const shortfall = Math.round(p.idealTotalMin - napMinutes);
      if (shortNaps.length) {
        return `Total nap time ${hrs}h — a little under the ~${Math.round(p.idealTotalMin/60*10)/10}h ideal for this age. Naps were a little shorter than usual — try an earlier bedtime tonight.`;
      }
      return `Total nap time ${hrs}h — a little under the ~${Math.round(p.idealTotalMin/60*10)/10}h ideal. Move bedtime earlier by 20–30 mins to avoid overtiredness.`;
    }
    if (napMinutes > p.idealTotalMax) {
      return `Total nap time ${hrs}h — above the ~${Math.round(p.idealTotalMax/60*10)/10}h ideal for this age. Baby may not be tired at the usual time — push bedtime 15–30 mins later.`;
    }
    if (longNaps.length && napsDone === 1) {
      return `${hrs}h nap — well within range for this age. Sleep pressure looks good. ✓`;
    }
    return `${hrs}h total nap time — right in the ideal range for this age. Bedtime should land well tonight. ✓`;
  }

  function tiredDetection() {
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type === "nap" && !e.night);
    const napMinutes = todayNaps.reduce((s, n) => s + minDiff(n.start, n.end), 0);
    if (napMinutes === 0) return null;
    const p = age ? getAgeNapProfile(age.totalWeeks) : { idealTotalMin:90, idealTotalMax:240 };

    const napsComplete = todayNaps.length >= (p.expectedNaps + (bridgeNapScheduled ? 1 : 0));
    const isToday = selDay === todayStr();
    const nowMins = isToday ? (() => { const n = new Date(); return n.getHours()*60+n.getMinutes(); })() : 24*60;

    const dayEffectivelyOver = nowMins >= 18 * 60;
    if (!napsComplete && !dayEffectivelyOver) {

      if (napMinutes > p.idealTotalMax * 1.15) return "💤 Plenty of sleep today — bedtime might be a little later";
      return null;
    }
    if (napMinutes < p.idealTotalMin * 0.75) return "😴 Looks like a tired day — an earlier bedtime may help";
    if (napMinutes > p.idealTotalMax * 1.15) return "💤 Plenty of sleep today — bedtime might be a little later";
    return "✓ Wake windows look good today";
  }


  function napNormalRange() {
    if (!age) return null;
    const w = age.totalWeeks;

    if (w < 4)  return { min:480, max:960, label:"8–16 hrs (inc. night)" };
    if (w < 8)  return { min:240, max:480, label:"4–8 hrs" };
    if (w < 13) return { min:180, max:360, label:"3–6 hrs" };
    if (w < 26) return { min:120, max:300, label:"2–5 hrs" };
    if (w < 39) return { min:120, max:240, label:"2–4 hrs" };
    if (w < 52) return { min:90,  max:180, label:"1.5–3 hrs" };
    if (w < 78) return { min:60,  max:120, label:"1–2 hrs" };
    return { min:60, max:90, label:"1–1.5 hrs" };
  }

  function sleepNormalCard() {
    const today = days[selDay] || [];
    const naps = today.filter(e => e.type === "nap" && !e.night);
    if (!naps.length) return null;
    const totalMins = naps.reduce((s,n) => s + minDiff(n.start, n.end), 0);
    const range = napNormalRange();
    if (!range) return null;

    const p = age ? getAgeNapProfile(age.totalWeeks) : null;
    const napsComplete = p ? naps.length >= (p.expectedNaps + (bridgeNapScheduled ? 1 : 0)) : true;
    const isToday = selDay === todayStr();
    const nowMins = isToday ? (() => { const n = new Date(); return n.getHours()*60+n.getMinutes(); })() : 24*60;
    const dayEffectivelyOver = nowMins >= 18 * 60;
    const afterAfternoon = nowMins >= 15 * 60;
    let status, color, bg, icon, message;
    if (totalMins < range.min) {
      // Suppress low sleep warning based on time of day:
      // Before noon: always suppress (way too early to judge)
      // Before 3pm: suppress (still plenty of nap time ahead)
      // After 3pm: only show if it's mathematically impossible to reach target before bedtime
      const beforeNoon = isToday && nowMins < 12 * 60;
      if (beforeNoon) return "suppressed";
      if (isToday && !afterAfternoon) return "suppressed";
      // Bug 2 Fix: only trigger alert when it's impossible to reach target before bedtime
      const bed2 = bedtimePrediction();
      const bed2Mins = bed2
        ? (()=>{ const [bh,bm]=bed2.time.split(":").map(Number); return bh*60+bm; })()
        : 19*60;
      const remainingBeforeBed = isToday ? Math.max(0, bed2Mins - nowMins) : 0;
      const maxPossibleAdditional = remainingBeforeBed;
      const couldStillReach = (totalMins + maxPossibleAdditional) >= range.min;

      // Suppress if: naps still incomplete AND there's still time to reach target
      if (!napsComplete && !dayEffectivelyOver && couldStillReach) return "suppressed";
      if (isToday && !dayEffectivelyOver && couldStillReach && napsComplete === false) return "suppressed";

      status = "below"; color = C.ter; bg = "#fff3f0";
      icon = "⚠️";
      const gap = range.min - totalMins;
      message = gap > 60
        ? "Naps have been a bit shorter today. An earlier bedtime tonight could help your little one catch up."
        : "Naps were a little lighter today — an earlier bedtime tonight could help.";
    } else if (totalMins > range.max) {
      status = "above"; color = "#b88a20"; bg = "#fffbf0";
      icon = "💤";
      message = "Nap time is higher than typical today. A slightly later bedtime can help build sleep pressure for the night.";
    } else {
      status = "normal"; color = C.mint; bg = "#f0faf6";
      icon = "✓";
      message = "Nap time is within a healthy range for this age. Well done!";
    }
    return { totalMins, range, status, color, bg, icon, message };
  }


  function regressionCheck() {
    const dk = Object.keys(days).sort();
    if (dk.length < 5) return null;
    const recent3 = dk.slice(-3);
    const prev4 = dk.slice(-7, -3);
    if (!prev4.length) return null;

    const avgNightWakes = arr => arr.reduce((s,d) => s + (days[d]||[]).filter(e=>e.night).length, 0) / arr.length;
    const avgNapMins = arr => arr.reduce((s,d) => {
      const ns = (days[d]||[]).filter(e=>e.type==="nap"&&!e.night);
      return s + ns.reduce((ss,n) => ss + minDiff(n.start,n.end), 0);
    }, 0) / arr.length;

    const recentWakes = avgNightWakes(recent3);
    const prevWakes   = avgNightWakes(prev4);
    const recentNaps  = avgNapMins(recent3);
    const prevNaps    = avgNapMins(prev4);

    const alerts = [];

    if (recentWakes > prevWakes + 1.2) {
      alerts.push({
        title: "More night wakes recently",
        body: "Night wakes have picked up a bit over the last 3 days. This often happens during developmental phases — it's very normal and usually settles within 1–2 weeks. Keeping bedtime consistent really helps.",
        icon: "🌙"
      });
    }
    if (prevNaps > 30 && recentNaps < prevNaps * 0.65) {
      alerts.push({
        title: "Shorter naps this week",
        body: "Naps have been shorter than usual. Baby may be going through a developmental phase or nap transition. Consistent wake windows and a calming pre-nap routine can help.",
        icon: "😴"
      });
    }
    if (prevNaps > 0 && recentNaps > prevNaps * 1.5 && recentNaps - prevNaps > 40) {
      alerts.push({
        title: "Naps have lengthened",
        body: "Baby is sleeping more than usual during the day. This is often a growth spurt or recovery from overtiredness. Watch that long naps don't push bedtime too late.",
        icon: "📈"
      });
    }
    return alerts.length ? alerts : null;
  }


  // ─── ENHANCED SLEEP ENGINE ──────────────────────────────────────────────────

  // Expected total daily sleep (day + night) by age for method2 bedtime
  function getAgeTotalSleepHours(ageWeeks) {
    if (ageWeeks < 6)  return 16;
    if (ageWeeks < 13) return 15;
    if (ageWeeks < 26) return 14.5;
    if (ageWeeks < 39) return 14;
    if (ageWeeks < 52) return 13.5;
    if (ageWeeks < 78) return 13;
    if (ageWeeks < 104) return 12.5;
    return 12;
  }

  // Expected daytime sleep range in minutes by age
  function getExpectedDaySleepRange(ageWeeks) {
    if (ageWeeks < 6)  return { min: 480, max: 600, label: "8–10 hrs" };
    if (ageWeeks < 13) return { min: 270, max: 390, label: "4.5–6.5 hrs" };
    if (ageWeeks < 26) return { min: 150, max: 270, label: "2.5–4.5 hrs" };
    if (ageWeeks < 39) return { min: 120, max: 210, label: "2–3.5 hrs" };
    if (ageWeeks < 52) return { min: 90,  max: 180, label: "1.5–3 hrs" };
    if (ageWeeks < 78) return { min: 60,  max: 120, label: "1–2 hrs" };
    return { min: 60, max: 90, label: "1–1.5 hrs" };
  }

  // 1 & 2. Circadian rhythm detection + gradual adjustment
  function circadianAnalysis() {
    const dk = Object.keys(days).sort().slice(-5);
    if (dk.length < 3) return null;
    const wakeMins = dk.map(d => {
      const e = (days[d]||[]).find(x => x.type==="wake" && !x.night);
      if (!e) return null;
      const [h,m] = e.time.split(":").map(Number);
      return h*60 + m;
    }).filter(v => v !== null);
    if (wakeMins.length < 3) return null;
    const avgWake = Math.round(wakeMins.reduce((a,b)=>a+b,0)/wakeMins.length);
    const optimalMin = 6*60, optimalMax = 7*60+30;
    const driftThreshold = 7*60+45;
    const isDrifted = avgWake > driftThreshold;
    const adjustment = [];
    if (isDrifted) {
      let cur = avgWake;
      const target = optimalMax;
      let day = 1;
      while (cur > target && day <= 10) {
        cur = Math.max(target, cur - 15);
        adjustment.push({ day, time: `${String(Math.floor(cur/60)).padStart(2,"0")}:${String(cur%60).padStart(2,"0")}` });
        day++;
      }
    }
    const mtp = m => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
    return { avgWake, avgWakeStr: mtp(avgWake), isDrifted, adjustment, optimalMin, optimalMax };
  }

  // 3. Cumulative daytime sleep tracker
  function getDaySleepSummary() {
    if (!age) return null;
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type==="nap" && !e.night);
    const totalDaySleep = todayNaps.reduce((s,n) => s + minDiff(n.start, n.end), 0);
    const range = getExpectedDaySleepRange(age.totalWeeks);
    const status = totalDaySleep < range.min ? "below" : totalDaySleep > range.max ? "above" : "normal";
    return { totalDaySleep, range, status };
  }

  // 4 & 5. Early bedtime risk + bridge nap suggestion
  function earlyBedtimeRisk() {
    if (!age) return null;
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type==="nap" && !e.night);
    if (!todayNaps.length) return null;
    const lastNap = todayNaps[todayNaps.length - 1];
    if (!lastNap.end) return null;
    const ww = getWakeWindow(age.totalWeeks);
    const [lh,lm] = lastNap.end.split(":").map(Number);
    const lastNapEndMins = lh*60+lm;
    const method1BedMins = lastNapEndMins + ww.max;
    const earlyThreshold = 18*60+15; // 6:15pm
    const isEarlyRisk = method1BedMins < earlyThreshold;
    const dss = getDaySleepSummary();
    const belowDaySleep = dss && dss.status === "below";
    const suggestBridge = isEarlyRisk && belowDaySleep;
    return { isEarlyRisk, method1BedMins, suggestBridge, lastNapEndMins };
  }

  // 7. Track consecutive early bedtime risk days for nap structure change
  function consecutiveEarlyBedDays() {
    const dk = Object.keys(days).sort().slice(-5);
    let consecutive = 0;
    for (let i = dk.length - 1; i >= 0; i--) {
      const d = dk[i];
      const es = days[d]||[];
      const naps = es.filter(e=>e.type==="nap"&&!e.night);
      if (!naps.length) break;
      const lastNap = naps[naps.length-1];
      if (!lastNap.end || !age) break;
      const ww = getWakeWindow(age.totalWeeks);
      const [lh,lm] = lastNap.end.split(":").map(Number);
      const pred = lh*60+lm + ww.max;
      if (pred < 18*60+15) consecutive++;
      else break;
    }
    return consecutive;
  }

  // 6 & 7. Dynamic nap structure recommendation
  function dynamicNapStructure() {
    if (!age) return null;
    const w = age.totalWeeks;
    const dss = getDaySleepSummary();
    const consec = consecutiveEarlyBedDays();
    const ebr = earlyBedtimeRisk();

    // Base expected naps
    let baseNaps;
    if (w < 13) baseNaps = 4;
    else if (w < 26) baseNaps = 3;
    else if (w < 39) baseNaps = 2;
    else if (w < 65) baseNaps = 2;
    else baseNaps = 1;

    let recommendation = null;
    let bridgeNap = false;

    if (consec >= 3 && baseNaps === 3) {
      recommendation = { type: "add_nap", message: `Your baby may temporarily benefit from 4 naps instead of 3 until naps lengthen.`, naps: 4 };
    }

    if (ebr && ebr.suggestBridge) {
      bridgeNap = true;
    }

    return { baseNaps, recommendation, bridgeNap };
  }

  // 8 & 9. Dual-method bedtime prediction
  function advancedBedtimePrediction() {
    if (!age) return null;
    const today = days[selDay] || [];
    const todayNaps = today.filter(e => e.type==="nap" && !e.night);
    if (!todayNaps.length) return null;
    const lastNap = todayNaps[todayNaps.length-1];
    if (!lastNap.end) return null;

    const ww = getWakeWindow(age.totalWeeks);
    const [lh,lm] = lastNap.end.split(":").map(Number);
    const lastNapEndMins = lh*60+lm;

    // Method 1: last nap end + recommended wake window
    const method1 = lastNapEndMins + Math.round((ww.min+ww.max)/2);

    // Method 2: wake time + (24h - night sleep needed)
    const wakeEntry = today.find(e=>e.type==="wake"&&!e.night);
    if (!wakeEntry) return { time: clampBedtime(method1), method1, method2: null, combined: method1, source: "method1" };
    const [wh,wm] = wakeEntry.time.split(":").map(Number);
    const wakeMins = wh*60+wm;
    const totalSleepH = getAgeTotalSleepHours(age.totalWeeks);
    const daySleepH = (getDaySleepSummary()?.totalDaySleep || 0) / 60;
    const nightSleepNeeded = totalSleepH - daySleepH;
    const method2 = wakeMins + (24*60 - nightSleepNeeded*60);

    // Combined average
    const combined = Math.round((method1 + method2) / 2);

    return {
      time: clampBedtime(combined),
      method1: clampBedtime(method1),
      method2: clampBedtime(method2),
      combined: clampBedtime(combined),
      source: "combined"
    };
  }

  // 12. Bedtime safety guard clamp
  function clampBedtime(mins) {
    const lo = 18*60, hi = 20*60+30;
    return Math.max(lo, Math.min(hi, mins));
  }

  // 10. Enhanced sleep stability score
  function sleepStabilityScore() {
    if (!age) return null;
    const today = days[selDay] || [];
    const todayNaps = today.filter(e=>e.type==="nap"&&!e.night);
    const totalDaySleep = todayNaps.reduce((s,n)=>s+minDiff(n.start,n.end),0);
    const wakeEntry = today.find(e=>e.type==="wake"&&!e.night);
    const ageWeeks = age.totalWeeks;
    const ww = getWakeWindow(ageWeeks);
    const daySleepRange = getExpectedDaySleepRange(ageWeeks);

    let score = 100;
    const factors = [];

    // Factor 1: wake time within biological range (6:00–7:30)
    if (wakeEntry) {
      const [h,m] = wakeEntry.time.split(":").map(Number);
      const wMins = h*60+m;
      if (wMins >= 6*60 && wMins <= 7*60+30) {
        factors.push({ label: "Wake time", status: "good", note: "Morning wake is within the optimal circadian window." });
      } else if (wMins > 7*60+45) {
        score -= 15;
        factors.push({ label: "Wake time", status: "warn", note: `Wake time (${fmt12(wakeEntry.time)}) is later than optimal. Gradual earlier shifts can help.` });
      } else if (wMins < 6*60) {
        score -= 10;
        factors.push({ label: "Wake time", status: "warn", note: "Very early morning wake. Keeping a consistent anchor helps." });
      }
    } else {
      score -= 5;
    }

    // Factor 2: total daytime sleep
    if (totalDaySleep >= daySleepRange.min && totalDaySleep <= daySleepRange.max) {
      factors.push({ label: "Daytime sleep", status: "good", note: `${Math.round(totalDaySleep/6)/10}h daytime sleep is within range (${daySleepRange.label}).` });
    } else if (totalDaySleep < daySleepRange.min) {
      const deficit = daySleepRange.min - totalDaySleep;
      score -= deficit > 60 ? 20 : 10;
      factors.push({ label: "Daytime sleep", status: "warn", note: `${Math.round(totalDaySleep/6)/10}h daytime sleep is below the expected ${daySleepRange.label} for this age.` });
    } else {
      score -= 8;
      factors.push({ label: "Daytime sleep", status: "info", note: "Daytime sleep is a little above range — bedtime may be slightly later." });
    }

    // Factor 3: wake window consistency
    const wins = getAwakeWindows(today);
    if (wins.length >= 2) {
      const winMins = wins.filter(w=>w.mins>0).map(w=>w.mins);
      if (winMins.length >= 2) {
        const avg = winMins.reduce((a,b)=>a+b,0)/winMins.length;
        const variance = winMins.map(v=>Math.abs(v-avg));
        const maxVar = Math.max(...variance);
        if (maxVar < 25) {
          factors.push({ label: "Wake window consistency", status: "good", note: "Wake windows are consistent today — great for rhythm stability." });
        } else {
          score -= 10;
          factors.push({ label: "Wake window consistency", status: "warn", note: "Wake windows varied quite a bit today. Consistent spacing helps body clock regulation." });
        }
      }
    }

    // Factor 4: final wake window (not too stretched)
    if (todayNaps.length) {
      const lastNap = todayNaps[todayNaps.length-1];
      if (lastNap.end) {
        const bedEntry = today.find(e=>e.type==="sleep"&&!e.night);
        const [lh,lm] = lastNap.end.split(":").map(Number);
        const lastNapEndMins = lh*60+lm;
        const checkMins = bedEntry ? (()=>{ const [bh,bm]=bedEntry.time.split(":").map(Number); return bh*60+bm; })() : null;
        if (checkMins) {
          const finalWW = checkMins - lastNapEndMins;
          if (finalWW <= ww.max + 15) {
            factors.push({ label: "Final wake window", status: "good", note: "Last wake window before bed is well-timed." });
          } else {
            score -= 12;
            factors.push({ label: "Final wake window", status: "warn", note: "Final wake window was longer than ideal — slight overtiredness risk." });
          }
        }
      }
    }

    // Factor 5: bedtime timing
    const bedEntry = today.find(e=>e.type==="sleep"&&!e.night);
    if (bedEntry) {
      const [bh,bm] = bedEntry.time.split(":").map(Number);
      const bMins = bh*60+bm;
      if (bMins >= 18*60 && bMins <= 20*60) {
        factors.push({ label: "Bedtime", status: "good", note: `Bedtime at ${fmt12(bedEntry.time)} is within the ideal range (6–8pm).` });
      } else if (bMins > 20*60) {
        score -= 15;
        factors.push({ label: "Bedtime", status: "warn", note: "Bedtime is later than 8pm. An earlier bedtime often improves night sleep quality." });
      } else if (bMins < 18*60) {
        score -= 10;
        factors.push({ label: "Bedtime", status: "info", note: "Bedtime is before 6pm, which may cause early morning waking." });
      }
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  // 13. Morning wake anchor check
  function morningWakeAnchor() {
    const today = days[selDay] || [];
    const wakes = today.filter(e=>e.type==="wake"&&!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
    if (wakes.length < 2) return null;
    const firstWake = wakes[0];
    const [fh] = firstWake.time.split(":").map(Number);
    if (fh < 6) {
      return { earlyWake: true, time: firstWake.time };
    }
    return null;
  }

  // 14. Sleep pressure / night outlook prediction
  function sleepPressureOutlook() {
    if (!age) return null;
    const today = days[selDay] || [];
    const todayNaps = today.filter(e=>e.type==="nap"&&!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
    if (todayNaps.length < 2) return null;

    const ww = getWakeWindow(age.totalWeeks);
    const nap1Dur = minDiff(todayNaps[0].start, todayNaps[0].end);
    const nap2Dur = minDiff(todayNaps[1].start, todayNaps[1].end);

    // Current wake window from last nap end
    const lastNap = todayNaps[todayNaps.length-1];
    let currentWW = null;
    if (lastNap.end) {
      const now = new Date();
      const nowMins = now.getHours()*60+now.getMinutes();
      const [lh,lm] = lastNap.end.split(":").map(Number);
      const lastNapEndMins = lh*60+lm;
      currentWW = nowMins - lastNapEndMins;
    }

    // Rule: nap1 < 30 AND nap2 < 30 AND currentWW > recommendedMax + 30
    const bothShort = nap1Dur < 30 && nap2Dur < 30;
    const isStretched = currentWW !== null && currentWW > ww.max + 30;
    const isOvertiredRisk = bothShort && isStretched;

    // Also detect moderate pressure: just short naps without the stretched window
    const isModerate = (nap1Dur < 40 || nap2Dur < 40) && !isOvertiredRisk;

    const dss = getDaySleepSummary();
    const belowRange = dss && dss.status === "below";

    let outlook, label, color, bg, message;
    if (isOvertiredRisk) {
      outlook = "higher_risk";
      label = "Higher overtired risk";
      color = C.ter;
      bg = "#fff3f0";
      message = "Today's nap pattern suggests higher sleep pressure. A short bridge nap or slightly earlier bedtime may help support smoother night sleep.";
    } else if (isModerate && belowRange) {
      outlook = "slight_risk";
      label = "Slight overtired risk";
      color = "#d4a020";
      bg = "#fffbf0";
      message = "Naps have been a little shorter today. Watch for tired signs and consider a slightly earlier bedtime.";
    } else {
      outlook = "stable";
      label = "Stable";
      color = C.mint;
      bg = "#f0faf6";
      message = "Today's sleep pattern looks balanced. Night sleep should go smoothly.";
    }

    return { outlook, label, color, bg, message, nap1Dur, nap2Dur };
  }

  // 11. Predict tomorrow's flexible schedule (enhanced version)
  function tomorrowFlexSchedule() {
    if (!age) return null;
    const w = age.totalWeeks;
    const ww = getWakeWindow(w);
    const mtp = m => `${String(Math.floor((m<0?m+24*60:m)/60)%24).padStart(2,"0")}:${String(((m%60)+60)%60).padStart(2,"0")}`;

    // Get average wake time from last 5 days
    const dk5 = Object.keys(days).sort().slice(-5);
    const wakeMinsArr = dk5.map(d=>{
      const e=(days[d]||[]).find(x=>x.type==="wake"&&!x.night);
      if(!e) return null;
      const[h,m]=e.time.split(":").map(Number); return h*60+m;
    }).filter(v=>v!==null);
    let baseWake = wakeMinsArr.length ? Math.round(wakeMinsArr.reduce((a,b)=>a+b,0)/wakeMinsArr.length) : 7*60;

    // Apply circadian correction
    const circ = circadianAnalysis();
    if (circ && circ.isDrifted && circ.adjustment.length) {
      const nextAdj = circ.adjustment[0];
      const [ah,am] = nextAdj.time.split(":").map(Number);
      baseWake = ah*60+am;
    }

    const daySleepRange = getExpectedDaySleepRange(w);
    const wwMid = Math.round((ww.min+ww.max)/2);

    // Dynamic nap count
    const dns = dynamicNapStructure();
    let napCount = dns ? dns.baseNaps : 3;
    const hasBridge = dns && dns.bridgeNap;

    // Average recent nap duration
    const recentNapLens = dk5.map(d=>{
      const ns=(days[d]||[]).filter(e=>e.type==="nap"&&!e.night);
      return ns.length ? ns.reduce((s,n)=>s+minDiff(n.start,n.end),0)/ns.length : null;
    }).filter(v=>v!==null);
    const avgNapLen = recentNapLens.length ? Math.round(avgArr(recentNapLens)) : 60;
    const cappedNapLen = Math.min(avgNapLen, w < 26 ? 90 : 80);

    // Avg bedtime for anchor
    const bedMinsArr = dk5.map(d=>{
      const e=(days[d]||[]).find(x=>x.type==="sleep"&&!x.night);
      if(!e) return null; const[h,m]=e.time.split(":").map(Number); return h*60+m;
    }).filter(v=>v!==null);
    const avgBed = bedMinsArr.length ? Math.round(avgArr(bedMinsArr)) : 19*60;
    const anchorBed = clampBedtime(avgBed);

    const schedule = [];
    schedule.push({ label:"Wake up", time:mtp(baseWake), icon:"☀️", type:"wake" });

    let cursor = baseWake + wwMid;
    let napsDone = 0;

    for (let i = 0; i < napCount; i++) {
      if (cursor >= anchorBed - ww.min) break;
      const napEnd = cursor + cappedNapLen;
      if (napEnd + ww.min > anchorBed && i < napCount-1) break;
      schedule.push({ label:`Nap ${napsDone+1}`, time:`${mtp(cursor)} – ${mtp(napEnd)}`, icon:"😴", type:"nap" });
      napsDone++;
      cursor = napEnd + wwMid;
      if (cursor >= anchorBed - 15) break;
    }

    // Bridge nap if needed (15–30 min, roughly 90m before bedtime)
    if (hasBridge) {
      const bridgeStart = anchorBed - 90;
      const bridgeEnd = anchorBed - 60;
      if (bridgeStart > cursor) {
        schedule.push({ label:"Bridge nap", time:`${mtp(bridgeStart)} – ${mtp(bridgeEnd)}`, icon:"🌙", type:"bridge" });
      }
    }

    // Method1+2 combined bedtime
    const adv = advancedBedtimePrediction();
    const finalBed = adv ? adv.combined : anchorBed;
    schedule.push({ label:"Bedtime", time:mtp(clampBedtime(finalBed)), icon:"🌙", type:"bed" });

    return { schedule, napCount, hasBridge, source: circ?.isDrifted ? "rhythm-adjusted" : "recent patterns" };
  }

  // ─── END ENHANCED SLEEP ENGINE ─────────────────────────────────────────────


  function feedCard() {
    if (!age) return null;
    const w = age.totalWeeks;
    const today = days[selDay] || [];


    const nextDayStr = (() => {
      const d = new Date(selDay + "T12:00:00"); d.setDate(d.getDate()+1);
      return d.toISOString().split("T")[0];
    })();
    const nextDayEntries = days[nextDayStr] || [];
    const nextDayMorningWake = nextDayEntries
      .filter(e => e.type==="wake" && !e.night)
      .sort((a,b) => timeVal(a)-timeVal(b))
      .find(e => { const h=parseInt((e.time||"00:00").split(":")[0]); return h>=5&&h<12; });
    const nextMorningMins = nextDayMorningWake ? timeVal(nextDayMorningWake) : 7*60;
    const crossMidnightEntries = nextDayEntries.filter(e =>
      e.night && timeVal(e) < nextMorningMins
    );
    const allToday = [...today, ...crossMidnightEntries];

    const allMilkFeeds  = allToday.filter(e => (e.type==="feed" && e.feedType!=="solids") || (e.type==="wake" && e.night && (e.amount||0)>0));
    const dayMilkFeeds  = allMilkFeeds.filter(e => !e.night);
    const nightMilkFeeds= allMilkFeeds.filter(e => e.night);
    const totalMl   = allMilkFeeds.reduce((s,f)  => s+(f.amount||0), 0);
    const dayMl     = dayMilkFeeds.reduce((s,f)  => s+(f.amount||0), 0);
    const nightMl   = nightMilkFeeds.reduce((s,f)=> s+(f.amount||0), 0);
    if (!totalMl) return null;


    let totalMin, totalMax, totalLabel, totalTarget, dayTarget, dayMin, targetFeeds, nhsNote;
    if (w < 4) {
      totalMin=400; totalMax=700; totalTarget=550; dayTarget=400; dayMin=280;
      targetFeeds=8; totalLabel="400–700ml/day (NHS)";
      nhsNote="Newborns feed 8–12 times in 24h. Frequent feeding builds your supply and helps baby regain birth weight.";
    } else if (w < 8) {
      totalMin=500; totalMax=800; totalTarget=650; dayTarget=480; dayMin=350;
      targetFeeds=7; totalLabel="500–800ml/day (NHS)";
      nhsNote="At this age babies typically feed every 2.5–3.5h. Consistent day feeds help night stretches extend naturally.";
    } else if (w < 13) {
      totalMin=600; totalMax=900; totalTarget=750; dayTarget=560; dayMin=400;
      targetFeeds=6; totalLabel="600–900ml/day (NHS)";
      nhsNote="NHS recommends ~150ml per kg/day. Stronger day feeds often reduce hunger-driven night waking.";
    } else if (w < 26) {
      totalMin=700; totalMax=1000; totalTarget=850; dayTarget=650; dayMin=480;
      targetFeeds=5; totalLabel="700–1000ml/day (NHS)";
      nhsNote="Babies 3–6 months benefit from full day feeds. Low day intake is a common cause of frequent night waking at this age.";
    } else if (w < 39) {
      totalMin=500; totalMax=800; totalTarget=700; dayTarget=560; dayMin=380;
      targetFeeds=4; totalLabel="500–800ml/day + solids (NHS)";
      nhsNote="With solids introduced, milk remains the main nutrition. Offering milk before solids helps maintain day intake.";
    } else if (w < 52) {
      totalMin=400; totalMax=700; totalTarget=600; dayTarget=480; dayMin=320;
      targetFeeds=3; totalLabel="400–700ml/day + solids (NHS)";
      nhsNote="At 9–12 months, 3 milk feeds per day alongside meals is typical. Solids shouldn't displace milk entirely.";
    } else {
      totalMin=300; totalMax=500; totalTarget=400; dayTarget=320; dayMin=200;
      targetFeeds=2; totalLabel="300–500ml/day (NHS)";
      nhsNote="After 12 months, cow's milk can replace formula. 300–400ml/day supports calcium needs alongside a varied diet.";
    }


    const recentDays = Object.keys(days).sort().slice(-7);
    const avgNightWakes = recentDays.length
      ? Math.round((recentDays.reduce((s,d) => s+(days[d]||[]).filter(e=>e.night).length, 0) / recentDays.length)*10)/10
      : null;
    const hasFrequentNightWakes = avgNightWakes !== null && avgNightWakes >= 2;


    const isPastDay = selDay < todayStr();
    const nowMins = new Date().getHours()*60 + new Date().getMinutes();
    const wakeEntry = today.find(e=>e.type==="wake"&&!e.night);
    const bedEntry  = today.find(e=>e.type==="sleep"&&!e.night);
    const sugBed    = bedtimePrediction();
    const wakeMin   = wakeEntry ? timeVal(wakeEntry) : 7*60;

    const bedMinLogged = bedEntry ? timeVal(bedEntry) : null;
    const bedMinSug    = sugBed  ? timeVal(sugBed.time) : 19*60;
    const bedMin       = bedMinLogged !== null ? bedMinLogged : bedMinSug;
    const dayLenMins   = Math.max(bedMin - wakeMin, 60);


    const effectiveNowMins = isPastDay ? bedMin : nowMins;
    const elapsedMins  = Math.min(Math.max(effectiveNowMins - wakeMin, 0), dayLenMins);
    const dayFraction  = isPastDay ? 1 : elapsedMins / dayLenMins;
    const remainingMins = isPastDay ? 0 : Math.max(bedMin - nowMins, 0);
    const remainingFeeds = isPastDay ? 0 : Math.max(Math.round(remainingMins / (dayLenMins / targetFeeds)), 0);


    const bedLogged       = bedEntry !== undefined && bedEntry !== null;
    const approachingBed  = !isPastDay && !bedLogged && remainingMins > 0 && remainingMins <= 180;
    const dayActive       = !isPastDay && !bedLogged;


    const totalOk       = totalMl >= totalMin;
    const totalHigh     = totalMl > totalMax;
    const metMinimum    = totalMl >= totalMin;
    const dayShortfall  = Math.max(totalMin - totalMl, 0);
    const totalShortfall= Math.max(totalTarget - totalMl, 0);


    const expectedNightFeeds = w < 8 ? "2–3" : w < 13 ? "1–2" : w < 26 ? "1–2" : "1";


    let status, color, bg, icon, statusMsg, sleepLink=null;


    if (isPastDay) {
      if (totalHigh) {
        status="high"; color="#b88a20"; bg="var(--card-bg)"; icon="📈";
        statusMsg=`Total intake was above average at ${fmtVol(totalMl,FU)} — common during growth spurts.`;
      } else if (metMinimum) {
        status="ok"; color=C.mint; bg="var(--card-bg)"; icon="✓";
        statusMsg=`Good day — ${fmtVol(totalMl,FU)} total, meeting the minimum recommended intake of ${fmtVol(totalMin,FU)}. Day feeds: ${fmtVol(dayMl,FU)}, night feeds: ${fmtVol(nightMl,FU)}.`;
      } else {
        status="low"; color=C.ter; bg="var(--card-bg)"; icon="⚠️";
        statusMsg=`Total intake was ${fmtVol(totalMl,FU)} — ${fmtVol(dayShortfall,FU)} a little under the recommended ${fmtVol(totalMin,FU)}. Day feeds: ${fmtVol(dayMl,FU)}, night feeds: ${fmtVol(nightMl,FU)}. One low day is nothing to worry about.`;
      }


    } else if (bedLogged) {
      if (totalHigh) {
        status="high"; color="#b88a20"; bg="var(--card-bg)"; icon="📈";
        statusMsg=`Total intake was above average at ${fmtVol(totalMl,FU)} — common during growth spurts.`;
      } else if (metMinimum) {
        status="ok"; color=C.mint; bg="var(--card-bg)"; icon="✓";
        statusMsg=`Great job — ${fmtVol(totalMl,FU)} total today, meeting the minimum of ${fmtVol(totalMin,FU)}. Day: ${fmtVol(dayMl,FU)}, night feeds: ${fmtVol(nightMl,FU)}.`;
      } else {

        status="low"; color=C.ter; bg="var(--card-bg)"; icon="⚠️";
        statusMsg=`Total milk today was ${fmtVol(totalMl,FU)} — ${fmtVol(dayShortfall,FU)} below the recommended minimum of ${fmtVol(totalMin,FU)}.`;
        sleepLink = {
          icon:"🌙",
          title:"Expect a hunger wake tonight",
          body:`With intake a little short today, baby may wake ${expectedNightFeeds} time${expectedNightFeeds==="1"?"":"s"} from genuine hunger overnight — that's completely normal. Responding to those feeds will help make up today's shortfall. One low day is nothing to worry about; if low intake continues for several days, mention it to your health visitor.`
        };
      }


    } else if (approachingBed) {
      if (totalHigh) {
        status="high"; color="#b88a20"; bg="var(--card-bg)"; icon="📈";
        statusMsg=`Intake is above average at ${fmtVol(totalMl,FU)} — looking good.`;
      } else if (metMinimum) {
        status="ok"; color=C.mint; bg="var(--card-bg)"; icon="✓";
        statusMsg=`Minimum intake reached (${fmtVol(totalMl,FU)}) — great work. Bedtime is about ${Math.round(remainingMins/60*10)/10 < 1 ? remainingMins+"m" : Math.round(remainingMins/60)+"h"} away.`;
      } else {

        const feedsLeft = Math.max(remainingFeeds, 1);
        const topUpEach = Math.round(dayShortfall / feedsLeft / 10) * 10;
        status="low"; color=C.ter; bg="var(--card-bg)"; icon="⏳";
        statusMsg=`${fmtVol(dayShortfall,FU)} still needed to reach the minimum (${fmtVol(totalMin,FU)}) — bedtime is ~${remainingMins < 60 ? remainingMins+"m" : Math.round(remainingMins/60)+"h"} away.`;
        sleepLink = {
          icon:"🍼",
          title:"Top up before bed",
          body:`With ${feedsLeft} feed${feedsLeft!==1?"s":""} left before bedtime, try offering an extra ~${fmtVol(topUpEach,FU)} at each to hit the minimum. A fuller tummy before bed reduces the chance of hunger-driven night waking. If baby doesn't take it, don't worry — one short day is nothing to worry about.`
        };
      }


    } else {
      if (dayFraction < 0.2) {
        status="early"; color=C.mint; bg="var(--card-bg)"; icon="☀️";
        statusMsg=`${fmtVol(totalMl,FU)} so far — the day is just getting started. Goal: reach ${fmtVol(totalMin,FU)} before bedtime.`;
      } else if (totalHigh) {
        status="high"; color="#b88a20"; bg="var(--card-bg)"; icon="📈";
        statusMsg=`Intake is above average at ${fmtVol(totalMl,FU)} — common during growth spurts.`;
      } else if (metMinimum) {
        status="ok"; color=C.mint; bg="var(--card-bg)"; icon="✓";
        statusMsg=`Minimum intake reached — ${fmtVol(totalMl,FU)} so far today. Keep it up through bedtime.`;
      } else {

        const feedsLeft = Math.max(remainingFeeds, 1);
        const topUpEach = remainingFeeds > 0 ? Math.round(dayShortfall / feedsLeft / 10) * 10 : dayShortfall;
        // Bug 2 Fix: only show "low" if it's actually impossible to reach target before bed
        // Also suppress low feed warning before 1pm — too early to judge intake
        const feedIntervalMins = dayLenMins / Math.max(targetFeeds, 1);
        const maxFeedsLeft = Math.max(Math.floor(remainingMins / feedIntervalMins), 0);
        const typicalPerFeed = totalMl / Math.max(dayMilkFeeds.length, 1);
        const maxPossibleIntake = totalMl + maxFeedsLeft * typicalPerFeed;
        const currentHour = new Date().getHours();
        const currentMin = new Date().getMinutes();
        if (!isPastDay && (currentHour < 12 || (currentHour === 12 && currentMin === 0))) {
          // Before noon — way too early to flag low intake
          status="ontrack"; color=C.mint; bg="var(--card-bg)"; icon="☀️";
          statusMsg=`${fmtVol(totalMl,FU)} so far — the day is just getting started. Goal: reach ${fmtVol(totalMin,FU)} before bedtime.`;
        } else if (!isPastDay && currentHour < 13) {
          // Before 1pm — too early to flag low intake
          status="ontrack"; color=C.mint; bg="var(--card-bg)"; icon="☀️";
          statusMsg=`${fmtVol(totalMl,FU)} so far — the day is still young. Goal: reach ${fmtVol(totalMin,FU)} before bedtime.`;
        } else if (maxPossibleIntake >= totalMin) {
          // Still achievable — show as "on track" not "low"
          status="ontrack"; color=C.mint; bg="var(--card-bg)"; icon="☀️";
          statusMsg=`${fmtVol(totalMl,FU)} so far — ${fmtVol(dayShortfall,FU)} to go. Plenty of time to reach the minimum of ${fmtVol(totalMin,FU)}.`;
        } else {
          status="low"; color=C.ter; bg="var(--card-bg)"; icon="⚠️";
          statusMsg=`${fmtVol(totalMl,FU)} so far — ${fmtVol(dayShortfall,FU)} to go to reach the minimum of ${fmtVol(totalMin,FU)} before bedtime.`;
        }
        if (hasFrequentNightWakes) {
          sleepLink = {
            icon:"💤",
            title:"May be linked to night waking",
            body:`Baby is averaging ${avgNightWakes} night wake${avgNightWakes!==1?"s":""}/night. Low daytime intake is a common reason babies feed more overnight. Spreading ${topUpEach>0?`an extra ~${fmtVol(topUpEach,FU)} across`:"intake across"} the remaining feeds today can help reduce hunger-driven waking.`
          };
        }
      }
    }


    const suggestions = [];
    if (!isPastDay && dayMilkFeeds.length >= 2) {
      const sorted = [...dayMilkFeeds].sort((a,b)=>timeVal(a)-timeVal(b));
      const amounts = sorted.map(f=>f.amount||0);
      const avgFeed = dayMl / dayMilkFeeds.length;


      if (!bedLogged && (status==="low") && remainingFeeds > 0 && dayShortfall > 80) {
        const topUp = Math.round(dayShortfall / remainingFeeds / 10) * 10;
        suggestions.push({ icon:"🍼", body:`${remainingFeeds} feed${remainingFeeds!==1?"s":""} left today. Adding ~${topUp}ml to each would reach the minimum.` });
      }


      const maxF=Math.max(...amounts), minF=Math.min(...amounts);
      if (dayMilkFeeds.length>=3 && maxF>avgFeed*1.5 && minF<avgFeed*0.6) {
        const even = Math.round(dayMl/dayMilkFeeds.length/10)*10;
        suggestions.push({ icon:"⚖️", body:`Day feeds range from ${minF}ml to ${maxF}ml. More consistent feeds of ~${even}ml reduce wind and keep hunger steady.` });
      }


      if (dayActive) {
        for (let i=1;i<sorted.length;i++){
          const gap=timeVal(sorted[i])-timeVal(sorted[i-1]);
          if(gap>(w<13?210:270)){
            const gH=Math.floor(gap/60),gM=gap%60;
            suggestions.push({ icon:"⏰", body:`${gH}h${gM>0?" "+gM+"m":""} gap between ${fmt12(sorted[i-1].time)} and ${fmt12(sorted[i].time)} — shorter gaps help maintain intake.` });
            break;
          }
        }
      }
    }

    return { totalMl, dayMl, nightMl, totalMin, totalMax, totalLabel, totalTarget, dayTarget, dayMin,
             status, color, bg, icon, statusMsg, sleepLink, suggestions, nhsNote, dayFraction,
             hasFrequentNightWakes, isPastDay, bedLogged, approachingBed, metMinimum,

             personalTarget: usePersonalRecs===true ? (()=>{ const pb=computePersonalBaselines(); return pb&&pb.personalAvgMl?pb.personalAvgMl:null; })() : null,
             personalFeedCount: usePersonalRecs===true ? (()=>{ const pb=computePersonalBaselines(); return pb&&pb.personalFeedCount?pb.personalFeedCount:null; })() : null
           };
  }

  function analyseTrends() {


    const dk = Object.keys(days).sort();
    if (dk.length < 3) return null;
    const recent = dk.slice(-7);

    const wakeTimes = recent.map(d=>{
      const w=(days[d]||[]).find(e=>e.type==="wake"&&!e.night);
      return w?timeVal(w):null;
    }).filter(v=>v!==null);
    const avgWake = wakeTimes.length ? Math.round(avgArr(wakeTimes)) : null;
    const wakeStdDev = wakeTimes.length > 1 ? Math.round(Math.sqrt(wakeTimes.reduce((s,v)=>s+Math.pow(v-(avgWake||0),2),0)/wakeTimes.length)) : null;

    const bedTimes = recent.map(d=>{
      const s=(days[d]||[]).find(e=>e.type==="sleep"&&!e.night);
      return s?timeVal(s):null;
    }).filter(v=>v!==null);
    const avgBed = bedTimes.length ? Math.round(avgArr(bedTimes)) : null;
    const bedStdDev = bedTimes.length>1 ? Math.round(Math.sqrt(bedTimes.reduce((s,v)=>s+Math.pow(v-(avgBed||0),2),0)/bedTimes.length)) : null;

    const napCounts = recent.map(d=>(days[d]||[]).filter(e=>e.type==="nap"&&!e.night).length);
    const avgNaps = napCounts.length ? Math.round(avgArr(napCounts)*10)/10 : null;

    const napMinsArr = recent.map(d=>{
      const ns=(days[d]||[]).filter(e=>e.type==="nap"&&!e.night);
      return ns.reduce((s,n)=>s+minDiff(n.start,n.end),0);
    });
    const avgNapMins = Math.round(avgArr(napMinsArr));
    const napMinsStdDev = napMinsArr.length > 1 ? Math.round(Math.sqrt(napMinsArr.reduce((s,v)=>s+Math.pow(v-avgNapMins,2),0)/napMinsArr.length)) : null;

    const nightWakes = recent.map(d=>(days[d]||[]).filter(e=>e.night).length);
    const avgNightWakes = Math.round(avgArr(nightWakes)*10)/10;

    const mlArr = recent.map(d=>(days[d]||[]).filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0));
    const avgMlRecent = Math.round(avgArr(mlArr));


    const recentHalf = nightWakes.slice(-3);
    const olderHalf = nightWakes.slice(0,3);
    const recentAvg = recentHalf.reduce((a,b)=>a+b,0)/Math.max(recentHalf.length,1);
    const olderAvg = olderHalf.length ? olderHalf.reduce((a,b)=>a+b,0)/olderHalf.length : recentAvg;
    const nightWakeTrend = recentAvg < olderAvg - 0.3 ? "improving" : recentAvg > olderAvg + 0.3 ? "worsening" : "stable";


    const mlRecent3 = mlArr.slice(-3).reduce((a,b)=>a+b,0)/3;
    const mlOlder = mlArr.slice(0,3).length ? mlArr.slice(0,3).reduce((a,b)=>a+b,0)/mlArr.slice(0,3).length : mlRecent3;
    const feedTrend = mlRecent3 > mlOlder + 30 ? "rising" : mlRecent3 < mlOlder - 30 ? "falling" : "stable";

    const ageWeeks = age ? age.totalWeeks : null;
    const ww = ageWeeks ? getWakeWindow(ageWeeks) : null;
    const napProfile = ageWeeks ? getAgeNapProfile(ageWeeks) : null;

    const mtp = m => {
      if (m === null) return "--";
      const h = Math.floor(((m%1440)+1440)%1440/60);
      const mm = ((m%1440)+1440)%1440%60;
      const ampm = h >= 12 ? "pm" : "am";
      const h12 = h%12 || 12;
      return `${h12}:${String(mm).padStart(2,"0")}${ampm}`;
    };

    const insights = [];


    if (wakeStdDev !== null && wakeTimes.length >= 4) {
      if (wakeStdDev > 35) {
        insights.push({
          type:"warn", icon:"🌅", title:"Inconsistent Wake Time",
          body:`Wake time varies by ~${wakeStdDev} minutes across the week (avg ${mtp(avgWake)}). A circadian rhythm that shifts significantly day-to-day makes nap timing harder to predict and can increase night waking. Aim for morning wake within a 20-minute window each day.`
        });
      } else if (wakeStdDev < 15) {
        insights.push({
          type:"good", icon:"🌅", title:"Excellent Wake Consistency",
          body:`Wake time is highly consistent — varying by only ~${wakeStdDev} minutes across the last ${wakeTimes.length} days. This is one of the strongest anchors for a predictable sleep rhythm. Keep it up.`
        });
      }
    }


    if (avgBed !== null && bedTimes.length >= 3) {
      const bedH = Math.floor(avgBed/60);
      if (bedStdDev !== null && bedStdDev > 30) {
        insights.push({
          type:"warn", icon:"🌙", title:"Bedtime Varies Too Much",
          body:`Average bedtime is ${mtp(avgBed)} but shifts by ~${bedStdDev} minutes day to day. Variable bedtimes make it harder for babies to build sleep pressure at the right time, often leading to overtired protests or early morning waking. Aim for within 15 minutes of ${mtp(avgBed)} each night.`
        });
      } else if (bedH < 17) {
        insights.push({
          type:"warn", icon:"🌙", title:"Bedtime May Be Too Early",
          body:`Average bedtime of ${mtp(avgBed)} is quite early. Bedtimes before 6pm can cause early morning waking (before 6am) — the baby completes their full sleep cycle and surfaces before dawn. If you're seeing early waking, try pushing bedtime 15–20 minutes later every few days.`
        });
      } else if (bedH > 20) {
        insights.push({
          type:"warn", icon:"🌙", title:"Late Average Bedtime",
          body:`Average bedtime of ${mtp(avgBed)} is later than the recommended 6:30–7:30pm window. Overtired babies often fight sleep and wake more at night — the later the bedtime, the higher cortisol levels tend to be. A gradual 10–15 min earlier each night can reset this without disruption.`
        });
      }
    }


    if (nightWakes.length >= 5) {
      if (nightWakeTrend === "worsening") {
        insights.push({
          type:"warn", icon:"😴", title:"Night Wakes Increasing",
          body:`Night wakes have been climbing over the last 3 days (avg ${recentAvg.toFixed(1)}) compared to earlier in the week (avg ${olderAvg.toFixed(1)}). Common causes at this point: a developmental phase, undertired days reducing sleep pressure, or a feed association building. Check the nap total trend below.`
        });
      } else if (nightWakeTrend === "improving") {
        insights.push({
          type:"good", icon:"😴", title:"Night Sleep Improving",
          body:`Night wakes have dropped recently — from an average of ${olderAvg.toFixed(1)} to ${recentAvg.toFixed(1)} per night. Whatever you're doing with daytime structure is working. Keep nap timing and bedtime consistent to maintain the improvement.`
        });
      }
    }


    if (avgNapMins > 0 && napProfile) {
      const { idealTotalMin, idealTotalMax } = napProfile;
      const gapToMin = idealTotalMin - avgNapMins;
      const gapToMax = avgNapMins - idealTotalMax;
      if (napMinsStdDev !== null && napMinsStdDev > 40) {
        insights.push({
          type:"info", icon:"💤", title:"Nap Length Is Inconsistent Day to Day",
          body:`Total nap time varies by ~${napMinsStdDev} minutes across the week (avg ${hm(avgNapMins)}). High variability often means wake windows are drifting — an overtired nap starts too late and runs short, then the next day everything shifts. A consistent first-nap start time reduces this ripple effect.`
        });
      } else if (gapToMin > 30) {
        insights.push({
          type:"warn", icon:"💤", title:"Below Target Nap Total",
          body:`Averaging ${hm(avgNapMins)} of day sleep — ${hm(gapToMin)} below the ${hm(idealTotalMin)} minimum for this age. Daytime sleep debt tends to surface as increased night waking or early rising, not as easier settling. Extending even one nap per day can make a measurable difference.`
        });
      } else if (gapToMax > 30) {
        insights.push({
          type:"info", icon:"💤", title:"Nap Total on the High Side",
          body:`Averaging ${hm(avgNapMins)} of day sleep — above the ideal ${hm(idealTotalMax)} maximum for this age. Too much daytime sleep can reduce overnight sleep pressure and lead to night waking or shorter consolidated stretches. Consider capping the last nap to protect bedtime.`
        });
      }
    }


    if (avgMlRecent > 0 && feedTrend !== "stable") {
      const weekLabel = ageWeeks && ageWeeks >= 26 ? " (alongside solids)" : "";
      if (feedTrend === "falling" && mlRecent3 < 400) {
        insights.push({
          type:"warn", icon:"🍼", title:"Milk Intake Dropping",
          body:`The last 3 days have averaged ${Math.round(mlRecent3)}ml — down from ${Math.round(mlOlder)}ml earlier in the week${weekLabel}. A sustained drop below 400ml/day is worth monitoring; if it continues for more than 3–4 days, mention it to your health visitor.`
        });
      } else if (feedTrend === "rising" && mlRecent3 > 1100) {
        insights.push({
          type:"info", icon:"🍼", title:"Milk Intake Rising",
          body:`Daily intake has climbed to ~${Math.round(mlRecent3)}ml in the last 3 days. This may reflect a growth spurt — a short-term increase is completely normal. If it continues beyond 5–7 days above 1200ml, it can sometimes indicate comfort feeding replacing sleep associations.`
        });
      }
    }


    if (avgNightWakes > 2 && avgMlRecent < 450 && avgMlRecent > 0) {
      insights.push({
        type:"warn", icon:"🔗", title:"Low Day Feeds May Be Driving Night Waking",
        body:`Average daytime intake of ${fmtVol(avgMlRecent,FU)} is below the typical minimum, and night wakes are averaging ${avgNightWakes}/night. Hungry babies often compensate at night — not from habit, but genuine need. Offering one extra daytime feed or adding 20–30ml per bottle may reduce overnight hunger waking within a few days.`
      });
    }


    if (ageWeeks && nightWakeTrend === "worsening") {
      const phaseNow = DEV_PHASES.find(l => ageWeeks >= l.windowStart-1 && ageWeeks <= l.windowEnd+1);
      if (phaseNow) {
        insights.push({
          type:"info", icon:"🧠", title:`Phase ${phaseNow.phase}: ${phaseNow.name}`,
          body:`Your baby is in or near developmental phase ${phaseNow.phase} — ${phaseNow.name} (weeks ${phaseNow.windowStart}–${phaseNow.windowEnd}). A bit more night waking is completely normal during these phases — the brain is building new connections. It usually settles within 1–3 weeks. Consistent routines help more than anything.`
        });
      }
    }

    return { insights, avgWake:avgWake!==null?mtp(avgWake):null, avgBed:avgBed!==null?mtp(avgBed):null, avgNaps, avgNapMins, avgNightWakes, avgMlRecent, days:dk.length };
  }


  function computePersonalBaselines() {
    const dk = Object.keys(days).sort();

    const activeDays = dk.filter(d => (days[d]||[]).some(e => !e.night && (e.type==="nap"||e.type==="feed")));
    if (activeDays.length < 7) return null;
    if (!age) return null;

    const recent = activeDays.slice(-14);
    const mtp = m => { const h=Math.floor(m/60)%24,mm=m%60; return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; };


    let allWakeWindows = [];
    recent.forEach(d => {
      const ws = getAwakeWindows(days[d]||[]);
      ws.forEach(w => { if(w.mins >= 20 && w.mins < 240) allWakeWindows.push(w.mins); });
    });
    const sortedWW = [...allWakeWindows].sort((a,b)=>a-b);
    const trim = Math.max(1, Math.floor(sortedWW.length * 0.1));
    const trimmedWW = sortedWW.slice(trim, sortedWW.length - trim);
    const personalAvgWW = trimmedWW.length >= 3 ? Math.round(trimmedWW.reduce((a,b)=>a+b,0)/trimmedWW.length) : null;
    const personalWWMin = personalAvgWW ? Math.max(25, Math.round(personalAvgWW * 0.88)) : null;
    const personalWWMax = personalAvgWW ? Math.max((personalWWMin||45)+15, Math.round(personalAvgWW * 1.12)) : null;


    const napCountsArr = recent.map(d => (days[d]||[]).filter(e=>e.type==="nap"&&!e.night).length).filter(v=>v>0);
    const personalNapCount = napCountsArr.length ? Math.round(napCountsArr.reduce((a,b)=>a+b,0)/napCountsArr.length) : null;

    const napDurArr = [];
    recent.forEach(d => {
      (days[d]||[]).filter(e=>e.type==="nap"&&!e.night&&e.start&&e.end).forEach(n => {
        const dur = minDiff(n.start, n.end);
        if(dur > 5 && dur < 240) napDurArr.push(dur);
      });
    });
    const sortedND = [...napDurArr].sort((a,b)=>a-b);
    const trimND = Math.max(1, Math.floor(sortedND.length * 0.1));
    const trimmedND = sortedND.slice(trimND, sortedND.length - trimND);
    const personalAvgNapDur = trimmedND.length >= 3 ? Math.round(trimmedND.reduce((a,b)=>a+b,0)/trimmedND.length) : null;


    const totalNapArr = recent.map(d => {
      const ns = (days[d]||[]).filter(e=>e.type==="nap"&&!e.night);
      return ns.reduce((s,n)=>s+minDiff(n.start,n.end),0);
    }).filter(v=>v>0);
    const personalTotalNap = totalNapArr.length ? Math.round(totalNapArr.reduce((a,b)=>a+b,0)/totalNapArr.length) : null;


    const feedArr = recent.map(d => {
      const fs = (days[d]||[]).filter(e=>e.type==="feed"&&e.feedType!=="solids");
      return fs.reduce((s,f)=>s+(f.amount||0),0);
    }).filter(v=>v>0);
    const sortedF = [...feedArr].sort((a,b)=>a-b);
    const trimF = Math.max(1, Math.floor(sortedF.length * 0.1));
    const personalAvgMl = sortedF.slice(trimF, sortedF.length - trimF).length >= 2
      ? Math.round(sortedF.slice(trimF, sortedF.length - trimF).reduce((a,b)=>a+b,0) / sortedF.slice(trimF, sortedF.length - trimF).length)
      : (feedArr.length ? Math.round(feedArr.reduce((a,b)=>a+b,0)/feedArr.length) : null);


    const feedCountArr = recent.map(d => (days[d]||[]).filter(e=>e.type==="feed"&&!e.night&&e.feedType!=="solids").length).filter(v=>v>0);
    const personalFeedCount = feedCountArr.length ? Math.round(feedCountArr.reduce((a,b)=>a+b,0)/feedCountArr.length) : null;


    const bedArr = recent.map(d => {
      const e = (days[d]||[]).find(x=>x.type==="sleep"&&!x.night);
      if(!e) return null;
      const [h,m]=e.time.split(":").map(Number); return h*60+m;
    }).filter(v=>v!==null);
    const personalAvgBed = bedArr.length >= 3 ? Math.round(bedArr.reduce((a,b)=>a+b,0)/bedArr.length) : null;


    const w = age.totalWeeks;
    const nhsWW = getWakeWindow(w);
    const nhsNapProfile = getAgeNapProfile(w);
    const nhsBedMin = 18*60, nhsBedMax = 20*60;


    const wwDiff = personalAvgWW ? personalAvgWW - Math.round((nhsWW.min+nhsWW.max)/2) : 0;
    const mlDiff = personalAvgMl && age ? (() => {
      let target;
      if(w<4)target=550;else if(w<8)target=650;else if(w<13)target=750;else if(w<26)target=850;else if(w<39)target=700;else if(w<52)target=600;else target=400;
      return personalAvgMl - target;
    })() : 0;

    return {
      activeDays: activeDays.length,
      personalAvgWW, personalWWMin, personalWWMax,
      personalNapCount, personalAvgNapDur, personalTotalNap,
      personalAvgMl, personalFeedCount,
      personalAvgBed: personalAvgBed ? mtp(personalAvgBed) : null,
      nhsWW, nhsNapProfile,
      wwDiff, mlDiff,
      hasEnoughData: personalAvgWW !== null && personalAvgMl !== null
    };
  }


  React.useEffect(()=>{
    if(usePersonalRecs !== null) {
      try{localStorage.setItem("use_personal_recs_v1", JSON.stringify(usePersonalRecs));}catch{}
    }
  },[usePersonalRecs]);

  React.useEffect(()=>{
    try{localStorage.setItem("fluid_unit_v1",fluidUnit);}catch{}
  },[fluidUnit]);


  function parseTime(str, previousMinutes=null) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    str = str.replace(/(\d+)(st|nd|rd|th)/g,"$1");

    let m = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
    if (m) {
      let h = parseInt(m[1]), min = parseInt(m[2]);
      const suffix = m[3];
      if (suffix==="pm" && h<12) h+=12;
      if (suffix==="am" && h===12) h=0;
      let total = h*60 + min;
      if (!suffix && previousMinutes!==null && total <= previousMinutes) {


        const crossedMidnight = previousMinutes >= 1080 && total < 720;
        if (!crossedMidnight) {
          while (total <= previousMinutes && total < 24*60) total += 12*60;
        }
      }
      total = total % (24*60);
      return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
    }

    m = str.match(/(\d{1,2})\s*(am|pm)?/);
    if (m) {
      let h = parseInt(m[1]), min = 0;
      const suffix = m[2];
      if (suffix==="pm" && h<12) h+=12;
      if (suffix==="am" && h===12) h=0;
      let total = h*60 + min;
      if (!suffix && previousMinutes!==null && total <= previousMinutes) {

        const crossedMidnight = previousMinutes >= 1080 && total < 720;
        if (!crossedMidnight) {
          while (total <= previousMinutes && total < 24*60) total += 12*60;
        }
      }
      total = total % (24*60);
      return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
    }
    return null;
  }

  function parseAmount(str) {
    const m = str.match(/(\d+)\s*ml/i);
    return m ? parseInt(m[1]) : 0;
  }

  function parseTimeRange(str, previousMinutes=null) {
    const sep = str.match(/(.+?)\s*(?:-|–|to)\s*(.+)/i);
    if (!sep) return null;

    const startRaw = sep[1].trim();
    const endRaw   = sep[2].trim();

    const startHasSuffix = /\d\s*(am|pm)/i.test(startRaw);
    const endHasSuffix   = /\d\s*(am|pm)/i.test(endRaw);


    let augmentedStart = startRaw;
    if (!startHasSuffix && endHasSuffix) {
      const endSuffix = (endRaw.match(/\d\s*(am|pm)/i) || [])[1];
      const startHour = parseInt((startRaw.match(/(\d{1,2})/) || [])[1] || "0");
      const endHour   = parseInt((endRaw.match(/(\d{1,2})/)   || [])[1] || "0");
      if (startHour <= endHour) augmentedStart = startRaw + endSuffix;
    }


    const start = parseTime(augmentedStart, (startHasSuffix || endHasSuffix) ? null : previousMinutes);
    const startMins = start ? timeVal(start) : previousMinutes;


    const end = endHasSuffix
      ? parseTime(endRaw, null)
      : parseTime(endRaw, startMins);

    if (start && end) return { start, end };
    return null;
  }

  function smartParse(text) {
    const rawLines = text.split(/\n/).map(function(l){return l.trim();}).filter(Boolean);
    const entries = [];
    const warnings = [];
    let lastMinutes = null;

    const tMins = (s) => { if(!s) return 0; const[h,m]=s.split(":").map(Number); return h*60+m; };


    const todayEntries = (days[selDay]||[]).filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
    if (todayEntries.length > 0) {
      const first = todayEntries[0];
      lastMinutes = timeVal(first);
    }

    let detectedDate = null;
    let yearWarning = null;

    if (rawLines.length > 0) {
      const dateMatch = rawLines[0].match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      if (dateMatch) {
        const d=dateMatch[1], mo=dateMatch[2], y=dateMatch[3];
        let yr = y.length===2 ? "20"+y : y;
        const currentYear = new Date().getFullYear();
        const parsedYear = parseInt(yr);
        if(parsedYear > currentYear) {
          yearWarning = { type:"future", parsed:parsedYear, corrected:String(currentYear) };
          yr = String(currentYear);
        } else if(parsedYear < currentYear) {
          yearWarning = { type:"past", parsed:parsedYear, corrected:String(currentYear) };
          yr = String(currentYear);
        }
        detectedDate = yr+"-"+mo.padStart(2,"0")+"-"+d.padStart(2,"0");
      }
    }

    if (!detectedDate && rawLines.some(l => /\btoday\b/i.test(l))) {
      detectedDate = todayStr();
    }

    const processedLines = rawLines.map(l => l.replace(/\btoday\b/gi, "").trim()).filter(Boolean);

    processedLines.forEach(function(raw) {
      const l = raw.toLowerCase().trim();
      if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{2,4})/.test(l)) return;
      if (/^(day|date)\s*:/.test(l)) return;


      if (/dream\s*feed/.test(l)) {
        const t = parseTime(raw.replace(/dream\s*feed/i,""), lastMinutes);
        const ml = parseAmount(raw);
        if (t) { entries.push({type:"feed",time:t,amount:ml,night:true,note:"Dream feed",id:uid(),feedType:"milk"}); lastMinutes = tMins(t); }
        else warnings.push("Couldn't parse dream feed: \""+raw+"\"");
        return;
      }


      if (/wake\s*\d|night\s*wake|woke\s*\d/.test(l)) {
        const t = parseTime(raw.replace(/wake\s*\d+|night\s*wake|woke\s*\d+/i,""), lastMinutes);
        const ml = parseAmount(raw);
        const hasNote = /self.settled|settled\s*without|no\s*milk|went\s*back|fussed|cried/i.test(raw);
        const note = hasNote ? raw.replace(/wake\s*\d+/i,"").replace(/^\s*[-–:\s]*/,"").trim() : "";
        if (t) { entries.push({type:ml>0?"feed":"wake",time:t,amount:ml||0,night:true,note:note,id:uid(),feedType:"milk"}); lastMinutes = tMins(t); }
        else warnings.push("Couldn't parse night wake: \""+raw+"\"");
        return;
      }


      if (/woke?\s*up|wake\s*up|morning|got\s*up/.test(l)) {
        const t = parseTime(raw.replace(/woke?\s*up|wake\s*up|morning|got\s*up/i,""), lastMinutes);
        if (t) { entries.push({type:"wake",time:t,night:false,note:"",id:uid()}); lastMinutes = tMins(t); }
        else warnings.push("Couldn't parse wake time: \""+raw+"\"");
        return;
      }


      if (/\b(asleep|bedtime|bed time|went to sleep|down for bed|bed|sleep)\b/.test(l) && !/nap/.test(l) && !/wake/.test(l)) {
        const bedRaw = raw.replace(/asleep|bedtime|bed time|went to sleep|down for bed|sleep|bed/ig,"").trim();

        const bedHasSuffix = /\d\s*(am|pm)\s*$/i.test(bedRaw);
        const t = parseTime(bedRaw, bedHasSuffix ? null : lastMinutes);
        if (t) { entries.push({type:"sleep",time:t,night:false,note:"",id:uid()}); lastMinutes = tMins(t); }
        else warnings.push("Couldn't parse bedtime: \""+raw+"\"");
        return;
      }


      if (/\bnap\b/.test(l)) {


        const rangeStr = raw.replace(/nap\s*(\d+(?![\d:]))\s*/i,"").replace(/nap\s*/i,"").replace(/^[\s:\-–]+/,"").trim();


        const rangeSep = rangeStr.match(/^(.+?)\s*(?:-|–|to)\s*(.+)$/i);
        let napStart = null, napEnd = null;
        if (rangeSep) {


          const startRaw = rangeSep[1].trim();
          const endRaw   = rangeSep[2].trim();
          const startHasSuffix = /\s*(am|pm)\s*$/i.test(startRaw);
          const endHasSuffix   = /\s*(am|pm)\s*$/i.test(endRaw);

          napStart = parseTime(startRaw, startHasSuffix ? null : lastMinutes);
          if (napStart) {
            const startMins = timeVal({time: napStart});

            napEnd = parseTime(endRaw, endHasSuffix ? null : startMins);
          }
        }
        if (napStart && napEnd) {
          entries.push({type:"nap",start:napStart,end:napEnd,night:false,note:"",id:uid()});
          lastMinutes = timeVal({time: napEnd});
        } else {
          const t = parseTime(rangeStr, lastMinutes);
          if (t) warnings.push('Found nap but no end time: "'+raw+'" — add it manually');
          else warnings.push("Couldn't parse nap: \""+raw+"\"");
        }
        return;
      }


      if (/feed|fed|bottle|milk|oz|\bml\b/.test(l) && !/sleep/.test(l)) {
        const ml = parseAmount(raw);
        const cleaned = raw.replace(/feed|fed|bottle|milk/i,"").replace(/\d+\s*ml/i,"").trim();
        const range = parseTimeRange(cleaned, lastMinutes);
        const t = range ? range.start : parseTime(cleaned, lastMinutes);

        const _mts=(mn)=>{const h=Math.floor(mn/60)%24,m=mn%60;return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");};
        const finalT = t || (lastMinutes !== null ? _mts(lastMinutes) : nowTime());
        entries.push({type:"feed",time:finalT,amount:ml,night:false,note:t?"":"(time estimated)",id:uid(),feedType:"milk"});
        if (t) lastMinutes = tMins(t);

        return;
      }


      const shorthand = l.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:feed|bottle|fed|f)?\s*(\d{2,3})(?:\s*ml)?$/);
      if (shorthand) {
        const t = parseTime(shorthand[1], lastMinutes);
        const ml = parseInt(shorthand[2]);
        if (t && ml >= 10 && ml <= 500) {
          entries.push({type:"feed",time:t,amount:ml,night:false,note:"",id:uid(),feedType:"milk"});
          lastMinutes = tMins(t);
          return;
        }
      }


      const bare = l.match(/^(\d{1,2}(?::\d{2})?)\s+(\d{2,3})$/);
      if (bare) {
        const t = parseTime(bare[1], lastMinutes);
        const num = parseInt(bare[2]);
        if (t && num >= 10 && num <= 500) {
          entries.push({type:"feed",time:t,amount:num,night:false,note:"",id:uid(),feedType:"milk"});
          lastMinutes = tMins(t);
          return;
        }
      }

      warnings.push("Couldn't understand: \""+raw+"\" — skipped");
    });

    return { entries: entries, warnings: warnings, detectedDate: detectedDate, yearWarning: yearWarning };
  }

  function openPaste() {
    setPasteText(""); _setParsedEntries(null); setParseError("");
    setModal("paste");
  }

  function runParse() {
    if (!pasteText.trim()) return;


    if (!selDay && !pasteText.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)) {
      setParseError("No day tab is open and no date was found in your notes. Open a day tab first or include a date.");
      return;
    }
    const result = smartParse(pasteText);
    if (result.entries.length === 0) {
      setParseError("Couldn't find any entries. Try including times like '9am', '11:15-12:35' and keywords like Feed, Nap, Wake.");
      _setParsedEntries(null);
    } else {
      _setParsedEntries(result);
      setParseError("");
    }
  }

  function confirmPaste() {
    if (!parsedEntries) return;
    const date = parsedEntries.detectedDate || selDay;
    if (!date) {
      setParseError("No day selected. Please create or select a day first.");
      return;
    }
    setDays(d => {
      const existing = d[date] || [];
      return { ...d, [date]: autoClassifyNight([...existing, ...parsedEntries.entries]) };
    });
    if (parsedEntries.detectedDate) setSelDay(parsedEntries.detectedDate);
    setModal(null); _setParsedEntries(null); setPasteText("");
  }

  function openEntry(night=false){setEditEntry(null);setEType("feed");setFeedType("milk");setForm({amount:"",time:"",start:"",end:"",note:"",night:"no",poopType:"",breastL:"",breastR:"",pumpL:"",pumpR:""});setModal("entry");}
  function openLogPanel(panel){
    setLogForm({feedType:"bottle",amount:"",breastL:"",breastR:"",pumpL:"",pumpR:"",pumpTotal:"",pumpDuration:"",pumpStart:"",note:"",poopType:"wet",sleepType:sleepDefault(),napStart:"",napEnd:"",bedTime:"",feedTime:"",feedTimeSet:false});
    setLogPanel(panel);
  }


  function autoClassifyNight(entries, prevDayEntries) {
    const sorted = [...entries].sort((a,b) => timeVal(a) - timeVal(b));

    const bedtimes = sorted.filter(e => e.type === "sleep" && !e.night);
    let bedtime = bedtimes.length ? bedtimes[bedtimes.length-1].time : null;

    // Phantom-entry fix: if no bedtime logged today, fall back to previous day's bedtime
    // so early-morning entries (e.g. 3am feed) still get classified as night:true
    if (!bedtime && prevDayEntries) {
      const prevBeds = prevDayEntries.filter(e => e.type === "sleep" && !e.night);
      if (prevBeds.length) bedtime = prevBeds[prevBeds.length-1].time;
    }
    // If still no bedtime, use a safe default of 19:00 for classification purposes
    if (!bedtime) {
      // Only reclassify entries that are clearly overnight (midnight–04:59)
      // NEVER create phantom classifications for 5am+ entries
      return entries.map(e => {
        if (e.nightLocked) return e;
        if (e.type !== "wake" && e.type !== "feed") return e;
        const t = e.time; if (!t) return e;
        const h = parseInt(t.split(":")[0]);
        if (h >= 0 && h < 5) return {...e, night: true};
        // Explicitly ensure anything 5am+ stays as daytime
        if (h >= 5 && e.night) return {...e, night: false};
        return e;
      });
    }

    // Only consider non-locked day wakes for the morning anchor
    const wakes = sorted.filter(e => e.type === "wake" && !e.nightLocked);
    const morningWake = wakes.find(e => {
      const h = parseInt((e.time||"00:00").split(":")[0]);
      return h >= 5 && h < 12;
    });
    const morningWakeTime = morningWake ? morningWake.time : null;

    const bedMins = timeVal({time: bedtime});

    return entries.map(e => {
      if (e.nightLocked) return e;
      if (e.type !== "wake" && e.type !== "feed") return e;
      const t = e.time;
      if (!t) return e;

      const tMins = timeVal({time: t});
      const h = parseInt(t.split(":")[0]);


      const afterBed = tMins > bedMins;

      const morningMins = morningWakeTime ? timeVal({time: morningWakeTime}) : 6*60;
      const crossMidnight = tMins < bedMins && tMins < morningMins && h >= 0 && h < 6;

      const shouldBeNight = afterBed || crossMidnight;

      // isMorningOrAfter only applies to early-morning entries (before bedtime),
      // NOT to entries after bedtime — those are always night
      const isMorningOrAfter = morningWakeTime && tMins >= morningMins && tMins <= bedMins;

      if (shouldBeNight && !isMorningOrAfter) return {...e, night: true};

      if (e.night && isMorningOrAfter) return {...e, night: false};
      return e;
    });
  }
  function openEdit(entry){
    // If editing a wake entry and bedtime is logged, ask day/night
    if(entry.type==="wake" && !entry.night){
      const dayEntries = days[selDay]||[];
      const hasBedtime = dayEntries.some(e=>e.type==="sleep"&&!e.night);
      if(hasBedtime){
        setWakeEditEntry(entry);
        setShowWakeEditPrompt(true);
        return;
      }
    }
    setEditEntry(entry);
    setEType(entry.type);
    setFeedType(entry.feedType||"milk");
    
    setForm({amount:entry.amount?String(mlToDisplay(entry.amount,fluidUnit)):"",time:entry.time||nowTime(),start:entry.start||nowTime(),end:entry.end||nowTime(),note:entry.note||"",night:entry.night?"yes":"no",poopType:entry.poopType||"",breastL:entry.breastL||"",breastR:entry.breastR||"",pumpL:entry.pumpL?String(mlToDisplay(entry.pumpL,fluidUnit)):"",pumpR:entry.pumpR?String(mlToDisplay(entry.pumpR,fluidUnit)):""});
    setModal("entry");
  }
  function delEntry(id){
    userDeletedCountRef.current += 1;
    const dayForEntry = selDay;
    setDays(d=>{
      const updated=(d[dayForEntry]||[]).filter(e=>e.id!==id);
      const prevD2 = dayForEntry ? (()=>{ const dt=new Date(dayForEntry+"T12:00:00"); dt.setDate(dt.getDate()-1); return dt.toISOString().slice(0,10); })() : null;
      return {...d,[dayForEntry]:autoClassifyNight(updated, prevD2 ? d[prevD2] : null)};
    });

    setTimeout(()=>{ if(backupCodeRef.current) pushToCloud(backupCodeRef.current, childrenRef.current); }, 600);
  }

  const lastLogRef = React.useRef({time:0, key:""});
  const[quickFlash,setQuickFlash]=useState(null);
  const[mascotPopup,setMascotPopup]=useState(null); // {type:'celebration'|'thinking'|'loading', message:'...'}
  const[viewPhoto,setViewPhoto]=useState(null); // {id, dataUrl, date, time} — full-screen photo viewer

  function showMascot(type, message, duration=3000){
    setMascotPopup({type, message});
    if(duration > 0) setTimeout(()=>setMascotPopup(null), duration);
  }
  function quickAddLog(type, data){

    const key = type + JSON.stringify(data);
    const now = Date.now();
    if(key === lastLogRef.current.key && now - lastLogRef.current.time < 2000) return;
    lastLogRef.current = {time: now, key};
    setDays(d=>{
      const u=[...(d[selDay]||[]),{id:uid(),night:false,...data}];
      const prevD = selDay ? (d=>{ const dt=new Date(selDay+"T12:00:00"); dt.setDate(dt.getDate()-1); return dt.toISOString().slice(0,10); })() : null;
      return{...d,[selDay]:autoClassifyNight(u, prevD ? d[prevD] : null)};
    });
    setLogPanel(null);
    // Haptic feedback — strong triple pulse
    try{navigator.vibrate&&navigator.vibrate([35,25,35]);}catch{}
    // Visual flash — brief confirmation
    const label = type==="feed"?(data.feedType==="breast"?"🤱 Logged":"🍼 Logged"):type==="poop"?"💩 Logged":type==="wake"?"☀️ Logged":type==="nap"?"😴 Started":"✓ Logged";
    setQuickFlash(label);
    setTimeout(()=>setQuickFlash(null),900);
  }

  function saveLogFeed(){
    const f=logForm;
    const t = f.feedTime || nowTime();
    if(f.feedType==="bottle"){
      quickAddLog("feed",{type:"feed",time:t,feedType:"milk",amount:displayToMl(f.amount,FU),note:f.note||""});
    } else if(f.feedType==="breast"){
      quickAddLog("feed",{type:"feed",time:t,feedType:"breast",breastL:parseInt(f.breastL)||0,breastR:parseInt(f.breastR)||0,amount:0,note:f.note||""});
    } else if(f.feedType==="pump"){
      const pL=displayToMl(f.pumpL,FU), pR=displayToMl(f.pumpR,FU);
      quickAddLog("feed",{type:"feed",time:t,feedType:"pump",pumpL:pL,pumpR:pR,amount:pL+pR,note:f.note||""});
    } else {
      quickAddLog("feed",{type:"feed",time:t,feedType:"solids",amount:0,note:f.note||""});
    }
  }

  function saveLogPump(){
    const f=logForm;
    const t = f.pumpStart || nowTime();
    const total = displayToMl(f.pumpTotal,FU);
    const pL = displayToMl(f.pumpL,FU);
    const pR = displayToMl(f.pumpR,FU);

    const finalL = (f.pumpL===""&&f.pumpR===""&&total>0) ? Math.round(total/2) : pL;
    const finalR = (f.pumpL===""&&f.pumpR===""&&total>0) ? total-Math.round(total/2) : pR;
    const finalTotal = finalL+finalR || total;
    quickAddLog("feed",{type:"feed",time:t,feedType:"pump",pumpL:finalL,pumpR:finalR,amount:finalTotal,pumpDuration:parseInt(f.pumpDuration)||0,note:f.note||""});
  }

  function saveLogNappy(poopType){
    quickAddLog("poop",{type:"poop",time:nowTime(),poopType,note:""});
  }

  function saveLogSleep(){
    const f=logForm;
    if(f.sleepType==="nap"){
      quickAddLog("nap",{type:"nap",start:f.napStart||nowTime(),end:f.napEnd||nowTime(),night:false,note:""});
    } else {
      quickAddLog("sleep",{type:"sleep",time:f.bedTime||nowTime(),night:false,note:""});
    }
  }
  function saveEntry(){
    let e={id:editEntry?editEntry.id:uid(),note:form.note||"",nightLocked:editEntry?editEntry.nightLocked:false};
    const formTime = form.time || nowTime();
    const formStart = form.start || nowTime();
    const formEnd = form.end || nowTime();
    if(eType==="feed"){
      if(feedType==="breast"){
        const bL=parseInt(form.breastL)||0, bR=parseInt(form.breastR)||0;
        e={...e,type:"feed",time:formTime,amount:0,feedType:"breast",breastL:bL,breastR:bR,night:form.night==="yes"};
      } else if(feedType==="pump"){
        const pL=parseInt(form.pumpL)||0, pR=parseInt(form.pumpR)||0;
        e={...e,type:"feed",time:formTime,amount:pL+pR,feedType:"pump",pumpL:pL,pumpR:pR,night:form.night==="yes"};
      } else {
        e={...e,type:"feed",time:formTime,amount:displayToMl(form.amount,FU),night:form.night==="yes",feedType:feedType};
      }
    }
    else if(eType==="nap"){e={...e,type:"nap",start:formStart,end:formEnd,night:false};}
    else if(eType==="poop"){e={...e,type:"poop",time:formTime,poopType:form.poopType||"",night:false};}
    else{e={...e,type:eType,time:formTime,night:false};}
    if(editEntry){
      setDays(d=>{
        const updated = (d[selDay]||[]).map(x=>x.id===editEntry.id?e:x);
        const _pd=(()=>{const dt=new Date(selDay+"T12:00:00");dt.setDate(dt.getDate()-1);return dt.toISOString().slice(0,10);})();
        return {...d,[selDay]:autoClassifyNight(updated,d[_pd]||null)};
      });
    } else {
      setDays(d=>{
        const updated = [...(d[selDay]||[]), e];
        const _pd=(()=>{const dt=new Date(selDay+"T12:00:00");dt.setDate(dt.getDate()-1);return dt.toISOString().slice(0,10);})();
        return {...d,[selDay]:autoClassifyNight(updated,d[_pd]||null)};
      });
      trackEvent("entry_logged", {type: eType});
    }
    setModal(null);setEditEntry(null);
  }
  function quickFeed(ml){
    setDays(d=>{
      const updated=[...(d[selDay]||[]),{id:uid(),type:"feed",time:nowTime(),amount:ml,feedType:"milk",night:false,note:""}];
      const _pd=(()=>{const dt=new Date(selDay+"T12:00:00");dt.setDate(dt.getDate()-1);return dt.toISOString().slice(0,10);})();
      return {...d,[selDay]:autoClassifyNight(updated,d[_pd]||null)};
    });
  }

  function reorderEntry(fromId, toId){
    if(fromId===toId) return;
    setDays(d=>{
      const arr=[...(d[selDay]||[])];
      const fi=arr.findIndex(e=>e.id===fromId);
      const ti=arr.findIndex(e=>e.id===toId);
      if(fi<0||ti<0) return d;
      const [moved]=arr.splice(fi,1);
      arr.splice(ti,0,moved);
      return {...d,[selDay]:arr};
    });
  }
  function handleSmartWake(){
    const dayEntries = days[selDay]||[];
    const hasBedtime = dayEntries.some(e=>e.type==="sleep"&&!e.night);
    const h = new Date().getHours();
    
    if(!hasBedtime){
      // No bedtime logged — just log morning wake
      quickAddLog("wake",{type:"wake",time:nowTime(),night:false,note:""});
      return;
    }
    
    // Bedtime IS logged
    if(h >= 12){
      // It's PM after bedtime — assume night wake
      setNwForm({time:nowTime(),ml:"",selfSettled:false,assisted:false,assistedType:"milk",assistedNote:"",assistedDuration:"",note:""});
      setShowNightWake(true);
    } else {
      // It's AM — could be night wake or start of day
      setShowWakePrompt(true);
    }
  }

  function logMorningWakeNextDay(){
    // Log wake on the next day
    const nextDay = (()=>{const d=new Date(selDay+"T12:00:00");d.setDate(d.getDate()+1);return d.toISOString().split("T")[0];})();
    const entry = {id:uid(),type:"wake",time:nowTime(),night:false,note:""};
    setDays(d=>{
      const existing = d[nextDay]||[];
      return {...d,[nextDay]:[...existing,entry]};
    });
    setShowWakePrompt(false);
    setSelDay(nextDay);
    try{navigator.vibrate&&navigator.vibrate([35,25,35]);}catch{}
    setQuickFlash("☀️ Wake logged on "+fmtDate(nextDay));
    setTimeout(()=>setQuickFlash(null),1200);
  }

  function startNap(){
    if (napOn) return; // already running
    const t=nowTime();
    // Clear any stale start time from a previous session
    try{localStorage.setItem("nap_startT",t);localStorage.setItem("nap_on","1");localStorage.setItem("nap_sec","0");}catch{}
    setNapStartT(t);setNapSec(0);setNapOn(true);
    setTimerMode("activeSleep");
  }

  function logBedtimeNow(){

    const already = (days[selDay]||[]).some(e => e.type==="sleep" && !e.night);
    if (already) return;
    quickAddLog("sleep",{type:"sleep",time:nowTime(),night:false,note:""});
  }


  function startBreastTimer(side){
    if(!breastStartTime){
      const t=nowTime();
      setBreastStartTime(t);
      try{localStorage.setItem("breast_startTime",t);}catch{}
    }
    setBreastSide(side);
    setBreastActive(true);
  }
  function pauseBreastTimer(){setBreastActive(false);}
  function switchBreastSide(side){
    setBreastActive(true);
    setBreastSide(side);
  }
  function saveBreastFeed(){
    if(!breastStartTime && breastSec.L===0 && breastSec.R===0) return;
    const totalSec = breastSec.L + breastSec.R;
    // Allow saving even with 0 seconds — logs as breastfeed at start time
    const lMins=breastSec.L > 0 ? Math.max(1, Math.round(breastSec.L/60)) : 0;
    const rMins=breastSec.R > 0 ? Math.max(1, Math.round(breastSec.R/60)) : 0;
    const entry={id:uid(),type:"feed",feedType:"breast",time:breastStartTime||nowTime(),amount:0,breastL:lMins,breastR:rMins,night:false,note:""};

    setBreastSide(null);setBreastSec({L:0,R:0});setBreastActive(false);setBreastStartTime(null);
    try{["breast_side","breast_sec","breast_active","breast_startTime"].forEach(k=>localStorage.removeItem(k));}catch{}
    setDays(d=>{const updated=[...(d[selDay]||[]),entry];const _pd=(()=>{const dt=new Date(selDay+"T12:00:00");dt.setDate(dt.getDate()-1);return dt.toISOString().slice(0,10);})();return{...d,[selDay]:autoClassifyNight(updated,d[_pd]||null)};});
    trackEvent("entry_logged",{type:"breast_feed"});
    try{navigator.vibrate&&navigator.vibrate([40,30,40]);}catch{}
    setQuickFlash("🤱 Feed Logged ✓");
    setTimeout(()=>setQuickFlash(null),1200);
  }
  function cancelBreastTimer(){
    setBreastSide(null);setBreastSec({L:0,R:0});setBreastActive(false);setBreastStartTime(null);
    try{["breast_side","breast_sec","breast_active","breast_startTime"].forEach(k=>localStorage.removeItem(k));}catch{}
  }
  function endNap(){
    if(!napOn) return;
    if (!napStartT) { setNapOn(false); setTimerMode("prediction"); return; }
    setNapOn(false);
    const end=nowTime();
    const [sh,sm]=napStartT.split(":").map(Number);
    const [eh,em]=end.split(":").map(Number);
    let durMins = (eh*60+em) - (sh*60+sm);
    if (durMins < 0) durMins += 24*60;
    const h = new Date().getHours();
    const isNightTime = h >= 19 || h < 6;
    const hasBedtime = (days[selDay]||[]).some(e => e.type==="sleep" && !e.night);
    if (isNightTime || hasBedtime) {
      // Show prompt: night wake, morning wake, or nap?
      setTimerEndPrompt({start: napStartT, end, durMins});
    } else {
      // Daytime with no bedtime — log as nap directly
      setDays(d=>{
        const updated=[...(d[selDay]||[]),{id:uid(),type:"nap",start:napStartT,end,duration:durMins,night:false,note:""}];
        const _pd=(()=>{const dt=new Date(selDay+"T12:00:00");dt.setDate(dt.getDate()-1);return dt.toISOString().slice(0,10);})();
        return {...d,[selDay]:autoClassifyNight(updated,d[_pd]||null)};
      });
    }
    setNapStartT(null);setNapSec(0);
    setTimerMode("prediction");
    try{["nap_on","nap_startT","nap_sec"].forEach(k=>localStorage.removeItem(k));}catch{}
  }
  function copySummary(){
    const ln=[`${fmtLong(selDay)} — ${possessive(babyName||"Baby")} Day`,""];
    dayE.forEach(e=>{
      if(e.type==="wake")ln.push(`☀️ Wake up ${fmt12(e.time)}`);
      else if(e.type==="feed")ln.push(`🍼 Feed ${fmtVol(e.amount,FU)} at ${fmt12(e.time)}${e.note?` (${e.note})`:""}`);
      else if(e.type==="nap")ln.push(`😴 Nap ${fmt12(e.start)}–${fmt12(e.end)} (${hm(minDiff(e.start,e.end))})${e.note?` (${e.note})`:""}`);
      else if(e.type==="sleep")ln.push(`🌙 Bedtime ${fmt12(e.time)}`);
    });
    if(nightE.length){ln.push("");ln.push("Night:");nightE.forEach((e,i)=>ln.push(`🌟 Wake ${i+1} ${fmt12(e.time)}${e.amount?` — ${fmtVol(e.amount,FU)}`:""}${e.note?` (${e.note})`:""}`));}
    ln.push("");ln.push(`Total feeds: ${fmtVol(totalMl,FU)} · Naps: ${naps.length} (${hm(napMins)})`);
    navigator.clipboard.writeText(ln.join("\n")).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  }
  function addDay(){
    if(!newDate)return;
    const currentYear = new Date().getFullYear();
    const targetYear = parseInt((newDate||"").split("-")[0]);
    if(targetYear && targetYear > currentYear){
      alert("Future year dates aren't allowed — please enter a past date.");
      return;
    }
    if(targetYear && targetYear < currentYear){
      if(window.confirm("That date is in " + targetYear + ". Did you mean " + currentYear + "?\n\nPress OK to use " + currentYear + ", or Cancel to keep " + targetYear + ".")){
        const corrected = newDate.replace(String(targetYear), String(currentYear));
        setNewDate(corrected);
        return;
      }
    }
    if(!days[newDate])setDays(d=>({...d,[newDate]:[]}));
    setSelDay(newDate);
    setModal(null);
  }


  const dedupDoneRef = React.useRef(false);
  useEffect(()=>{
    if(dedupDoneRef.current) return;
    dedupDoneRef.current = true;
    setChildren(prev => {
      let changed = false;
      const cleaned = {};
      Object.entries(prev).forEach(([cid, child]) => {
        const cleanDays = {};
        Object.entries(child.days || {}).forEach(([date, entries]) => {
          const deduped = dedupEntries(entries || []);
          cleanDays[date] = deduped;
          if(deduped.length !== (entries||[]).length) changed = true;
        });
        cleaned[cid] = {...child, days: cleanDays};
      });
      return changed ? cleaned : prev;
    });
  }, []);


  /* Auto next-day creation removed — users add days manually */


  useEffect(()=>{
    function ensureToday(){
      const t = todayStr();
      setDays(d => d[t] ? d : {...d, [t]: []});
      setSelDay(s => s === t ? s : t);
    }
    ensureToday();

    function scheduleMidnight(){
      const now = new Date();
      const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 1).getTime() - now.getTime();
      return setTimeout(()=>{ ensureToday(); scheduleMidnight(); }, msUntilMidnight);
    }
    const t = scheduleMidnight();
    return ()=>clearTimeout(t);
  }, []);
  function saveEditDay(){
    if(!editDate||editDate===menuDay){setModal(null);return;}

    const currentYear = new Date().getFullYear();
    const targetYear = parseInt((editDate||"").split("-")[0]);
    if(targetYear && targetYear > currentYear) {
      alert("Future year dates aren't allowed — please enter a date in " + currentYear + " or earlier.");
      return;
    }
    if(targetYear && targetYear < currentYear) {
      if(!window.confirm("That date is in " + targetYear + ". Did you mean " + currentYear + "? Press OK to use " + currentYear + ", or Cancel to keep " + targetYear + ".")) {

      } else {

        setEditDate(editDate.replace(/^\d{4}/, String(currentYear)));
        return;
      }
    }

    const targetEntries = days[editDate] || [];
    if(targetEntries.length > 0){alert("A day with data already exists on that date.");return;}
    setDays(d=>{const c={...d};c[editDate]=c[menuDay];delete c[menuDay];return c;});
    setSelDay(editDate);setModal(null);
  }
  function delDay(){
    const deletedCount = (days[menuDay]||[]).length;
    if(deletedCount > 0){ setConfirmDeleteDay(true); return; }
    _doDelDay();
  }
  function _doDelDay(){
    const dayToDelete = menuDay;
    Object.keys(children).forEach(cid => {
      deletedDaysRef.current.add(cid + ":" + dayToDelete);
    });
    const cnt = (days[dayToDelete]||[]).length;
    userDeletedCountRef.current += cnt;
    setDays(d=>{
      const c={...d};
      delete c[dayToDelete];
      const rem = Object.keys(c).sort().filter(k=>k!==dayToDelete);
      setSelDay(rem[rem.length-1]||null);
      return c;
    });
    setConfirmDeleteDay(false);
    setModal(null);
    setTimeout(()=>{ if(backupCodeRef.current) pushToCloud(backupCodeRef.current, childrenRef.current); }, 600);
  }
  function addWeight(){
    if(!wForm.kg)return;
    const updated=[...weights.filter(x=>x.date!==wForm.date),{date:wForm.date,kg:parseFloat(wForm.kg)}].sort((a,b)=>a.date.localeCompare(b.date));
    setWeights(updated);setWForm({date:todayStr(),kg:""});
  }


  useEffect(()=>{
    const keys = Object.keys(days).sort();
    if (keys.length > 0 && (!selDay || !days[selDay])) {
      setSelDay(keys[keys.length - 1]);
    }
  },[Object.keys(days).join(",")]);

  const tabSt=t=>({flex:"none",padding:"8px 14px 6px",border:_bN,background:"none",fontSize:9,fontWeight:tab===t?700:500,cursor:_cP,color:tab===t?C.ter:"var(--text-lt)",display:"flex",flexDirection:"column",alignItems:"center",gap:2,letterSpacing:"0.02em",position:"relative",transition:"transform 0.2s cubic-bezier(.23,1,.32,1)",borderRadius:12});
  const card={background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",border:"1px solid var(--card-border)",borderRadius:20,padding:"16px",marginBottom:14,boxShadow:"var(--card-shadow)",transition:"transform 0.2s cubic-bezier(.23,1,.32,1),box-shadow 0.25s ease"};

  const tabIcons={day:"📅",insights:"💡",milestones:"⭐",develop:"🧩",settings:"👤"};
  const tabLabels={day:"Day",insights:"Insights",milestones:"Milestones",develop:"Development",settings:""};


  if (authScreen) {
    const isLogin = authMode === "login";
    const canSubmit = authUsername.trim().length >= 3 && authPin.length === 4 && (!isLogin ? authPin2 === authPin && agreedToTerms : true);

    async function handleAuth(pinArg, pin2Arg) {
      const pin = typeof pinArg === "string" ? pinArg : authPin;
      const pin2 = typeof pin2Arg === "string" ? pin2Arg : authPin2;
      if(pin.length !== 4) return;
      setAuthError(""); setAuthLoading(true);
      if(isLogin) {
        const ok = await verifyLogin(authUsername, pin);
        if(ok) {
          try{ localStorage.setItem("onboarded_v2","1"); }catch{}
          setOnboarded(true); setAuthScreen(null);
        } else {
          setAuthError("Wrong PIN — try again");
          setAuthPin(""); setAuthLoading(false);
        }
      } else {
        if(pin !== pin2) { setAuthError("PINs don't match"); setAuthPin2(""); setAuthLoading(false); return; }
        const ok = await reserveUsername(authUsername, pin);
        if(ok) {
          try{ localStorage.setItem("onboarded_v2","1"); }catch{}
          try{ localStorage.removeItem("tut_v2"); }catch{}
          setTutStep(0); setNeedsChildSetup(true); setOnboarded(true); setAuthScreen(null);
        } else { setAuthError("That username is taken — try another"); setAuthLoading(false); }
      }
    }

    return (
      <div style={{height:"100vh",background:"var(--bg-grad)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",overflowY:"auto",padding:"0 24px 24px",fontFamily:"'DM Sans',sans-serif"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 0 16px"}}>
          <img src="obubba-happy.png" style={{width:56,height:56,borderRadius:14,marginBottom:10,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}/>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:C.deep,marginBottom:3}}>OBubba</div>
          <div style={{fontSize:14,color:C.lt}}>{isLogin?"Welcome back":"Create your account"}</div>
        </div>
        <div style={{display:"flex",background:"var(--card-bg-alt)",borderRadius:99,padding:4,marginBottom:16,gap:4}}>
          {[["login","Sign In"],["create","Create Account"]].map(([m,l])=>(
            <button key={m} onClick={()=>{setAuthMode(m);setAuthError("");setAuthPin("");setAuthPin2("");setAuthUsernameStatus("idle");setAgreedToTerms(false);}}
              style={{padding:"7px 16px",borderRadius:99,border:_bN,background:authMode===m?"var(--card-bg-solid)":"transparent",color:authMode===m?C.ter:C.lt,fontWeight:700,fontSize:13,cursor:_cP,fontFamily:_fI,transition:"all 0.2s",boxShadow:authMode===m?"0 1px 6px rgba(0,0,0,0.1)":"none"}}>
              {l}
            </button>
          ))}
        </div>

        <div style={{width:"100%",maxWidth:320}}>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:5}}>Username</label>
            <input type="text" value={authUsername}
              autoCapitalize="none" autoCorrect="off" spellCheck="false"
              autoComplete="off" data-lpignore="true" data-form-type="other"
              placeholder="e.g. TeamSmith"
              style={{width:"100%",fontSize:16,padding:"11px 14px",borderRadius:12,border:`2px solid ${isLogin?authUsernameStatus==="found"?"#50c878":authUsernameStatus==="notfound"?C.ter:C.blush:C.blush}`,background:"var(--card-bg-solid)",outline:_oN,fontFamily:_fI,boxSizing:_bBB}}
              onChange={e=>checkAuthUsername(e.target.value)}/>
            {isLogin && authUsernameStatus!=="idle" && (
              <div style={{fontSize:12,marginTop:4,textAlign:"center",color:authUsernameStatus==="found"?"#50c878":authUsernameStatus==="notfound"?C.ter:C.lt}}>
                {authUsernameStatus==="checking"?"⏳ Checking…":authUsernameStatus==="found"?"✓ Account found":"✗ No account with that username"}
              </div>
            )}
          </div>
          <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:10}}>
            {isLogin?"PIN":"Choose a PIN"}
          </label>
          {authLoading ? (
            <div style={{textAlign:"center",padding:"24px 0",fontSize:13,color:C.mid,fontFamily:_fM}}>⏳ {isLogin?"Signing in…":"Creating account…"}</div>
          ) : (
            <PinPad value={authPin} onChange={p=>{setAuthPin(p);setAuthError("");}} onComplete={isLogin?handleAuth:null}/>
          )}
          {!isLogin && !authLoading && authPin.length===4 && (
            <div style={{marginTop:16}}>
              <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:10}}>Confirm PIN</label>
              <PinPad value={authPin2} onChange={p=>{setAuthPin2(p);setAuthError("");}} onComplete={null}/>
            </div>
          )}

          {authError&&<div style={{fontSize:13,color:C.ter,textAlign:"center",marginTop:10,fontWeight:600}}>{authError}</div>}
          {isLogin && !authLoading ? (
            <button onClick={()=>handleAuth(authPin)} disabled={authPin.length!==4}
              style={{width:"100%",marginTop:10,background:authPin.length===4&&!authLoading?`linear-gradient(135deg,#c9705a,#a85a44)`:"#f2d9cc",
                border:_bN,borderRadius:99,padding:"13px",color:authPin.length===4&&!authLoading?"white":"#b89890",
                fontSize:15,fontWeight:700,cursor:authPin.length===4&&!authLoading?"pointer":"not-allowed",fontFamily:_fI,
                boxShadow:authPin.length===4?"0 4px 20px rgba(201,112,90,0.4)":"none",transition:"all 0.2s"}}>
              Sign in with PIN →
            </button>
          ) : !isLogin && !authLoading ? (
            <div>
              <div style={{display:"flex",alignItems:"flex-start",gap:8,marginTop:14,marginBottom:12,padding:"10px 12px",background:"var(--card-bg-alt)",borderRadius:12,border:`1.5px solid ${agreedToTerms?C.mint:C.blush}`}}>
                <input type="checkbox" checked={agreedToTerms} onChange={e=>setAgreedToTerms(e.target.checked)}
                  style={{marginTop:3,width:18,height:18,accentColor:C.ter,flexShrink:0,cursor:_cP}}/>
                <div style={{fontSize:12,color:C.mid,lineHeight:1.5}}>
                  I agree to the <a href="terms.html" target="_blank" style={{color:C.ter,fontWeight:600,textDecoration:"underline"}}>Terms & Conditions</a> and <a href="privacy.html" target="_blank" style={{color:C.ter,fontWeight:600,textDecoration:"underline"}}>Privacy Policy</a>
                </div>
              </div>
              <button onClick={()=>handleAuth(authPin,authPin2)} disabled={!canSubmit}
                style={{width:"100%",background:canSubmit&&!authLoading?`linear-gradient(135deg,#c9705a,#a85a44)`:"#f2d9cc",
                  border:_bN,borderRadius:99,padding:"13px",color:canSubmit&&!authLoading?"white":"#b89890",
                  fontSize:15,fontWeight:700,cursor:canSubmit&&!authLoading?"pointer":"not-allowed",fontFamily:_fI,
                  boxShadow:canSubmit?"0 4px 20px rgba(201,112,90,0.4)":"none",transition:"all 0.2s"}}>
                Create Account
              </button>
            </div>
          ) : null}

          {isLogin && !authLoading && (
            <div style={{textAlign:"center",marginTop:14}}>
              <button onClick={()=>{setShowForgotPin(true);setForgotPinStep("word");setForgotPinWord("");setForgotPinNewPin("");setForgotPinError("");}}
                style={{background:"none",border:"none",color:C.lt,fontSize:13,cursor:"pointer",fontFamily:_fI,textDecoration:"underline"}}>
                Forgot PIN?
              </button>
            </div>
          )}
        </div>

        {showForgotPin && (
        <div onClick={()=>setShowForgotPin(false)} style={{position:"fixed",inset:0,background:"rgba(44,31,26,0.6)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card-bg-solid)",borderRadius:24,padding:"28px 24px",width:"100%",maxWidth:340,boxShadow:"0 8px 40px rgba(0,0,0,0.18)"}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.deep,marginBottom:4}}>🔑 Reset PIN</div>
            <div style={{fontSize:13,color:C.lt,marginBottom:20}}>for <strong>{authUsername||"your account"}</strong></div>

            {forgotPinStep==="word" && (
              <>
                <div style={{fontSize:14,color:C.mid,marginBottom:16,lineHeight:1.6}}>Enter your <strong>recovery word</strong> to verify it's you.</div>
                <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:6}}>Recovery word</label>
                <input value={forgotPinWord} onChange={e=>{setForgotPinWord(e.target.value);setForgotPinError("");}}
                  placeholder="e.g. sunshine  or  AB3X7Y"
                  autoCapitalize="none" autoCorrect="off" spellCheck="false"
                  style={{width:"100%",fontSize:15,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--bg-solid)",outline:"none",fontFamily:_fI,color:C.deep,boxSizing:"border-box",marginBottom:14}}/>
                {forgotPinError&&<div style={{fontSize:13,color:C.ter,textAlign:"center",marginBottom:10,fontWeight:600}}>{forgotPinError}</div>}
                <button onClick={async()=>{
                  if(!forgotPinWord.trim()){setForgotPinError("Enter your recovery word");return;}
                  if(!authUsername.trim()){setForgotPinError("Enter your username first");setShowForgotPin(false);return;}
                  setForgotPinLoading(true);setForgotPinError("");
                  if(!window._fb){setForgotPinError("Not connected");setForgotPinLoading(false);return;}
                  const {db,doc,getDoc}=window._fb;
                  try{
                    const snap=await getDoc(doc(db,"usernames",normaliseUsername(authUsername)));
                    if(!snap.exists()){setForgotPinError("Username not found");setForgotPinLoading(false);return;}
                    const data=snap.data();
                    const wordHash=hashPin(forgotPinWord.trim().toLowerCase());
                    const codeMatch=(data.backupCode||data.familyCode||"").toUpperCase()===forgotPinWord.trim().toUpperCase();
                    const wordMatch=data.recoveryHash&&data.recoveryHash===wordHash;
                    if(codeMatch||wordMatch){setForgotPinStep("newpin");}
                    else{setForgotPinError("That doesn't match — check your recovery word");}
                  }catch(e){setForgotPinError("Something went wrong — try again");}
                  setForgotPinLoading(false);
                }} disabled={forgotPinLoading||!forgotPinWord.trim()}
                  style={{width:"100%",padding:"12px",borderRadius:99,border:"none",background:forgotPinWord.trim()?`linear-gradient(135deg,#c9705a,#a85a44)`:"#f2d9cc",color:forgotPinWord.trim()?"white":"#b89890",fontSize:14,fontWeight:700,cursor:forgotPinWord.trim()?"pointer":"not-allowed",fontFamily:_fI,marginBottom:10}}>
                  {forgotPinLoading?"⏳ Checking…":"Verify →"}
                </button>
                <button onClick={()=>setShowForgotPin(false)} style={{width:"100%",padding:"10px",borderRadius:99,border:"none",background:"var(--card-bg-alt)",color:C.lt,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:_fI}}>Cancel</button>
              </>
            )}

            {forgotPinStep==="newpin" && (
              <>
                <div style={{fontSize:14,color:C.mid,marginBottom:16,lineHeight:1.6}}>✅ Verified! Choose a new PIN.</div>
                <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:8}}>New PIN</label>
                <PinPad value={forgotPinNewPin} onChange={p=>{setForgotPinNewPin(p);setForgotPinError("");}}/>
                {forgotPinError&&<div style={{fontSize:13,color:C.ter,textAlign:"center",marginTop:8,fontWeight:600}}>{forgotPinError}</div>}
                <button onClick={async()=>{
                  if(forgotPinNewPin.length!==4){setForgotPinError("Enter a 4-digit PIN");return;}
                  setForgotPinLoading(true);
                  const result=await resetPinWithCode(authUsername,forgotPinWord,forgotPinNewPin);
                  setForgotPinLoading(false);
                  if(result.ok){setForgotPinStep("done");}
                  else{setForgotPinError(result.error);}
                }} disabled={forgotPinLoading||forgotPinNewPin.length!==4}
                  style={{width:"100%",marginTop:12,padding:"12px",borderRadius:99,border:"none",background:forgotPinNewPin.length===4?`linear-gradient(135deg,#c9705a,#a85a44)`:"#f2d9cc",color:forgotPinNewPin.length===4?"white":"#b89890",fontSize:14,fontWeight:700,cursor:forgotPinNewPin.length===4?"pointer":"not-allowed",fontFamily:_fI,marginBottom:8}}>
                  {forgotPinLoading?"⏳ Saving…":"Set new PIN"}
                </button>
                <button onClick={()=>setForgotPinStep("word")} style={{width:"100%",padding:"10px",borderRadius:99,border:"none",background:"var(--card-bg-alt)",color:C.lt,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:_fI}}>← Back</button>
              </>
            )}

            {forgotPinStep==="done" && (
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:12}}>✅</div>
                <div style={{fontSize:16,fontWeight:700,color:C.deep,marginBottom:8}}>PIN reset!</div>
                <div style={{fontSize:14,color:C.lt,marginBottom:20}}>Sign in with your new PIN.</div>
                <button onClick={()=>{setShowForgotPin(false);setAuthPin("");}} style={{width:"100%",padding:"12px",borderRadius:99,border:"none",background:`linear-gradient(135deg,#c9705a,#a85a44)`,color:"white",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:_fI}}>Sign in →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    );
  }


  if (!onboarded) {
    const completeOnboarding = async () => {
      if(obUsername.trim() && fbReady && obPin.length===4) {
        await reserveUsername(obUsername, obPin);
      }
      try{ localStorage.setItem("onboarded_v2","1"); }catch{}

      try{ localStorage.removeItem("tut_v2"); }catch{}
      setTutStep(0);
      setNeedsChildSetup(true);
      setOnboarded(true);
    };

    const steps = [
      {
        icon:"oliver", title:"Welcome to\nOBubba!",
        sub:"Everything you need to track your baby's world.",
        action: (
          <div style={{width:"100%",marginTop:10}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:16}}>
              {[
                ["🍼","Track feeds"],
                ["💩","Track nappies"],
                ["😴","Track sleep"],
                ["🧠","Sleep advice"],
                ["🔮","Schedule prediction"],
                ["💤","Nap prediction"],
                ["🍽️","Feed advice"],
                ["⭐","Milestone tracker"],
                ["📏","Growth tracker"],
                ["📈","Analyse trends"],
              ].map(function(item,i){
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:12,padding:"9px 10px"}}>
                    <div style={{fontSize:15}}>{item[0]}</div>
                    <div style={{fontSize:12,color:C.mid,fontWeight:500,lineHeight:1.2}}>{item[1]}</div>
                  </div>
                );
              })}
            </div>
            <button onClick={()=>setObStep(1)} style={{width:"100%",background:`linear-gradient(135deg,#c9705a,#a85a44)`,border:_bN,borderRadius:99,padding:"14px 40px",color:"white",fontSize:16,fontWeight:700,cursor:_cP,boxShadow:"0 4px 20px rgba(201,112,90,0.4)"}}>Get Started →</button>
          </div>
        )
      },
      {
        icon:"🔑",
        title:"Welcome back\nor new here?",
        sub:"Sign in to sync your existing data, or create a new account to get started.",
        action: (
          <div style={{width:"100%",marginTop:24,display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={()=>setObStep(2)} style={{width:"100%",background:`linear-gradient(135deg,#c9705a,#a85a44)`,border:_bN,borderRadius:16,padding:"18px",color:"white",fontSize:16,fontWeight:700,cursor:_cP,boxShadow:"0 4px 20px rgba(201,112,90,0.4)",fontFamily:_fI,textAlign:"left",display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
              <span style={{fontSize:28}}>✨</span>
              <div>
                <div style={{fontSize:16,fontWeight:700}}>Create new account</div>
                <div style={{fontSize:13,opacity:0.82,fontWeight:400,marginTop:2}}>Set up a username & PIN</div>
              </div>
            </button>
            <button onClick={()=>{setAuthMode("login");setAuthScreen("login");setAuthError("");setAuthPin("");}} style={{width:"100%",background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"18px",color:C.deep,fontSize:16,fontWeight:700,cursor:_cP,fontFamily:_fI,textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:28}}>🔐</span>
              <div>
                <div style={{fontSize:16,fontWeight:700}}>I already have an account</div>
                <div style={{fontSize:13,color:C.lt,fontWeight:400,marginTop:2}}>Sign in to restore your data</div>
              </div>
            </button>
          </div>
        )
      },
      {
        icon:"👨‍👩‍👧",
        title:"Choose a\nusername",
        sub:'This is how your partner will find and sync with you. Something memorable like "TeamSmith" or "BabyJones2025".',
        action: (
          <div style={{width:"100%",marginTop:20}}>
            <div style={{position:"relative",marginBottom:8}}>
              <input
                autoFocus
                type="text"
                value={obUsername}
                onChange={e=>checkUsername(e.target.value)}
                placeholder="e.g. TeamSmith"
                autoCapitalize="none" autoCorrect="off" spellCheck="false"
                autoComplete="off" data-lpignore="true" data-form-type="other"
                style={{width:"100%",fontSize:20,padding:"14px 48px 14px 18px",borderRadius:16,
                  border:`2px solid ${
                    obUsernameStatus==="available"?"#50c878":
                    obUsernameStatus==="taken"||obUsernameStatus==="invalid"?C.ter:C.blush}`,
                  background:"var(--card-bg-solid)",outline:_oN,fontFamily:_fI,textAlign:"center",
                  boxSizing:_bBB,transition:"border-color 0.2s"}}/>
              <span style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",fontSize:18}}>
                {obUsernameStatus==="checking"?"⏳":
                 obUsernameStatus==="available"?"✅":
                 obUsernameStatus==="taken"?"❌":
                 obUsernameStatus==="invalid"?"⚠️":""}
              </span>
            </div>
            <div style={{fontSize:13,textAlign:"center",marginBottom:16,minHeight:20,
              color:obUsernameStatus==="available"?"#50c878":
                    obUsernameStatus==="taken"?C.ter:
                    obUsernameStatus==="invalid"?"#b88a20":C.lt}}>
              {obUsernameStatus==="available"?"✓ Username is available!":
               obUsernameStatus==="taken"?"That username is taken — try another":
               obUsernameStatus==="invalid"?"Must be at least 3 characters":
               obUsernameStatus==="checking"?"Checking…":
               "Your partner will use this to sync with you"}
            </div>
            <button
              onClick={()=>obUsernameStatus==="available"?setObStep(3):completeOnboarding()}
              disabled={obUsernameStatus==="taken"||obUsernameStatus==="checking"||obUsernameStatus==="invalid"}
              style={{width:"100%",background:
                (obUsernameStatus==="taken"||obUsernameStatus==="checking"||obUsernameStatus==="invalid")
                  ?"#f2d9cc":`linear-gradient(135deg,#c9705a,#a85a44)`,
                border:_bN,borderRadius:99,padding:"14px",color:
                (obUsernameStatus==="taken"||obUsernameStatus==="checking"||obUsernameStatus==="invalid")
                  ?"#b89890":"white",
                fontSize:16,fontWeight:700,cursor:
                (obUsernameStatus==="taken"||obUsernameStatus==="checking"||obUsernameStatus==="invalid")
                  ?"not-allowed":"pointer",
                boxShadow:"0 4px 20px rgba(201,112,90,0.4)",marginBottom:10,transition:"all 0.2s"}}>
              {obUsernameStatus==="checking"?"Checking…":"Continue →"}
            </button>
            <button onClick={()=>completeOnboarding()} style={{width:"100%",background:_bN,border:_bN,color:C.lt,fontSize:14,cursor:_cP,fontFamily:_fI}}>
              Skip for now
            </button>
          </div>
        )
      },
      {
        icon:"🔐",
        title:"Create a PIN",
        sub:"4 digits to protect your account. You'll only need this on new devices.",
        action: (
          <div style={{width:"100%",marginTop:20}}>
            <PinPad value={obPin} onChange={setObPin} onComplete={()=>{}}/>
            {obPin.length===4&&(
              <div style={{marginTop:20}}>
                {obPin2.length===0&&<div style={{fontSize:14,color:C.lt,textAlign:"center",marginBottom:10}}>Confirm your PIN</div>}
                {obPin2.length>0&&obPin2.length<4&&<div style={{fontSize:14,color:C.lt,textAlign:"center",marginBottom:10}}>Confirm your PIN</div>}
                {obPin2.length===4&&obPin2!==obPin&&<div style={{fontSize:14,color:C.ter,textAlign:"center",marginBottom:10}}>PINs don't match — try again</div>}
                
                <PinPad value={obPin2} onChange={setObPin2} onComplete={(p)=>{ if(p===obPin) completeOnboarding(); }}/>
              </div>
            )}
            <button onClick={()=>completeOnboarding()} style={{width:"100%",background:_bN,border:_bN,color:C.lt,fontSize:14,cursor:_cP,fontFamily:_fI,marginTop:16}}>
              Skip PIN
            </button>
          </div>
        )
      },
    ];
    const step = steps[obStep];
    const isHeroStep = obStep === 0;
    return (
      <div style={{minHeight:"100vh",background:"var(--bg-grad)",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'DM Sans',sans-serif",boxSizing:_bBB,overflowY:"auto",position:"relative",overflow:"hidden"}}>
        <style>{`
          @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
          @keyframes obFloat{0%,100%{transform:translateY(0px) rotate(-1deg)}50%{transform:translateY(-10px) rotate(1deg)}}
          @keyframes obGlow{0%,100%{opacity:0.3}50%{opacity:0.7}}
          @keyframes obShimmer{0%{background-position:200% center}100%{background-position:-200% center}}
        `}</style>
        <div style={{position:"absolute",top:-100,left:"50%",transform:"translateX(-50%)",width:500,height:400,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(201,112,90,0.12) 0%,transparent 65%)",pointerEvents:"none",animation:"obGlow 5s ease infinite"}}/>
        <div style={{position:"absolute",bottom:-60,right:-80,width:320,height:320,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(201,112,90,0.09) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:80,left:-60,width:200,height:200,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(111,168,152,0.08) 0%,transparent 70%)",pointerEvents:"none"}}/>

        {isHeroStep ? (

          <div style={{width:"100%",maxWidth:430,minHeight:"100vh",display:"flex",flexDirection:"column",padding:"env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)"}}>
            <div style={{padding:"48px 28px 0",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:13,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0,boxShadow:"0 4px 16px rgba(201,112,90,0.15)"}}>
                <img src="obubba-happy.png" alt="OBubba" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";e.target.parentNode.textContent="🍼";}}/>
              </div>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,color:C.deep,lineHeight:1,letterSpacing:"0.01em"}}>OBubba</div>
                <div style={{fontSize:11,color:C.lt,letterSpacing:_ls08,textTransform:"uppercase",marginTop:2}}>Baby Tracker</div>
              </div>
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 28px 0",textAlign:"center",animation:"fadeUp 0.5s ease"}}>
              <div style={{position:"relative",marginBottom:28}}>
                <div style={{position:"absolute",inset:-16,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(201,112,90,0.25) 0%,transparent 70%)",animation:"obGlow 3s ease infinite"}}/>
                <div style={{width:158,height:158,borderRadius:36,overflow:"hidden",border:`1.5px solid ${C.blush}`,boxShadow:"0 24px 48px rgba(201,112,90,0.2), inset 0 1px 0 rgba(255,255,255,0.8)",animation:"obFloat 5s ease infinite",position:"relative"}}>
                  <img src="obubba-happy.png" alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";e.target.parentNode.style.background="var(--chip-bg-active)";e.target.parentNode.textContent="👶";e.target.parentNode.style.fontSize="72px";e.target.parentNode.style.lineHeight="158px";}}/>
                </div>
                <div style={{position:"absolute",bottom:-6,right:-6,width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#50c878,#38b060)",border:"2.5px solid var(--card-border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,boxShadow:"0 4px 14px rgba(80,200,120,0.45)"}}>✓</div>
              </div>

              <div style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:700,color:C.deep,lineHeight:1.18,marginBottom:14}}>
                Everything your<br/>baby needs, tracked.
              </div>
              <div style={{fontSize:15,color:C.mid,lineHeight:1.7,marginBottom:30,maxWidth:290}}>
                Sleep, feeds, nappies, growth and smart insights — built for the reality of new parenthood.
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:6}}>
                {[["🍼","Feeds & intake"],["😴","Sleep tracking"],["🧠","Smart insights"],["📏","Growth & WHO"],["⭐","Milestones"],["🔗","Partner sync"]].map(([ico,lbl],i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:99,padding:"7px 13px",boxShadow:"0 1px 4px rgba(201,112,90,0.08)"}}>
                    <span style={{fontSize:13}}>{ico}</span>
                    <span style={{fontSize:12,color:C.mid,fontWeight:500}}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{padding:"28px 28px 40px"}}>
              <button onClick={()=>setObStep(1)} style={{width:"100%",background:"rgba(201,112,90,0.55)",backdropFilter:"blur(20px) saturate(1.8)",WebkitBackdropFilter:"blur(20px) saturate(1.8)",border:"1.5px solid rgba(255,200,180,0.40)",borderRadius:18,padding:"19px",color:"white",fontSize:17,fontWeight:700,cursor:_cP,boxShadow:"0 8px 32px rgba(201,112,90,0.3), 0 0 44px rgba(255,190,70,0.20), 0 0 72px rgba(255,170,40,0.12)",letterSpacing:"0.01em",transition:"transform 0.12s",fontFamily:_fI}}>
                Get Started →
              </button>
              <div style={{textAlign:"center",marginTop:12,fontSize:12,color:C.lt,letterSpacing:"0.02em"}}>Free · No ads · Your data stays private</div>
            </div>
          </div>
        ) : (

          <div style={{width:"100%",maxWidth:430,minHeight:"100vh",display:"flex",flexDirection:"column",padding:"env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)"}}>
            <div style={{padding:"48px 28px 20px",display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>setObStep(s=>s-1)} style={{width:38,height:38,borderRadius:11,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,color:C.mid,fontSize:17,cursor:_cP,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:_fI}}>←</button>
              <div style={{flex:1,height:3,background:C.blush,borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(obStep/3)*100}%`,background:"linear-gradient(90deg,#c9705a,#e0825f)",borderRadius:99,transition:"width 0.4s ease"}}/>
              </div>
              <div style={{fontSize:12,color:C.lt,fontFamily:_fM,flexShrink:0}}>{obStep}/3</div>
            </div>
            <div key={obStep} style={{flex:1,padding:"0 28px",animation:"fadeUp 0.35s ease"}}>
              <div style={{fontSize:46,marginBottom:14,lineHeight:1}}>{step.icon}</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:C.deep,lineHeight:1.22,whiteSpace:"pre-line",marginBottom:10}}>{step.title}</div>
              <div style={{fontSize:14,color:C.mid,lineHeight:1.65,marginBottom:22}}>{step.sub}</div>
              <div style={{background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:22,padding:"22px 18px",boxShadow:"0 2px 16px rgba(201,112,90,0.08)"}}>
                {step.action}
              </div>
            </div>
            <div style={{height:40}}/>
          </div>
        )}
      </div>
    );
  }

  // ── CHILD SETUP SCREEN (after new account creation, before app) ──
  if (needsChildSetup && tutStep === -1) {
    const finishChildSetup = async (childData) => {
      if (childData) {
        updateChild({ name: (childData.name||"").trim(), dob: childData.dob||"", sex: childData.sex||"" });
        showMascot("celebration", `${(childData.name||"Baby").trim()}'s tracker is ready! 🎉`, 3000);
      }
      setNeedsChildSetup(false);
    };
    return (
      <div style={{minHeight:"100vh",background:"var(--bg-grad)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"env(safe-area-inset-top,30px) 24px 40px",fontFamily:"'DM Sans',sans-serif",boxSizing:_bBB,overflowY:"auto"}}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div key="child-setup" style={{animation:"fadeUp 0.4s ease",textAlign:"center",width:"100%",maxWidth:360}}>
          <img src="obubba-happy.png" style={{width:100,height:100,borderRadius:20,marginBottom:16,boxShadow:"0 8px 24px rgba(0,0,0,0.1)"}}/>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:C.deep,lineHeight:1.25,marginBottom:6}}>Now let's add your baby ✨</div>
          <div style={{fontSize:13,color:C.lt,lineHeight:1.6,marginBottom:20}}>OBubba uses your baby's details to personalise nap predictions, feeding recommendations, milestones and growth charts.</div>
          <div style={{display:"flex",background:"var(--card-bg-alt)",borderRadius:99,padding:3,marginBottom:18,gap:3}}>
            {[["new","👶 Add my baby"],["link","🔗 Join via share code"]].map(([m,l])=>(
              <button key={m} onClick={()=>{setObChildMode(m);setObLinkStatus("");setObLinkError("");}}
                style={{flex:1,padding:"9px 6px",borderRadius:99,border:_bN,background:obChildMode===m?"white":"transparent",color:obChildMode===m?C.ter:C.lt,fontWeight:700,fontSize:13,cursor:_cP,fontFamily:_fI,transition:"all 0.2s",boxShadow:obChildMode===m?"0 1px 6px rgba(0,0,0,0.1)":"none"}}>
                {l}
              </button>
            ))}
          </div>

          {obChildMode==="new" && (
            <div>
              <div style={{background:"var(--card-bg-alt)",borderRadius:14,padding:"12px 14px",marginBottom:14,border:`1px solid ${C.blush}`,display:"flex",gap:10,alignItems:"flex-start",textAlign:"left"}}>
                <span style={{fontSize:18,flexShrink:0}}>💡</span>
                <div style={{fontSize:13,color:C.mid,lineHeight:1.55}}>Used for <strong>nap & wake windows</strong>, <strong>feed recommendations</strong>, <strong>milestones</strong> and <strong>growth percentiles</strong>. Update anytime in ⚙️ Baby Settings.</div>
              </div>
              <input value={obName} onChange={e=>setObName(e.target.value)}
                placeholder="Baby's name (optional)"
                style={{width:"100%",fontSize:18,padding:"12px 16px",borderRadius:14,border:`2px solid ${C.blush}`,background:"var(--card-bg-solid)",outline:_oN,fontFamily:_fI,textAlign:"center",marginBottom:10,boxSizing:_bBB}}/>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                {[["born","Already born 🎉"],["unborn","Not born yet 🤰"]].map(([v,l])=>(
                  <div key={v} onClick={()=>setBabyUnborn(v==="unborn")} style={{flex:1,padding:"10px 6px",borderRadius:12,border:`2px solid ${(v==="unborn"?babyUnborn:!babyUnborn)?C.ter:C.blush}`,background:(v==="unborn"?babyUnborn:!babyUnborn)?"var(--chip-bg-active)":"white",textAlign:"center",cursor:_cP,fontSize:13,fontWeight:700,color:(v==="unborn"?babyUnborn:!babyUnborn)?C.ter:C.mid,transition:"all 0.2s"}}>
                    {l}
                  </div>
                ))}
              </div>
              <input type="date" value={obDob} onChange={e=>setObDob(e.target.value)}
                style={{width:"100%",fontSize:16,padding:"12px 16px",borderRadius:14,border:`2px solid ${C.blush}`,background:"var(--card-bg-solid)",outline:_oN,fontFamily:_fI,textAlign:"center",marginBottom:10,boxSizing:_bBB}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {[["boy","👦","Boy","#eaf3fb","#3d6a8a"],["girl","👧","Girl","#fde7e4","#a85070"],["","⬜","Not set","#f0e8e0","#7a5c52"]].map(([v,emoji,l,accent,col])=>(
                  <button key={v} onClick={()=>setObSex(v)}
                    style={{padding:"12px 4px",borderRadius:14,border:`2px solid ${obSex===v?col:C.blush}`,background:obSex===v?accent:"white",cursor:_cP,fontSize:13,fontWeight:700,color:obSex===v?col:C.mid,fontFamily:_fI,transition:"all 0.15s",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <span style={{fontSize:22}}>{emoji}</span>{l}
                  </button>
                ))}
              </div>
              <button onClick={()=>finishChildSetup({name:obName,dob:obDob,sex:obSex})}
                style={{width:"100%",background:`linear-gradient(135deg,#c9705a,#a85a44)`,border:_bN,borderRadius:99,padding:"14px",color:"white",fontSize:16,fontWeight:700,cursor:_cP,boxShadow:"0 4px 20px rgba(201,112,90,0.4)",marginBottom:10,fontFamily:_fI}}>
                {obName.trim()||obDob ? "Let's go! →" : "Continue →"}
              </button>
              <button onClick={()=>finishChildSetup(null)} style={{width:"100%",background:_bN,border:_bN,color:C.lt,fontSize:14,cursor:_cP,fontFamily:_fI}}>
                Skip — I'll add details later
              </button>
            </div>
          )}

          {obChildMode==="link" && (
            <div>
              <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:14,padding:"12px 14px",marginBottom:14,border:"1px solid var(--card-border)",boxShadow:"var(--card-shadow)",display:"flex",gap:10,alignItems:"flex-start",textAlign:"left"}}>
                <span style={{fontSize:18,flexShrink:0}}>📲</span>
                <div style={{fontSize:13,color:"var(--mint)",lineHeight:1.55}}>If another parent has already set up this baby, they can share a <strong>6-digit code</strong> from their Share menu. Enter it below to add the child to your app.</div>
              </div>
              <input
                value={obLinkCode}
                onChange={e=>{ setObLinkCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"")); setObLinkStatus(""); setObLinkError(""); }}
                placeholder="e.g. AB3X7Y"
                maxLength={6}
                style={{width:"100%",fontSize:28,fontFamily:_fM,fontWeight:700,letterSpacing:"0.2em",textAlign:"center",padding:"16px",borderRadius:14,border:`2px solid ${obLinkStatus==="error"?C.ter:obLinkStatus==="ok"?"#50c878":C.blush}`,background:"var(--card-bg-solid)",color:C.ter,outline:_oN,marginBottom:10,boxSizing:_bBB}}/>
              {obLinkStatus==="error" && <div style={{fontSize:13,color:C.ter,marginBottom:10,textAlign:"center"}}>{obLinkError}</div>}
              {obLinkStatus==="ok" && <div style={{fontSize:13,color:"#50c878",marginBottom:10,textAlign:"center",fontWeight:600}}>✔ Child linked! Taking you in…</div>}
              <button onClick={async()=>{
                if(obLinkCode.length!==6) return;
                setObLinkStatus("loading");
                const result = await joinChildByCode(obLinkCode);
                if(result.ok) {
                  setObLinkStatus("ok");
                  setTimeout(()=>finishChildSetup(null), 1200);
                } else {
                  setObLinkStatus("error");
                  setObLinkError(result.error||"Code not found — check with the other parent");
                }
              }} disabled={obLinkCode.length!==6||obLinkStatus==="loading"||obLinkStatus==="ok"}
                style={{width:"100%",padding:"14px",borderRadius:99,border:_bN,background:obLinkCode.length===6&&obLinkStatus!=="ok"?`linear-gradient(135deg,#50c878,#3aa860)`:"#e0f0ea",color:obLinkCode.length===6&&obLinkStatus!=="ok"?"white":"#a0c8b0",fontSize:16,fontWeight:700,cursor:obLinkCode.length===6&&obLinkStatus!=="ok"?"pointer":"not-allowed",fontFamily:_fI,transition:"all 0.2s",marginBottom:10}}>
                {obLinkStatus==="loading"?"⏳ Linking…":"Link child →"}
              </button>
              <button onClick={()=>finishChildSetup(null)} style={{width:"100%",background:_bN,border:_bN,color:C.lt,fontSize:14,cursor:_cP,fontFamily:_fI}}>
                Skip — I'll set up later
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return(
    <div style={{background:"transparent",minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:"var(--text-deep)",paddingBottom:80}}>
      <style>{`
        @keyframes pulse{0%,100%{box-shadow:0 0 0 12px rgba(201,112,90,0.15)}50%{box-shadow:0 0 0 22px rgba(201,112,90,0.04)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:scale(0.6)}to{opacity:1;transform:scale(1)}}
        @keyframes tutPop{from{opacity:0;transform:translate(-50%,-50%) scale(0.93)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        @keyframes tutPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,112,90,0.5)}70%{box-shadow:0 0 0 14px rgba(201,112,90,0)}}
      `}</style>
      {tutStep >= 0 && (()=>{
        const TUT_STEPS = [
          { icon:"👋", title:"Welcome to OBubba!", body:"A quick tour of how everything works — takes about 60 seconds. Tap anywhere or Next to continue.", location:null },
          { icon:"🍼", title:"Quick Log Row",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>The row of icons at the top is your <strong style={{color:C.ter}}>quick log bar</strong> — one tap logs instantly at the current time:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>🍼 <strong>Feed</strong> — logs a bottle feed (add ml later)</div>
                  <div>🤱 <strong>Breast</strong> — logs a breastfeed (edit L/R and duration later)</div>
                  <div>💩 <strong>Nappy</strong> — logs a wet nappy</div>
                  <div>😴 <strong>Nap</strong> — starts the nap timer</div>
                  <div>🫙 <strong>Pump</strong> — opens pump session form</div>
                  <div>☀️ <strong>Wake</strong> — logs morning wake time</div>
                  <div>📷 <strong>Photo</strong> — snaps a photo for the day's diary</div>
                </div>
                <div style={{fontSize:13,color:C.lt,lineHeight:1.5,marginTop:8}}>Everything logs at the current time. Tap ✎ on any entry to edit the details afterwards.</div>
              </div>
            ), location:"Below the header" },
          { icon:"📝", title:"Detailed Logging",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Below the quick log bar you'll find <strong style={{color:C.ter}}>detailed log buttons</strong> for when you need more control:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>🍼 <strong>Feed</strong> — choose bottle, breast or solids with full details</div>
                  <div>💩 <strong>Nappy</strong> — wet or dirty with poop type picker</div>
                  <div>😴 <strong>Sleep</strong> — log a nap with start/end times, or bedtime</div>
                  <div>🫙 <strong>Pump</strong> — full pump session with duration, L/R amounts</div>
                  <div>☀️ <strong>Wake Up</strong> — set exact wake time</div>
                  <div>📋 <strong>Notes</strong> — paste your whole day in plain text and it parses automatically</div>
                </div>
              </div>
            ), location:"Centre of screen" },
          { icon:"⏱️", title:"Nap & Bedtime Countdown",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Next to <strong>🤱 Start Feed</strong> you'll see a countdown pill:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>⏱️ <strong>Nap 42m</strong> — shows when the next nap is due based on wake windows</div>
                  <div>🌙 <strong>Bed 1h 20m</strong> — switches to bedtime countdown once all naps are done</div>
                  <div>😴 <strong>Nap Now!</strong> — tap to start the nap timer when it's time</div>
                  <div>☀️ <strong>Log wake</strong> — appears if no wake is logged yet today</div>
                </div>
                <div style={{fontSize:13,color:C.lt,lineHeight:1.5,marginTop:8}}>When a nap is running, the timer appears in the same row with a Stop button.</div>
              </div>
            ), location:"Start Feed row" },
          { icon:"🤱", title:"Breastfeed Timer", body:"Tap 🤱 Start Feed in the header to begin a live breastfeed timer — switch between left and right sides, pause, and save when done. The timer tracks each side separately. You can also quick-log a breastfeed from the quick bar and edit the details later.", location:"Header — Start Feed" },
          { icon:"🧠", title:"Personal vs NHS Mode",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>OBubba can predict nap and bedtimes in two ways — change this in <strong style={{color:C.ter}}>Account → Sleep Recommendations</strong>:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:8,fontSize:14}}>
                  <div>✨ <strong>Personal</strong> — learns from your baby's actual patterns. After 5+ days of data, it blends your baby's real nap lengths and wake times with age guidance. Gets more accurate the more you log.</div>
                  <div>🏥 <strong>NHS</strong> — uses standard NHS/WHO wake windows and nap counts for your baby's age. Best when starting out or if you prefer official guidelines.</div>
                </div>
                <div style={{fontSize:13,color:C.lt,lineHeight:1.5,marginTop:8}}>This affects nap countdowns, bedtime predictions, "Is This Normal?" and tomorrow's schedule. You can switch anytime.</div>
              </div>
            ), location:"Account → Sleep Recommendations" },
          { icon:"📅", title:"Days & Dates",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>The date strip below the header shows your logged days:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>📅 Tap any date to view that day's log</div>
                  <div>✎ Tap the edit button on a date to rename or delete the day</div>
                  <div>+ <strong>Date</strong> — tap to add a past day manually</div>
                </div>
                <div style={{fontSize:13,color:C.lt,lineHeight:1.5,marginTop:8}}>Today is created automatically. Tap + Date to log a past day you missed.</div>
              </div>
            ), location:"Date strip below header" },
          { icon:"📋", title:"Notes — Your Secret Weapon",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Too busy to log each feed and nap one by one? Just <strong style={{color:C.ter}}>tap 📋 Notes</strong> and type or paste your day in plain English — OBubba reads it and logs everything for you.</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Example — just type something like:</div>
                  <div style={{fontSize:14,color:C.deep,lineHeight:1.7,fontStyle:"italic"}}>
                    Woke up 6:30am<br/>7am 180ml<br/>Nap 9:15 - 10:00<br/>11:30 150ml<br/>Nap 1pm - 2:15pm<br/>5pm 180ml<br/>Bedtime 7pm
                  </div>
                </div>
                <div style={{fontSize:13,color:C.lt,lineHeight:1.5}}>It understands wake times, feeds with amounts, nap ranges, bedtime, night wakes, and dream feeds.</div>
              </div>
            ), location:"Log buttons — Notes" },
          { icon:"📷", title:"Photo Diary",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Capture moments throughout the day with the <strong style={{color:C.ter}}>📷 Photo</strong> button in the quick log bar:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>📷 <strong>Quick snap</strong> — opens your camera instantly, photo saves to today's diary</div>
                  <div>🗓️ <strong>Day view</strong> — photos appear below the detailed log buttons for that day</div>
                  <div>🖼️ <strong>Tap to view</strong> — tap any photo to see it full-size with the option to delete</div>
                  <div>⭐ <strong>Milestones</strong> — add photos to completed milestones with the 📷 button</div>
                </div>
                <div style={{fontSize:13,color:C.lt,lineHeight:1.5,marginTop:8}}>Your full photo diary is also visible in Account settings, showing your most recent snapshots.</div>
              </div>
            ), location:"Quick log bar — Photo" },
          { icon:"💡", title:"Insights",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Tap <strong style={{color:C.ter}}>💡 Insights</strong> in the bottom navigation — your baby's data centre:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>📏 <strong>Growth Percentiles</strong> — weight and height with WHO charts</div>
                  <div>🍼 <strong>Today with {babyName||"Baby"}</strong> — daily summary</div>
                  <div>🍼 <strong>Feeding Insight</strong> — NHS milk targets and suggestions</div>
                  <div>📈 <strong>Trends</strong> — growth chart, weekly comparisons, trend lines</div>
                  <div>😴 <strong>Sleep Analysis</strong> — stability score, bedtime prediction, tomorrow's schedule</div>
                  <div>📊 <strong>Day Report</strong> — full daily breakdown</div>
                </div>
              </div>
            ), location:"Bottom navigation — Insights" },
          { icon:"⭐", title:"Milestones & Development",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Two tabs for tracking your baby's growth:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>⭐ <strong>Milestones</strong> — age-appropriate milestones from NHS guidelines. Tap to mark achieved. Filter by social, language, movement or cognitive.</div>
                  <div>🧩 <strong>Development</strong> — current developmental phase, age-appropriate activities, and NHS/WHO expert guidance for your baby's exact age.</div>
                </div>
              </div>
            ), location:"Bottom navigation" },
          { icon:"🌙", title:"Day & Night Mode", body:"Tap the 🌙 / ☀️ toggle in the top-right of the header to switch between day and night mode. It sits right next to your account button for quick access.", location:"Header — top right" },
          { icon:"👨‍👩‍👧", title:"Share & Sync",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Tap <strong style={{color:C.ter}}>👤 Account</strong> in the header, then <strong>Share & Sync</strong>:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,fontSize:14}}>
                  <div>🔗 Tap <strong>Get code</strong> next to your child — share the 6-letter code with your partner</div>
                  <div>📲 Your partner opens Share & Sync → <strong>Link a child</strong> → enters the code</div>
                  <div>✅ Both phones stay in sync automatically</div>
                  <div>👶 <strong>Multiple children</strong> — swipe left/right on the header, or tap + to add</div>
                </div>
              </div>
            ), location:"👤 Account → Share & Sync" },
          { icon:"🔐", title:"Keep Your Data Safe",
            bodyJSX:(
              <div style={{fontSize:15,color:C.mid,lineHeight:1.65}}>
                <div style={{marginBottom:8}}>Your data backs up to the cloud automatically — here's how to keep it secure:</div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:7,fontSize:14}}>
                  <div>🔑 <strong>Set a recovery word</strong> in Share & Sync — this lets you reset your PIN if you ever forget it</div>
                  <div>📱 To move to a <strong>new phone</strong>, just sign in with your username & PIN — all your data restores automatically</div>
                  <div>☁️ Everything <strong>backs up on its own</strong> — nothing to export or save manually</div>
                  <div>📵 Works <strong>offline</strong> too — entries save locally and sync when you reconnect</div>
                </div>
                <div style={{marginTop:10,padding:"9px 12px",background:"var(--card-bg-alt)",borderRadius:10,fontSize:13,color:C.ter,fontWeight:600,lineHeight:1.5}}>⚠️ Without a recovery word, a forgotten PIN means losing access. Set one now in Account → Share & Sync!</div>
              </div>
            ), location:"👤 Account → Share & Sync" },
          { icon:"🎉", title:"You're all set!", body:"Log today's wake time to get started — the nap countdown will appear next to Start Feed. Before you go, set a recovery word in Account → Share & Sync to keep your data safe. You can replay this tour anytime from Account → App Tour. Happy tracking!", location:null },
        ];

        const dismissTutorial = () => {
          try{localStorage.setItem("tut_v2","1");}catch{}
          setTutStep(-1);
          showMascot("celebration", "Tutorial complete! You're ready to go! 🎉", 3000);
        };
        const nextStep = () => {
          if (tutStep >= TUT_STEPS.length - 1) { dismissTutorial(); return; }
          setTutStep(s => s+1);
        };
        const prevStep = () => { if (tutStep > 0) setTutStep(s => s-1); };

        const step = TUT_STEPS[tutStep];
        const isLast = tutStep === TUT_STEPS.length - 1;

        const cardBg = "var(--card-bg-solid)";
        const cardText = C.deep;
        const cardSub = C.mid;
        const locBg = "#f5f0e8";
        const locText = C.lt;

        return (
          <div style={{position:"fixed",inset:0,zIndex:999,pointerEvents:"auto"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(16,8,4,0.85)",backdropFilter:"blur(3px)"}}
              onClick={nextStep}/>
            <div style={{
              position:"fixed",
              left:"50%",
              top:"50%",
              transform:"translate(-50%, -50%)",
              width:"min(370px, calc(100vw - 28px))",
              background:cardBg,
              borderRadius:24,
              padding:"22px 20px 18px",
              boxShadow:"0 28px 72px rgba(0,0,0,0.55)",
              animation:"tutPop 0.3s ease",
              zIndex:1002,
              pointerEvents:"auto",
              maxHeight:"calc(100vh - 60px)",
              overflowY:"auto",
            }}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:40,height:40,borderRadius:12,background:"var(--card-bg-alt)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{step.icon}</div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:cardText,lineHeight:1.2}}>{step.title}</div>
                </div>
                <button onClick={dismissTutorial} style={{background:_bN,border:_bN,color:locText,fontSize:18,cursor:_cP,padding:"0 0 0 8px",lineHeight:1,flexShrink:0}}>✕</button>
              </div>
              {step.location && (
                <div style={{display:"inline-flex",alignItems:"center",gap:5,background:locBg,borderRadius:99,padding:"4px 12px",marginBottom:10,fontSize:12,color:locText,fontFamily:_fM}}>
                  📍 {step.location}
                </div>
              )}

              <div style={{fontSize:14,color:cardSub,lineHeight:1.65,marginBottom:14}}>{step.bodyJSX || step.body}</div>
              <div style={{display:"flex",gap:3,justifyContent:"center",marginBottom:12}}>
                {TUT_STEPS.map((_,i)=>(
                  <div key={i} onClick={()=>setTutStep(i)} style={{
                    width:i===tutStep?18:5,height:5,borderRadius:99,
                    background:i<tutStep?"#c9705a":i===tutStep?C.ter:C.blush,
                    transition:"all 0.3s",cursor:_cP,flexShrink:0
                  }}/>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                {tutStep > 0 && (
                  <button onClick={prevStep} style={{flex:1,padding:"9px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.mid,fontSize:14,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                    ← Back
                  </button>
                )}
                <button onClick={nextStep} style={{flex:2,padding:"10px",borderRadius:12,border:"1.5px solid rgba(201,112,90,0.35)",background:"var(--card-bg)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",color:C.ter,fontSize:15,fontWeight:700,cursor:_cP,fontFamily:_fI,boxShadow:"inset 0 0 8px rgba(201,112,90,0.15), inset 0 1px 0 rgba(255,255,255,0.25), 0 0 6px rgba(201,112,90,0.20), 0 0 14px rgba(201,112,90,0.12)"}}>
                  {isLast ? "🎉 Start Tracking!" : "Next →"}
                </button>
              </div>

              {tutStep === 0 && (
                <button onClick={dismissTutorial} style={{width:"100%",marginTop:8,background:_bN,border:_bN,color:locText,fontSize:13,cursor:_cP,fontFamily:_fI}}>
                  Skip tour
                </button>
              )}
            </div>
          </div>
        );
      })()}
      {!isOnline&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:999,background:"#2c1f1a",color:"white",textAlign:"center",padding:"10px 16px",fontSize:14,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span>📵</span>
          <span>You're offline — entries are saved locally and will sync when you reconnect</span>
        </div>
      )}
      {/* Hidden photo input for diary/milestones */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handlePhotoCapture}/>
      <div
        style={{background:theme.primary,padding:"16px 16px 0",position:"relative",backdropFilter:"blur(var(--glass-blur)) saturate(var(--glass-saturate))",WebkitBackdropFilter:"blur(var(--glass-blur)) saturate(var(--glass-saturate))",boxShadow:"var(--card-shadow)",borderBottom:"1px solid var(--card-border)"}}
        onTouchStart={handleSwipeStart}
        onTouchEnd={handleSwipeEnd}
      >
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {childIds.map(cid=>(
              <button key={cid} onClick={()=>setActiveChildId(cid)} style={{
                width:cid===resolvedActiveId?22:8,height:8,borderRadius:99,border:_bN,cursor:_cP,
                background:cid===resolvedActiveId?C.ter:"rgba(0,0,0,0.18)",transition:"all 0.25s",padding:0
              }}/>
            ))}
            <button onClick={()=>setShowAddChild(true)} style={{
              width:22,height:22,borderRadius:99,border:"1.5px dashed rgba(0,0,0,0.2)",
              background:"transparent",color:C.mid,cursor:_cP,fontSize:13,
              display:"flex",alignItems:"center",justifyContent:"center"
            }}>+</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <button onClick={e=>{e.stopPropagation();toggleTheme();}}
              style={{background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:99,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",cursor:_cP,fontSize:14,flexShrink:0}}>
              {isDark?"☀️":"🌙"}
            </button>
            <button onClick={e=>{e.stopPropagation();setTab("settings");}}
              style={{background:"var(--card-bg)",border:_bN,borderRadius:99,padding:"4px 10px 4px 7px",display:"flex",alignItems:"center",gap:5,cursor:_cP,maxWidth:120}}>
              <span style={{fontSize:13}}>👤</span>
              <span style={{fontSize:10,fontFamily:_fM,fontWeight:700,color:C.mid,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{familyUsername||"Account"}</span>
            </button>
          </div>
        </div>
        {!nameEdit ? (
          <div onClick={()=>{setNameIn(babyName);setNameEdit(true);}} style={{cursor:_cP,marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:9,overflow:"hidden",flexShrink:0,border:"1.5px solid rgba(255,255,255,0.75)",boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}>
              <img src="obubba-happy.png" alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                onError={e=>{e.target.style.display="none";e.target.parentNode.style.background=C.ter;e.target.parentNode.style.display="flex";e.target.parentNode.style.alignItems="center";e.target.parentNode.style.justifyContent="center";e.target.parentNode.textContent="🍼";}}/>
            </div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,color:C.deep,fontWeight:700,lineHeight:1.1}}>
              {babyName ? `${possessive(babyName)} Tracker` : "Baby Tracker"}
            </div>
          </div>
        ) : (
          <form onSubmit={e=>{e.preventDefault();setBabyName(nameIn.trim());setNameEdit(false);}} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
            <input autoFocus value={nameIn} onChange={e=>setNameIn(e.target.value)} placeholder="e.g. Oliver"
              style={{flex:1,fontSize:18,padding:"9px 13px",borderRadius:12,border:_bN,background:"var(--card-bg)",color:C.deep,outline:_oN,fontFamily:_fI}}/>
            <button type="submit" style={{background:C.ter,border:_bN,borderRadius:10,color:"white",fontSize:14,padding:"9px 14px",cursor:_cP,fontWeight:700}}>Save</button>
            {babyName&&<button type="button" onClick={()=>setNameEdit(false)} style={{background:"var(--chip-bg)",border:_bN,borderRadius:10,color:C.mid,fontSize:14,padding:"9px 10px",cursor:_cP}}>✕</button>}
          </form>
        )}
        {}
        <div style={{marginBottom:7}}>
          {(()=>{
            if (!age && !babyUnborn) return (
              <div onClick={e=>{e.stopPropagation();setCsName(babyName||"");setCsDob(activeChild.dob||"");setCsSex(activeChild.sex||"");setCsConfirmDelete(false);setShowChildSettings(true);}}
                style={{fontSize:13,color:C.mid,cursor:_cP,background:"var(--chip-bg)",borderRadius:99,padding:"5px 12px",fontFamily:_fM,display:"inline-block"}}>
                ⚙️ Add date of birth
              </div>
            );
            if (babyUnborn && babyDob) {
              const daysUntil = Math.ceil((new Date(babyDob) - new Date()) / (1000*60*60*24));
              return <div style={{background:"var(--card-bg)",borderRadius:99,padding:"5px 14px",display:"inline-flex",alignItems:"center",gap:5,fontSize:14,color:C.deep,fontWeight:700}}>🤰 {daysUntil > 0 ? `Due in ${daysUntil} days` : "Due any day!"}</div>;
            }
            if (!age) return null;
            return <div style={{background:"var(--card-bg)",borderRadius:99,padding:"5px 14px",display:"inline-flex",alignItems:"center",gap:5,fontSize:14,color:C.deep,fontWeight:700}}>🎂 {fmtAge(age)} · {age.totalWeeks}wk</div>;
          })()}
        </div>
        {tab === "day" && breastStartTime && (
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            {breastStartTime && (
              <div style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"7px 10px",boxShadow:"0 2px 8px rgba(44,31,26,0.12)",display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",gap:5}}>
                  {["L","R"].map(side=>(
                    <button key={side} onClick={()=>switchBreastSide(side)} style={{
                      flex:1,padding:"4px 8px",borderRadius:8,border:_bN,cursor:_cP,fontFamily:_fM,fontWeight:700,fontSize:12,
                      background:breastSide===side&&breastActive?C.ter:"#f5e8e4",
                      color:breastSide===side&&breastActive?"white":C.mid,transition:"all 0.15s"
                    }}>
                      {side} {fmtSec(breastSec[side])}{breastSide===side&&breastActive&&<span style={{marginLeft:2,fontSize:9}}>●</span>}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={breastActive?pauseBreastTimer:()=>startBreastTimer(breastSide||"L")} style={{flex:1,padding:"3px",borderRadius:7,border:`1px solid ${C.blush}`,background:_bN,fontSize:11,color:C.mid,cursor:_cP,fontWeight:600}}>
                    {breastActive?"⏸":"▶"}
                  </button>
                  <button onClick={saveBreastFeed} style={{flex:1,padding:"3px",borderRadius:7,border:_bN,background:C.ter,color:"white",fontSize:11,cursor:_cP,fontWeight:700}}>Save ✓</button>
                  <button onClick={cancelBreastTimer} style={{padding:"3px 7px",borderRadius:7,border:_bN,background:"var(--card-bg-alt)",color:C.lt,fontSize:11,cursor:_cP}}>✕</button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Start Feed + Nap/Bed pill row */}
        {tab === "day" && !breastStartTime && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:10}}>
            {!napOn && (
              <button onClick={()=>startBreastTimer("L")} style={{background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:99,padding:"5px 14px",fontSize:13,color:C.ter,cursor:_cP,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
                🤱 Start Feed
              </button>
            )}
            {/* Active nap timer */}
            {napOn && (
              <div style={{display:"flex",alignItems:"center",gap:5,background:C.mint,borderRadius:99,padding:"5px 6px 5px 14px"}}>
                <span style={{fontSize:13,fontFamily:_fM,fontWeight:700,color:"white"}}>😴 {fmtSec(napSec)}</span>
                <button onClick={endNap} style={{background:"rgba(255,255,255,0.3)",border:_bN,borderRadius:99,padding:"3px 10px",fontSize:11,color:"white",cursor:_cP,fontWeight:700}}>Stop</button>
              </div>
            )}
            {/* Nap/Bed countdown pill — right side */}
            {!napOn&&(()=>{
              const hasBedLogged = (days[selDay]||[]).some(e=>e.type==="sleep"&&!e.night);
              if(hasBedLogged) return null;
              const isBed = bedCountdown !== null;
              const countdown = isBed ? bedCountdown : napCountdown;
              if(!isBed && napCountdown === null) return null;
              const isNeutral = !isBed && napCountdown === -1;
              const isNapNow = !isBed && !isNeutral && napCountdown !== null && napCountdown <= 0;
              const isBedNow = isBed && bedCountdown <= 0;
              const isNow = isNapNow || isBedNow;
              if(isNeutral) {
                return (
                  <button onClick={()=>{setInlineWakeTime(nowTime());setShowWakeInline(v=>!v);}}
                    style={{background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:99,padding:"5px 14px",display:"flex",alignItems:"center",gap:5,cursor:_cP,fontSize:13,fontWeight:700,fontFamily:_fM,color:C.ter}}>
                    ☀️ Log wake
                  </button>
                );
              }
              const isNapTappable = !isBed && !isNeutral && napCountdown !== null;
              const handleTap = () => {
                if(isNapTappable || isNapNow){ startNap(); }
                else if(isBedNow || isBed){ startNap(); }
              };
              const icon = isBedNow||isBed ? "🌙" : isNapNow ? "😴" : "⏱️";
              const pillBg = isNow ? (isBedNow?C.sky:C.mint) : "var(--card-bg)";
              const pillColor = isNow ? "white" : (isBed?C.sky:C.mint);
              const pillBorder = isNow ? "none" : "1px solid var(--card-border)";
              const valueText = isNow ? "Now!" : (countdown!==null ? fmtCountdown(countdown) : "–");
              const label = isBed ? "Bed" : "Nap";
              return (
                <button onClick={handleTap}
                  style={{background:pillBg,border:pillBorder,borderRadius:99,padding:"5px 14px",display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontFamily:_fM}}>
                  <span style={{fontSize:13}}>{icon}</span>
                  <span style={{fontSize:13,fontWeight:700,color:pillColor}}>{label} {valueText}</span>
                </button>
              );
            })()}
          </div>
        )}
        <div onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()} style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",paddingBottom:14}}>
          <div style={{flexShrink:0}}>
            <button onClick={()=>{setNewDate(todayStr());setModal("addDay");}} style={{background:"var(--card-bg)",border:`1px dashed ${C.lt}`,borderRadius:20,padding:"5px 12px",color:C.mid,fontSize:13,fontWeight:600,cursor:_cP,whiteSpace:"nowrap"}}>+ Date</button>
          </div>
          {displayDayKeys.map(d=>(
            <div key={d} style={{flexShrink:0,display:"flex",alignItems:"center",gap:2,background:d===selDay?"white":"rgba(255,255,255,0.35)",borderRadius:20,padding:"4px 4px 4px 11px",border:d===selDay?"none":`1px solid rgba(255,255,255,0.45)`}}>
              <button onClick={()=>setSelDay(d)} style={{background:_bN,border:_bN,color:d===selDay?C.ter:C.mid,fontSize:13,fontFamily:_fM,cursor:_cP,padding:"1px 0",whiteSpace:"nowrap",fontWeight:d===selDay?700:400}}>{fmtDate(d)}</button>
              <button onClick={e=>{setMenuDay(d);setEditDate(d);setConfirmDeleteDay(false);setModal("dayMenu");e.stopPropagation();}} style={{background:d===selDay?"rgba(243,211,218,0.60)":"rgba(255,255,255,0.55)",border:"1px solid rgba(255,255,255,0.45)",borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",cursor:_cP,fontSize:10,color:d===selDay?C.ter:C.mid}}>✎</button>
            </div>
          ))}
          {!displayDayKeys.length&&<span style={{color:C.lt,fontSize:13,fontFamily:_fM,alignSelf:"center"}}>No days yet</span>}
        </div>
      </div>
      {showWakeInline && (
        <div style={{background:"var(--card-bg-solid)",borderTop:`2px solid ${C.ter}`,padding:"12px 16px",maxWidth:520,margin:"0 auto",boxShadow:"0 4px 16px rgba(201,112,90,0.12)",animation:"fadeUp 0.2s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>☀️</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:4}}>Morning wake time</div>
              <TimeInput value={inlineWakeTime} onChange={t=>setInlineWakeTime(t)} style={{marginBottom:0}} inputStyle={{padding:"7px 10px",borderRadius:10,fontSize:15}}/>
            </div>
            <button onClick={()=>{
              const t = inlineWakeTime || nowTime();
              quickAddLog("wake",{type:"wake",time:t,night:false,note:""});
              setShowWakeInline(false);
            }} style={{background:`linear-gradient(135deg,${C.ter},#a85a44)`,border:_bN,borderRadius:12,padding:"10px 16px",color:"white",fontSize:14,fontWeight:700,cursor:_cP,fontFamily:_fI,whiteSpace:"nowrap",boxShadow:"0 4px 12px rgba(201,112,90,0.35)"}}>
              ✓ Log
            </button>
            <button onClick={()=>setShowWakeInline(false)}
              style={{background:"var(--card-bg-alt)",border:_bN,borderRadius:"50%",width:28,height:28,color:C.lt,cursor:_cP,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
      )}

      <div style={{padding:"16px 14px 20px",maxWidth:520,margin:"0 auto",animation:"fadeIn 0.3s ease"}}>
        {tab==="day"&&(
          !selDay||!days[selDay]?(
            <div style={{textAlign:"center",padding:"40px 20px",color:C.lt}}>
              <img src="obubba-thinking.png" alt="" style={{width:120,height:120,objectFit:"contain",marginBottom:12,opacity:0.8,filter:"drop-shadow(0 8px 20px rgba(217,207,243,0.25))"}}/>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:C.mid,marginBottom:8}}>No day selected</div>
              <div style={{fontSize:15,fontFamily:_fM}}>Tap + Date to get started</div>
            </div>
          ):( 
            <div>
              {/* ONE-TAP LOG ROW — below date strip, above age guidance */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",border:"1px solid var(--card-border)",borderRadius:18,padding:"10px 14px",marginBottom:10,gap:4,boxShadow:"var(--card-shadow)"}}>
                {[
                  {emoji:"🍼",label:"Feed",action:()=>quickAddLog("feed",{type:"feed",time:nowTime(),feedType:"milk",amount:0,night:false,note:""})},
                  {emoji:"🤱",label:"Breast",action:()=>quickAddLog("feed",{type:"feed",time:nowTime(),feedType:"breast",breastL:0,breastR:0,amount:0,night:false,note:""})},
                  {emoji:"💩",label:"Nappy",action:()=>quickAddLog("poop",{type:"poop",time:nowTime(),poopType:"wet",night:false,note:""})},
                  {emoji:"😴",label:napOn?"Stop":"Nap",action:()=>{
                    if(napOn){ endNap(); } else { startNap(); }
                  }},
                  {emoji:"🫙",label:"Pump",action:()=>openLogPanel("pump")},
                  {emoji:"☀️",label:"Wake",action:()=>handleSmartWake()},
                  {emoji:"📷",label:"Photo",action:()=>capturePhoto(null)},
                ].map(({emoji,label,action})=>(
                  <button key={label} onClick={action}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flex:1,padding:"6px 2px",borderRadius:12,border:"none",background:"transparent",cursor:_cP,transition:"transform 0.1s ease, background 0.1s ease"}}
                    onMouseDown={e=>{e.currentTarget.style.background="var(--chip-bg-active)";e.currentTarget.style.transform="scale(0.85)";}}
                    onMouseUp={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}
                    onTouchStart={e=>{e.currentTarget.style.background="var(--chip-bg-active)";e.currentTarget.style.transform="scale(0.85)";}}
                    onTouchEnd={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.transform="scale(1)";}}
                  >
                    <span style={{fontSize:24,lineHeight:1}}>{emoji}</span>
                    <span style={{fontSize:9,fontWeight:700,color:napOn&&label==="Stop"?C.ter:C.mid,fontFamily:_fM,letterSpacing:"0.02em"}}>{label}</span>
                  </button>
                ))}
              </div>

              {/* Quick log confirmation toast */}
              {quickFlash&&(
                <div style={{textAlign:"center",padding:"6px 0",marginBottom:6}}>
                  <span style={{display:"inline-block",background:"var(--card-bg-solid)",border:"1.5px solid var(--ter)",borderRadius:99,padding:"7px 20px",fontSize:14,fontWeight:700,color:C.ter,fontFamily:_fM,boxShadow:"0 0 20px rgba(246,221,227,0.40), 0 4px 12px rgba(192,112,136,0.15)",animation:"popIn 0.2s cubic-bezier(0.34,1.56,0.64,1)"}}>{quickFlash}</span>
                </div>
              )}

              {/* Age guidance */}
              {ageStage&&(
                <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",border:"1px solid var(--card-border)",borderRadius:16,padding:"12px 14px",marginBottom:14,boxShadow:"var(--card-shadow)"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:3}}>{ageStage.label}</div>
                    <div style={{fontSize:14,color:C.mid,lineHeight:1.5}}>{ageStage.tip}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                      {[{icon:"😴",val:ageStage.napGoal},{icon:"🍼",val:ageStage.feedGoal},{icon:"🌙",val:ageStage.nightNote}].map((x,i)=>(
                        <span key={i} style={{fontSize:14,fontFamily:_fM,background:"var(--chip-bg)",color:C.ter,padding:"2px 8px",borderRadius:99}}>{x.icon} {x.val}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}


              {/* 3. Quick actions */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:16}}>
                {[
                  {id:"feed",  icon:"🍼", label:"Feed"},
                  {id:"nappy", icon:"💩", label:"Nappy"},
                  {id:"sleep", icon:"😴", label:"Sleep"},
                  {id:"pump",  icon:"🫙", label:"Pump"},
                  {id:"wake",  icon:"☀️", label:"Wake Up"},
                  {id:"paste", icon:"📋", label:"Notes"},
                ].map(({id,icon,label})=>(
                  <button key={id} onClick={()=>id==="paste"?openPaste():openLogPanel(id)}
                    style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 4px",borderRadius:14,border:`2px solid ${logPanel===id?"var(--ter)":"rgba(255,255,255,0.45)"}`,background:logPanel===id?"var(--chip-bg-active)":"var(--card-bg)",cursor:_cP,fontFamily:_fI,transition:"all 0.15s, transform 0.1s",boxShadow:logPanel===id?"0 0 12px rgba(192,112,136,0.30), inset 0 1px 0 rgba(255,255,255,0.60)":"inset 0 0 5px rgba(246,221,227,0.35), inset 0 1px 0 rgba(255,255,255,0.50)"}}
                    onMouseDown={e=>{e.currentTarget.style.transform="scale(0.92)";}}
                    onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";}}
                    onTouchStart={e=>{e.currentTarget.style.transform="scale(0.92)";}}
                    onTouchEnd={e=>{e.currentTarget.style.transform="scale(1)";}}>
                    <span style={{fontSize:22}}>{icon}</span>
                    <span style={{fontSize:11,fontWeight:700,color:logPanel===id?C.ter:C.mid,letterSpacing:"0.01em",textAlign:"center",lineHeight:1.2}}>{label}</span>
                  </button>
                ))}
              </div>

              {/* Photo diary for this day */}
              {(()=>{
                const dayPhotos = photos.filter(p=>p.date===selDay);
                if(!dayPhotos.length) return null;
                return (
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>📷 Photos · {fmtDate(selDay)}</div>
                    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
                      {dayPhotos.map((p,i)=>(
                        <div key={p.id||i} onClick={()=>setViewPhoto(p)} style={{flexShrink:0,width:72,height:72,borderRadius:12,overflow:"hidden",border:`1px solid ${C.blush}`,position:"relative",cursor:_cP}}>
                          <img src={p.dataUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.45)",color:"white",fontSize:8,fontFamily:_fM,padding:"1px 4px",textAlign:"center"}}>{fmt12(p.time)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 5. Today's summary stats */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:14}}>
                {[
                  {big:totalMl?mlToDisplay(totalMl,FU):dayE.filter(e=>e.type==="feed"&&e.feedType==="solids").length,unit:totalMl?volLabel(FU):"meals",label:totalMl?"Total Milk":"Solids",color:C.ter,bg:"var(--card-bg)"},
                  {big:dayE.filter(e=>e.type==="poop").length,unit:"💩",label:"Nappies",color:C.mid,bg:"var(--card-bg)"},
                  {big:naps.length,unit:"naps",label:"Day Sleep",color:C.mint,bg:"var(--card-bg)"},
                  {big:hm(napMins),unit:"",label:"Nap Time",color:C.sky,bg:"var(--card-bg)"},
                ].map((s,i)=>(
                  <div key={i} style={{background:s.bg,backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:16,padding:"12px 4px",textAlign:"center",boxShadow:"var(--card-shadow)",border:"1px solid var(--card-border)"}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:s.color,lineHeight:1}}>{s.big}</div>
                    {s.unit&&<div style={{fontSize:14,fontFamily:_fM,color:s.color,opacity:0.7,marginTop:1}}>{s.unit}</div>}
                    <div style={{fontSize:8,color:C.mid,marginTop:3,textTransform:"uppercase",letterSpacing:_ls08,fontFamily:_fM}}>{s.label}</div>
                  </div>
                ))}
              </div>


              {/* 7. Daily timeline header */}

              {/* Compact next nap / bedtime card */}
              {(()=>{
                const hasBed = dayE.some(e=>e.type==="sleep");
                const pred = predictNextNap();
                const suggestedBed = bedtimePrediction();
                if(hasBed) return null;
                if(!pred && !suggestedBed) return null;
                return (
                  <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.mint}44`,borderRadius:16,padding:"12px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    {pred ? (
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:20}}>⏱️</span>
                          <div>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:1}}>Next Nap</div>
                            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.mint}}>{napCountdown!==null&&napCountdown<=0?"Now!":fmtCountdown(napCountdown||0)}</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:14,fontFamily:_fM,fontWeight:700,color:C.mint}}>{fmt12(pred.napStart_min)}</div>
                          <div style={{fontSize:12,color:C.lt}}>– {fmt12(pred.napStart_max)}</div>
                        </div>
                      </>
                    ) : suggestedBed ? (
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:20}}>🌙</span>
                          <div>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:1}}>{suggestedBed.bedSource==="avg"?"Predicted Bedtime":"Suggested Bedtime"}</div>
                            <div style={{fontSize:13,color:C.mid,lineHeight:1.4}}>{suggestedBed.adjustReason||"Based on today's naps"}</div>
                          </div>
                        </div>
                        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.sky}}>{fmt12(suggestedBed.time)}</div>
                      </>
                    ) : null}
                  </div>
                );
              })()}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:14,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700}}>Today's Log</div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",color:C.mid,fontSize:15}}>Daytime</span>
              </div>
              <div ref={logListCallbackRef} style={{display:"flex",flexDirection:"column",gap:7,marginBottom:13}}>
                {dayE.length===0&&(
                  <div style={{textAlign:"center",padding:"22px 12px",background:"var(--card-bg-alt)",borderRadius:14,border:`1px dashed ${C.blush}`}}>
                    <div style={{fontSize:28,marginBottom:8}}>👆</div>
                    <div style={{fontSize:15,fontWeight:600,color:C.mid,marginBottom:4}}>Nothing logged yet today</div>
                    <div style={{fontSize:13,color:C.lt,lineHeight:1.5}}>
                      Tap 🍼 Feed, 💩 Nappy or 😴 Sleep above to log an entry.
                    </div>
                  </div>
                )}
                {[...dayE].sort((a,b)=>timeVal(a)-timeVal(b)).map(e=>{
                  const isDragging=dragId===e.id;
                  const isOver=dragOver===e.id;
                  const accentCol=e.type==="feed"?(e.feedType==="solids"?"#b8860b":e.feedType==="breast"?"#c07080":e.feedType==="pump"?"#7090c0":C.ter):e.type==="nap"?C.mint:e.type==="sleep"?C.sky:e.type==="poop"?"#8a7060":e.type==="wake"?C.gold:C.mid;

                  // Activity label: "time - Activity (type)" format
                  const actLabel = (() => {
                    if (e.type === "nap" && e.start && e.end) {
                      return `${fmt12(e.start)}-${fmt12(e.end)} - Nap`;
                    }
                    const timeStr = e.time || e.start || "";
                    const timeDisplay = timeStr ? fmt12(timeStr) : "";
                    const name = e.type==="feed"
                      ? (e.feedType==="solids"?"Solids":e.feedType==="breast"?"Breast Feed":e.feedType==="pump"?"Pump":"Bottle Feed")
                      : e.type==="nap"?"Nap"
                      : e.type==="sleep"?"Bedtime"
                      : e.type==="wake"?"Wake Up"
                      : e.type==="poop"?"Nappy"
                      : NAMES[e.type]||e.type;
                    return timeDisplay ? `${timeDisplay} - ${name}` : name;
                  })();

                  // Sub-detail: key info per type
                  // Nap: duration | Feed: ml or food desc | Nappy: poop type | Pump: amount pumped | Breast: duration + L/R
                  let subDetail = null;
                  if(e.type==="feed"&&e.feedType==="breast"){
                    const parts=[];
                    const total = (e.breastL||0)+(e.breastR||0);
                    if(total>0) parts.push(`${total}min`);
                    if(e.breastL>0) parts.push(`L: ${e.breastL}min`);
                    if(e.breastR>0) parts.push(`R: ${e.breastR}min`);
                    if(parts.length) subDetail=parts.join(" · ");
                  } else if(e.type==="feed"&&e.feedType==="pump"){
                    const parts=[];
                    const total=(e.pumpL||0)+(e.pumpR||0)||e.amount||0;
                    if(total>0) parts.push(fmtVol(total,FU));
                    if(e.pumpL>0) parts.push(`L: ${fmtVol(e.pumpL,FU)}`);
                    if(e.pumpR>0) parts.push(`R: ${fmtVol(e.pumpR,FU)}`);
                    if(e.pumpDuration>0) parts.push(`${e.pumpDuration}min`);
                    if(parts.length) subDetail=parts.join(" · ");
                  } else if(e.type==="feed"&&e.feedType==="solids"){
                    subDetail = e.note||null;
                  } else if(e.type==="feed"){
                    // bottle — ml shown in badge chip, no subtitle needed
                    subDetail=null;
                  } else if(e.type==="nap"&&e.start){
                    // Duration shown in badge chip; sub-detail is empty to avoid duplication
                    subDetail = null;
                  } else if(e.type==="poop"){
                    subDetail=e.poopType||null;
                  }
                  if(e.note&&!subDetail) subDetail=e.note;
                  else if(e.note&&subDetail) subDetail+=` · ${e.note}`;

                  // Badge chip value (right side) — show key metric only, no time duplication
                  let badgeVal = null;
                  if(e.type==="feed"){
                    if(e.feedType==="breast") badgeVal=`${(e.breastL||0)+(e.breastR||0)}min`;
                    else if(e.feedType==="pump") badgeVal=fmtVol((e.pumpL||0)+(e.pumpR||0)||e.amount||0,FU);
                    else if(e.feedType==="solids") badgeVal=null;
                    else badgeVal=e.amount?fmtVol(e.amount,FU):null;
                  } else if(e.type==="nap"){
                    const dur=e.start&&e.end?minDiff(e.start,e.end):0;
                    badgeVal=dur>0?hm(dur):null;
                  } else if(e.type==="poop"){
                    badgeVal=e.poopType||null;
                  } else {
                    badgeVal=null; // time is already in actLabel
                  }

                  return(
                    <div key={e.id}
                      data-entry-id={e.id}
                      draggable
                      onDragStart={()=>setDragId(e.id)}
                      onDragOver={ev=>{ev.preventDefault();setDragOver(e.id);}}
                      onDragEnd={()=>{if(dragId&&dragOver&&dragId!==dragOver)reorderEntry(dragId,dragOver);setDragId(null);setDragOver(null);}}
                      onDrop={ev=>{ev.preventDefault();}}
                      style={{background:isOver?"var(--card-bg-solid)":"var(--card-bg)",borderRadius:14,padding:"11px 12px",border:`1px solid ${isOver?C.ter:C.blush}`,borderLeft:`3px solid ${accentCol}`,opacity:isDragging?0.45:1,backdropFilter:"blur(16px) saturate(1.6)",WebkitBackdropFilter:"blur(16px) saturate(1.6)",boxShadow:"var(--card-shadow)"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                        <div style={{display:"flex",alignItems:"center",gap:9,flex:1,minWidth:0}}>
                          <span data-drag-handle="1" style={{fontSize:18,cursor:"grab",color:C.lt,letterSpacing:-1,touchAction:"none",padding:"6px 4px",userSelect:"none",WebkitUserSelect:"none"}}>&#x2261;</span>
                          <span style={{fontSize:17,flexShrink:0}}>{ICONS[e.type]||"📝"}</span>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:500}}>{actLabel}</div>
                            {subDetail&&<div style={{fontSize:13,color:C.lt,fontFamily:_fM,marginTop:1}}>{subDetail}</div>}
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          {badgeVal&&<Badge type={e.type}>{badgeVal}</Badge>}
                          <button onClick={()=>openEdit(e)} style={{background:"var(--card-bg-solid)",border:"1.5px solid var(--card-border)",borderRadius:"50%",width:26,height:26,color:C.ter,cursor:_cP,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 8px rgba(246,221,227,0.30)"}}>✎</button>
                          <button onClick={()=>delEntry(e.id)} style={{background:"var(--card-bg-solid)",border:"1.5px solid var(--card-border)",borderRadius:"50%",width:26,height:26,color:"#e06070",cursor:_cP,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:20,padding:"14px 17px",marginBottom:18,border:"1px solid var(--card-border)",boxShadow:"var(--card-shadow)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:3,height:18,background:"#7b68ee",borderRadius:99}}/>
                    <span style={{fontFamily:"'Playfair Display',serif",fontStyle:"italic",color:"var(--text-mid)",fontSize:16}}>Night Wakes</span>
                  </div>
                  <button onClick={()=>{setNwForm({time:"",ml:"",selfSettled:false,note:""});setShowNightWake(true);}} style={{background:"var(--card-bg-alt)",border:_bN,borderRadius:99,padding:"4px 11px",fontSize:15,color:"#7b68ee",cursor:_cP,fontWeight:600}}>+ add</button>
                </div>
                {nightE.length===0&&<div style={{textAlign:"center",color:"var(--text-lt)",fontSize:14,fontFamily:_fM,padding:"6px 0"}}>No night wakes logged</div>}
                {(()=>{
                  const sleepEv=dayE.find(e=>e.type==="sleep"&&!e.night);
                  const bedMins=sleepEv?timeVal(sleepEv):22*60;
                  
                  // Build timeline points: bedtime, then each wake
                  // Sort key: PM times after bed stay as-is, AM times get +1440
                  const sk = (t) => {
                    const m = typeof t === "string" ? (()=>{const[h,mn]=t.split(":").map(Number);return h*60+mn;})() : t;
                    return m >= bedMins ? m : (m < 12*60 ? m + 1440 : m);
                  };

                  return nightE.map((e,i)=>{
                    // Calculate stretch FROM previous point TO this wake
                    const prevTime = i === 0 
                      ? (sleepEv ? sleepEv.time : null)
                      : nightE[i-1].time;
                    
                    if(!prevTime) return (
                      <div key={e.id}>
                        <div style={{padding:"7px 10px",background:"var(--card-bg-solid)",borderRadius:10,border:"1px solid var(--card-border)",marginBottom:5}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <div>
                              <span style={{color:"var(--text-mid)",fontSize:15}}>🌟 {fmt12(e.time)} wake</span>
                              {e.selfSettled&&<div style={{fontSize:12,color:"#50c878",fontFamily:_fM,marginTop:2}}>Self settled</div>}
                              {e.assisted&&<div style={{fontSize:12,color:"#7b68ee",fontFamily:_fM,marginTop:2}}>
                                Assisted soothing{e.assistedType==="milk"?" – milk":e.assistedNote?" – "+e.assistedNote:""}
                                {e.assistedDuration?<span> · Duration: {e.assistedDuration}m</span>:null}
                              </div>}
                              {!e.selfSettled&&!e.assisted&&e.note&&<div style={{fontSize:14,color:"var(--text-lt)",fontStyle:"italic",marginTop:1}}>{e.note}</div>}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:7}}>
                              {e.amount>0&&<span style={{background:"var(--chip-bg)",color:C.gold,fontFamily:_fM,fontSize:15,padding:"2px 7px",borderRadius:99}}>{fmtVol(e.amount,FU)}</span>}
                              <button onClick={()=>openEdit(e)} style={{background:"var(--card-bg-solid)",border:"1.5px solid rgba(123,104,238,0.30)",borderRadius:"50%",width:24,height:24,color:"#7b68ee",cursor:_cP,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 8px rgba(123,104,238,0.20)"}}>✎</button>
                              <button onClick={()=>delEntry(e.id)} style={{background:"var(--card-bg-solid)",border:"1.5px solid var(--card-border)",borderRadius:"50%",width:24,height:24,color:"#e06070",cursor:_cP,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );

                    // If previous wake had assistedDuration, stretch starts from (prevWake + duration)
                    let fromMins = sk(prevTime);
                    if(i > 0) {
                      const prevWake = nightE[i-1];
                      const dur = parseInt(prevWake.assistedDuration) || 0;
                      if(dur > 0) fromMins += dur;
                    }
                    let strMins = sk(e.time) - fromMins;
                    if(strMins <= 0) strMins += 1440;
                    
                    return(
                      <div key={e.id}>
                        {strMins>0&&(
                          <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 4px 5px",opacity:0.7}}>
                            <div style={{flex:1,height:1,background:"var(--card-bg-alt)"}}/>
                            <span style={{fontSize:14,fontFamily:_fM,color:strMins>=180?"#6fa898":strMins>=120?"#d4a855":"#7b68ee"}}>{hm(strMins)}</span>
                            <div style={{flex:1,height:1,background:"var(--card-bg-alt)"}}/>
                          </div>
                        )}
                        <div style={{padding:"7px 10px",background:"var(--card-bg-solid)",borderRadius:10,border:"1px solid var(--card-border)",marginBottom:5}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <div>
                              <span style={{color:"var(--text-mid)",fontSize:15}}>🌟 {fmt12(e.time)} wake</span>
                              {e.selfSettled&&<div style={{fontSize:12,color:"#50c878",fontFamily:_fM,marginTop:2}}>Self settled</div>}
                              {e.assisted&&<div style={{fontSize:12,color:"#7b68ee",fontFamily:_fM,marginTop:2}}>
                                Assisted soothing{e.assistedType==="milk"?" – milk":e.assistedNote?" – "+e.assistedNote:""}
                                {e.assistedDuration?<span> · Duration: {e.assistedDuration}m</span>:null}
                              </div>}
                              {!e.selfSettled&&!e.assisted&&e.note&&<div style={{fontSize:14,color:"var(--text-lt)",fontStyle:"italic",marginTop:1}}>{e.note}</div>}
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:7}}>
                              {e.amount>0&&<span style={{background:"var(--chip-bg)",color:C.gold,fontFamily:_fM,fontSize:15,padding:"2px 7px",borderRadius:99}}>{fmtVol(e.amount,FU)}</span>}
                              <button onClick={()=>openEdit(e)} style={{background:"var(--card-bg-solid)",border:"1.5px solid rgba(123,104,238,0.30)",borderRadius:"50%",width:24,height:24,color:"#7b68ee",cursor:_cP,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 8px rgba(123,104,238,0.20)"}}>✎</button>
                              <button onClick={()=>delEntry(e.id)} style={{background:"var(--card-bg-solid)",border:"1.5px solid var(--card-border)",borderRadius:"50%",width:24,height:24,color:"#e06070",cursor:_cP,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              {(()=>{
                const sc = sleepNormalCard();
                if (!sc) return (
                  <div style={{background:"var(--card-bg-alt)",borderRadius:14,padding:"16px",marginBottom:10,border:`1px dashed ${C.blush}`,textAlign:"center"}}>
                    <div style={{fontSize:22,marginBottom:6}}>😴</div>
                    <div style={{fontSize:14,fontWeight:600,color:C.mid,marginBottom:3}}>No naps logged yet</div>
                    <div style={{fontSize:13,color:C.lt}}>Tap <strong>Start Nap</strong> in the header or log a nap to see age-based sleep guidance.</div>
                  </div>
                );
                if (sc === "suppressed") {
                  // Naps logged, day still in progress — show neutral in-progress card
                  const today2 = days[selDay]||[];
                  const naps2 = today2.filter(e=>e.type==="nap"&&!e.night);
                  const totalMins2 = naps2.reduce((s,n)=>s+minDiff(n.start,n.end),0);
                  const range2 = napNormalRange();
                  return (
                    <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",border:`1px solid ${C.mint}30`,borderLeft:`4px solid ${C.mint}`,borderRadius:16,padding:"14px 16px",marginBottom:10,boxShadow:"var(--card-shadow)"}}>
                      <div style={{fontSize:14,fontFamily:_fM,color:C.mint,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Is This Normal? Today's Sleep</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                        <div>
                          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.mint}}>{hm(totalMins2)}</div>
                          <div style={{fontSize:14,fontFamily:_fM,color:C.lt,marginTop:2}}>today's naps so far</div>
                        </div>
                        {range2&&<div style={{textAlign:"right"}}>
                          <div style={{fontSize:15,fontFamily:_fM,color:C.mid}}>Typical for this age</div>
                          <div style={{fontSize:15,fontWeight:600,color:C.mid}}>{range2.label}</div>
                        </div>}
                      </div>
                      <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"var(--card-bg-solid)",borderRadius:10,padding:"9px 12px"}}>
                        <span style={{fontSize:16,flexShrink:0}}>✓</span>
                        <div style={{fontSize:14,color:C.mid,lineHeight:1.5}}>Day still in progress — more naps expected. Check back later for a full summary.</div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div style={{background:sc.bg,border:`1px solid ${sc.color}30`,borderLeft:`4px solid ${sc.color}`,borderRadius:16,padding:"14px 16px",marginBottom:10}}>
                    <div style={{fontSize:14,fontFamily:_fM,color:sc.color,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Is This Normal? Today's Sleep</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div>
                        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:sc.color}}>{hm(sc.totalMins)}</div>
                        <div style={{fontSize:14,fontFamily:_fM,color:C.lt,marginTop:2}}>today's naps</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:15,fontFamily:_fM,color:C.mid}}>Typical for this age</div>
                        <div style={{fontSize:15,fontWeight:600,color:C.mid}}>{sc.range.label}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"var(--card-bg-solid)",borderRadius:10,padding:"9px 12px"}}>
                      <span style={{fontSize:16,flexShrink:0}}>{sc.icon}</span>
                      <div style={{fontSize:14,color:C.mid,lineHeight:1.5}}>{sc.message}</div>
                    </div>
                  </div>
                );
              })()}

            </div>
          )
        )}
        {tab==="week"&&(
          <div>
            <div className="glass-card" style={card}>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:4}}>Avg Daily Feed (last 7 days)</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:30,fontWeight:700,color:C.ter}}>{mlToDisplay(avgMl,FU)}<span style={{fontSize:15,color:C.lt,fontWeight:400}}> {volLabel(FU)}</span></div>
            </div>
            <div className="glass-card" style={card}>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:10}}>Feed Total by Day</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:80}}>
                {wStats.map((s,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{fontSize:9,fontFamily:_fM,color:C.lt}}>{s.ml||""}</div>
                    <div style={{width:"100%",background:`${C.ter}${s.date===selDay?"ff":"88"}`,borderRadius:"4px 4px 0 0",height:`${Math.max(4,(s.ml/maxMl)*60)}px`}}/>
                    <div style={{fontSize:9,fontFamily:_fM,color:s.date===selDay?C.ter:C.lt,fontWeight:s.date===selDay?700:400}}>{fmtDate(s.date).slice(0,2)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card" style={card}>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:10}}>Nap Time by Day (mins)</div>
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:80}}>
                {wStats.map((s,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{fontSize:9,fontFamily:_fM,color:C.lt}}>{s.napM||""}</div>
                    <div style={{width:"100%",background:`${C.mint}${s.date===selDay?"ff":"88"}`,borderRadius:"4px 4px 0 0",height:`${Math.max(4,(s.napM/maxNapBar)*60)}px`}}/>
                    <div style={{fontSize:9,fontFamily:_fM,color:s.date===selDay?C.mint:C.lt,fontWeight:s.date===selDay?700:400}}>{fmtDate(s.date).slice(0,2)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card" style={card}>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:10}}>Day Summary</div>
              {wStats.map((s,i)=>(
                <div key={i} onClick={()=>{setSelDay(s.date);setTab("day");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:i<wStats.length-1?`1px solid ${C.blush}`:"none",cursor:_cP}}>
                  <span style={{fontSize:15,color:s.date===selDay?C.ter:C.deep,fontWeight:s.date===selDay?600:400}}>{fmtLong(s.date)}</span>
                  <div style={{display:"flex",gap:8}}>
                    <span style={{fontSize:14,fontFamily:_fM,color:C.ter}}>{fmtVol(s.ml,FU)}</span>
                    <span style={{fontSize:14,fontFamily:_fM,color:C.mint}}>{s.naps} naps</span>
                    <span style={{fontSize:14,fontFamily:_fM,color:C.lt}}>{s.nightW}🌙</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab==="insights"&&(()=>{
          const ageMonths = babyDob ? Math.floor((new Date() - new Date(babyDob)) / (1000*60*60*24*30.44)) : null;
          const sortedW = [...weights].sort((a,b)=>a.date.localeCompare(b.date));
          const sortedH = [...heights].sort((a,b)=>a.date.localeCompare(b.date));
          const wWithPct = sortedW.map(w => {
            if(!babyDob) return {...w, pct: null};
            const ageMo = Math.floor((new Date(w.date) - new Date(babyDob)) / (1000*60*60*24*30.44));
            if(ageMo < 0 || ageMo > 24) return {...w, pct: null};
            return {...w, pct: getPercentile(w.kg, ageMo, babySex), ageMo};
          });
          const hWithPct = sortedH.map(h => {
            if(!babyDob) return {...h, pct: null};
            const ageMo = Math.floor((new Date(h.date) - new Date(babyDob)) / (1000*60*60*24*30.44));
            if(ageMo < 0 || ageMo > 24) return {...h, pct: null};
            return {...h, pct: getHeightPercentile(h.cm, ageMo, babySex), ageMo};
          });
          const latestW = wWithPct.filter(w=>w.pct!==null).slice(-1)[0];
          const latestH = hWithPct.filter(h=>h.pct!==null).slice(-1)[0];
          const prevW = wWithPct.filter(w=>w.pct!==null).slice(-2,-1)[0];
          const weightGain = latestW && prevW ? Math.round((latestW.kg - prevW.kg)*1000)/1000 : null;

          const collHead = (key, icon, label) => (
            <button onClick={()=>toggleInsight(key)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:"var(--card-bg-solid)",border:`1.5px solid ${C.blush}`,borderRadius:16,marginBottom:insightSection[key]?0:12,borderBottomLeftRadius:insightSection[key]?0:16,borderBottomRightRadius:insightSection[key]?0:16,cursor:_cP,boxShadow:"0 2px 8px rgba(201,112,90,0.05)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>{icon}</span>
                <span style={{fontSize:14,fontWeight:700,color:C.deep,letterSpacing:"0.02em"}}>{label}</span>
              </div>
              <span style={{fontSize:12,color:C.lt,transition:"transform 0.2s",transform:insightSection[key]?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
            </button>
          );

          return (
            <div>
              {/* ── GROWTH PERCENTILE BANNER ── */}
              <div style={{background:`linear-gradient(135deg,${latestW?percentileColor(latestW?.pct)+"18":"#f5f0eb"},${latestW?percentileColor(latestW?.pct)+"08":"#ede8e0"})`, border:`2px solid ${latestW ? percentileColor(latestW?.pct)+"44" : C.blush}`, borderRadius:20, marginBottom:14, overflow:"hidden"}}>
                <div style={{padding:"16px 16px 14px"}}>
                  <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:12}}>📏 Growth Percentiles</div>

                  {/* WHO Growth Charts with integrated stats */}
                  {babyDob && (weights.length > 0 || heights.length > 0) ? (
                    <div>
                      {weights.length > 0 && (()=>{
                        const wData = weights.map(w => {
                          const mo = Math.round(((new Date(w.date) - new Date(babyDob)) / (1000*60*60*24*30.44))*10)/10;
                          return {mo: Math.max(0,mo), val: w.kg};
                        }).filter(d=>d.mo>=0&&d.mo<=24);
                        const lms = babySex==="girl" ? WHO_LMS_GIRLS : WHO_LMS_BOYS;
                        return (
                          <div style={{marginBottom:12}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                              <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08}}>Weight · WHO Curves</div>
                              {latestW && <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <span style={{fontSize:13,fontWeight:700,color:C.deep}}>{latestW.kg}kg</span>
                                <span style={{fontSize:12,fontWeight:700,color:percentileColor(latestW.pct),background:percentileColor(latestW.pct)+"18",padding:"2px 8px",borderRadius:99,fontFamily:_fM}}>{ordinal(latestW.pct)}</span>
                                {weightGain !== null && <span style={{fontSize:11,color:weightGain>=0?C.mint:C.ter,fontFamily:_fM,fontWeight:700}}>{weightGain>=0?"↑":"↓"}{Math.abs(weightGain*1000)}g</span>}
                              </div>}
                            </div>
                            <div style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"10px 6px 4px",border:`1px solid ${C.blush}`}}>
                              <GrowthChart lmsTable={lms} babyData={wData} yLabel="Weight" unit="kg" sex={babySex} color={C.ter}/>
                            </div>
                          </div>
                        );
                      })()}
                      {heights.length > 0 && (()=>{
                        const hData = heights.map(h => {
                          const mo = Math.round(((new Date(h.date) - new Date(babyDob)) / (1000*60*60*24*30.44))*10)/10;
                          return {mo: Math.max(0,mo), val: h.cm};
                        }).filter(d=>d.mo>=0&&d.mo<=24);
                        const lms = babySex==="girl" ? WHO_LENGTH_LMS_GIRLS : WHO_LENGTH_LMS_BOYS;
                        return (
                          <div style={{marginBottom:12}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                              <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08}}>Height · WHO Curves</div>
                              {latestH && <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <span style={{fontSize:13,fontWeight:700,color:C.deep}}>{latestH.cm}cm</span>
                                <span style={{fontSize:12,fontWeight:700,color:percentileColor(latestH.pct),background:percentileColor(latestH.pct)+"18",padding:"2px 8px",borderRadius:99,fontFamily:_fM}}>{ordinal(latestH.pct)}</span>
                              </div>}
                            </div>
                            <div style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"10px 6px 4px",border:`1px solid ${C.blush}`}}>
                              <GrowthChart lmsTable={lms} babyData={hData} yLabel="Height" unit="cm" sex={babySex} color={C.sky}/>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      <div style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"12px",border:`1px solid ${C.blush}`}}>
                        <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Weight</div>
                        {latestW ? <div><span style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:percentileColor(latestW.pct)}}>{ordinal(latestW.pct)}</span> <span style={{fontSize:12,color:C.lt}}>· {latestW.kg}kg</span></div>
                        : <div style={{fontSize:12,color:C.lt,fontStyle:"italic"}}>Not logged</div>}
                      </div>
                      <div style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"12px",border:`1px solid ${C.blush}`}}>
                        <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Height</div>
                        {latestH ? <div><span style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:700,color:percentileColor(latestH.pct)}}>{ordinal(latestH.pct)}</span> <span style={{fontSize:12,color:C.lt}}>· {latestH.cm}cm</span></div>
                        : <div style={{fontSize:12,color:C.lt,fontStyle:"italic"}}>Not logged</div>}
                      </div>
                    </div>
                  )}

                  {/* Overall status */}
                  {latestW && (
                    <div style={{fontSize:12,padding:"5px 12px",borderRadius:99,display:"inline-block",background:percentileColor(latestW.pct)+"22",color:percentileColor(latestW.pct),fontFamily:_fM,fontWeight:600,marginBottom:8}}>
                      {percentileNote(latestW.pct)}
                    </div>
                  )}

                  {/* Log inputs */}
                  <div style={{marginTop:12,borderTop:`1px solid ${C.blush}`,paddingTop:12}}>
                    <Inp label="Date" type="date" value={growthForm.date} onChange={e=>{setGrowthForm(f=>({...f,date:e.target.value}));setHeightForm(f=>({...f,date:e.target.value}));}} style={{marginBottom:10}}/>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                      <Inp label="Weight (kg)" type="number" step="0.01" placeholder="e.g. 5.2" value={growthForm.kg} onChange={e=>setGrowthForm(f=>({...f,kg:e.target.value}))} style={{marginBottom:0}}/>
                      <Inp label="Height (cm)" type="number" step="0.1" placeholder="e.g. 62" value={heightForm.cm} onChange={e=>setHeightForm(f=>({...f,cm:e.target.value}))} style={{marginBottom:0}}/>
                    </div>
                    <PBtn onClick={()=>{
                      let saved = false;
                      if(growthForm.kg){
                        const kg = parseFloat(growthForm.kg);
                        if(kg < 0.3 || kg > 35){ alert("Weight should be between 0.3kg and 35kg. Please check your entry."); return; }
                        const updated=[...weights.filter(x=>x.date!==growthForm.date),{date:growthForm.date,kg}].sort((a,b)=>a.date.localeCompare(b.date));
                        setWeights(updated); saved = true;
                      }
                      if(heightForm.cm){
                        const cm = parseFloat(heightForm.cm);
                        if(cm < 25 || cm > 140){ alert("Height should be between 25cm and 140cm. Please check your entry."); return; }
                        const updated=[...heights.filter(x=>x.date!==heightForm.date),{date:heightForm.date,cm}].sort((a,b)=>a.date.localeCompare(b.date));
                        setHeights(updated); saved = true;
                      }
                      if(saved){
                        setGrowthForm({date:todayStr(),kg:""});setHeightForm({date:todayStr(),cm:""});
                        try{navigator.vibrate&&navigator.vibrate([30,20,30]);}catch{}
                      }
                    }} style={{marginTop:2}}>Save Measurements</PBtn>
                  </div>

                  {/* History toggle */}
                  <button onClick={()=>setGrowthLogOpen(o=>!o)} style={{background:_bN,border:_bN,fontSize:12,color:C.mid,cursor:_cP,fontFamily:_fI,marginTop:8,display:"flex",alignItems:"center",gap:4,padding:0}}>
                    {growthLogOpen?"Hide":"Show"} history {growthLogOpen?"▲":"▼"}
                  </button>
                  {growthLogOpen && (weights.length>0 || heights.length>0) && (
                    <div style={{marginTop:8}}>
                      {[...weights].sort((a,b)=>b.date.localeCompare(a.date)).map((w,i)=>(
                        <div key={"w"+i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.blush}`}}>
                          <div style={{fontSize:13,color:C.deep}}>{fmtLong(w.date)}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <span style={{background:"var(--chip-bg)",color:C.ter,fontFamily:_fM,fontSize:12,padding:"2px 8px",borderRadius:99}}>{w.kg}kg</span>
                            <button onClick={()=>setWeights(ws=>ws.filter(x=>x.date!==w.date))} style={{background:"var(--card-bg-alt)",border:_bN,borderRadius:"50%",width:20,height:20,color:C.lt,cursor:_cP,fontSize:12,lineHeight:"20px",padding:0}}>✕</button>
                          </div>
                        </div>
                      ))}
                      {[...heights].sort((a,b)=>b.date.localeCompare(a.date)).map((h,i)=>(
                        <div key={"h"+i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.blush}`}}>
                          <div style={{fontSize:13,color:C.deep}}>{fmtLong(h.date)}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <span style={{background:"var(--chip-bg)",color:C.sky,fontFamily:_fM,fontSize:12,padding:"2px 8px",borderRadius:99}}>{h.cm}cm</span>
                            <button onClick={()=>setHeights(hs=>hs.filter(x=>x.date!==h.date))} style={{background:"var(--card-bg-alt)",border:_bN,borderRadius:"50%",width:20,height:20,color:C.lt,cursor:_cP,fontSize:12,lineHeight:"20px",padding:0}}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── TODAY WITH [NAME] ── */}
              {(()=>{
                if (!age || !days[selDay] || (days[selDay]||[]).filter(e=>!e.night).length === 0) return null;
                const isToday = selDay === todayStr();
                const name = babyName || "Baby";
                const ageWeeks = age.totalWeeks;
                const dayLabel = isToday ? "Today" : fmtLong(selDay);
                const todayEntries = days[selDay]||[];
                const todayDayE = todayEntries.filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));

                const napCount = todayDayE.filter(e=>e.type==="nap").length;
                const todayNapMins = todayDayE.filter(e=>e.type==="nap").reduce((s,n)=>s+minDiff(n.start,n.end),0);
                const range = napNormalRange();
                let sleepLine = "";
                if (napCount === 0) sleepLine = "No naps logged yet.";
                else if (todayNapMins < (range ? range.min : 60)) sleepLine = `Naps were a little shorter today (${hm(todayNapMins)} across ${napCount} nap${napCount!==1?"s":""}).`;
                else if (todayNapMins > (range ? range.max : 300)) sleepLine = `Plenty of nap time today (${hm(todayNapMins)} across ${napCount} nap${napCount!==1?"s":""}).`;
                else sleepLine = `Nap time looks good (${hm(todayNapMins)} across ${napCount} nap${napCount!==1?"s":""}).`;
                const bedEntry2 = todayDayE.find(e => e.type === "sleep");
                if (bedEntry2) sleepLine += ` Bedtime logged at ${fmt12(bedEntry2.time)}.`;

                const dayMlTotal = todayEntries.filter(e => e.type === "feed" && !e.night).reduce((s,f) => s+(f.amount||0), 0);
                const feedCount = todayDayE.filter(e => e.type === "feed").length;
                let feedLine = "";
                if (feedCount === 0) feedLine = "No feeds logged yet.";
                else if (dayMlTotal > 0) {
                  feedLine = `${dayMlTotal}ml across ${feedCount} feed${feedCount!==1?"s":""}`;
                  const solids = todayDayE.filter(e => e.type === "feed" && e.feedType === "solids").length;
                  if (solids > 0) feedLine += ` + ${solids} solid${solids!==1?"s":""}`;
                  feedLine += ".";
                } else {
                  const breast = todayDayE.filter(e => e.type === "feed" && e.feedType === "breast").length;
                  const solids = todayDayE.filter(e => e.type === "feed" && e.feedType === "solids").length;
                  const parts = [];
                  if (breast > 0) parts.push(`${breast} breastfeed${breast!==1?"s":""}`);
                  if (solids > 0) parts.push(`${solids} solid${solids!==1?"s":""}`);
                  feedLine = parts.length ? parts.join(" + ") + "." : `${feedCount} feed${feedCount!==1?"s":""}.`;
                }

                const devSkills = MILESTONES.filter(m => ageWeeks >= m.weeks[0] && ageWeeks <= m.weeks[1] && !milestones[m.id]?.date);
                const cats = [...new Set(devSkills.map(m => m.cat))];
                const catNames = {social:"social skills",language:"communication",motor:"movement",cognitive:"thinking & play"};
                let devLine = "";
                if (cats.length > 0) devLine = `Working on ${cats.slice(0,2).map(c => catNames[c]||c).join(" and ")}.`;

                return (
                  <div style={{background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:20,padding:"16px",marginBottom:14,boxShadow:"0 2px 12px rgba(201,112,90,0.06)"}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700,color:C.deep,marginBottom:2}}>{dayLabel} with {name}</div>
                    <div style={{fontSize:12,color:C.lt,fontFamily:_fM,marginBottom:14}}>{fmtAge(age)} · week {ageWeeks}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {sleepLine && (
                        <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                          <span style={{fontSize:15,flexShrink:0,marginTop:1}}>😴</span>
                          <div>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:2}}>Sleep</div>
                            <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>{sleepLine}</div>
                          </div>
                        </div>
                      )}
                      {feedLine && (
                        <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                          <span style={{fontSize:15,flexShrink:0,marginTop:1}}>🍼</span>
                          <div>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:2}}>Feeding</div>
                            <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>{feedLine}</div>
                          </div>
                        </div>
                      )}
                      {devLine && (
                        <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                          <span style={{fontSize:15,flexShrink:0,marginTop:1}}>🧠</span>
                          <div>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:2}}>Development</div>
                            <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>{devLine}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── TODAY'S FEEDING INSIGHT ── */}
              {(()=>{
                const fc = feedCard();
                if (!fc) return null;
                return (
                  <div style={{background:fc.bg,backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",border:`1px solid ${fc.color}30`,borderLeft:`4px solid ${fc.color}`,borderRadius:16,padding:"14px 16px",marginBottom:14,boxShadow:"var(--card-shadow)"}}>
                    <div style={{fontSize:13,fontFamily:_fM,color:fc.color,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:10}}>{fc.isPastDay ? "Milk Intake" : "Today's Milk Intake"}</div>
                    <div style={{display:"flex",gap:10,marginBottom:10}}>
                      <div style={{flex:1,background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:12,padding:"10px 12px"}}>
                        <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>Daytime</div>
                        <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:fc.color,lineHeight:1}}>{fc.dayMl}ml</div>
                        <div style={{fontSize:11,color:fc.metMinimum?C.mint:fc.approachingBed?C.ter:C.lt,marginTop:2,fontWeight:fc.approachingBed&&!fc.metMinimum?600:400}}>
                          {fc.metMinimum ? `✓ min ${fc.totalMin}ml reached` : `min ${fc.totalMin}ml by bedtime`}
                        </div>
                      </div>
                      {fc.nightMl > 0 && (
                        <div style={{flex:1,background:"var(--chip-bg)",borderRadius:12,padding:"10px 12px"}}>
                          <div style={{fontSize:11,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>Night feeds</div>
                          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:"var(--text-mid)",lineHeight:1}}>{fc.nightMl}ml</div>
                          <div style={{fontSize:11,color:"var(--text-lt)",marginTop:2}}>total {fc.totalMl}ml</div>
                        </div>
                      )}
                      {fc.nightMl === 0 && (
                        <div style={{flex:1,background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:12,padding:"10px 12px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
                          <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:2}}>NHS range</div>
                          <div style={{fontSize:13,fontWeight:600,color:C.mid}}>{fc.totalLabel}</div>
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"var(--card-bg-solid)",borderRadius:10,padding:"9px 11px",marginBottom:(fc.sleepLink||fc.suggestions.length)?6:0}}>
                      <span style={{fontSize:14,flexShrink:0}}>{fc.icon}</span>
                      <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>{fc.statusMsg}</div>
                    </div>
                    {fc.sleepLink && (
                      <div style={{display:"flex",alignItems:"flex-start",gap:8,background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:10,padding:"9px 11px",marginBottom:fc.suggestions.length?6:0}}>
                        <span style={{fontSize:13,flexShrink:0}}>{fc.sleepLink.icon}</span>
                        <div>
                          {fc.sleepLink.title && <div style={{fontSize:12,fontWeight:700,color:"#8868d0",marginBottom:2}}>{fc.sleepLink.title}</div>}
                          <div style={{fontSize:12,color:"var(--text-mid)",lineHeight:1.5}}>{fc.sleepLink.body}</div>
                        </div>
                      </div>
                    )}
                    {fc.suggestions.map((s,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,background:"var(--card-bg)",borderRadius:10,padding:"8px 11px",marginTop:5}}>
                        <span style={{fontSize:13,flexShrink:0}}>{s.icon}</span>
                        <div style={{fontSize:12,color:C.mid,lineHeight:1.5}}>{s.body}</div>
                      </div>
                    ))}
                    {fc.status==="low" && (
                      <div style={{fontSize:12,color:C.lt,marginTop:8,paddingTop:6,borderTop:`1px solid ${fc.color}20`,lineHeight:1.4}}>
                        ℹ️ {fc.nhsNote}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── TRENDS SECTION (collapsible) ── */}
              {collHead("trends","📈","Trends")}
              {insightSection.trends && (
                <div style={{background:"var(--card-bg-solid)",border:`1.5px solid ${C.blush}`,borderTop:"none",borderRadius:"0 0 16px 16px",padding:"14px 14px 16px",marginBottom:12}}>

                  {/* Feed & Nap Trends */}
                  {dayKeys.length<3?(
                    <div style={{textAlign:"center",padding:"24px 10px",color:C.lt}}>
                      <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.mid,marginBottom:6}}>Not enough data yet</div>
                      <div style={{fontSize:13,fontFamily:_fM}}>Add at least 3 days to see trends</div>
                    </div>
                  ):(
                    <div>
                      {tLast&&tPrev&&(
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:10}}>This Week vs Last Week</div>
                          {[
                            {label:"Avg Daily Feed",curr:mlToDisplay(tLast.avgMl,FU),prev:mlToDisplay(tPrev.avgMl,FU),unit:volLabel(FU)},
                            {label:"Avg Nap Time",curr:tLast.avgNap,prev:tPrev.avgNap,unit:"",fmt:hm},
                            {label:"Avg Night Wakes",curr:tLast.avgNight,prev:tPrev.avgNight,unit:""},
                          ].map((row,i)=>{
                            const t=arrow(row.curr,row.prev);
                            return(
                              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:i<2?`1px solid ${C.blush}`:"none"}}>
                                <div>
                                  <div style={{fontSize:14,fontWeight:500}}>{row.label}</div>
                                  <div style={{fontSize:13,fontFamily:_fM,color:C.lt,marginTop:2}}>Last: {row.fmt?row.fmt(row.prev):row.prev}{row.unit}</div>
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.ter}}>{row.fmt?row.fmt(row.curr):row.curr}<span style={{fontSize:12,color:C.lt}}>{row.unit}</span></div>
                                  {t&&<div style={{fontSize:14,color:t.color,lineHeight:1}}>{t.icon}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div style={{marginBottom:14}}>
                        <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Daily Feed ({volLabel(FU)})</div>
                        <TrendLine vals={mlVals.map(v=>mlToDisplay(v,FU))} keys={dayKeys} color={C.ter} unit={volLabel(FU)}/>
                      </div>
                      <div style={{marginBottom:14}}>
                        <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Daily Nap Time</div>
                        <TrendLine vals={napVals} keys={dayKeys} color={C.mint} unit="m"/>
                      </div>
                      {weekAvgs.length>1&&(
                        <div>
                          <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Weekly Averages</div>
                          {weekAvgs.map((wk,i)=>(
                            <div key={i} style={{padding:"8px 0",borderBottom:i<weekAvgs.length-1?`1px solid ${C.blush}`:"none"}}>
                              <div style={{fontSize:13,fontFamily:_fM,color:C.lt,marginBottom:4}}>{wk.label} · {wk.days} days</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                <span style={{background:"var(--chip-bg)",color:C.ter,fontFamily:_fM,fontSize:13,padding:"2px 7px",borderRadius:99}}>~{mlToDisplay(wk.avgMl,FU)}{volLabel(FU)}/day</span>
                                <span style={{background:"var(--chip-bg)",color:C.mint,fontFamily:_fM,fontSize:13,padding:"2px 7px",borderRadius:99}}>~{hm(wk.avgNap)} naps</span>
                                <span style={{background:"var(--chip-bg)",color:"var(--gold)",fontFamily:_fM,fontSize:13,padding:"2px 7px",borderRadius:99}}>~{wk.avgNight} wakes</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── SLEEP ANALYSIS SECTION (collapsible) ── */}
              {collHead("sleep","😴","Sleep Analysis")}
              {insightSection.sleep && (
                <div style={{background:"var(--card-bg-solid)",border:`1.5px solid ${C.blush}`,borderTop:"none",borderRadius:"0 0 16px 16px",padding:"14px 14px 16px",marginBottom:12}}>
                  {/* Sleep Stability Score & Analytics */}
                  {(()=>{
                    const score = sleepScore();
                    const advice = sleepAdvice();
                    const suggestedBed = bedtimePrediction();
                    const hasNap = (days[selDay]||[]).some(e=>e.type==="nap");
                    const actualBedEntry = dayE.find(e=>e.type==="sleep");
                    const pred = predictNextNap();
                    const minsAway = pred ? minutesUntil(pred.napStart_min) : null;
                    const stability = sleepStabilityScore();
                    const outlook = sleepPressureOutlook();
                    const ebr = earlyBedtimeRisk();
                    const adv = advancedBedtimePrediction();
                    const circ = circadianAnalysis();
                    const anchor = morningWakeAnchor();
                    if (!hasNap) return <div style={{textAlign:"center",padding:"16px",color:C.lt,fontSize:13}}>No naps logged today — log a nap on the Day tab to see sleep analytics.</div>;
                    const stScore = stability ? stability.score : score;
                    const stColor = sleepScoreColor(stScore);
                    const radius = 22;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDash = (stScore / 100) * circumference;
                    return (
                      <div>
                        {/* Main Sleep Stability Card */}
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:12}}>🧠 Sleep Analytics</div>
                          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
                            <div style={{position:"relative",flexShrink:0}}>
                              <svg width={60} height={60} viewBox="0 0 60 60">
                                <circle cx={30} cy={30} r={radius} fill="none" stroke={C.blush} strokeWidth={5}/>
                                <circle cx={30} cy={30} r={radius} fill="none" stroke={stColor} strokeWidth={5} strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 30 30)"/>
                              </svg>
                              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontFamily:_fM,fontSize:15,fontWeight:700,color:stColor}}>{stScore}</div>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:stColor,marginBottom:2}}>Sleep Stability Score</div>
                              <div style={{fontSize:14,color:C.mid,lineHeight:1.5}}>{advice}</div>
                            </div>
                          </div>

                          {stability && stability.factors.length > 0 && (
                            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:12}}>
                              {stability.factors.map((f,i)=>(
                                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",borderRadius:10,background:f.status==="good"?"#f0faf6":f.status==="warn"?"#fff8f5":"#f5f8ff"}}>
                                  <span style={{fontSize:13,flexShrink:0,marginTop:1}}>{f.status==="good"?"✓":f.status==="warn"?"⚠️":"ℹ️"}</span>
                                  <div>
                                    <div style={{fontSize:12,fontFamily:_fM,color:f.status==="good"?C.mint:f.status==="warn"?C.ter:C.sky,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:1}}>{f.label}</div>
                                    <div style={{fontSize:13,color:C.mid,lineHeight:1.4}}>{f.note}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Night Sleep Outlook */}
                          {outlook && (
                            <div style={{marginBottom:12,padding:"10px 12px",borderRadius:12,background:outlook.bg,border:`1px solid ${outlook.color}33`}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:outlook.outlook!=="stable"?4:0}}>
                                <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08}}>🌙 Night Sleep Outlook</div>
                                <div style={{fontSize:13,fontFamily:_fM,fontWeight:700,color:outlook.color,padding:"2px 10px",borderRadius:99,background:`${outlook.color}18`}}>{outlook.label}</div>
                              </div>
                              {outlook.outlook!=="stable"&&<div style={{fontSize:13,color:C.mid,lineHeight:1.45,marginTop:4}}>{outlook.message}</div>}
                            </div>
                          )}

                          {/* Bridge nap suggestion */}
                          {(()=>{
                            if (!ebr) return null;
                            const dss2 = getDaySleepSummary();
                            const dayMet = dss2 && (dss2.status === "normal" || dss2.status === "above");
                            if (bridgeNapScheduled && dayMet) {
                              const todayNaps3 = (days[selDay]||[]).filter(e=>e.type==="nap"&&!e.night);
                              const lastNap2 = todayNaps3.length ? todayNaps3[todayNaps3.length-1] : null;
                              const lastNapDur = lastNap2 && lastNap2.start && lastNap2.end ? minDiff(lastNap2.start, lastNap2.end) : 0;
                              return (
                                <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid #50a888",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                                  <div style={{fontSize:13,fontWeight:700,color:"var(--mint)",marginBottom:4}}>✅ Day sleep target met!</div>
                                  <div style={{fontSize:13,color:C.mid,lineHeight:1.5,marginBottom:8}}>
                                    {lastNapDur >= 90
                                      ? `Baby slept ${hm(lastNapDur)} on the last nap and has now reached the NHS recommended day sleep for this age.`
                                      : `Baby has now reached the recommended day sleep for this age.`}
                                  </div>
                                  <div style={{display:"flex",gap:7}}>
                                    <button onClick={()=>setBridgeNap(false)} style={{flex:1,background:"linear-gradient(135deg,#50a888,#3a8870)",border:"none",borderRadius:99,padding:"7px 0",fontSize:13,fontWeight:700,color:"white",cursor:"pointer"}}>Remove bridge nap</button>
                                    <button onClick={()=>setBridgeNap(true)} style={{flex:1,background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:99,padding:"7px 0",fontSize:13,fontWeight:600,color:"var(--mint)",cursor:"pointer"}}>Keep it in</button>
                                  </div>
                                </div>
                              );
                            }
                            if (ebr.suggestBridge) {
                              return (
                                <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid var(--gold)",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                                  <div style={{fontSize:13,fontWeight:700,color:"var(--gold)",marginBottom:3}}>🌉 Bridge Nap Suggested</div>
                                  <div style={{fontSize:13,color:C.mid,lineHeight:1.5,marginBottom:bridgeNapScheduled?6:8}}>Today's naps were shorter than usual. A short bridge nap (15–30 min) may help.</div>
                                  {bridgeNapScheduled ? (
                                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                                        <span style={{fontSize:13}}>✅</span>
                                        <span style={{fontSize:12,fontFamily:_fM,color:"var(--gold)",fontWeight:700}}>Added to schedule</span>
                                      </div>
                                      <button onClick={()=>setBridgeNap(false)} style={{background:"var(--chip-bg)",border:"1px solid var(--card-border)",borderRadius:99,padding:"4px 11px",fontSize:12,fontWeight:600,color:"var(--gold)",cursor:"pointer"}}>Remove</button>
                                    </div>
                                  ) : (
                                    <button onClick={()=>setBridgeNap(true)} style={{width:"100%",background:"linear-gradient(135deg,#d4a855,#b8902a)",border:"none",borderRadius:99,padding:"8px 0",fontSize:13,fontWeight:700,color:"white",cursor:"pointer"}}>+ Add bridge nap to schedule</button>
                                  )}
                                </div>
                              );
                            }
                            if (bridgeNapScheduled) {
                              return (
                                <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid var(--gold)",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                                  <div style={{fontSize:13,fontWeight:700,color:"var(--gold)",marginBottom:3}}>🌉 Bridge nap scheduled</div>
                                  <div style={{fontSize:13,color:C.mid,lineHeight:1.5,marginBottom:6}}>Conditions have changed — bridge nap may no longer be necessary.</div>
                                  <button onClick={()=>setBridgeNap(false)} style={{background:"var(--chip-bg)",border:"1px solid var(--card-border)",borderRadius:99,padding:"5px 14px",fontSize:12,fontWeight:600,color:"var(--gold)",cursor:"pointer"}}>Remove from schedule</button>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Bedtime prediction */}
                          {actualBedEntry ? (
                            <div style={{background:"var(--card-bg-alt)",borderRadius:14,padding:"12px 14px"}}>
                              <div style={{fontSize:14,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:2}}>Bedtime Logged 🌙</div>
                              <div style={{fontSize:15,color:"var(--text-lt)"}}>Sleep tight!</div>
                            </div>
                          ) : pred ? (
                            <div style={{background:"var(--card-bg-alt)",borderRadius:14,padding:"12px 14px"}}>
                              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:adv||suggestedBed?8:0}}>
                                <div>
                                  <div style={{fontSize:14,fontFamily:_fM,color:C.mint,textTransform:"uppercase",letterSpacing:_ls08}}>😴 Next Nap Window</div>
                                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.mint}}>{minsAway!==null&&minsAway<=0?"Now!":fmtCountdown(napCountdown||0)}</div>
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <div style={{fontFamily:_fM,fontSize:15,fontWeight:700,color:C.mint}}>{fmt12(pred.napStart_min)}</div>
                                  <div style={{fontSize:15,color:C.lt}}>– {fmt12(pred.napStart_max)}</div>
                                </div>
                              </div>
                              {adv && (
                                <div style={{borderTop:`1px solid ${C.mint}22`,paddingTop:8,marginTop:4}}>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                                    <div style={{fontSize:14,fontFamily:_fM,color:C.sky,textTransform:"uppercase",letterSpacing:_ls08}}>Predicted Bedtime</div>
                                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.sky}}>{fmt12((() => { const m=adv.combined; return `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; })())}</div>
                                  </div>
                                </div>
                              )}
                              {!adv && suggestedBed && (
                                <div style={{borderTop:`1px solid ${C.mint}22`,paddingTop:8,marginTop:4}}>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                                    <div style={{fontSize:14,fontFamily:_fM,color:C.sky,textTransform:"uppercase",letterSpacing:_ls08}}>{suggestedBed.bedSource==="avg"?"Predicted Bedtime":"Suggested Bedtime"}</div>
                                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.sky}}>{fmt12(suggestedBed.time)}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : adv ? (
                            <div style={{background:"var(--card-bg-alt)",borderRadius:14,padding:"12px 14px",marginTop:4}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                                <div style={{fontSize:14,fontFamily:_fM,color:C.sky,textTransform:"uppercase",letterSpacing:_ls08}}>Predicted Bedtime</div>
                                <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:C.sky}}>{fmt12((() => { const m=adv.combined; return `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; })())}</div>
                              </div>
                            </div>
                          ) : suggestedBed ? (
                            <div style={{background:"var(--card-bg-alt)",borderRadius:14,padding:"12px 14px",marginTop:4}}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                                <div style={{fontSize:14,fontFamily:_fM,color:C.sky,textTransform:"uppercase",letterSpacing:_ls08}}>{suggestedBed.bedSource==="avg"?"Predicted Bedtime":"Suggested Bedtime"}</div>
                                <div style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:C.sky}}>{fmt12(suggestedBed.time)}</div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {/* Circadian rhythm alert */}
                        {circ && circ.isDrifted && (
                          <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid var(--gold)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                              <span style={{fontSize:16}}>🌅</span>
                              <div style={{fontSize:13,fontWeight:700,color:"var(--gold)"}}>Circadian Rhythm Running Later</div>
                            </div>
                            <div style={{fontSize:13,color:C.mid,lineHeight:1.5,marginBottom:8}}>Morning rhythm running later than typical (avg wake {fmt12(circ.avgWakeStr)}). Gradually shifting wake time earlier may help.</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                              {circ.adjustment.slice(0,5).map((a,i)=>(
                                <div key={i} style={{background:"var(--chip-bg)",border:"1px solid var(--card-border)",borderRadius:8,padding:"3px 8px",fontSize:12,color:"var(--gold)",fontFamily:_fM}}>
                                  Day {a.day}: {fmt12(a.time)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Early wake anchor */}
                        {anchor && anchor.earlyWake && (
                          <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid var(--sky)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                              <span style={{fontSize:14}}>⏰</span>
                              <div style={{fontSize:13,fontWeight:700,color:"#4060a0"}}>Early Morning Waking Detected</div>
                            </div>
                            <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>Consistent morning wake time helps stabilise baby's body clock.</div>
                          </div>
                        )}

                        {/* Nap structure */}
                        {(()=>{
                          const dns = dynamicNapStructure();
                          if (!dns || !dns.recommendation) return null;
                          return (
                            <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid var(--ter)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{fontSize:14}}>📋</span>
                                <div style={{fontSize:13,fontWeight:700,color:C.ter}}>Nap Structure Note</div>
                              </div>
                              <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>{dns.recommendation.message}</div>
                            </div>
                          );
                        })()}

                        {/* Regression check */}
                        {(()=>{
                          const alerts = regressionCheck();
                          if (!alerts) return null;
                          return alerts.map((a,i)=>(
                            <div key={i} style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderLeft:"4px solid var(--gold)",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                <span style={{fontSize:16}}>{a.icon}</span>
                                <div style={{fontSize:13,fontWeight:700,color:"var(--gold)"}}>Pattern Shift</div>
                              </div>
                              <div style={{fontSize:13,fontWeight:600,color:C.mid,marginBottom:3}}>{a.title}</div>
                              <div style={{fontSize:13,color:C.mid,lineHeight:1.5}}>{a.body}</div>
                            </div>
                          ));
                        })()}

                        {/* Wake Windows & Night Stretches */}
                        {(()=>{
                          const nextDayKey = (()=>{ const d=new Date(selDay+"T12:00:00"); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
                          const nightWins = getNightWindows(entries, days[nextDayKey]||[]);
                          if (wins.length === 0 && nightWins.length === 0) return null;
                          return (
                            <div style={{marginBottom:14}}>
                              <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Wake Windows & Night Stretches</div>
                              {wins.length>0&&(
                                <div style={{marginBottom:nightWins.length?10:0}}>
                                  <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:4}}>Wake Windows</div>
                                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                    {wins.map((w,i)=>(
                                      <div key={i} style={{background:w.bed?"#d5e7f2":"#f5eccb",borderRadius:8,padding:"4px 8px",fontSize:13,color:w.bed?C.sky:"#b88a20",fontFamily:_fM}}>
                                        {fmt12(w.from)} → {fmt12(w.to)} <strong>{hm(w.mins)}</strong>
                                        {w.bed&&<span style={{fontSize:11,marginLeft:3,opacity:0.7}}>🌙</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {nightWins.length>0&&(
                                <div>
                                  <div style={{fontSize:11,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:4}}>Night Stretches</div>
                                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                                    {nightWins.map((w,i)=>(
                                      <div key={i} style={{background:"var(--card-bg-alt)",borderRadius:8,padding:"4px 8px",fontSize:13,color:"var(--text-mid)",fontFamily:_fM}}>
                                        {fmt12(w.from)} → {fmt12(w.to)} <strong>{hm(w.mins)}</strong>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Tomorrow's Predicted Rhythm */}
                        {(()=>{
                          const flex = tomorrowFlexSchedule();
                          const sched = flex ? flex.schedule : null;
                          if (!sched) return null;
                          const isRhythmAdj = flex && flex.source === "rhythm-adjusted";
                          return (
                            <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderRadius:14,padding:"14px"}}>
                              <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:4}}>📅 Tomorrow's Predicted Rhythm</div>
                              <div style={{fontSize:12,color:C.lt,fontFamily:_fM,marginBottom:10}}>
                                {isRhythmAdj ? "⚡ Adjusted for circadian rhythm" : "Based on recent sleep patterns"}
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                                {sched.map((item,i)=>{
                                  const isBridge = item.type==="bridge";
                                  const dotColor = item.type==="bed"?C.sky:item.type==="nap"?C.mint:isBridge?"#d4a855":C.gold;
                                  return (
                                    <div key={i} style={{display:"flex",alignItems:"center",gap:0}}>
                                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:24,flexShrink:0}}>
                                        <div style={{width:8,height:8,borderRadius:"50%",background:dotColor,flexShrink:0}}/>
                                        {i<sched.length-1&&<div style={{width:2,height:20,background:C.blush}}/>}
                                      </div>
                                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flex:1,padding:"4px 0 4px 4px",opacity:isBridge?0.75:1}}>
                                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                                          <span style={{fontSize:13}}>{item.icon}</span>
                                          <span style={{fontSize:13,color:isBridge?"#8a6020":C.mid,fontWeight:500}}>{item.label}{isBridge?" (optional)":""}</span>
                                        </div>
                                        <span style={{fontFamily:_fM,fontSize:13,fontWeight:700,color:C.deep}}>{fmt12(item.time.includes("–")?item.time.split("–")[0].trim():item.time)}{item.time.includes("–")?" – "+fmt12(item.time.split("–")[1].trim()):""}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{fontSize:11,fontFamily:_fM,color:C.lt,marginTop:10,borderTop:`1px solid ${C.blush}`,paddingTop:6}}>
                                Based on {usePersonalRecs===true?"✨ personal":"NHS"} wake windows
                              </div>
                            </div>
                          );
                        })()}

                        {/* Averages */}
                        {(()=>{
                          const last14 = dayKeys.slice(-14);
                          if(last14.length < 3) return null;
                          const sleepData = last14.map(d=>{
                            const es = days[d]||[];
                            const bedEntry = es.filter(e=>e.type==="sleep"&&!e.night).sort((a,b)=>timeVal(a)-timeVal(b)).pop();
                            const wakeEntry = es.filter(e=>e.type==="wake"&&!e.night).sort((a,b)=>timeVal(a)-timeVal(b))[0];
                            const naps = es.filter(e=>e.type==="nap"&&!e.night);
                            const napMin = naps.reduce((s,n)=>s+minDiff(n.start,n.end),0);
                            const nightWakes = es.filter(e=>e.night).length;
                            return {date:d, bedtime:bedEntry?bedEntry.time:null, waketime:wakeEntry?wakeEntry.time:null, napMin, napCount:naps.length, nightWakes};
                          });
                          const bedtimes = sleepData.filter(d=>d.bedtime).map(d=>{const[h,m]=d.bedtime.split(":").map(Number);return h*60+m;});
                          const waketimes = sleepData.filter(d=>d.waketime).map(d=>{const[h,m]=d.waketime.split(":").map(Number);return h*60+m;});
                          const avgBed = bedtimes.length ? avgArr(bedtimes) : null;
                          const avgWake = waketimes.length ? avgArr(waketimes) : null;
                          const avgNightWakes = sleepData.length ? (sleepData.reduce((s,d)=>s+d.nightWakes,0)/sleepData.length).toFixed(1) : "—";
                          const avgNapMin = sleepData.length ? avgArr(sleepData.map(d=>d.napMin)) : 0;
                          const avgNapCount = sleepData.length ? (sleepData.reduce((s,d)=>s+d.napCount,0)/sleepData.length).toFixed(1) : "—";
                          const fmtMins = m => { if(m===null) return "—"; const h=Math.floor(m/60),mi=m%60; return `${h%12||12}:${String(mi).padStart(2,"0")}${h>=12?"pm":"am"}`; };
                          return (
                            <div style={{marginTop:14}}>
                              <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:8}}>Last {last14.length} Days Average</div>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 12px",border:`1px solid ${C.blush}`}}>
                                  <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>🌙 Avg Bedtime</div>
                                  <div style={{fontSize:18,fontWeight:700,color:C.deep,fontFamily:"'Playfair Display',serif"}}>{fmtMins(avgBed)}</div>
                                </div>
                                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 12px",border:`1px solid ${C.blush}`}}>
                                  <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>☀️ Avg Wake</div>
                                  <div style={{fontSize:18,fontWeight:700,color:C.deep,fontFamily:"'Playfair Display',serif"}}>{fmtMins(avgWake)}</div>
                                </div>
                                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 12px",border:`1px solid ${C.blush}`}}>
                                  <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>🔔 Avg Night Wakes</div>
                                  <div style={{fontSize:18,fontWeight:700,color:C.deep,fontFamily:"'Playfair Display',serif"}}>{avgNightWakes}</div>
                                </div>
                                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 12px",border:`1px solid ${C.blush}`}}>
                                  <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>😴 Avg Nap Time</div>
                                  <div style={{fontSize:18,fontWeight:700,color:C.deep,fontFamily:"'Playfair Display',serif"}}>{hm(avgNapMin)}</div>
                                  <div style={{fontSize:11,color:C.lt,marginTop:1}}>{avgNapCount} naps/day avg</div>
                                </div>
                              </div>
                              <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:6}}>Night Wakes Trend</div>
                              <TrendLine vals={last14.map(d=>(days[d]||[]).filter(e=>e.night).length)} keys={last14} color={C.sky}/>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── REPORTS SECTION (collapsible) — Day Report ── */}
              {collHead("reports","📊","Day Report")}
              {insightSection.reports && (
                <div style={{background:"var(--card-bg-solid)",border:`1.5px solid ${C.blush}`,borderTop:"none",borderRadius:"0 0 16px 16px",padding:"14px 14px 16px",marginBottom:12}}>
                  {(()=>{
                    const rEntries = days[selDay]||[];
                    const rDayE = rEntries.filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
                    const rNightE = rEntries.filter(e=>e.night);
                    const wakeEv = rDayE.find(e=>e.type==="wake");
                    const sleepEv = rDayE.find(e=>e.type==="sleep");
                    const dayFeeds = rDayE.filter(e=>e.type==="feed");
                    const dayNaps = rDayE.filter(e=>e.type==="nap");
                    const totalFeedMl = rEntries.filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0);
                    const nightFeedMl = rNightE.filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0);
                    const totalNapM = dayNaps.reduce((s,n)=>s+minDiff(n.start,n.end),0);
                    if(rEntries.length === 0) return <div style={{textAlign:"center",padding:"20px",color:C.lt,fontSize:13}}>No data for {fmtLong(selDay)}. Log entries on the Day tab first.</div>;
                    return (
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                          <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#c9705a,#7a5c52)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>📊</div>
                          <div>
                            <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700}}>Day Report</div>
                            <div style={{fontSize:13,fontFamily:_fM,color:C.lt}}>{fmtLong(selDay)}</div>
                          </div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                          <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderRadius:12,padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>Wake Up</div>
                            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.gold}}>{wakeEv?fmt12(wakeEv.time):"—"}</div>
                          </div>
                          <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderRadius:12,padding:"10px",textAlign:"center"}}>
                            <div style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>Bedtime</div>
                            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:C.sky}}>{sleepEv?fmt12(sleepEv.time):"—"}</div>
                          </div>
                        </div>
                        <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderLeft:`3px solid ${C.ter}`,borderRadius:12,padding:"10px",marginBottom:8}}>
                          <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>🍼 Feeding</div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:14,color:C.deep}}>Total</span>
                            <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.ter}}>{mlToDisplay(totalFeedMl,FU)}<span style={{fontSize:12,color:C.lt}}>{volLabel(FU)}</span></span>
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.mid,borderTop:`1px solid ${C.blush}`,paddingTop:4}}>
                            <span>Daytime · {dayFeeds.length} feeds</span>
                            <span style={{fontFamily:_fM}}>{totalFeedMl-nightFeedMl}ml</span>
                          </div>
                          {rNightE.filter(e=>e.type==="feed").length>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.mid,marginTop:3}}>
                            <span>Night · {rNightE.filter(e=>e.type==="feed").length} feeds</span>
                            <span style={{fontFamily:_fM}}>{nightFeedMl}ml</span>
                          </div>}
                        </div>
                        <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderLeft:`3px solid ${C.mint}`,borderRadius:12,padding:"10px",marginBottom:8}}>
                          <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>😴 Naps</div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:14,color:C.deep}}>{dayNaps.length} nap{dayNaps.length!==1?"s":""}</span>
                            <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.mint}}>{hm(totalNapM)}</span>
                          </div>
                          {dayNaps.map((n,i)=>(
                            <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:C.lt,fontFamily:_fM,marginTop:3,borderTop:i===0?`1px solid ${C.blush}`:"none",paddingTop:i===0?4:0}}>
                              <span>{fmt12(n.start)} – {fmt12(n.end)}</span>
                              <span>{minDiff(n.start,n.end)}min</span>
                            </div>
                          ))}
                        </div>
                        <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:12,padding:"10px",marginBottom:8,border:"1px solid var(--card-border)",boxShadow:"var(--card-shadow)"}}>
                          <div style={{fontSize:13,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>🌟 Night Wakes</div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:14,color:"var(--text-mid)"}}>{rNightE.length} wake{rNightE.length!==1?"s":""}</span>
                            {nightFeedMl>0&&<span style={{background:"var(--chip-bg)",color:C.gold,fontFamily:_fM,fontSize:13,padding:"2px 7px",borderRadius:99}}>{nightFeedMl}ml</span>}
                          </div>
                        </div>
                        {/* Sleep & Feed Insights from analyseTrends */}
                        {(()=>{
                          const t = analyseTrends();
                          if(!t || !t.insights || !t.insights.length) return null;
                          return (
                            <div style={{marginTop:6}}>
                              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
                                <span style={{fontSize:14}}>✨</span>
                                <div style={{fontSize:12,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls1,fontWeight:700}}>Sleep & Feed Insights</div>
                              </div>
                              {t.insights.map((ins,i)=>(
                                <div key={i} style={{marginBottom:6,padding:"8px 10px",borderRadius:12,background:ins.type==="warn"?"#fff8f5":ins.type==="good"?"#f0faf6":"#f5f8ff",border:`1px solid ${ins.type==="warn"?C.rose:ins.type==="good"?"var(--card-border)":"var(--card-border)"}`}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                                    <span style={{fontSize:13}}>{ins.icon}</span>
                                    <span style={{fontWeight:700,fontSize:12,color:ins.type==="warn"?C.ter:ins.type==="good"?C.mint:C.sky}}>{ins.title}</span>
                                  </div>
                                  <div style={{fontSize:12,color:C.mid,lineHeight:1.5}}>{ins.body}</div>
                                </div>
                              ))}
                              <div style={{fontSize:10,color:C.lt,fontFamily:_fM,lineHeight:1.4,padding:"4px 2px"}}>⚠️ General observations — not medical advice.</div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}
        {tab==="milestones"&&(()=>{
          const ageWeeks = age ? age.totalWeeks : null;

          if (!babyDob) return (
            <div className="glass-card" style={{...card,textAlign:"center",padding:"36px 20px"}}>
              <div style={{fontSize:40,marginBottom:14}}>🎂</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.mid,marginBottom:8}}>Add your baby's date of birth</div>
              <div style={{fontSize:15,color:C.lt,marginBottom:20,lineHeight:1.7}}>Add your baby's date of birth in Baby Settings to unlock milestones and Development Phases.</div>
              <button onClick={()=>{setCsName(babyName||"");setCsDob(activeChild.dob||"");setCsSex(activeChild.sex||"");setCsConfirmDelete(false);setShowChildSettings(true);}} style={{background:"linear-gradient(135deg,#c9705a,#a85a44)",border:_bN,borderRadius:99,padding:"12px 28px",color:"white",fontSize:14,cursor:_cP,fontWeight:700}}>⚙️ Open Baby Settings →</button>
            </div>
          );
          if (babyUnborn) {
            const daysUntil = babyDob ? Math.ceil((new Date(babyDob) - new Date()) / (1000*60*60*24)) : null;
            return (
              <div className="glass-card" style={{...card,textAlign:"center",padding:"36px 20px"}}>
                <div style={{fontSize:36,marginBottom:10}}>🤰</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.deep,fontWeight:700,marginBottom:6}}>
                  {daysUntil > 0 ? `Due in ${daysUntil} day${daysUntil!==1?"s":""}` : "Almost here!"}
                </div>
                <div style={{fontSize:15,color:C.mid,lineHeight:1.6}}>Milestones and Development Phases unlock once {babyName||"your baby"} arrives!</div>
              </div>
            );
          }

          // ── helpers ──────────────────────────────────────────────────────
          const dobDate  = new Date(babyDob + "T00:00:00");
          const wkToDate = (w) => { const d = new Date(dobDate); d.setDate(d.getDate() + w*7); return d; };
          const fmtD     = (d) => d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
          const name     = babyName || "Baby";

          // ── phase logic ──────────────────────────────────────────────────
          const activePhase  = DEV_PHASES.find(l => ageWeeks >= l.windowStart && ageWeeks <= l.windowEnd);
          const nextPhase    = DEV_PHASES.find(l => l.windowStart > (activePhase ? activePhase.windowEnd : ageWeeks));
          const isPrePhase   = !activePhase && nextPhase && ageWeeks >= nextPhase.windowStart - 1;
          const isFussy      = activePhase && ageWeeks <  activePhase.peakWeek;
          const isBloom      = activePhase && ageWeeks >= activePhase.peakWeek;
          const heroPhase    = activePhase || (isPrePhase ? nextPhase : null);
          const pastPhases   = DEV_PHASES.filter(l => l.windowEnd < ageWeeks && !(activePhase && l.phase===activePhase.phase));
          const upcomPhases  = DEV_PHASES.filter(l => {
            if (activePhase && l.phase <= activePhase.phase) return false;
            if (nextPhase && l.phase === nextPhase.phase && isPrePhase) return false;
            return l.windowStart > ageWeeks;
          });

          // ── milestones ───────────────────────────────────────────────────
          const doneCount = MILESTONES.filter(m => milestones[m.id]?.date).length;
          const ageLabel = fmtAge(age);
          const catOk   = (m) => msFilter === "all" || m.cat === msFilter;
          const nowMs   = MILESTONES.filter(m => catOk(m) && ageWeeks >= m.weeks[0] && m.weeks[0] <= ageWeeks + 4 && m.weeks[2] >= ageWeeks - 4);
          const pastMs  = MILESTONES.filter(m => catOk(m) && m.weeks[2] < ageWeeks - 4 && milestones[m.id]?.date);
          const futureMs = MILESTONES.filter(m => catOk(m) && m.weeks[0] > ageWeeks + 4);

          // ── age-appropriate activities ───────────────────────────────────
          const nowActs = DEV_ACTIVITIES.filter(a => ageWeeks >= a.weeks[0] && ageWeeks <= a.weeks[1]);

          // ── sub-components ───────────────────────────────────────────────
          // Exercise suggestions per milestone category (NHS/WHO/developmental guidelines)
          const MILESTONE_EXERCISES = {
            m1:  ["Try gentle face-to-face time 20–30cm away and smile back whenever baby makes eye contact — mirroring is the key trigger for social smiling."],
            m2:  ["Talk and sing close to baby's face; use a calm, high-pitched voice (motherese) — recognition develops through repeated, close exposure."],
            m3:  ["Try skin-to-skin contact and gentle rhythmic rocking; babies often settle faster when they can feel and hear your heartbeat."],
            m4:  ["Play peek-a-boo, blow raspberries, and make funny faces very close up — laughter is triggered by playful, surprising interactions."],
            m5:  ["Hold baby in front of a baby-safe mirror for 2–3 minutes daily — they'll engage with the other baby and build visual and social skills."],
            m6:  ["Gentle bicycle legs, singing action songs like Row Your Boat, and responding enthusiastically to any movement sparks excitement."],
            m7:  ["Offer arms out and make eye contact — don't rush to pick baby up, let them lean or reach toward you to build the association."],
            m8:  ["This is normal development — don't force introductions. Let new people make slow, gentle approaches while baby is in your arms."],
            m9:  ["Cover your face with your hands and reappear with a smile. Start slow and predictable, then vary the timing to build anticipation."],
            m10: ["Model affection to teddies or dolls ('cuddle the bear!') and respond warmly to any touch baby offers to reinforce the behaviour."],
            m11: ["Wave bye-bye consistently every time someone leaves; narrate it (Bye-bye Grandma!) — repetition is key for copying waving."],
            m12: ["Short separations with warm, confident goodbyes followed by reliable returns build security over time — avoid sneaking away."],
            m13: ["Baby groups or parallel play sessions alongside other children are the best natural practice for social play skills."],
            m14: ["Talk and sing constantly; pause after sentences to invite a 'response'. Even vowel sounds count as early cooing."],
            m15: ["Make sounds from different positions around the room; use a rattle to draw attention — sound tracking develops through practice."],
            m16: ["Gently clap near (not directly at) baby's ears, use different volumes — sensitivity to sound is usually present from birth."],
            m17: ["Blow raspberries, make squeaky or silly sounds close to baby's face and wait — they'll often try to copy the sound."],
            m18: ["Babble back at baby using the same sounds they make ('ba-ba-ba!') — this conversational turn-taking is the foundation of language."],
            m19: ["Use baby's name consistently — say it before speaking to them, during nappy changes, feeding. 'Oliver, look!' builds name recognition."],
            m20: ["Copy the sounds baby makes back to them, then add a new sound. Take turns — this 'serve and return' teaches imitation naturally."],
            m21: ["Model gestures throughout the day — wave bye-bye, shake your head for 'no', nod for 'yes'. Pair each gesture with the word every time."],
            m22: ["Use 'mama' and 'dada' consistently when the right parent is present. Point and say 'there's Dada!' — repetition links the word to the person."],
            m23: ["Label everything repeatedly — 'ball', 'cup', 'dog'. When baby attempts any word, respond enthusiastically and repeat it back clearly."],
            m24: ["Point to things yourself throughout the day — 'look, a bird!' Then pause and wait. When baby points, name what they're pointing at immediately."],
            m25: ["Give simple one-step instructions during play — 'give me the ball', 'put it in the box'. Gesture alongside words to support understanding."],
            m26: ["Expand on everything baby says. If they say 'milk', reply 'yes, more milk!' Model two-word phrases naturally throughout the day."],
            m27: ["Place baby on their tummy on a firm surface for short bursts (1–2 minutes, several times daily). Get down at their level with toys to encourage lifting."],
            m28: ["Hold baby upright against your shoulder or on your lap. Slowly reduce support so they practise holding their head steady independently."],
            m29: ["Place a rattle or soft toy in baby's palm — let them feel the grip reflex. Offer different textures and sizes to build hand strength."],
            m30: ["During tummy time, place a toy just ahead of baby to encourage pushing up on arms. Your face at their level is the best motivator."],
            m31: ["Hold a colourful toy within arm's reach during tummy time or supported sitting. Move it slowly to encourage reaching with either hand."],
            m32: ["During tummy time, hold a toy to one side and slightly above — this encourages the twist and weight shift needed to roll front to back."],
            m33: ["Lay baby on their back and hold a toy to one side. Gently bend the opposite knee across their body to show the rolling motion."],
          };

          const getMilestoneExercise = (m) => {
            if (!ageWeeks || !m || m.id === undefined) return null;
            const done = !!(milestones[m.id]?.date);
            if (done) return null;
            // Show tip for any unmet milestone that is currently in window or overdue
            const isInWindowOrPast = ageWeeks >= m.weeks[0];
            if (!isInWindowOrPast) return null;
            return (MILESTONE_EXERCISES[m.id] || [])[0] || null;
          };

          const MilestoneRow = ({m}) => {
            const done     = !!(milestones[m.id]?.date);
            const isNow    = ageWeeks >= m.weeks[0] && ageWeeks <= m.weeks[2];
            const isPast   = !isNow && ageWeeks > m.weeks[2];
            const isFuture = ageWeeks < m.weeks[0];
            const catInfo  = MILESTONE_CATS.find(c => c.key === m.cat);
            const tick     = done ? C.mint : isNow ? C.ter : "#ccc";
            const exerciseTip = getMilestoneExercise(m);
            return (
              <div style={{borderBottom:`1px solid ${C.blush}`}}>
                <div onClick={()=>{
                  if(isFuture) return;
                  if(done){ if(window.confirm(`Remove "${m.label}"?`)) setMilestones(ms=>({...ms,[m.id]:{}}))}
                  else {
                    setMilestones(ms=>{
                      const updated = {...ms,[m.id]:{date:todayStr()}};
                      setTimeout(()=>{
                        const catMs = MILESTONES.filter(mi=>mi.cat===m.cat && age && age.totalWeeks >= mi.weeks[0] && age.totalWeeks <= mi.weeks[2]);
                        const allDone = catMs.length >= 3 && catMs.every(mi=>updated[mi.id]?.date);
                        if(allDone){
                          const catLabel = MILESTONE_CATS.find(c=>c.key===m.cat)?.label || m.cat;
                          showMascot("celebration", `All ${catLabel} milestones hit! 🎉`, 3500);
                        }
                      }, 100);
                      return updated;
                    });
                    try{navigator.vibrate&&navigator.vibrate([30,20,30]);}catch{}
                  }
                }} style={{display:"flex",alignItems:"flex-start",gap:11,padding:"10px 0",cursor:isFuture?"default":"pointer",opacity:isFuture?0.45:1}}>
                  <div style={{width:21,height:21,borderRadius:"50%",border:`2px solid ${tick}`,background:done?C.mint:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                    {done && <span style={{color:"white",fontSize:11,fontWeight:700}}>✓</span>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:done?600:400,color:done?C.mint:C.deep,lineHeight:1.3}}>{m.label}</div>
                    <div style={{fontSize:11,color:C.lt,marginTop:2,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{background:"var(--chip-bg)",borderRadius:99,padding:"1px 6px"}}>{catInfo?.icon} {catInfo?.label}</span>
                      {done ? <span style={{color:C.mint}}>✓ {fmtLong(milestones[m.id].date)}</span>
                            : <span style={{fontFamily:_fM}}>typical wk {m.weeks[1]}</span>}
                      {done && <button onClick={e=>{e.stopPropagation();capturePhoto(m.id);}} style={{background:"var(--chip-bg)",border:"none",borderRadius:99,padding:"1px 7px",fontSize:11,color:C.mid,cursor:_cP}}>📷</button>}
                    </div>
                    {done && milestones[m.id]?.photo && (
                      <div style={{marginTop:6,width:64,height:64,borderRadius:10,overflow:"hidden",border:`1px solid ${C.blush}`}}>
                        <img src={milestones[m.id].photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      </div>
                    )}
                  </div>
                  <div style={{flexShrink:0,paddingTop:2}}>
                    {!done && isNow  && <span style={{fontSize:11,background:"var(--chip-bg-active)",color:C.ter,borderRadius:99,padding:"3px 8px",fontWeight:700}}>Now</span>}
                    {!done && isPast && <span style={{fontSize:11,background:"var(--chip-bg)",color:C.mint,borderRadius:99,padding:"3px 8px",cursor:_cP}}>Log it</span>}
                    {!done && isFuture && <span style={{fontSize:11,color:"#bbb",fontFamily:_fM}}>wk {m.weeks[0]}</span>}
                  </div>
                </div>
                {exerciseTip && (
                  <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:12,padding:"9px 11px",marginBottom:10,marginLeft:32}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#9878d0",marginBottom:3}}>💡 Try this to help</div>
                    <div style={{fontSize:13,color:"#9070c0",lineHeight:1.55}}>{exerciseTip}</div>
                  </div>
                )}
              </div>
            );
          };

          const Accordion = ({label, count, open, toggle, accent, children}) => (
            <div style={{marginBottom:8}}>
              <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",background:open?"#fdf4f0":C.warm,border:`1px solid ${open?C.blush:"var(--card-border)"}`,borderRadius:open?"12px 12px 0 0":12,cursor:_cP,fontFamily:_fI}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:accent||C.mid}}>{label}</span>
                  <span style={{fontSize:11,background:"var(--chip-bg)",borderRadius:99,padding:"1px 7px",color:C.lt,fontFamily:_fM}}>{count}</span>
                </div>
                <span style={{fontSize:11,color:C.lt,display:"inline-block",transform:open?"rotate(180deg)":"rotate(0)"}} >▼</span>
              </button>
              {open && (
                <div style={{border:`1px solid ${C.blush}`,borderTop:"none",borderRadius:"0 0 12px 12px",padding:"4px 14px 10px",background:"var(--card-bg-solid)"}}>
                  {children}
                </div>
              )}
            </div>
          );

          return (
            <div>
              <div className="glass-card" style={{...card,marginBottom:12,padding:"12px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:2}}>{possessive(name)} age</div>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.ter,lineHeight:1}}>
                      {ageLabel} <span style={{fontSize:12,color:C.lt,fontFamily:_fM,fontWeight:400}}>· wk {ageWeeks}</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:C.mint,lineHeight:1}}>{doneCount}</div>
                    <div style={{fontSize:10,fontFamily:_fM,color:C.lt}}>milestones logged</div>
                  </div>
                </div>
                <div style={{background:C.blush,borderRadius:99,height:5,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:99,background:`linear-gradient(90deg,${C.ter},${C.mint})`,width:`${Math.round(doneCount/MILESTONES.length*100)}%`,transition:"width 0.4s"}}/>
                </div>
                <div style={{fontSize:10,fontFamily:_fM,color:C.lt,marginTop:3}}>{doneCount} of {MILESTONES.length} logged</div>
              </div>
              <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:12,WebkitOverflowScrolling:"touch"}}>
                {[{key:"all",icon:"⭐",label:"All"},...MILESTONE_CATS].map(c=>(
                  <button key={c.key} onClick={()=>setMsFilter(c.key)}
                    style={{flexShrink:0,padding:"7px 14px",borderRadius:999,border:`1px solid ${msFilter===c.key?"var(--card-border)":"var(--card-border)"}`,background:msFilter===c.key?"var(--chip-bg-active)":"var(--chip-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",color:msFilter===c.key?C.ter:C.mid,fontSize:12,fontWeight:msFilter===c.key?700:400,cursor:_cP,fontFamily:_fI,whiteSpace:"nowrap",boxShadow:msFilter===c.key?"var(--chip-shadow-active)":"var(--chip-shadow)"}}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
              <div className="glass-card" style={{...card,padding:"4px 14px 8px",marginBottom:10}}>
                <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,padding:"8px 0 6px",borderBottom:`1px solid ${C.blush}`,marginBottom:2}}>
                  Happening now · tap to mark achieved
                </div>
                {nowMs.length === 0
                  ? <div style={{textAlign:"center",padding:"18px 0",color:C.lt,fontSize:13}}>No milestones in this window for this category.</div>
                  : nowMs.map(m => <MilestoneRow key={m.id} m={m}/>)
                }
              </div>
              {pastPhases.length > 0 && (
                <Accordion label="Past development phases" count={pastPhases.length} open={msShowPastPhases} toggle={()=>setMsShowPastPhases(v=>!v)} accent="#7060b0">
                  {pastPhases.map(l => (
                    <div key={l.phase} style={{padding:"10px 0",borderBottom:`1px solid ${C.blush}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#9060e0,#7040c0)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:10,color:"white",fontWeight:700}}>{l.phase}</span>
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:"#4a28a0"}}>Phase {l.phase}: {l.name}</div>
                          <div style={{fontSize:11,color:C.lt,fontFamily:_fM}}>{fmtD(wkToDate(l.windowStart))} – {fmtD(wkToDate(l.windowEnd))}</div>
                        </div>
                      </div>
                      <div style={{fontSize:11,color:C.lt,paddingLeft:32,lineHeight:1.6}}>{l.skills.join(" · ")}</div>
                    </div>
                  ))}
                </Accordion>
              )}
              {pastMs.length > 0 && (
                <Accordion label="Achieved milestones" count={pastMs.length} open={msShowPastMs} toggle={()=>setMsShowPastMs(v=>!v)} accent={C.mint}>
                  {pastMs.map(m => <MilestoneRow key={m.id} m={m}/>)}
                </Accordion>
              )}
              {(upcomPhases.length > 0 || futureMs.length > 0) && (
                <Accordion label="What's coming up" count={upcomPhases.length + futureMs.length} open={msShowUpcoming} toggle={()=>setMsShowUpcoming(v=>!v)} accent="#d09020">
                  {upcomPhases.map(l => (
                    <div key={l.phase} style={{padding:"10px 0",borderBottom:`1px solid ${C.blush}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#f0c030,#d89010)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{fontSize:10,color:"white",fontWeight:700}}>{l.phase}</span>
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:"var(--gold)"}}>Phase {l.phase}: {l.name}</div>
                          <div style={{fontSize:11,color:C.lt,fontFamily:_fM}}>{fmtD(wkToDate(l.windowStart))} – {fmtD(wkToDate(l.windowEnd))} · wk {l.windowStart}–{l.windowEnd}</div>
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"var(--gold)",paddingLeft:32,marginBottom:3,lineHeight:1.5}}>{l.fussy}</div>
                      <div style={{fontSize:11,color:C.lt,paddingLeft:32,lineHeight:1.6}}>{l.skills.join(" · ")}</div>
                    </div>
                  ))}
                  {futureMs.length > 0 && (
                    <div>
                      <div style={{fontSize:10,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,padding:"10px 0 4px",borderBottom:`1px solid ${C.blush}`,marginBottom:2}}>Future milestones</div>
                      {futureMs.map(m => <MilestoneRow key={m.id} m={m}/>)}
                    </div>
                  )}
                </Accordion>
              )}
              <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:12,padding:"12px 14px",marginTop:6,marginBottom:4}}>
                <div style={{fontSize:11,color:C.mid,lineHeight:1.7}}>
                  <span style={{fontWeight:700,color:C.deep}}>ℹ️ A note on milestones</span><br/>
                  Every baby develops at their own pace — these ranges are general guidelines, not a fixed schedule. Some babies reach milestones earlier, others later, and both are perfectly normal.<br/><br/>
                  If you have any concerns about milestones that haven't been reached over a couple of months, or if something doesn't feel right, <span style={{fontWeight:600,color:C.deep}}>speak to your health visitor or GP</span> — they're there to help and will always take your concerns seriously.
                </div>
              </div>

            </div>
          );
        })()}
        {tab==="develop"&&(()=>{
          const ageWeeks = age ? age.totalWeeks : null;
          const name = babyName || "Baby";


          function getDevAdvice(ageWeeks) {
            if (!ageWeeks) return [];
            if (ageWeeks < 6) return [
              { icon:"👁", title:"Visual stimulation", body:"Babies can only focus 20–30cm away. Hold high-contrast black-and-white patterns near their face. Mobiles above the cot help develop tracking." },
              { icon:"🗣", title:"Talk constantly", body:"Narrate everything you do. Your voice is the most important stimulus. Babies recognise parents' voices from birth and respond to tone before words." },
              { icon:"🤱", title:"Skin-to-skin", body:"WHO recommends daily skin-to-skin contact in early weeks. Regulates baby's temperature, heart rate and stress hormones, and supports bonding." },
              { icon:"🏋️", title:"Tummy time from day one", body:"NHS recommends starting supervised tummy time from birth. Even 1–2 minutes several times daily builds neck and shoulder strength essential for later motor development." },
            ];
            if (ageWeeks < 13) return [
              { icon:"😄", title:"Respond to smiles", body:"First social smiles appear around 6–8 weeks. Mirror them immediately — this serve-and-return interaction is foundational for emotional development per WHO guidelines." },
              { icon:"🎵", title:"Singing and rhythm", body:"Singing the same simple songs repeatedly helps babies begin to recognise patterns in language. NHS encourages nursery rhymes from birth for speech development." },
              { icon:"👐", title:"Grasp play", body:"Place a rattle or your finger lightly in their palm. The grasp reflex is transitioning to intentional grasping — repeated practice builds hand strength." },
              { icon:"🏋️", title:"Increase tummy time", body:"Work up to 30 minutes of tummy time per day spread across multiple sessions. This is the NHS and WHO recommendation for building strength before rolling." },
            ];
            if (ageWeeks < 26) return [
              { icon:"🔊", title:"Sound cause & effect", body:"Shake a rattle and watch them follow it. Let baby hold the rattle to discover they make the sound. This builds early understanding of cause and effect." },
              { icon:"📚", title:"Board books daily", body:"NHS Start4Life recommends daily shared book reading from birth. At this age, simple faces and high-contrast illustrations are most engaging." },
              { icon:"🪞", title:"Mirror exploration", body:"Hold baby in front of a baby-safe mirror. They won't recognise themselves yet but will engage with the other baby — supporting social and visual development." },
              { icon:"🎶", title:"Baby music classes", body:"WHO developmental guidance notes that rhythmic movement and music together accelerate auditory processing. Even gentle bouncing to music counts." },
            ];
            if (ageWeeks < 40) return [
              { icon:"🧩", title:"Object permanence games", body:"This is the peak age for developing object permanence. Cover a toy with a cloth while they watch and encourage them to find it. Start simple, get more complex." },
              { icon:"🍽️", title:"Weaning begins", body:"NHS and WHO recommend introducing solid foods at around 6 months (26 weeks). Start with smooth purees, offering a wide variety of tastes early reduces fussiness." },
              { icon:"🗣", title:"Babbling back", body:"When baby babbles (ba-ba, da-da), respond with the same sounds. This conversational turn-taking is the direct precursor to first words." },
              { icon:"🚶", title:"Supported standing", body:"Hold baby upright with feet flat and let them bounce and bear weight. NHS guidelines note this builds the leg strength needed for walking later." },
            ];
            if (ageWeeks < 54) return [
              { icon:"👋", title:"Simple signs", body:"NHS recommends teaching simple baby sign language (more, milk, all done) alongside spoken words. Signs give pre-verbal babies a way to communicate and reduce frustration." },
              { icon:"📖", title:"Interactive reading", body:"Point to pictures and ask where is the dog? Pause and wait. This builds pointing, joint attention and receptive vocabulary — all key WHO language milestones." },
              { icon:"🧱", title:"Stacking and sorting", body:"Stacking cups and shape sorters build fine motor control, spatial reasoning and problem-solving. NHS developmental checks look for these skills at the 1-year review." },
              { icon:"🏃", title:"Walking support", body:"Encourage cruising along furniture. NHS guidance is that most babies walk independently by 18 months — provide safe furniture routes and celebrate every step." },
            ];
            if (ageWeeks < 78) return [
              { icon:"💬", title:"First words & naming", body:"Encourage labelling everything consistently. WHO speech milestones expect 2–3 meaningful words by 12–15 months and 10+ by 18 months. Respond enthusiastically to any attempt." },
              { icon:"🎭", title:"Pretend play", body:"Introduce simple pretend play — feeding a teddy, talking on a toy phone. NHS 2-year check looks for symbolic play as a key cognitive indicator." },
              { icon:"🌍", title:"Social play", body:"Organise playdates or baby groups. WHO guidelines emphasise that from 12 months, exposure to other children significantly advances social development." },
              { icon:"🏃", title:"Physical confidence", body:"WHO recommends at least 180 minutes of physical activity per day for 1–2 year olds. Encourage walking on different surfaces, climbing safely, and dancing." },
            ];
            if (ageWeeks < 104) return [
              { icon:"📚", title:"Expand vocabulary", body:"NHS expects 50+ words and two-word phrases by age 2. Read together daily, name new things, and expand what they say — if they say car, you say yes, big red car." },
              { icon:"🧩", title:"Puzzles & problem-solving", body:"Simple 2–4 piece puzzles build spatial reasoning. Shape sorters and stacking toys develop the problem-solving skills assessed at the NHS 2-year review." },
              { icon:"🎨", title:"Mark-making", body:"Offer chunky crayons and large paper. Scribbling is a fine motor milestone and the precursor to drawing and writing. NHS looks for mark-making at the 2-year check." },
              { icon:"🤝", title:"Turn-taking", body:"Practice my turn, your turn with rolling a ball, building blocks, or simple games. Turn-taking is a key social skill that NHS assesses at age 2." },
            ];
            return [
              { icon:"🗣", title:"Sentences & stories", body:"NHS expects 3–5 word sentences by age 3. Tell stories together, ask open-ended questions like what happened? and model full sentences back." },
              { icon:"🏃", title:"Active play", body:"WHO recommends at least 60 minutes of energetic physical activity daily for 2–3 year olds, plus no more than 1 hour of sedentary screen time." },
              { icon:"🎭", title:"Imaginative play", body:"Pretend play with storylines (shops, kitchens, doctors) shows advanced cognitive development. NHS 2.5-year check looks for this as a key indicator." },
              { icon:"😊", title:"Emotional literacy", body:"Name emotions as they happen: you look cross, that was exciting. NHS guidance for 2–3 year olds emphasises that naming feelings helps children learn self-regulation." },
            ];
          }

          const devAdvice = getDevAdvice(ageWeeks);
          const nowActs = DEV_ACTIVITIES.filter(a => ageWeeks !== null && ageWeeks >= a.weeks[0] && ageWeeks <= a.weeks[1]);
          const filteredActs = devActFilter === "all" ? nowActs : nowActs.filter(a => a.cat === devActFilter);

          return (
            <div>
              {/* ── COMING UP — Development Phase ── */}
              {(()=>{
                if (!ageWeeks || !babyDob) return null;
                const dobDate = new Date(babyDob+"T00:00:00");
                const wkToDate2 = (w) => { const d = new Date(dobDate); d.setDate(d.getDate() + w*7); return d; };
                const fmtD2 = (d) => d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
                const activePhase = DEV_PHASES.find(l => ageWeeks >= l.windowStart && ageWeeks <= l.windowEnd);
                const nextPhase2 = DEV_PHASES.find(l => l.windowStart > (activePhase ? activePhase.windowEnd : ageWeeks));
                const isPrePhase = !activePhase && nextPhase2 && ageWeeks >= nextPhase2.windowStart - 1;
                const isFussy2 = activePhase && ageWeeks < activePhase.peakWeek;
                const isBloom2 = activePhase && ageWeeks >= activePhase.peakWeek;
                const heroPhase = activePhase || (isPrePhase ? nextPhase2 : null);
                if (!heroPhase && !nextPhase2) return null;

                return (
                  <div style={{marginBottom:14}}>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.deep,marginBottom:12}}>Coming Up</div>

                    {isPrePhase && heroPhase && (()=>{
                      const sd=fmtD2(wkToDate2(heroPhase.windowStart)), pd=fmtD2(wkToDate2(heroPhase.peakWeek)), ed=fmtD2(wkToDate2(heroPhase.windowEnd));
                      return (
                        <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:18,padding:"16px",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                            <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#f5c840,#e8a820)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>⛈</div>
                            <div>
                              <div style={{fontSize:10,fontFamily:_fM,color:"var(--gold)",textTransform:"uppercase",letterSpacing:_ls1}}>Approaching · Phase {heroPhase.phase}</div>
                              <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--gold)"}}>{heroPhase.name}</div>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                            {[["Unsettled period",`${sd} – ${pd}`],["New skills",`${pd} – ${ed}`]].map(([lbl,val])=>(
                              <div key={lbl} style={{background:"var(--chip-bg)",borderRadius:99,padding:"3px 10px",fontSize:11}}>
                                <span style={{color:"var(--gold)",fontWeight:600}}>{lbl} </span><span style={{color:"var(--gold)",fontFamily:_fM}}>{val}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{fontSize:13,color:"var(--gold)",lineHeight:1.55,marginBottom:9}}>{heroPhase.fussy}</div>
                          <div style={{fontSize:12,fontWeight:700,color:"var(--gold)",marginBottom:5}}>Skills coming with this phase</div>
                          {heroPhase.skills.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><span style={{color:"var(--gold)",fontSize:13,flexShrink:0}}>✦</span><span style={{fontSize:13,color:"var(--gold)"}}>{s}</span></div>))}
                        </div>
                      );
                    })()}

                    {isFussy2 && heroPhase && (()=>{
                      const pd=fmtD2(wkToDate2(heroPhase.peakWeek)), ed=fmtD2(wkToDate2(heroPhase.windowEnd));
                      return (
                        <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:18,padding:"16px",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                            <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#8848e0,#6030c0)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🌀</div>
                            <div>
                              <div style={{fontSize:10,fontFamily:_fM,color:"var(--text-mid)",textTransform:"uppercase",letterSpacing:_ls1}}>Phase {heroPhase.phase} · Unsettled period</div>
                              <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--text-mid)"}}>{heroPhase.name}</div>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                            {[["Unsettled period","now → "+pd],["New skills",pd+" → "+ed]].map(([lbl,val])=>(
                              <div key={lbl} style={{background:"var(--chip-bg)",borderRadius:99,padding:"3px 10px",fontSize:11}}>
                                <span style={{color:"var(--text-mid)",fontWeight:600}}>{lbl} </span><span style={{color:"var(--text-mid)",fontFamily:_fM}}>{val}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{fontSize:13,color:"var(--text-mid)",lineHeight:1.55,marginBottom:9}}>{heroPhase.fussy} New skills start emerging around {pd}.</div>
                          <div style={{fontSize:12,fontWeight:700,color:"var(--text-mid)",marginBottom:5}}>Skills unlocking soon</div>
                          {heroPhase.skills.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><span style={{color:"#8848e0",fontSize:13,flexShrink:0}}>✦</span><span style={{fontSize:13,color:"var(--text-mid)"}}>{s}</span></div>))}
                        </div>
                      );
                    })()}

                    {isBloom2 && heroPhase && (()=>{
                      const ed=fmtD2(wkToDate2(heroPhase.windowEnd));
                      return (
                        <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:18,padding:"16px",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                            <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#38c870,#20a050)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🌱</div>
                            <div>
                              <div style={{fontSize:10,fontFamily:_fM,color:"#187040",textTransform:"uppercase",letterSpacing:_ls1}}>Phase {heroPhase.phase} · New skills emerging</div>
                              <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"var(--mint)"}}>{heroPhase.name}</div>
                            </div>
                          </div>
                          <div style={{fontSize:13,color:"var(--mint)",lineHeight:1.55,marginBottom:9}}>The unsettled period has passed — watch for new abilities over the next few days.</div>
                          <div style={{fontSize:12,fontWeight:700,color:"var(--mint)",marginBottom:5}}>Skills developing now (until {ed})</div>
                          {heroPhase.skills.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><span style={{color:"#38c870",fontSize:13,flexShrink:0}}>✦</span><span style={{fontSize:13,color:"var(--mint)"}}>{s}</span></div>))}
                        </div>
                      );
                    })()}

                    {!activePhase && !isPrePhase && nextPhase2 && (nextPhase2.windowStart - ageWeeks) <= 8 && (()=>{
                      const wksAway=nextPhase2.windowStart-ageWeeks, sd=fmtD2(wkToDate2(nextPhase2.windowStart)), pd=fmtD2(wkToDate2(nextPhase2.peakWeek)), ed=fmtD2(wkToDate2(nextPhase2.windowEnd));
                      return (
                        <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:18,padding:"14px 16px 12px",marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                            <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#c0a8f0,#a080d8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>🔭</div>
                            <div>
                              <div style={{fontSize:10,fontFamily:_fM,color:"#8878d0",textTransform:"uppercase",letterSpacing:_ls1}}>Coming in ~{wksAway} week{wksAway!==1?"s":""} · Phase {nextPhase2.phase}</div>
                              <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:"#2e1870"}}>{nextPhase2.name}</div>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:9}}>
                            {[["Unsettled period",`${sd} – ${pd}`],["New skills",`${pd} – ${ed}`]].map(([lbl,val])=>(
                              <div key={lbl} style={{background:"var(--chip-bg)",borderRadius:99,padding:"3px 10px",fontSize:11}}>
                                <span style={{color:"var(--text-mid)",fontWeight:600}}>{lbl} </span><span style={{color:"var(--text-mid)",fontFamily:_fM}}>{val}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{fontSize:13,color:"var(--text-mid)",lineHeight:1.55,marginBottom:7}}>{nextPhase2.fussy}</div>
                          <div style={{fontSize:12,fontWeight:700,color:"var(--text-mid)",marginBottom:5}}>Skills coming with this phase</div>
                          {nextPhase2.skills.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}><span style={{color:"#a080d8",fontSize:13,flexShrink:0}}>✦</span><span style={{fontSize:13,color:"var(--text-mid)"}}>{s}</span></div>))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",border:`1px solid ${C.rose}`,borderRadius:20,padding:"16px",marginBottom:14,display:"flex",alignItems:"center",gap:14,boxShadow:"var(--card-shadow)"}}>
                <div style={{width:52,height:52,borderRadius:16,background:`linear-gradient(135deg,${C.ter},#a85a44)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:24}}>🧩</span>
                </div>
                <div>
                  <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:C.deep}}>{name}'s Development</div>
                  <div style={{fontSize:13,color:C.mid,marginTop:2}}>
                    {age ? `${fmtAge(age)} · ${age.totalWeeks} weeks old` : "Set a date of birth to personalise"}
                  </div>
                  <div style={{fontSize:11,fontFamily:_fM,color:C.lt,marginTop:3}}>Based on NHS & WHO guidelines</div>
                </div>
              </div>
              <div className="glass-card" style={{...card, marginBottom:14}}>
                <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:12}}>🎯 Activities for right now</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
                  {[{key:"all",label:"All",icon:"✦"},...ACT_CATS].map(c=>(
                    <button key={c.key} onClick={()=>setDevActFilter(c.key)}
                      style={{padding:"7px 14px",borderRadius:999,border:"1px solid var(--card-border)",background:devActFilter===c.key?"var(--chip-bg-active)":"var(--chip-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",fontSize:12,fontWeight:600,color:devActFilter===c.key?C.ter:C.mid,cursor:_cP,fontFamily:_fI,transition:"all 0.2s",boxShadow:devActFilter===c.key?"var(--chip-shadow-active)":"var(--chip-shadow)"}}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>

                {!ageWeeks ? (
                  <div style={{textAlign:"center",padding:"20px",color:C.lt,fontSize:13}}>Set a date of birth in Growth to see personalised activities.</div>
                ) : filteredActs.length === 0 ? (
                  <div style={{textAlign:"center",padding:"20px",color:C.lt,fontSize:13}}>No activities in this category for current age.</div>
                ) : (
                  filteredActs.map(a => {
                    const catInfo = ACT_CATS.find(c=>c.key===a.cat);
                    return (
                      <div key={a.id} style={{padding:"14px",marginBottom:10,borderRadius:16,background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                          <div style={{width:34,height:34,borderRadius:12,background:`linear-gradient(135deg,${C.ter}22,${C.ter}11)`,border:`1px solid ${C.rose}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15}}>
                            {catInfo?.icon||"✦"}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:15,fontWeight:700,color:C.deep,lineHeight:1.2}}>{a.title}</div>
                            <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                              <span style={{fontSize:11,background:"var(--chip-bg)",borderRadius:99,padding:"2px 8px",color:C.mid}}>{catInfo?.icon} {catInfo?.label}</span>
                              <span style={{fontSize:11,fontFamily:_fM,background:"var(--card-bg-alt)",borderRadius:99,padding:"2px 8px",color:C.mint}}>wk {a.weeks[0]}–{a.weeks[1]}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{paddingLeft:44}}>
                          <div style={{fontSize:13,color:C.deep,lineHeight:1.6,marginBottom:6}}>
                            <span style={{fontWeight:700,color:C.ter}}>How: </span>{a.how}
                          </div>
                          <div style={{fontSize:12,color:C.mid,lineHeight:1.55,background:"var(--card-bg-solid)",borderRadius:10,padding:"8px 11px",border:`1px solid ${C.blush}`}}>
                            <span style={{fontWeight:600,color:C.mint}}>Why it helps: </span>{a.why}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="glass-card" style={{...card, marginBottom:14}}>
                <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:12}}>🏥 NHS & WHO Guidance for this age</div>
                {!ageWeeks ? (
                  <div style={{textAlign:"center",padding:"16px",color:C.lt,fontSize:13}}>Set a date of birth to see age-appropriate guidance.</div>
                ) : (
                  devAdvice.map((item, i) => (
                    <div key={i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:i<devAdvice.length-1?`1px solid ${C.blush}`:"none"}}>
                      <div style={{width:36,height:36,borderRadius:12,background:"var(--card-bg)",border:"1px solid var(--card-border)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>
                        {item.icon}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:C.deep,marginBottom:3}}>{item.title}</div>
                        <div style={{fontSize:13,color:C.mid,lineHeight:1.6}}>{item.body}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{background:"var(--card-bg-alt)",border:"1px solid var(--card-border)",borderRadius:12,padding:"12px 14px",marginBottom:4}}>
                <div style={{fontSize:11,color:C.mid,lineHeight:1.7}}>
                  <span style={{fontWeight:700,color:C.deep}}>ℹ️ About this guidance</span><br/>
                  Activities and advice are based on NHS Start4Life and WHO Child Development guidelines, as well as Kinedu-style developmental play principles. Every baby develops at their own pace — use these as inspiration, not a checklist. If you have concerns about development, speak to your health visitor or GP.
                </div>
              </div>

            </div>
          );
        })()}

      </div>
      
      {tab==="settings"&&(
        <div style={{padding:"16px 16px 100px"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.deep,marginBottom:4}}>👤 {familyUsername||"Account"}</div>
          {familyUsername&&<div style={{fontSize:12,fontFamily:_fM,color:C.lt,marginBottom:20}}>{syncStatus==="synced"?"🔄 Synced":syncStatus==="syncing"?"⏳ Syncing…":syncStatus==="error"?"⚠️ Sync error":"☁️ "+familyUsername}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <button onClick={()=>setShowFamilyModal(true)} style={{display:"flex",alignItems:"center",gap:14,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",cursor:_cP,textAlign:"left",width:"100%"}}>
              <span style={{fontSize:24}}>👨‍👩‍👧</span>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.deep}}>Share & Sync</div>
                <div style={{fontSize:12,color:C.lt,marginTop:2}}>{familyCode?"Manage sync & backup":"Connect with partner or restore data"}</div>
              </div>
            </button>
            {backupCode&&(
              <button onClick={()=>{
                const tot=Object.values(children).reduce((s,c)=>s+Object.values(c.days||{}).reduce((s2,arr)=>s2+(arr||[]).length,0),0);
                const days2=Object.values(children).reduce((s,c)=>s+Object.keys(c.days||{}).length,0);
                if(window.confirm("Save current data to cloud?\n\n"+days2+" days · "+tot+" entries\n\n⚠️ This replaces whatever is currently saved in the cloud with what's on this device. Use this if you're sure this device has the most up-to-date data.")){pushToCloud(backupCode,childrenRef.current);}
              }} style={{display:"flex",alignItems:"center",gap:14,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",cursor:_cP,textAlign:"left",width:"100%"}}>
                <span style={{fontSize:24}}>💾</span>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.mint}}>Save to Cloud</div>
                  <div style={{fontSize:12,color:C.lt,marginTop:2}}>Manually push this device's data to the cloud — replaces existing cloud data</div>
                </div>
              </button>
            )}
            <button onClick={()=>{setTutStep(0);try{localStorage.removeItem("tut_v2");}catch{}}} style={{display:"flex",alignItems:"center",gap:14,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",cursor:_cP,textAlign:"left",width:"100%"}}>
              <span style={{fontSize:24}}>❓</span>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.deep}}>App Tour</div>
                <div style={{fontSize:12,color:C.lt,marginTop:2}}>Replay the walkthrough</div>
              </div>
            </button>
            {/* Export Data */}
            <button onClick={()=>exportCSV()} style={{display:"flex",alignItems:"center",gap:14,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",cursor:_cP,textAlign:"left",width:"100%"}}>
              <span style={{fontSize:24}}>📊</span>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.deep}}>Export Data</div>
                <div style={{fontSize:12,color:C.lt,marginTop:2}}>Download CSV — feeds, sleep, growth &amp; more</div>
              </div>
            </button>
            {/* Photo Diary */}
            {photos.length>0&&(
              <div style={{background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",width:"100%"}}>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                  <span style={{fontSize:24}}>📷</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:700,color:C.deep}}>Photo Diary</div>
                    <div style={{fontSize:12,color:C.lt,marginTop:2}}>{photos.length} photo{photos.length!==1?"s":""}</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {photos.slice(-12).map((p,i)=>(
                    <div key={p.id||i} onClick={()=>setViewPhoto(p)} style={{position:"relative",paddingBottom:"100%",borderRadius:10,overflow:"hidden",border:`1px solid ${C.blush}`,cursor:_cP}}>
                      <img src={p.dataUrl} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.5)",color:"white",fontSize:8,fontFamily:_fM,padding:"2px 4px",textAlign:"center"}}>{fmtDate(p.date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Fluid Measurement Unit */}
            <div style={{background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",width:"100%",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                <span style={{fontSize:24}}>🍼</span>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.deep}}>Fluid Measurement</div>
                  <div style={{fontSize:12,color:C.lt,marginTop:2}}>Choose how milk and pump volumes are displayed</div>
                </div>
              </div>
              <div style={{display:"inline-flex",background:"var(--card-bg)",borderRadius:99,border:`1px solid ${C.blush}`,overflow:"hidden",marginBottom:8}}>
                <button onClick={()=>setFluidUnit("ml")} style={{padding:"7px 20px",fontSize:13,fontFamily:_fM,fontWeight:700,border:"none",background:fluidUnit==="ml"?`linear-gradient(135deg,${C.ter},#a85a44)`:"transparent",color:fluidUnit==="ml"?"white":C.lt,cursor:"pointer",borderRadius:99}}>ml</button>
                <div style={{width:1,background:C.blush}}/>
                <button onClick={()=>setFluidUnit("oz")} style={{padding:"7px 20px",fontSize:13,fontFamily:_fM,fontWeight:700,border:"none",background:fluidUnit==="oz"?`linear-gradient(135deg,${C.ter},#a85a44)`:"transparent",color:fluidUnit==="oz"?"white":C.lt,cursor:"pointer",borderRadius:99}}>fl oz</button>
              </div>
              <div style={{fontSize:12,color:C.lt,lineHeight:1.5}}>
                {fluidUnit==="oz"?"Volumes shown in fluid ounces. Data is stored in ml internally — you can switch back anytime.":"Volumes shown in millilitres (default)."}
              </div>
            </div>
            {/* Sleep Recommendations Mode */}
            <div style={{background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",width:"100%"}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                <span style={{fontSize:24}}>🧠</span>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.deep}}>Sleep Recommendations</div>
                  <div style={{fontSize:12,color:C.lt,marginTop:2}}>Choose how nap and bedtime predictions are calculated</div>
                </div>
              </div>
              <div style={{display:"inline-flex",background:"var(--card-bg)",borderRadius:99,border:`1px solid ${C.blush}`,overflow:"hidden",marginBottom:12}}>
                <button onClick={()=>{setUsePersonalRecs(true);try{localStorage.setItem("use_personal_recs_v1","true");}catch{};}} style={{padding:"7px 16px",fontSize:13,fontFamily:_fM,fontWeight:700,border:"none",background:usePersonalRecs===true?"linear-gradient(135deg,#50a888,#3a8870)":"transparent",color:usePersonalRecs===true?"white":C.lt,cursor:"pointer",whiteSpace:"nowrap",borderRadius:99}}>✨ Personal</button>
                <div style={{width:1,background:C.blush}}/>
                <button onClick={()=>{setUsePersonalRecs(false);try{localStorage.setItem("use_personal_recs_v1","false");}catch{};}} style={{padding:"7px 16px",fontSize:13,fontFamily:_fM,fontWeight:700,border:"none",background:(usePersonalRecs===false||usePersonalRecs===null)?"#4a5a80":"transparent",color:(usePersonalRecs===false||usePersonalRecs===null)?"white":C.lt,cursor:"pointer",whiteSpace:"nowrap",borderRadius:99}}>NHS</button>
              </div>
              <div style={{fontSize:13,color:C.mid,lineHeight:1.6}}>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
                  <div style={{fontWeight:700,color:C.deep,marginBottom:4}}>✨ Personal Mode</div>
                  Learns from your baby's actual sleep patterns. After 5+ days of data, OBubba analyses your baby's real nap lengths, wake windows, and bedtime habits, then blends them with age guidance to create personalised predictions. Gets more accurate the more you log.
                </div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontWeight:700,color:C.deep,marginBottom:4}}>NHS Mode</div>
                  Uses standard NHS and WHO recommended wake windows and nap counts for your baby's age. Population-level guidelines that work well for most babies. Best when starting out, sleep is unpredictable, or you prefer official recommendations.
                </div>
                <div style={{fontSize:12,color:C.lt,lineHeight:1.55}}>
                  <div style={{fontWeight:600,color:C.mid,marginBottom:4}}>This setting affects:</div>
                  <div>• Nap countdown timers and bedtime predictions</div>
                  <div>• "Is This Normal?" sleep comparison card</div>
                  <div>• Tomorrow's predicted schedule in Sleep Analysis</div>
                  <div>• Suggested wake windows and nap counts</div>
                  <div>• Feeding suggestions and milk targets</div>
                  <div style={{marginTop:6}}>Switch between modes at any time — your logged data is always kept.</div>
                </div>
              </div>
            </div>
            {familyUsername&&(
              <button onClick={logout} style={{display:"flex",alignItems:"center",gap:14,background:"var(--card-bg-solid)",border:`1px solid ${C.blush}`,borderRadius:16,padding:"14px 16px",cursor:_cP,textAlign:"left",width:"100%",marginTop:6}}>
                <span style={{fontSize:24}}>🚪</span>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:C.mid}}>Sign Out</div>
                  <div style={{fontSize:12,color:C.lt,marginTop:2}}>Signed in as {familyUsername}</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"var(--nav-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderTop:"1px solid var(--nav-border)",display:"flex",justifyContent:"space-evenly",alignItems:"center",boxShadow:"var(--nav-shadow)",maxWidth:520,margin:"0 auto",borderRadius:"22px 22px 0 0",paddingBottom:"env(safe-area-inset-bottom,0)",padding:"4px 8px env(safe-area-inset-bottom,0)"}}>
        {["day","insights","milestones","develop"].map(t=>(
          <button key={t} onClick={()=>{setTab(t);setLogPanel(null);}} style={tabSt(t)}>
            <span style={{fontSize:14,transition:"transform 0.15s",transform:tab===t?"scale(1.1)":"scale(1)"}}>{tabIcons[t]}</span>
            <span>{tabLabels[t]}</span>
            {tab===t&&<div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:24,height:2.5,borderRadius:99,background:C.ter}}/>}
          </button>
        ))}
      </div>
      {/* Timer end prompt — night wake or morning wake? */}
      {timerEndPrompt && (
        <Sheet onClose={()=>setTimerEndPrompt(null)} title="">
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:36,marginBottom:8}}>⏱️</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.deep,marginBottom:4}}>Timer stopped</div>
            <div style={{fontSize:14,color:C.mid}}>{fmt12(timerEndPrompt.start)} → {fmt12(timerEndPrompt.end)} · {hm(timerEndPrompt.durMins)}</div>
          </div>
          <div style={{fontSize:14,color:C.mid,textAlign:"center",marginBottom:16}}>What was this?</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button onClick={()=>{
              // Log as night wake on current day
              quickAddLog("wake",{type:"wake",time:timerEndPrompt.end,night:true,note:""});
              setTimerEndPrompt(null);
              setShowNightWake(true);
            }} style={{padding:"14px",borderRadius:14,border:"1.5px solid var(--card-border)",background:"var(--card-bg-alt)",cursor:_cP,fontFamily:_fI,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>🌙</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:15,fontWeight:700,color:"#7b68ee"}}>Night Wake</div>
                <div style={{fontSize:12,color:"#9080d8"}}>Baby woke during the night — log a night wake</div>
              </div>
            </button>
            <button onClick={()=>{
              // Morning wake — if bedtime already logged today, create next day and log wake there
              const hasBedtime = (days[selDay]||[]).some(e => e.type==="sleep" && !e.night);
              if (hasBedtime) {
                const nextDay = (()=>{ const d=new Date(selDay+"T12:00:00"); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })();
                setDays(d=>{
                  const existing = d[nextDay] || [];
                  const hasWake = existing.some(e=>e.type==="wake"&&!e.night);
                  if (hasWake) return d;
                  const updated = [...existing, {id:uid(),type:"wake",time:timerEndPrompt.end,night:false,note:""}];
                  return {...d, [nextDay]: updated};
                });
                setSelDay((()=>{ const d=new Date(selDay+"T12:00:00"); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; })());
              } else {
                quickAddLog("wake",{type:"wake",time:timerEndPrompt.end,night:false,note:""});
              }
              setTimerEndPrompt(null);
            }} style={{padding:"14px",borderRadius:14,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",cursor:_cP,fontFamily:_fI,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>☀️</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:15,fontWeight:700,color:C.gold}}>Morning Wake Up</div>
                <div style={{fontSize:12,color:C.mid}}>Baby's up for the day — logs on the next day</div>
              </div>
            </button>
          </div>
        </Sheet>
      )}
      {logPanel==="feed"&&(
        <Sheet onClose={()=>setLogPanel(null)} title="🍼 Log Feed">
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {[{v:"bottle",label:"🍼 Bottle"},{v:"breast",label:"🤱 Breast"},{v:"solids",label:"🥣 Solids"}].map(({v,label})=>(
              <button key={v} onClick={()=>setLogForm(f=>({...f,feedType:v}))}
                style={{flex:1,padding:"9px 4px",borderRadius:12,border:`2px solid ${logForm.feedType===v?C.ter:C.blush}`,background:logForm.feedType===v?"var(--chip-bg-active)":C.warm,fontSize:13,fontWeight:700,color:logForm.feedType===v?C.ter:C.mid,cursor:_cP,fontFamily:_fI}}>
                {label}
              </button>
            ))}
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>Time (optional)</label>
            <TimeInput value={logForm.feedTime} onChange={t=>setLogForm(f=>({...f,feedTime:t}))} style={{marginBottom:0}}/>
            <div style={{fontSize:11,color:C.lt,marginTop:3}}>Leave empty to log as now</div>
          </div>

          {logForm.feedType==="bottle"&&(
            <Inp label={`Amount (${volLabel(FU)})`} type="number" inputMode="numeric" placeholder={FU==="oz"?"e.g. 6":"e.g. 180"} value={logForm.amount} onChange={e=>setLogForm(f=>({...f,amount:e.target.value}))}/>
          )}
          {logForm.feedType==="breast"&&(
            <div style={{marginBottom:12}}>
              <label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:6}}>Minutes each side</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[["breastL","Left (L)"],["breastR","Right (R)"]].map(([k,lbl])=>(
                  <div key={k}>
                    <label style={{fontSize:14,fontFamily:_fM,color:C.lt,display:"block",marginBottom:3}}>{lbl}</label>
                    <input type="number" inputMode="numeric" min="0" max="60" placeholder="mins" value={logForm[k]||""} onChange={e=>setLogForm(f=>({...f,[k]:e.target.value}))}
                      style={{width:"100%",padding:"9px 11px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:15,fontFamily:_fI,outline:_oN,boxSizing:_bBB,textAlign:"center"}}/>
                  </div>
                ))}
              </div>
              <div style={{fontSize:15,color:C.lt,fontFamily:_fM,marginTop:6,textAlign:"center"}}>
                Total: {((parseInt(logForm.breastL)||0)+(parseInt(logForm.breastR)||0))} min
              </div>
            </div>
          )}
          {logForm.feedType==="pump"&&null}
          {logForm.feedType==="solids"&&(
            <Inp label="What did they eat?" type="text" placeholder="e.g. porridge, half jar" value={logForm.note} onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}/>
          )}
          {logForm.feedType!=="solids"&&(
            <Inp label="Note (optional)" type="text" placeholder="e.g. fussy, didn't finish…" value={logForm.note} onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}/>
          )}
          <PBtn onClick={saveLogFeed}>✓ Log Feed</PBtn>
        </Sheet>
      )}

      {logPanel==="nappy"&&(
        <Sheet onClose={()=>{setLogPanel(null);setNappyMode(null);setNappyTime("");}} title="💩 Log Nappy">
          <div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:11,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>Time (optional)</label>
              <TimeInput value={nappyTime} onChange={t=>setNappyTime(t)} style={{marginBottom:0}}/>
              <div style={{fontSize:11,color:C.lt,marginTop:3}}>Leave empty to log as now</div>
            </div>
            {!nappyMode && (
              <div>
                <div style={{fontSize:13,color:C.lt,marginBottom:10,fontFamily:_fM}}>What type?</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                  <button onClick={()=>{const t=nappyTime||nowTime();quickAddLog("poop",{type:"poop",time:t,poopType:"wet",note:""});setNappyMode(null);setNappyTime("");}}
                    style={{padding:"18px 10px",borderRadius:16,border:`2px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:32,cursor:_cP,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <span>💧</span>
                    <span style={{fontSize:14,fontWeight:700,color:C.mid}}>Wet</span>
                  </button>
                  <button onClick={()=>setNappyMode("dirty")}
                    style={{padding:"18px 10px",borderRadius:16,border:`2px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:32,cursor:_cP,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <span>💩</span>
                    <span style={{fontSize:14,fontWeight:700,color:C.mid}}>Dirty</span>
                  </button>
                </div>
              </div>
            )}
            {nappyMode==="dirty" && (
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontSize:13,fontFamily:_fM,color:C.mid,fontWeight:600}}>💩 What did it look like?</div>
                  <button onClick={()=>setNappyMode(null)} style={{fontSize:12,color:C.lt,background:_bN,border:_bN,cursor:_cP,fontFamily:_fI}}>← Back</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                  {POOP_TYPES.map(pt=>(
                    <button key={pt} onClick={()=>{const t=nappyTime||nowTime();quickAddLog("poop",{type:"poop",time:t,poopType:pt,note:""});setNappyMode(null);setNappyTime("");}}
                      style={{padding:"7px 14px",borderRadius:99,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:13,color:C.mid,cursor:_cP,fontFamily:_fI}}>
                      {pt}
                    </button>
                  ))}
                </div>
                <PBtn v="ghost" onClick={()=>{const t=nappyTime||nowTime();quickAddLog("poop",{type:"poop",time:t,poopType:"dirty",note:""});setNappyMode(null);setNappyTime("");}}>Just log as dirty</PBtn>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {logPanel==="sleep"&&(
        <Sheet onClose={()=>setLogPanel(null)} title="😴 Log Sleep">
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {[{v:"nap",label:"😴 Nap"},{v:"bed",label:"🌙 Bedtime"}].map(({v,label})=>(
              <button key={v} onClick={()=>setLogForm(f=>({...f,sleepType:v}))}
                style={{flex:1,padding:"9px 4px",borderRadius:12,border:`2px solid ${logForm.sleepType===v?C.ter:C.blush}`,background:logForm.sleepType===v?"var(--chip-bg-active)":C.warm,fontSize:13,fontWeight:700,color:logForm.sleepType===v?C.ter:C.mid,cursor:_cP,fontFamily:_fI}}>
                {label}
              </button>
            ))}
          </div>
          {logForm.sleepType==="nap"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
                {[["napStart","Start"],["napEnd","End"]].map(([k,lbl])=>(
                  <div key={k}>
                    <label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>{lbl}</label>
                    <TimeInput value={logForm[k]} onChange={t=>setLogForm(f=>({...f,[k]:t}))} style={{marginBottom:0}}/>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:C.lt,marginBottom:12}}>Leave empty to log as now</div>
            </div>
          )}
          {logForm.sleepType==="bed"&&(
            <div style={{marginBottom:12}}>
              <TimeInput label="Bedtime" value={logForm.bedTime} onChange={t=>setLogForm(f=>({...f,bedTime:t}))}/>
              <div style={{fontSize:11,color:C.lt,marginTop:-8}}>Leave empty to log as now</div>
            </div>
          )}
          <PBtn onClick={saveLogSleep}>✓ Log Sleep</PBtn>
        </Sheet>
      )}

      {logPanel==="wake"&&(
        <Sheet onClose={()=>setLogPanel(null)} title="☀️ Log Wake Up">
          <div style={{marginBottom:12}}>
            <TimeInput label="Wake Time" value={logForm.feedTime} onChange={t=>setLogForm(f=>({...f,feedTime:t}))}/>
          </div>
          {(()=>{
            const dayEntries = days[selDay]||[];
            const hasBedtime = dayEntries.some(e=>e.type==="sleep"&&!e.night);
            if(!hasBedtime){
              return (
                <div>
                  <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 12px",marginBottom:14,fontSize:13,color:C.mid,lineHeight:1.55}}>
                    ☀️ Logs morning wake time — used to calculate wake windows and today's nap schedule.
                  </div>
                  <PBtn onClick={()=>{
                    const t = logForm.feedTime || nowTime();
                    quickAddLog("wake",{type:"wake",time:t,night:false,note:""});
                    setLogPanel(null);
                  }}>✓ Log Wake Up</PBtn>
                </div>
              );
            }
            return (
              <div>
                <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"10px 12px",marginBottom:14,fontSize:13,color:C.mid,lineHeight:1.55}}>
                  🌙 Bedtime has been logged. Is this a night wake or start of the next day?
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <PBtn v="pri" onClick={()=>{
                    setLogPanel(null);
                    setNwForm({time:logForm.feedTime||nowTime(),ml:"",selfSettled:false,assisted:false,assistedType:"milk",assistedNote:"",assistedDuration:"",note:""});
                    setShowNightWake(true);
                  }}>🌙 Night Wake</PBtn>
                  <PBtn v="ghost" onClick={()=>{
                    const t = logForm.feedTime || nowTime();
                    const nextDay = (()=>{const d=new Date(selDay+"T12:00:00");d.setDate(d.getDate()+1);return d.toISOString().split("T")[0];})();
                    const entry = {id:uid(),type:"wake",time:t,night:false,note:""};
                    setDays(d=>({...d,[nextDay]:[...(d[nextDay]||[]),entry]}));
                    setLogPanel(null);
                    setSelDay(nextDay);
                    try{navigator.vibrate&&navigator.vibrate([35,25,35]);}catch{}
                    setQuickFlash("☀️ Wake logged on "+fmtDate(nextDay));
                    setTimeout(()=>setQuickFlash(null),1200);
                  }}>☀️ Start of New Day</PBtn>
                </div>
              </div>
            );
          })()}
        </Sheet>
      )}

      {logPanel==="pump"&&(
        <Sheet onClose={()=>setLogPanel(null)} title="🫙 Log Pump Session">
          <div style={{marginBottom:14}}>
            <TimeInput label="Start time" value={logForm.pumpStart||nowTime()} onChange={t=>setLogForm(f=>({...f,pumpStart:t}))} style={{marginBottom:0}}/>
          </div>
          <Inp label="Duration (mins)" type="number" inputMode="numeric" min="0" placeholder="e.g. 20"
            value={logForm.pumpDuration||""} onChange={e=>setLogForm(f=>({...f,pumpDuration:e.target.value}))}/>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:6}}>Total pumped ({volLabel(FU)})</label>
            <input type="number" inputMode="numeric" min="0" placeholder="e.g. 120"
              value={logForm.pumpTotal||""}
              onChange={e=>{
                const tot=parseInt(e.target.value)||0;
                const half=Math.round(tot/2);
                setLogForm(f=>({...f,pumpTotal:e.target.value,pumpL:tot>0?String(half):"",pumpR:tot>0?String(tot-half):""}));
              }}
              style={{width:"100%",padding:"9px 11px",borderRadius:12,border:`2px solid ${C.ter}`,background:"var(--card-bg-alt)",fontSize:18,fontWeight:700,fontFamily:_fI,outline:_oN,boxSizing:_bBB,textAlign:"center",color:C.ter}}/>
            <div style={{fontSize:12,color:C.lt,marginTop:4,textAlign:"center",fontFamily:_fM}}>Splits equally between left & right — adjust below if needed</div>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:6}}>Per side ({volLabel(FU)})</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["pumpL","Left (L)"],["pumpR","Right (R)"]].map(([k,lbl])=>(
                <div key={k}>
                  <label style={{fontSize:13,fontFamily:_fM,color:C.mid,display:"block",marginBottom:3,textAlign:"center"}}>{lbl}</label>
                  <input type="number" inputMode="numeric" min="0" placeholder={volLabel(FU)}
                    value={logForm[k]||""}
                    onChange={e=>{
                      const updated={...logForm,[k]:e.target.value};
                      const newTotal=(parseInt(updated.pumpL)||0)+(parseInt(updated.pumpR)||0);
                      setLogForm(f=>({...f,[k]:e.target.value,pumpTotal:newTotal>0?String(newTotal):""}));
                    }}
                    style={{width:"100%",padding:"9px 11px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:15,fontFamily:_fI,outline:_oN,boxSizing:_bBB,textAlign:"center"}}/>
                </div>
              ))}
            </div>

          </div>

          <Inp label="Notes (optional)" type="text" placeholder="e.g. morning session, freezer stash…"
            value={logForm.note||""} onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}/>

          <PBtn onClick={saveLogPump}>✓ Save Pump Session</PBtn>
        </Sheet>
      )}
      {modal==="entry"&&(
        <Sheet onClose={()=>{setModal(null);setEditEntry(null);}} title={editEntry?"Edit Entry":"Add Entry"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:15}}>
            {["feed","nap","wake","sleep","poop"].map(t=>(
              <div key={t} onClick={()=>setEType(t)} style={{padding:"10px 6px",borderRadius:14,border:`2px solid ${eType===t?C.ter:C.blush}`,background:eType===t?"var(--chip-bg-active)":C.warm,textAlign:"center",cursor:_cP}}>
                <div style={{fontSize:20}}>{ICONS[t]}</div>
                <div style={{fontSize:14,fontWeight:500,color:eType===t?C.ter:C.mid,marginTop:3}}>{NAMES[t]}</div>
              </div>
            ))}
          </div>

          {eType==="feed"&&<>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {["milk","breast","solids"].map(ft=>(
                <button key={ft} onClick={()=>setFeedType(ft)} style={{flex:1,padding:"7px 4px",borderRadius:12,border:`2px solid ${feedType===ft?C.ter:C.blush}`,background:feedType===ft?"var(--chip-bg-active)":C.warm,fontSize:14,fontWeight:600,color:feedType===ft?C.ter:C.mid,cursor:_cP,fontFamily:_fI}}>
                  {ft==="milk"?"🍼 Bottle":ft==="breast"?"🤱 Breast":"🥣 Solids"}
                </button>
              ))}
            </div>
            {feedType==="milk"&&<Inp label={`Amount (${volLabel(FU)})`} type="number" inputMode="numeric" placeholder={FU==="oz"?"e.g. 6":"e.g. 180"} value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>}
            {feedType==="breast"&&(
              <div style={{marginBottom:12}}>
                <label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:6}}>Minutes each side</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["breastL","Left (L)"],["breastR","Right (R)"]].map(([k,lbl])=>(
                    <div key={k}>
                      <label style={{fontSize:14,fontFamily:_fM,color:C.lt,display:"block",marginBottom:3}}>{lbl}</label>
                      <input type="number" inputMode="numeric" min="0" max="60" placeholder="mins" value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                        style={{width:"100%",padding:"9px 11px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:15,fontFamily:_fI,outline:_oN,boxSizing:_bBB,textAlign:"center"}}/>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:15,color:C.lt,fontFamily:_fM,marginTop:6,textAlign:"center"}}>
                  Total: {((parseInt(form.breastL)||0)+(parseInt(form.breastR)||0))} min
                </div>
              </div>
            )}
            {feedType==="solids"&&<Inp label="Description / amount" type="text" placeholder="e.g. porridge, half jar" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>}
            <TimeInput label="Time" value={form.time} onChange={t=>setForm(f=>({...f,time:t}))}/>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>Night feed?</label>
                <select value={form.night} onChange={e=>setForm(f=>({...f,night:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",fontSize:15,fontFamily:_fI,outline:_oN,boxSizing:_bBB}}>
                  <option value="no">No — daytime</option>
                  <option value="yes">Yes — night wake</option>
                </select>
              </div>
            {(feedType==="milk"||feedType==="breast")&&<Inp label="Note (optional)" type="text" placeholder="e.g. fussy, didn't finish…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>}
          </>}

          {eType==="nap"&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {["start","end"].map(k=>(
                  <div key={k}>
                    <label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:4}}>{k}</label>
                    <TimeInput value={form[k]} onChange={t=>setForm(f=>({...f,[k]:t}))} style={{marginBottom:0}}/>
                  </div>
                ))}
              </div>
              <Inp label="Note (optional)" type="text" placeholder="e.g. fussy, didn't finish…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
            </>
          )}

          {(eType==="wake"||eType==="sleep")&&(
            <>
              <TimeInput label="Time" value={form.time} onChange={t=>setForm(f=>({...f,time:t}))}/>
              <Inp label="Note (optional)" type="text" placeholder="e.g. fussy, didn't finish…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
            </>
          )}

          {eType==="poop"&&(
            <>
              <TimeInput label="Time" value={form.time} onChange={t=>setForm(f=>({...f,time:t}))}/>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:15,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:_ls08,display:"block",marginBottom:6}}>Colour / type</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {POOP_TYPES.map(pt=>(
                    <button key={pt} onClick={()=>setForm(f=>({...f,poopType:pt}))} style={{padding:"6px 12px",borderRadius:99,border:`1.5px solid ${form.poopType===pt?"#8a7060":C.blush}`,background:form.poopType===pt?"#e8e0d4":C.warm,fontSize:14,color:form.poopType===pt?"#5a4030":C.mid,cursor:_cP,fontFamily:_fI,fontWeight:form.poopType===pt?600:400}}>
                      {pt}
                    </button>
                  ))}
                </div>
              </div>
              <Inp label="Note (optional)" type="text" placeholder="e.g. explosive, small…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
            </>
          )}

          <PBtn onClick={saveEntry}>{editEntry?"Update Entry":"Save Entry"}</PBtn>
        </Sheet>
      )}

      {modal==="addDay"&&(
        <Sheet onClose={()=>setModal(null)} title="Add Past Day">
          <div style={{fontSize:15,color:C.lt,marginBottom:12,lineHeight:1.6}}>Today is created automatically. Use this to log a past day you missed.</div>
          <Inp label="Date" type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} max={(()=>{const y=new Date();y.setDate(y.getDate()-1);return y.toISOString().split("T")[0];})()}/>
          <PBtn onClick={addDay}>Add Past Day</PBtn>
        </Sheet>
      )}

      {modal==="dayMenu"&&menuDay&&(
        <Sheet onClose={()=>{setModal(null);setConfirmDeleteDay(false);}} title={`Edit · ${fmtDate(menuDay)}`}>
          {!confirmDeleteDay ? (<>
            <Inp label="Change Date To" type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}/>
            <PBtn onClick={saveEditDay}>Save New Date</PBtn>
            <PBtn v="ghost" onClick={()=>setModal(null)} style={{marginTop:8}}>Cancel</PBtn>
            <div style={{borderTop:`1px solid ${C.blush}`,margin:"12px 0"}}/>
            <PBtn v="danger" onClick={delDay}>🗑 Delete This Day</PBtn>
          </>) : (<>
            <div style={{textAlign:"center",padding:"8px 0 16px"}}>
              <div style={{fontSize:32,marginBottom:8}}>🗑</div>
              <div style={{fontSize:15,fontWeight:700,color:C.deep,marginBottom:6}}>Delete {fmtDate(menuDay)}?</div>
              <div style={{fontSize:13,color:C.lt,marginBottom:20}}>This will permanently remove all entries for this day.</div>
              <PBtn v="danger" onClick={_doDelDay}>Yes, delete it</PBtn>
              <PBtn v="ghost" onClick={()=>setConfirmDeleteDay(false)} style={{marginTop:8}}>Cancel</PBtn>
            </div>
          </>)}
        </Sheet>
      )}
      {modal==="paste"&&(
        <Sheet onClose={()=>{setModal(null);_setParsedEntries(null);setPasteText("");}} title="📋 Paste Day Notes">
          {!parsedEntries ? (
            <>
              <div style={{fontSize:15,color:C.mid,marginBottom:4,lineHeight:1.6}}>
                Paste your notes in any format — the app will read them and sort them into the right categories.
              </div>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,marginBottom:12,padding:"10px",background:"var(--bg-solid)",borderRadius:10,lineHeight:1.8}}>
                e.g. "Woke up 7am · Feed 8am 180ml · Nap 10:15-11:30 · Feed 1pm 150ml · Asleep 7pm · Wake1 10:30pm 60ml"
              </div>
              <textarea
                value={pasteText}
                onChange={e=>setPasteText(e.target.value)}
                placeholder={"Paste your notes here...\n\nWoke up 9am\nFeed 9am 210ml\nNap 11:15-12:35\nFeed 1pm 150ml\nNap 2:25-2:50\nAsleep 7pm\nWake1 8:30pm 70ml"}
                style={{width:"100%",minHeight:180,padding:"12px",borderRadius:14,border:`1.5px solid ${C.blush}`,background:"var(--bg-solid)",fontSize:15,fontFamily:_fI,outline:_oN,resize:"vertical",lineHeight:1.7,boxSizing:_bBB,marginBottom:8}}
              />
              {parseError&&<div style={{fontSize:14,color:C.ter,background:"var(--card-bg-alt)",borderRadius:10,padding:"8px 12px",marginBottom:10}}>{parseError}</div>}
              <PBtn onClick={runParse}>Parse Notes →</PBtn>
            </>
          ) : (
            <>
              {parsedEntries.yearWarning&&parsedEntries.yearWarning.type==="future"&&(
                <div style={{fontSize:14,color:"#c04040",background:"var(--card-bg-alt)",borderRadius:10,padding:"10px 12px",marginBottom:12,border:"1px solid var(--card-border)"}}>
                  ⚠️ Future year ({parsedEntries.yearWarning.parsed}) detected — automatically changed to {parsedEntries.yearWarning.corrected}.
                </div>
              )}
              {parsedEntries.yearWarning&&parsedEntries.yearWarning.type==="past"&&(
                <div style={{fontSize:14,color:C.mid,background:"var(--card-bg-alt)",borderRadius:10,padding:"10px 12px",marginBottom:12,border:"1px solid var(--card-border)"}}>
                  <div style={{fontWeight:700,marginBottom:6,color:"var(--gold)"}}>⚠️ Year {parsedEntries.yearWarning.parsed} detected — did you mean {parsedEntries.yearWarning.corrected}?</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>{
                      // Use ref to get fresh state — avoids stale closure saving wrong year
                      const fresh = parsedEntriesRef.current;
                      if(fresh) _setParsedEntries({...fresh, yearWarning:null});
                    }} style={{flex:1,padding:"8px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:13,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
                      Use {parsedEntries.yearWarning.corrected}
                    </button>
                    <button onClick={()=>{
                      // Use ref to get fresh state — avoids stale closure
                      const fresh = parsedEntriesRef.current;
                      if(fresh && fresh.yearWarning) {
                        const revertedDate = fresh.detectedDate
                          ? fresh.detectedDate.replace(fresh.yearWarning.corrected, String(fresh.yearWarning.parsed))
                          : fresh.detectedDate;
                        _setParsedEntries({...fresh, detectedDate: revertedDate, yearWarning:null});
                      }
                    }} style={{flex:1,padding:"8px",borderRadius:99,border:`1px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.mid,fontSize:13,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                      Keep {parsedEntries.yearWarning.parsed}
                    </button>
                  </div>
                </div>
              )}
              {parsedEntries.detectedDate&&!parsedEntries.yearWarning&&(
                <div style={{fontSize:14,fontFamily:_fM,color:C.mint,background:"var(--card-bg)",borderRadius:10,padding:"7px 12px",marginBottom:12}}>
                  📅 Detected date: <strong>{fmtLong(parsedEntries.detectedDate)}</strong> — entries will be added to this day
                </div>
              )}
              {parsedEntries.detectedDate&&parsedEntries.yearWarning&&(
                <div style={{fontSize:14,fontFamily:_fM,color:C.lt,background:"var(--bg-solid)",borderRadius:10,padding:"7px 12px",marginBottom:12}}>
                  📅 Detected date: <strong>{fmtLong(parsedEntries.detectedDate)}</strong>
                </div>
              )}
              {!parsedEntries.detectedDate&&(
                <div style={{fontSize:14,fontFamily:_fM,color:selDay?C.mint:C.gold,background:selDay?"#f0faf6":"#fffbf0",borderRadius:10,padding:"7px 12px",marginBottom:12}}>
                  📅 {selDay ? <>Adding to open tab: <strong>{fmtLong(selDay)}</strong></> : <>No date found — entries will be added to <strong>{fmtLong(todayStr())}</strong></>}
                </div>
              )}
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:8}}>
                Found {parsedEntries.entries.length} entr{parsedEntries.entries.length===1?"y":"ies"}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,maxHeight:280,overflowY:"auto"}}>
                {parsedEntries.entries.map((e,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 11px",borderRadius:12,background:"var(--bg-solid)",border:`1px solid ${C.blush}`,borderLeft:`3px solid ${e.type==="feed"?C.ter:e.type==="nap"?C.mint:e.type==="sleep"?C.sky:C.gold}`}}>
                    <span style={{fontSize:16}}>{ICONS[e.type]}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:500}}>{NAMES[e.type]}{e.night?" (night)":""}</div>
                      <div style={{fontSize:15,fontFamily:_fM,color:C.lt}}>
                        {e.type==="nap"?`${fmt12(e.start)} – ${fmt12(e.end)} (${hm(minDiff(e.start,e.end))})`:`${fmt12(e.time)}${e.amount?` · ${fmtVol(e.amount,FU)}`:""}`}
                        {e.note?` · ${e.note}`:""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {parsedEntries.warnings.length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:15,fontFamily:_fM,color:C.gold,marginBottom:5}}>⚠️ Couldn't parse {parsedEntries.warnings.length} line{parsedEntries.warnings.length>1?"s":""}:</div>
                  {parsedEntries.warnings.map((w,i)=>(
                    <div key={i} style={{fontSize:15,color:C.mid,fontFamily:_fM,padding:"4px 8px",background:"var(--card-bg-alt)",borderRadius:8,marginBottom:3}}>{w}</div>
                  ))}
                </div>
              )}
              <PBtn onClick={confirmPaste}>✓ Add {parsedEntries.entries.length} {parsedEntries.entries.length===1?"Entry":"Entries"}</PBtn>
              <button onClick={()=>_setParsedEntries(null)} style={{width:"100%",marginTop:8,padding:"10px",borderRadius:12,border:`1px solid ${C.blush}`,background:_bN,color:C.mid,fontSize:15,cursor:_cP,fontFamily:_fI}}>← Edit notes</button>
            </>
          )}
        </Sheet>
      )}
      {modal==="report"&&(()=>{
        const es=days[selDay]||[];
        const dEs=es.filter(e=>!e.night).sort((a,b)=>timeVal(a)-timeVal(b));
        const nEs=es.filter(e=>e.night).sort((a,b)=>timeVal(a)-timeVal(b));
        const wakeEv=dEs.find(e=>e.type==="wake");
        const sleepEv=dEs.find(e=>e.type==="sleep");
        const dayFeeds=dEs.filter(e=>e.type==="feed");
        const dayNaps=dEs.filter(e=>e.type==="nap");
        const totalFeedMl=es.filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0);
        const nightFeedMl=nEs.filter(e=>e.type==="feed").reduce((s,f)=>s+(f.amount||0),0);
        const totalNapM=dayNaps.reduce((s,n)=>s+minDiff(n.start,n.end),0);
        const nightPoints=[];
        if(sleepEv) nightPoints.push({label:"Bedtime",time:sleepEv.time});
        nEs.forEach((e,i)=>nightPoints.push({label:`Wake ${i+1}`,time:e.time,feed:e.amount||0}));
        const stretches=[];
        for(let i=0;i<nightPoints.length-1;i++){
          const from=nightPoints[i];const to=nightPoints[i+1];
          let mins=minDiff(from.time,to.time);
          if(mins<=0) mins+=1440;
          stretches.push({from:from.label,to:to.label,mins,toTime:to.time,feed:to.feed});
        }
        function copyReport(){
          const ln=[`📋 ${fmtLong(selDay)} — ${babyName||"Baby"}'s Day Report`,``];
          ln.push(`☀️ Wake up: ${wakeEv?fmt12(wakeEv.time):"—"}`);
          ln.push(`🌙 Bedtime: ${sleepEv?fmt12(sleepEv.time):"—"}`);
          ln.push(``);
          ln.push(`🍼 Total feed: ${totalFeedMl}ml`);
          ln.push(`   Daytime: ${totalFeedMl-nightFeedMl}ml over ${dayFeeds.length} feed${dayFeeds.length!==1?"s":""}`);
          if(nEs.length) ln.push(`   Night: ${nightFeedMl}ml over ${nEs.filter(e=>e.type==="feed").length} feed${nEs.filter(e=>e.type==="feed").length!==1?"s":""}`);
          ln.push(``);
          ln.push(`😴 Naps: ${dayNaps.length} nap${dayNaps.length!==1?"s":""} (${hm(totalNapM)} total)`);
          ln.push(``);
          ln.push(`🌟 Night: ${nEs.length} wake${nEs.length!==1?"s":""}`);
          if(stretches.length){
            ln.push(`   Stretches between wakes:`);
            stretches.forEach(s=>ln.push(`   ${s.from} → ${s.to} (${fmt12(s.toTime)}): ${hm(s.mins)}${s.feed?` · ${s.feed}ml`:""}`));
          }
          navigator.clipboard.writeText(ln.join("\n")).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
        }
        return(
          <Sheet onClose={()=>setModal(null)} title="">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#c9705a,#7a5c52)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📊</div>
              <div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:18}}>Day Report</div>
                <div style={{fontSize:15,fontFamily:_fM,color:C.lt}}>{fmtLong(selDay)}</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
                <div style={{fontSize:14,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:4}}>Wake Up</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.gold}}>{wakeEv?fmt12(wakeEv.time):"—"}</div>
              </div>
              <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
                <div style={{fontSize:14,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:4}}>Bedtime</div>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:C.sky}}>{sleepEv?fmt12(sleepEv.time):"—"}</div>
              </div>
            </div>
            <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderLeft:`3px solid ${C.ter}`,borderRadius:14,padding:"12px",marginBottom:10}}>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:8}}>🍼 Feeding</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:15,color:C.deep}}>Total</span>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.ter}}>{mlToDisplay(totalFeedMl,FU)}<span style={{fontSize:14,color:C.lt,fontWeight:400}}>{volLabel(FU)}</span></span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:14,color:C.mid,borderTop:`1px solid ${C.blush}`,paddingTop:6}}>
                <span>Daytime · {dayFeeds.length} feeds</span>
                <span style={{fontFamily:_fM}}>{totalFeedMl-nightFeedMl}ml</span>
              </div>
              {nEs.length>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:14,color:C.mid,marginTop:4}}>
                <span>Night · {nEs.filter(e=>e.type==="feed").length} feeds</span>
                <span style={{fontFamily:_fM}}>{nightFeedMl}ml</span>
              </div>}
            </div>
            <div style={{background:"var(--card-bg-alt)",border:`1px solid ${C.blush}`,borderLeft:`3px solid ${C.mint}`,borderRadius:14,padding:"12px",marginBottom:10}}>
              <div style={{fontSize:15,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:8}}>😴 Naps</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:15,color:C.deep}}>{dayNaps.length} nap{dayNaps.length!==1?"s":""}</span>
                <span style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.mint}}>{hm(totalNapM)}</span>
              </div>
              {dayNaps.map((n,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:15,color:C.lt,fontFamily:_fM,marginTop:4,borderTop:i===0?`1px solid ${C.blush}`:"none",paddingTop:i===0?6:0}}>
                  <span>{fmt12(n.start)} – {fmt12(n.end)}</span>
                  <span>{minDiff(n.start,n.end)}min</span>
                </div>
              ))}
            </div>
            <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:14,padding:"12px",marginBottom:10,border:"1px solid var(--card-border)",boxShadow:"var(--card-shadow)"}}>
              <div style={{fontSize:15,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:8}}>🌟 Night Wakes</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:stretches.length?10:0}}>
                <span style={{fontSize:15,color:"var(--text-mid)"}}>{nEs.length} wake{nEs.length!==1?"s":""}</span>
                {nightFeedMl>0&&<span style={{background:"var(--chip-bg)",color:C.gold,fontFamily:_fM,fontSize:14,padding:"2px 8px",borderRadius:99}}>{nightFeedMl}ml total</span>}
              </div>
              {stretches.length>0&&(
                <>
                  <div style={{fontSize:14,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Stretches between wakes</div>
                  {stretches.map((s,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:"var(--card-bg-solid)",borderRadius:10,border:"1px solid var(--card-border)",marginBottom:5}}>
                      <div>
                        <div style={{fontSize:14,color:"var(--text-mid)"}}>{s.from} → {s.to}</div>
                        <div style={{fontSize:14,fontFamily:_fM,color:"var(--text-lt)",marginTop:2}}>{fmt12(s.toTime)}{s.feed?` · ${s.feed}ml`:""}</div>
                      </div>
                      <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:s.mins>=180?"#6fa898":s.mins>=120?"#d4a855":"#c9705a",fontWeight:700}}>{hm(s.mins)}</span>
                    </div>
                  ))}
                </>
              )}
              {stretches.length===0&&nEs.length===0&&<div style={{fontSize:14,color:"var(--text-lt)",fontFamily:_fM,textAlign:"center",padding:"4px 0"}}>No night wakes logged</div>}
            </div>
            {/* ── Sleep & Feed Insights ── */}
            {(()=>{
              const t = analyseTrends();
              if(!t || !t.insights || !t.insights.length) return null;
              return (
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                    <span style={{fontSize:16}}>✨</span>
                    <div style={{fontSize:13,fontFamily:_fM,color:C.mid,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Sleep &amp; Feed Insights</div>
                    <div style={{fontSize:12,color:C.lt,fontFamily:_fM,marginLeft:"auto"}}>{t.days} days of data</div>
                  </div>
                  {t.insights.map((ins,i)=>(
                    <div key={i} style={{marginBottom:8,padding:"10px 12px",borderRadius:14,background:ins.type==="warn"?"#fff8f5":ins.type==="good"?"#f0faf6":"#f5f8ff",border:`1px solid ${ins.type==="warn"?C.rose:ins.type==="good"?"var(--card-border)":"var(--card-border)"}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <span style={{fontSize:14}}>{ins.icon}</span>
                        <span style={{fontWeight:700,fontSize:13,color:ins.type==="warn"?C.ter:ins.type==="good"?C.mint:C.sky}}>{ins.title}</span>
                      </div>
                      <div style={{fontSize:13,color:C.mid,lineHeight:1.55}}>{ins.body}</div>
                    </div>
                  ))}
                  <div style={{fontSize:11,color:C.lt,fontFamily:_fM,lineHeight:1.5,padding:"6px 4px"}}>⚠️ General observations from logged data — not medical advice. Consult your health visitor or GP with concerns.</div>
                </div>
              );
            })()}
            <div style={{display:"flex",gap:8}}>
              <button onClick={copyReport} style={{flex:1,padding:"11px",borderRadius:99,border:`1px dashed ${C.rose}`,background:_bN,color:C.ter,fontSize:15,cursor:_cP,fontFamily:_fI,fontWeight:500}}>{copied?"✓ Copied!":"📋 Copy Report"}</button>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:"11px",borderRadius:99,border:_bN,background:C.blush,color:C.mid,fontSize:15,cursor:_cP,fontFamily:_fI,fontWeight:600}}>Done</button>
            </div>
          </Sheet>
        );
      })()}
      {}
      {/* Personal/NHS toggle moved to Account → Sleep Recommendations */}


      {/* Wake Prompt — AM after bedtime: night wake or new day? */}
      {showWakePrompt&&(
        <div onClick={()=>setShowWakePrompt(false)} style={{position:"fixed",inset:0,background:"var(--sheet-overlay)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--picker-bg)",borderRadius:24,padding:"28px 24px",width:"100%",maxWidth:340,boxShadow:"0 12px 40px rgba(0,0,0,0.2)",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>☀️</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.deep,marginBottom:8}}>What kind of wake?</div>
            <div style={{fontSize:14,color:C.mid,marginBottom:20,lineHeight:1.5}}>Bedtime has been logged. Is this a night wake or the start of a new day?</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{
                setShowWakePrompt(false);
                setNwForm({time:nowTime(),ml:"",selfSettled:false,assisted:false,assistedType:"milk",assistedNote:"",assistedDuration:"",note:""});
                setShowNightWake(true);
              }} style={{width:"100%",padding:"14px",borderRadius:99,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.mid,fontSize:15,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                🌙 Night Wake
              </button>
              <button onClick={()=>{
                setShowWakePrompt(false);
                logMorningWakeNextDay();
              }} style={{width:"100%",padding:"14px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:15,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
                ☀️ Start of New Day
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wake Edit Prompt — when editing a wake entry after bedtime */}
      {showWakeEditPrompt&&wakeEditEntry&&(
        <div onClick={()=>{setShowWakeEditPrompt(false);setWakeEditEntry(null);}} style={{position:"fixed",inset:0,background:"var(--sheet-overlay)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--picker-bg)",borderRadius:24,padding:"28px 24px",width:"100%",maxWidth:340,boxShadow:"0 12px 40px rgba(0,0,0,0.2)",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>☀️</div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.deep,marginBottom:8}}>Edit as day or night wake?</div>
            <div style={{fontSize:14,color:C.mid,marginBottom:6,lineHeight:1.5}}>Logged at {fmt12(wakeEditEntry.time)}</div>
            <div style={{fontSize:13,color:C.lt,marginBottom:20,lineHeight:1.5}}>Bedtime has been logged. Would you like to edit this as a regular wake or convert it to a night wake?</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{
                setShowWakeEditPrompt(false);
                // Convert to night wake and open night wake panel
                const entry = wakeEditEntry;
                delEntry(entry.id);
                setNwForm({time:entry.time,ml:entry.amount||"",selfSettled:false,assisted:false,assistedType:"milk",assistedNote:"",assistedDuration:"",note:entry.note||""});
                setWakeEditEntry(null);
                setShowNightWake(true);
              }} style={{width:"100%",padding:"14px",borderRadius:99,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.mid,fontSize:15,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                🌙 Night Wake
              </button>
              <button onClick={()=>{
                // Move to next day as morning wake
                setShowWakeEditPrompt(false);
                const entry = wakeEditEntry;
                delEntry(entry.id);
                const nextDay = (()=>{const d=new Date(selDay+"T12:00:00");d.setDate(d.getDate()+1);return d.toISOString().split("T")[0];})();
                const newEntry = {id:uid(),type:"wake",time:entry.time,night:false,note:entry.note||""};
                setDays(d=>({...d,[nextDay]:[...(d[nextDay]||[]),newEntry]}));
                setWakeEditEntry(null);
                setSelDay(nextDay);
                try{navigator.vibrate&&navigator.vibrate([35,25,35]);}catch{}
                setQuickFlash("☀️ Moved to "+fmtDate(nextDay));
                setTimeout(()=>setQuickFlash(null),1200);
              }} style={{width:"100%",padding:"14px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:15,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
                ☀️ Morning Wake (Next Day)
              </button>
              <button onClick={()=>{
                // Keep as-is, open normal edit
                setShowWakeEditPrompt(false);
                const entry = wakeEditEntry;
                setWakeEditEntry(null);
                setEditEntry(entry);
                setEType(entry.type);
                setFeedType(entry.feedType||"milk");
                setForm({amount:entry.amount?String(mlToDisplay(entry.amount,fluidUnit)):"",time:entry.time||nowTime(),start:entry.start||nowTime(),end:entry.end||nowTime(),note:entry.note||"",night:entry.night?"yes":"no",poopType:entry.poopType||"",breastL:entry.breastL||"",breastR:entry.breastR||"",pumpL:entry.pumpL?String(mlToDisplay(entry.pumpL,fluidUnit)):"",pumpR:entry.pumpR?String(mlToDisplay(entry.pumpR,fluidUnit)):""});
                setModal("entry");
              }} style={{width:"100%",padding:"10px",borderRadius:99,border:_bN,background:"transparent",color:C.lt,fontSize:13,cursor:_cP,fontFamily:_fI}}>
                Just edit time/note
              </button>
            </div>
          </div>
        </div>
      )}

      {showNightWake&&(
        <div style={{position:"fixed",inset:0,background:"rgba(44,31,26,0.55)",backdropFilter:"blur(4px)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowNightWake(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-solid)",borderRadius:"24px 24px 0 0",padding:"24px 20px 40px",width:"100%",boxSizing:_bBB}}>
            <div style={{width:36,height:4,background:C.blush,borderRadius:99,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.deep,marginBottom:20}}>🌟 Log Night Wake</div>

            <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Wake time</div>
            <TimeInput value={nwForm.time} onChange={t=>setNwForm(f=>({...f,time:t}))} style={{marginBottom:16}} inputStyle={{fontSize:18,padding:"12px 14px",borderRadius:14,color:C.deep,fontFamily:_fM,textAlign:"center"}}/>

            {/* Soothing options */}
            <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Soothing</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
              {/* Self settled */}
              <div onClick={()=>setNwForm(f=>({...f,selfSettled:!f.selfSettled,assisted:false}))}
                style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:14,border:`1.5px solid ${nwForm.selfSettled?"#50c878":C.blush}`,background:nwForm.selfSettled?"rgba(80,200,120,0.08)":C.warm,cursor:_cP,transition:"all 0.2s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${nwForm.selfSettled?"#50c878":C.blush}`,background:nwForm.selfSettled?"#50c878":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                  {nwForm.selfSettled&&<span style={{color:"white",fontSize:13,fontWeight:700}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:nwForm.selfSettled?"#50c878":C.mid}}>Self settled</div>
                  <div style={{fontSize:12,color:C.lt,marginTop:1}}>No help needed</div>
                </div>
              </div>
              {/* Assisted soothing */}
              <div onClick={()=>setNwForm(f=>({...f,assisted:!f.assisted,selfSettled:false,ml:""}))}
                style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:14,border:`1.5px solid ${nwForm.assisted?"#7b68ee":C.blush}`,background:nwForm.assisted?"rgba(123,104,238,0.08)":C.warm,cursor:_cP,transition:"all 0.2s"}}>
                <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${nwForm.assisted?"#7b68ee":C.blush}`,background:nwForm.assisted?"#7b68ee":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.2s"}}>
                  {nwForm.assisted&&<span style={{color:"white",fontSize:13,fontWeight:700}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:nwForm.assisted?"#7b68ee":C.mid}}>Assisted soothing</div>
                  <div style={{fontSize:12,color:C.lt,marginTop:1}}>Parent helped to resettle</div>
                </div>
              </div>
            </div>

            {/* Assisted soothing details */}
            {nwForm.assisted&&(
              <div style={{background:"var(--chip-bg)",borderRadius:14,padding:"14px",marginBottom:16,border:"1px solid var(--card-border)"}}>
                <div style={{fontSize:13,fontFamily:_fM,color:"#9080d8",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:8}}>Type</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[["milk","🍼 Milk"],["other","💬 Other"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setNwForm(f=>({...f,assistedType:v,ml:"",assistedNote:""}))}
                      style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${nwForm.assistedType===v?"#7b68ee":C.blush}`,background:nwForm.assistedType===v?"#f0eeff":C.warm,color:nwForm.assistedType===v?"#5040a0":C.mid,fontSize:13,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
                      {l}
                    </button>
                  ))}
                </div>
                {nwForm.assistedType==="milk"&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:5}}>Amount</div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <input type="number" inputMode="numeric" placeholder={volLabel(FU)} value={nwForm.ml}
                        onChange={e=>setNwForm(f=>({...f,ml:e.target.value}))}
                        style={{flex:1,fontSize:18,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",color:C.deep,outline:_oN,fontFamily:_fM,textAlign:"center",boxSizing:_bBB}}/>
                      <span style={{fontSize:15,color:C.lt,fontFamily:_fM}}>{volLabel(FU)}</span>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:7}}>
                      {(FU==="oz"?[2,3,4,5,6]:[60,90,120,150,180]).map(ml=>(
                        <button key={ml} onClick={()=>setNwForm(f=>({...f,ml:String(ml)}))}
                          style={{flex:1,padding:"6px 2px",borderRadius:9,border:`1px solid ${nwForm.ml===String(ml)?"#7b68ee":C.blush}`,background:nwForm.ml===String(ml)?"#f0eeff":C.warm,color:nwForm.ml===String(ml)?"#5040a0":C.lt,fontSize:11,fontFamily:_fM,cursor:_cP}}>
                          {ml}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {nwForm.assistedType==="other"&&(
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:5}}>Notes (e.g. rocked, dummy…)</div>
                    <input placeholder="How did you resettle?" value={nwForm.assistedNote}
                      onChange={e=>setNwForm(f=>({...f,assistedNote:e.target.value}))}
                      style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",color:C.deep,outline:_oN,fontFamily:_fI,boxSizing:_bBB}}/>
                  </div>
                )}
                <div>
                  <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:5}}>Duration soothed (optional)</div>
                  <input type="number" inputMode="numeric" placeholder="minutes" value={nwForm.assistedDuration}
                    onChange={e=>setNwForm(f=>({...f,assistedDuration:e.target.value}))}
                    style={{width:"100%",fontSize:14,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",color:C.deep,outline:_oN,fontFamily:_fM,boxSizing:_bBB}}/>
                </div>
              </div>
            )}

            {/* Feed amount for non-assisted, non-self-settled */}
            {!nwForm.selfSettled&&!nwForm.assisted&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Feed amount (if applicable)</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <input type="number" inputMode="numeric" placeholder={volLabel(FU)} value={nwForm.ml}
                    onChange={e=>setNwForm(f=>({...f,ml:e.target.value}))}
                    style={{flex:1,fontSize:20,padding:"12px 14px",borderRadius:14,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",color:C.deep,outline:_oN,fontFamily:_fM,textAlign:"center",boxSizing:_bBB}}/>
                  <span style={{fontSize:16,color:C.lt,fontFamily:_fM}}>{volLabel(FU)}</span>
                </div>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  {(FU==="oz"?[2,3,4,5,6]:[60,90,120,150,180]).map(ml=>(
                    <button key={ml} onClick={()=>setNwForm(f=>({...f,ml:String(ml)}))}
                      style={{flex:1,padding:"7px 2px",borderRadius:10,border:`1px solid ${nwForm.ml===String(ml)?"#7b68ee":C.blush}`,background:nwForm.ml===String(ml)?"#f0eeff":C.warm,color:nwForm.ml===String(ml)?"#5040a0":C.lt,fontSize:12,fontFamily:_fM,cursor:_cP}}>
                      {ml}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{fontSize:13,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Notes</div>
            <input placeholder="e.g. fussed, resettled easily…" value={nwForm.note}
              onChange={e=>setNwForm(f=>({...f,note:e.target.value}))}
              style={{width:"100%",fontSize:15,padding:"12px 14px",borderRadius:14,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-alt)",color:C.deep,outline:_oN,fontFamily:_fI,marginBottom:20,boxSizing:_bBB}}/>

            <button onClick={()=>{
              if(!nwForm.time) return;
              const isMilkAssisted = nwForm.assisted && nwForm.assistedType==="milk";
              const ml = nwForm.selfSettled ? 0 : isMilkAssisted ? displayToMl(nwForm.ml,FU) : displayToMl(nwForm.ml,FU);
              const noteStr = nwForm.selfSettled
                ? (nwForm.note||"Self settled")
                : nwForm.assisted
                  ? [nwForm.assistedType==="milk"?"Assisted – milk":("Assisted – "+(nwForm.assistedNote||"assisted")), nwForm.assistedDuration?`Duration: ${nwForm.assistedDuration}m`:"", nwForm.note].filter(Boolean).join(" · ")
                  : (nwForm.note||"");
              const entry = {
                id: uid(),
                type: (nwForm.selfSettled||nwForm.assisted) ? "wake" : "feed",
                time: nwForm.time,
                amount: ml,
                feedType: "milk",
                night: true,
                nightLocked: true,
                selfSettled: nwForm.selfSettled,
                assisted: nwForm.assisted,
                assistedType: nwForm.assisted ? nwForm.assistedType : undefined,
                assistedNote: nwForm.assisted ? nwForm.assistedNote : undefined,
                assistedDuration: nwForm.assisted && nwForm.assistedDuration ? parseInt(nwForm.assistedDuration) : undefined,
                note: noteStr,
              };
              setDays(d=>{
                const existing = d[selDay]||[];
                const updated = autoClassifyNight([...existing, entry]);
                const relocked = updated.map(e => e.nightLocked ? {...e, night: true} : e);
                return{...d,[selDay]:relocked};
              });
              setShowNightWake(false);
            }} style={{width:"100%",padding:"15px",borderRadius:99,border:_bN,background:`linear-gradient(135deg,#7b68ee,#5040a0)`,color:"white",fontSize:16,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
              Save Wake ✦
            </button>
          </div>
        </div>
      )}

      {showAddChild && (
        <div style={{position:"fixed",inset:0,background:"rgba(44,31,26,0.5)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowAddChild(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-solid)",borderRadius:"24px 24px 0 0",padding:"28px 24px 40px",width:"100%"}}>
            <div style={{width:40,height:4,background:"var(--blush)",borderRadius:99,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:"var(--text-deep)",marginBottom:20}}>Add a child</div>

            <div style={{fontSize:14,color:"var(--text-lt)",marginBottom:6,fontWeight:600}}>Name</div>
            <input value={newChildName} onChange={e=>setNewChildName(e.target.value)}
              placeholder="Baby's name" autoFocus
              style={{width:"100%",fontSize:18,padding:"12px 14px",borderRadius:12,border:"1.5px solid var(--card-border)",background:"var(--card-bg-solid)",color:"var(--text-deep)",outline:_oN,fontFamily:_fI,marginBottom:14}}/>

            <div style={{fontSize:14,color:"var(--text-lt)",marginBottom:6,fontWeight:600}}>
              {newChildUnborn ? "Due date" : "Date of birth"}
            </div>
            <input type="date" value={newChildDob} onChange={e=>setNewChildDob(e.target.value)}
              style={{width:"100%",fontSize:16,padding:"12px 14px",borderRadius:12,border:"1.5px solid var(--card-border)",background:"var(--card-bg-solid)",color:"var(--text-deep)",outline:_oN,fontFamily:_fI,marginBottom:14}}/>

            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {["","girl","boy"].map(s=>(
                <button key={s} onClick={()=>setNewChildSex(s)} style={{
                  flex:1,padding:"10px",borderRadius:12,border:_bN,cursor:_cP,fontSize:14,fontWeight:600,
                  background: newChildSex===s ? "#c9705a" : "#f2d9cc",
                  color: newChildSex===s ? "white" : "#7a5c52"
                }}>{s===""?"Any":s==="girl"?"👧 Girl":"👦 Boy"}</button>
              ))}
            </div>

            <button onClick={()=>setNewChildUnborn(v=>!v)} style={{
              width:"100%",padding:"11px",borderRadius:99,border:"1.5px solid var(--card-border)",
              background: newChildUnborn?"#fff3f0":"white",color:"var(--text-mid)",fontSize:14,
              cursor:_cP,fontFamily:_fI,fontWeight:600,marginBottom:16
            }}>{newChildUnborn ? "🤰 Not born yet" : "🎂 Already born"}</button>

            <button onClick={()=>{
              if(!newChildName.trim()) return;
              addChild(newChildName.trim(), newChildDob, newChildSex, newChildUnborn);
              setNewChildName(""); setNewChildDob(""); setNewChildSex(""); setNewChildUnborn(false);
              setShowAddChild(false);
              setTab("day"); setSelDay(todayStr());
            }} style={{
              width:"100%",padding:"15px",borderRadius:99,border:_bN,
              background: newChildName.trim() ? "#c9705a" : "#f2d9cc",
              color: newChildName.trim() ? "white" : "#b89890",
              fontSize:16,fontWeight:700,cursor:_cP,fontFamily:_fI
            }}>Add {newChildName||"child"} ✦</button>
          </div>
        </div>
      )}
      {showChildSettings&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowChildSettings(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--card-bg-solid)",borderRadius:"24px 24px 0 0",padding:"28px 24px 40px",width:"100%",maxWidth:480,boxShadow:"0 -8px 40px rgba(0,0,0,0.15)"}}>
            <div style={{width:36,height:4,background:C.blush,borderRadius:99,margin:"0 auto 24px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,color:C.deep,marginBottom:24}}>Child Settings</div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,display:"block",marginBottom:6}}>Name</label>
              <input value={csName} onChange={e=>setCsName(e.target.value)} placeholder="Baby's name"
                style={{width:"100%",fontSize:17,padding:"12px 14px",borderRadius:12,border:`2px solid ${C.blush}`,outline:_oN,fontFamily:_fI,boxSizing:_bBB}}/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,display:"block",marginBottom:6}}>Date of Birth</label>
              <input type="date" value={csDob} onChange={e=>setCsDob(e.target.value)}
                style={{width:"100%",fontSize:17,padding:"12px 14px",borderRadius:12,border:`2px solid ${C.blush}`,outline:_oN,fontFamily:_fI,boxSizing:_bBB}}/>
            </div>
            <div style={{marginBottom:24}}>
              <label style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,display:"block",marginBottom:8}}>Sex</label>
              <div style={{display:"flex",gap:8}}>
                {[["boy","👦 Boy","#eaf3fb","#3d6a8a"],["girl","👧 Girl","#fde7e4","#a85070"],["","⬜ Not set","#f0e8e0","#7a5c52"]].map(([v,l,accent,col])=>(
                  <button key={v} onClick={()=>setCsSex(v)}
                    style={{flex:1,padding:"10px 6px",borderRadius:12,border:`2px solid ${csSex===v?col:C.blush}`,background:csSex===v?accent:"white",cursor:_cP,fontSize:13,fontWeight:700,color:csSex===v?col:C.mid,fontFamily:_fI,transition:"all 0.15s"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={()=>{
              updateChild({name:csName.trim(),dob:csDob,sex:csSex});
              setShowChildSettings(false);
            }} style={{width:"100%",background:`linear-gradient(135deg,#c9705a,#a85a44)`,border:_bN,borderRadius:99,padding:"14px",color:"white",fontSize:16,fontWeight:700,cursor:_cP,marginBottom:10,fontFamily:_fI,boxShadow:"0 4px 16px rgba(201,112,90,0.35)"}}>
              Save Changes
            </button>
            {Object.keys(children).length > 1 && !csConfirmDelete && (
              <button onClick={()=>setCsConfirmDelete(true)}
                style={{width:"100%",background:_bN,border:`2px solid ${C.blush}`,borderRadius:99,padding:"12px",color:C.ter,fontSize:15,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                🗑 Delete this child
              </button>
            )}
            {csConfirmDelete && (
              <div style={{background:"var(--card-bg-alt)",border:`2px solid ${C.ter}`,borderRadius:16,padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:600,color:C.deep,marginBottom:12}}>Delete {csName||"this child"}? This cannot be undone.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setCsConfirmDelete(false)} style={{flex:1,padding:"11px",borderRadius:99,border:`2px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.mid,fontSize:14,fontWeight:600,cursor:_cP,fontFamily:_fI}}>Cancel</button>
                  <button onClick={()=>{deleteChild(resolvedActiveId);setShowChildSettings(false);setCsConfirmDelete(false);}}
                    style={{flex:1,padding:"11px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:14,fontWeight:700,cursor:_cP,fontFamily:_fI}}>
                    Yes, delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showFamilyModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(44,31,26,0.5)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowFamilyModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-solid)",borderRadius:"24px 24px 0 0",padding:"28px 24px 40px",width:"100%",maxHeight:"85vh",overflowY:"auto"}}>

            <div style={{width:40,height:4,background:C.blush,borderRadius:99,margin:"0 auto 20px"}}/>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:C.deep,marginBottom:6}}>Data & Sync</div>
            <div style={{background: backupCode?"#e8f7f0":"#fff8e8",borderRadius:12,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,border:`1px solid ${backupCode?"#b0e8cc":"#f0d890"}`}}>
              <span style={{fontSize:20}}>{backupCode?"🛡️":"⏳"}</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:backupCode?"#2a7a50":"#8a6a10"}}>{backupCode?"Auto-backup active":"Setting up backup…"}</div>
                <div style={{fontSize:12,color:backupCode?"#4a9a70":"#9a7a20",marginTop:1}}>{backupCode?"Your data saves to the cloud automatically":"Firebase is connecting, backup will begin shortly"}</div>
              </div>
            </div>
            {backupCode && (
              <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:12,padding:"10px 14px",marginBottom:8,border:"1px solid var(--card-border)",boxShadow:"var(--card-shadow)",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>☁️</span>
                <div style={{fontSize:13,color:"var(--mint)",lineHeight:1.4}}>Auto-backup active — your data saves to the cloud and restores when you sign in on any device.</div>
              </div>
            )}
            {familyUsername && (
              <div style={{background:"var(--card-bg-solid)",borderRadius:12,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.blush}`}}>
                <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:6}}>Recovery word</div>
                <div style={{fontSize:13,color:C.mid,marginBottom:10,lineHeight:1.5}}>A secret word you choose — used to reset your PIN if you ever forget it. No email or phone number required.</div>
                <div style={{display:"flex",gap:8}}>
                  <input
                    type="text"
                    value={recoveryWordInput}
                    onChange={e=>{ setRecoveryWordInput(e.target.value); setRecoveryWordStatus(null); }}
                    placeholder="e.g. sunshine, mango…"
                    autoCapitalize="none" autoCorrect="off" spellCheck="false"
                    style={{flex:1,fontSize:15,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${C.blush}`,background:"var(--bg-solid)",outline:"none",fontFamily:_fI,color:C.deep,boxSizing:"border-box"}}
                  />
                  <button
                    onClick={async()=>{
                      if(recoveryWordInput.trim().length < 3){ setRecoveryWordStatus("short"); return; }
                      setRecoveryWordSaving(true); setRecoveryWordStatus(null);
                      const ok = await saveRecoveryWord(recoveryWordInput);
                      setRecoveryWordSaving(false);
                      setRecoveryWordStatus(ok?"saved":"error");
                      if(ok) setRecoveryWordInput("");
                    }}
                    disabled={recoveryWordSaving||recoveryWordInput.trim().length<3}
                    style={{padding:"9px 14px",borderRadius:10,border:"none",background:recoveryWordInput.trim().length>=3?`linear-gradient(135deg,#c9705a,#a85a44)`:"#f2d9cc",color:recoveryWordInput.trim().length>=3?"white":"#b89890",fontSize:13,fontWeight:700,cursor:recoveryWordInput.trim().length>=3?"pointer":"not-allowed",fontFamily:_fI,flexShrink:0,whiteSpace:"nowrap"}}>
                    {recoveryWordSaving?"⏳ Saving…":"Save word"}
                  </button>
                </div>
                {recoveryWordStatus==="saved"&&<div style={{fontSize:12,color:"var(--mint)",marginTop:6,fontWeight:600}}>✓ Recovery word saved — don't forget it!</div>}
                {recoveryWordStatus==="error"&&<div style={{fontSize:12,color:C.ter,marginTop:6}}>Something went wrong — try again</div>}
                {recoveryWordStatus==="short"&&<div style={{fontSize:12,color:C.ter,marginTop:6}}>Word must be at least 3 characters</div>}
              </div>
            )}
            {familyUsername ? (
              <div style={{background:"var(--card-bg-solid)",borderRadius:12,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.blush}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:12,fontFamily:_fM,color:C.lt,textTransform:"uppercase",letterSpacing:_ls08,marginBottom:3}}>Your username</div>
                  <div style={{fontSize:20,fontWeight:700,color:C.ter}}>{familyUsername}</div>
                </div>
                <span style={{fontSize:22}}>👨‍👩‍👧</span>
              </div>
            ) : (
              <div style={{background:"var(--card-bg-alt)",borderRadius:12,padding:"12px 14px",marginBottom:16,border:"1px solid var(--card-border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--gold)",marginBottom:4}}>No username set</div>
                <div style={{fontSize:13,color:"var(--gold)",marginBottom:8}}>Set a username so your partner can find and sync with you.</div>
                <UsernameSetForm normaliseUsername={normaliseUsername} reserveUsername={reserveUsername} C={C} />
              </div>
            )}

            <div style={{width:"100%",height:1,background:C.blush,marginBottom:16}}/>
            <div style={{fontFamily:_fM,fontSize:12,color:C.lt,textTransform:"uppercase",letterSpacing:_ls1,marginBottom:10}}>Share children individually</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
              {Object.values(children).map(child => {
                const cid = child.id;
                const code = childSyncCodes[cid];
                const isShared = !!code;
                return (
                  <div key={cid} style={{background:"var(--card-bg-solid)",borderRadius:14,padding:"12px 14px",border:`1px solid ${isShared?C.mint+"40":C.blush}`}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:isShared?8:0}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:15,color:C.deep}}>{child.name||"Unnamed child"}</div>
                        <div style={{fontSize:12,color:C.lt}}>{isShared?"Sharing enabled":"Not shared yet"}</div>
                      </div>
                      {!isShared ? (
                        <button onClick={async()=>{await createChildSyncCode(cid);}} style={{padding:"7px 14px",borderRadius:99,border:_bN,background:C.ter,color:"white",fontSize:13,fontWeight:700,cursor:_cP,fontFamily:_fI,flexShrink:0}}>
                          Get code
                        </button>
                      ) : (
                        <span style={{fontSize:18}}>🔗</span>
                      )}
                    </div>
                    {isShared && (
                      <>
                        <div style={{background:"var(--card-bg)",backdropFilter:"blur(var(--glass-blur))",WebkitBackdropFilter:"blur(var(--glass-blur))",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,border:"1px solid var(--card-border)",boxShadow:"var(--card-shadow)"}}>
                          <div>
                            <div style={{fontSize:11,fontFamily:_fM,color:"var(--mint)",textTransform:"uppercase",letterSpacing:_ls08,marginBottom:2}}>Sync code</div>
                            <div style={{fontFamily:_fM,fontSize:24,fontWeight:700,color:C.ter,letterSpacing:"0.18em"}}>{code}</div>
                          </div>
                          <button onClick={()=>{try{navigator.clipboard.writeText(code);}catch{}}} style={{padding:"6px 12px",borderRadius:99,border:`1px solid ${C.blush}`,background:"var(--card-bg-solid)",fontSize:12,fontWeight:600,color:C.mid,cursor:_cP,fontFamily:_fI}}>
                            Copy
                          </button>
                        </div>
                        <div style={{fontSize:12,color:C.lt,marginBottom:6}}>Share this code with the co-parent — they tap "Link a child" below and enter it.</div>
                        <button onClick={()=>unlinkChild(cid)} style={{fontSize:12,color:C.lt,background:_bN,border:_bN,cursor:_cP,padding:0,fontFamily:_fI,textDecoration:"underline"}}>
                          Remove from my app
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <LinkChildForm joinChildByCode={joinChildByCode} C={C} />
            <RestoreDataForm restoreFromBackup={restoreFromBackup} setShowFamilyModal={setShowFamilyModal} familyUsername={familyUsername} backupCode={backupCode} C={C} />
            {familyUsername && (
              <div style={{borderTop:`1px solid ${C.blush}`,marginTop:16,paddingTop:16}}>
                <button onClick={()=>{setShowFamilyModal(false);logout();}}
                  style={{width:"100%",padding:"12px",borderRadius:99,border:`1.5px solid ${C.blush}`,background:"var(--card-bg-solid)",color:C.lt,fontSize:14,fontWeight:600,cursor:_cP,fontFamily:_fI}}>
                  Sign out of {familyUsername}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ═══ Photo Viewer Overlay ═══ */}
      {viewPhoto && (
        <div onClick={()=>setViewPhoto(null)} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.85)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={ev=>ev.stopPropagation()} style={{maxWidth:"100%",maxHeight:"80vh",position:"relative"}}>
            <img src={viewPhoto.dataUrl} alt="" style={{maxWidth:"100%",maxHeight:"75vh",borderRadius:16,objectFit:"contain",boxShadow:"0 0 40px rgba(0,0,0,0.5)"}}/>
          </div>
          <div style={{marginTop:16,display:"flex",alignItems:"center",gap:10}}>
            <div style={{color:"white",fontSize:13,fontFamily:_fM,opacity:0.7}}>
              {viewPhoto.date&&fmtDate(viewPhoto.date)}{viewPhoto.time&&` · ${fmt12(viewPhoto.time)}`}
            </div>
          </div>
          <div onClick={ev=>ev.stopPropagation()} style={{marginTop:16,display:"flex",gap:12}}>
            <button onClick={()=>setViewPhoto(null)} style={{padding:"10px 28px",borderRadius:99,background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.25)",color:"white",fontSize:14,fontWeight:700,cursor:_cP,fontFamily:"inherit"}}>Close</button>
            <button onClick={()=>{setPhotos(prev=>prev.filter(x=>x.id!==viewPhoto.id));setViewPhoto(null);try{navigator.vibrate&&navigator.vibrate(30);}catch{}}} style={{padding:"10px 28px",borderRadius:99,background:"rgba(224,96,112,0.25)",border:"1.5px solid rgba(224,96,112,0.45)",color:"#ff8a95",fontSize:14,fontWeight:700,cursor:_cP,fontFamily:"inherit"}}>Delete Photo</button>
          </div>
        </div>
      )}

      {/* ═══ Mascot Popup Overlay ═══ */}
      {mascotPopup && (
        <div style={{position:"fixed",inset:0,zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{pointerEvents:"auto",textAlign:"center",animation:"mascotPop 0.5s cubic-bezier(0.22,1.2,0.36,1) both"}}>
            <style>{`
              @keyframes mascotPop{from{opacity:0;transform:scale(0.3) translateY(30px)}60%{opacity:1;transform:scale(1.05) translateY(-4px)}to{opacity:1;transform:scale(1) translateY(0)}}
              @keyframes mascotFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
              @keyframes mascotTextIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
            `}</style>
            <img
              src={mascotPopup.type==="celebration"?"obubba-celebration.png":mascotPopup.type==="loading"?"obubba-loading.png":"obubba-thinking.png"}
              alt=""
              style={{width:220,height:220,objectFit:"contain",animation:"mascotFloat 2s ease-in-out 0.5s infinite",filter:"drop-shadow(0 16px 36px rgba(217,207,243,0.45))"}}
            />
            <div className="mascot-pill" style={{marginTop:14,background:document.body.classList.contains("dark-mode")?"rgba(30,40,60,0.92)":"rgba(255,255,255,0.95)",borderRadius:99,padding:"12px 28px",boxShadow:"0 0 28px rgba(246,221,227,0.50), 0 4px 20px rgba(217,207,243,0.30), inset 0 1px 0 rgba(255,255,255,0.25)",display:"inline-block",border:"1.5px solid rgba(255,255,255,0.18)",animation:"mascotTextIn 0.4s ease 0.3s both"}}>
              <div style={{fontSize:16,fontWeight:700,color:document.body.classList.contains("dark-mode")?"#F0F2F5":"#5B4F5F",fontFamily:"'DM Sans',sans-serif",letterSpacing:"0.01em"}}>{mascotPopup.message}</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={hasError:false,error:null};}
  static getDerivedStateFromError(error){return{hasError:true,error};}
  componentDidCatch(error,info){console.error("OBubba error boundary:",error,info);}
  render(){
    if(this.state.hasError){
      return React.createElement("div",{style:{minHeight:"100vh",background:"linear-gradient(135deg,#FFF8F2 0%,#F5E1D8 40%,#F0DDD6 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:"'DM Sans',sans-serif",textAlign:"center",position:"relative",overflow:"hidden"}},
        // Soft background orbs
        React.createElement("div",{style:{position:"absolute",top:"-10%",left:"10%",width:300,height:300,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(246,221,227,0.40),transparent 70%)",pointerEvents:"none"}}),
        React.createElement("div",{style:{position:"absolute",bottom:"5%",right:"5%",width:250,height:250,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(217,207,243,0.35),transparent 70%)",pointerEvents:"none"}}),
        // Animated CSS
        React.createElement("style",null,`
          @keyframes babyBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.008)}}
          @keyframes zzz1{0%{opacity:0;transform:translate(0,0) scale(0.6)}30%{opacity:1}100%{opacity:0;transform:translate(15px,-60px) scale(1.2)}}
          @keyframes zzz2{0%{opacity:0;transform:translate(0,0) scale(0.5)}35%{opacity:1}100%{opacity:0;transform:translate(25px,-75px) scale(1.1)}}
          @keyframes zzz3{0%{opacity:0;transform:translate(0,0) scale(0.4)}40%{opacity:1}100%{opacity:0;transform:translate(10px,-90px) scale(1)}}
          @keyframes floatUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
          .zzz{position:absolute;font-weight:700;color:#D9CFF3;font-family:'Playfair Display',serif;font-style:italic}
        `),
        // Baby image with breathing
        React.createElement("div",{style:{position:"relative",marginBottom:28}},
          React.createElement("img",{src:"sleep-baby.png",alt:"Sleeping baby",style:{width:200,height:200,objectFit:"contain",animation:"babyBreathe 3.5s ease-in-out infinite",filter:"drop-shadow(0 16px 32px rgba(217,207,243,0.35))"}}),
          // Floating Zzz's
          React.createElement("span",{className:"zzz",style:{top:8,right:-5,fontSize:18,animation:"zzz1 2.8s ease-in-out infinite"}},"z"),
          React.createElement("span",{className:"zzz",style:{top:-8,right:12,fontSize:24,animation:"zzz2 2.8s ease-in-out 0.5s infinite"}},"z"),
          React.createElement("span",{className:"zzz",style:{top:-28,right:28,fontSize:16,animation:"zzz3 2.8s ease-in-out 1s infinite"}},"z")
        ),
        // Text
        React.createElement("div",{style:{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:700,color:"#5B4F5F",lineHeight:1.25,marginBottom:10}},"Uh oh!"),
        React.createElement("div",{style:{fontSize:15,color:"#7A6B7E",lineHeight:1.65,maxWidth:300,marginBottom:6}},"Looks like OBubba fell asleep..."),
        React.createElement("div",{style:{fontSize:14,color:"#A898AC",lineHeight:1.5,maxWidth:280,marginBottom:28}},"Hold tight — we'll be back from our nap ASAP. Your data is safe."),
        // Refresh button
        React.createElement("button",{onClick:()=>window.location.reload(),style:{padding:"14px 36px",borderRadius:99,border:"none",background:"rgba(192,112,136,0.55)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",color:"white",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 0 24px rgba(246,221,227,0.40), 0 0 48px rgba(217,207,243,0.25), 0 4px 16px rgba(192,112,136,0.20)",animation:"floatUp 3s ease-in-out infinite",letterSpacing:"0.01em"}},"Wake Up & Refresh"),
        // Tiny error detail
        React.createElement("div",{style:{fontSize:10,color:"#C8B8C0",marginTop:24,fontFamily:"monospace",maxWidth:300,wordBreak:"break-all"}},String(this.state.error))
      );
    }
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ErrorBoundary,null,React.createElement(App)));
