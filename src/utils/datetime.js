// ── Date & Time Utilities ──

export const fmt12 = t => { if(!t)return""; const[h,m]=t.split(":").map(Number); return`${h%12||12}:${String(m).padStart(2,"0")}${h>=12?"pm":"am"}`; };
export const minDiff = (s,e) => { if(!s||!e)return 0; const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number); let d=eh*60+em-sh*60-sm; if(d<0)d+=1440; return d; };
export const timeVal = e => { const t=e.time||e.start||"00:00"; const[h,m]=t.split(":").map(Number); return h*60+m; };
export const fmtDate = d => { if(!d)return""; const[y,mo,day]=d.split("-"); return`${day}/${mo}/${y.slice(2)}`; };
export const fmtLong = d => new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
export const nowTime = () => { const n=new Date(); return`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`; };
export const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const localDateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
export const prevDay = (dateStr) => { const d=new Date(dateStr+"T12:00:00"); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };
export const nextDay = (dateStr) => { const d=new Date(dateStr+"T12:00:00"); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); };
export const hm = m => { if(!m||m<=0)return"—"; return m>=60?`${Math.floor(m/60)}h ${m%60}m`:`${m}m`; };
export const fmtSec = s => s>=3600 ? `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}` : `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
export const fmtCountdown = s => {
  if(s <= 0) return "Now!";
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  if(h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  return `${m}m`;
};
export const avgArr = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;

export function parseTimeFree(str, previousMinutes=null) {
  if (!str) return null;
  str = str.trim().toLowerCase();
  str = str.replace(/(\d+)(st|nd|rd|th)/g,"$1");
  let m = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const suffix = m[3];
    if (suffix==="pm" && h<12) h+=12;
    if (suffix==="am" && h===12) h=0;
    if (!suffix && previousMinutes!==null && h*60+min <= previousMinutes) {
      const total0 = h*60+min;
      const crossedMidnight = previousMinutes >= 1080 && total0 < 720;
      let total = total0;
      if (!crossedMidnight) { while(total <= previousMinutes && total < 24*60) total+=12*60; }
      total = total % (24*60);
      return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
    }
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
  m = str.match(/^(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2,"0")}:00`;
  }
  return null;
}

export function getAwakeWindows(entries) {
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

export function getNightWindows(thisDayEntries, nextDayEntries) {
  const next = nextDayEntries || [];
  const bedEntry = [...thisDayEntries]
    .filter(e => e.type==="sleep" && !e.night)
    .sort((a,b) => timeVal(a)-timeVal(b))
    .pop();
  const morningWake = [...next]
    .filter(e => e.type==="wake" && !e.night)
    .sort((a,b) => timeVal(a)-timeVal(b))[0];
  const morningMins = morningWake ? timeVal(morningWake) : 7*60;
  const bedMins = bedEntry ? timeVal(bedEntry) : 22*60;
  const nightWakesThisDay = [...thisDayEntries]
    .filter(e => e.night && (e.type==="wake" || e.type==="feed"))
    .filter(e => {
      const t = timeVal(e);
      return t >= bedMins || t < morningMins;
    });
  const nightWakesNextDay = [...next]
    .filter(e => e.night && timeVal(e) < morningMins);
  const sortKey = (e, isThisDay) => {
    const t = timeVal(e);
    if(isThisDay && t >= bedMins) return t;
    return t + 1440;
  };
  const taggedWakes = [
    ...nightWakesThisDay.map(e=>({...e, _sk: sortKey(e, true)})),
    ...nightWakesNextDay.map(e=>({...e, _sk: sortKey(e, false)}))
  ];
  const seenIds = new Set();
  const nightWakes = taggedWakes
    .filter(e => { if(seenIds.has(e.id)) return false; seenIds.add(e.id); return true; })
    .sort((a,b) => a._sk - b._sk);
  const wins=[];
  if(bedEntry && nightWakes.length>0){
    let mins = nightWakes[0]._sk - bedMins;
    if(mins<=0) mins+=1440;
    if(mins>0 && mins<840) wins.push({from:bedEntry.time, to:nightWakes[0].time, mins, night:true});
  }
  for(let i=1;i<nightWakes.length;i++){
    const prevWake = nightWakes[i-1];
    const dur = parseInt(prevWake.assistedDuration) || 0;
    let fromSk = prevWake._sk + dur;
    let mins = nightWakes[i]._sk - fromSk;
    if(mins>0 && mins<840) wins.push({from:prevWake.time, to:nightWakes[i].time, mins, night:true});
  }
  if(nightWakes.length>0 && morningWake){
    const last = nightWakes[nightWakes.length-1];
    const dur = parseInt(last.assistedDuration) || 0;
    let fromSk = last._sk + dur;
    let mins = morningMins + 1440 - fromSk;
    if(morningMins > fromSk) mins = morningMins - fromSk;
    if(mins<=0) mins+=1440;
    if(mins>0 && mins<840) wins.push({from:last.time, to:morningWake.time, mins, night:true});
  }
  if(wins.length===0 && bedEntry && morningWake){
    let mins = morningMins + 1440 - bedMins;
    if(morningMins > bedMins) mins = morningMins - bedMins;
    if(mins<=0) mins+=1440;
    if(mins>0 && mins<840) wins.push({from:bedEntry.time, to:morningWake.time, mins, night:true});
  }
  return wins;
}

export function calcAge(dob, dueDate) {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  let correctedBirth = birth; let weeksPreterm = 0;
  if (dueDate) { const due = new Date(dueDate + "T00:00:00"); const diffDays = Math.round((due - birth) / (1000*60*60*24)); if (diffDays > 14) { weeksPreterm = Math.round(diffDays / 7); correctedBirth = due; } }
  const today = new Date();
  const totalDays = Math.floor((today - birth) / (1000*60*60*24));
  if (totalDays < 0) return null;
  const totalWeeks = Math.floor(totalDays / 7);
  const correctedDays = Math.floor((today - correctedBirth) / (1000*60*60*24));
  const correctedWeeks = Math.max(0, Math.floor(correctedDays / 7));
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  function addMonthsSafe(date, m) {
    const d = new Date(date);
    const origDay = d.getDate();
    d.setMonth(d.getMonth() + m);
    if (d.getDate() !== origDay) d.setDate(0);
    return d;
  }
  let afterMonths = addMonthsSafe(birth, months);
  if (afterMonths > today) { months--; afterMonths = addMonthsSafe(birth, months); }
  const daysAfterMonths = Math.floor((today - afterMonths) / (1000*60*60*24));
  const weeksAfterMonths = Math.floor(daysAfterMonths / 7);
  const remainingDays = daysAfterMonths % 7;
  const years = Math.floor(months / 12);
  const monthsAfterYears = months % 12;
  return { months, weeksAfterMonths, remainingDays, totalWeeks, totalDays, years, monthsAfterYears };
}

export function fmtAge(age) {
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
