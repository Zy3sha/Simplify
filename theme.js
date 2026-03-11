// ── Theme System: auto (device) / light / dark ──
function applyTheme(mode){
  var body=document.body;
  var btn=document.getElementById('theme-toggle');
  var meta=document.querySelector('meta[name="theme-color"]');
  var dark;
  if(mode==='auto'){
    dark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  }else{
    dark=(mode==='dark');
  }
  body.classList.remove('dark-mode','light-mode');
  body.classList.add(dark?'dark-mode':'light-mode');
  var saved=getThemePref();
  if(saved==='auto') btn.textContent=dark?'☀️':'🌙';
  else if(saved==='dark') btn.textContent='☀️';
  else btn.textContent='🌙';
  btn.title=saved==='auto'?'Auto (following device · tap to lock light)':saved==='light'?'Light mode · tap to switch to dark':'Dark mode · tap to switch to auto';
  if(meta) meta.content=dark?'#080e1c':'#f0ddd6';
}
function getThemePref(){
  try{return localStorage.getItem('theme')||'auto';}catch(e){return 'auto';}
}
function toggleTheme(){
  var current=getThemePref();
  var next;
  if(current==='auto') next='light';
  else if(current==='light') next='dark';
  else next='auto';
  try{localStorage.setItem('theme',next);}catch(e){}
  applyTheme(next);
}
window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){
  if(getThemePref()==='auto') applyTheme('auto');
});
(function(){applyTheme(getThemePref());})();
