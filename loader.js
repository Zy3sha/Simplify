// ── Global error handler ──
window.onerror = function(msg, src, line, col, err) {
  document.getElementById('root').innerHTML = '<div style="padding:30px;font-family:monospace;font-size:13px;background:#fff;color:#333;word-break:break-all"><b>Error:</b> ' + msg + '<br><b>Line:</b> ' + line + '<br><b>Detail:</b> ' + (err&&err.stack?err.stack:'') + '</div>';
};

// ── Load and compile JSX from external file ──
(function() {
  function compile(src) {
    try {
      if (typeof Babel === 'undefined') throw new Error('Babel not loaded');
      if (typeof React === 'undefined') throw new Error('React not loaded');
      var result = Babel.transform(src, { presets: ['react'] });
      var blob = new Blob([result.code], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var s = document.createElement('script');
      s.src = url;
      s.onload = function() { URL.revokeObjectURL(url); };
      s.onerror = function(e) { console.error('JSX load error', e); };
      document.body.appendChild(s);
    } catch(e) {
      document.getElementById('root').innerHTML = '<div style="padding:30px;font-family:monospace;font-size:13px;background:#fff;color:#333;word-break:break-all"><b>Loader error:</b> ' + e.message + '<br>' + e.stack + '</div>';
    }
  }

  fetch('app.jsx')
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to load app.jsx: ' + r.status);
      return r.text();
    })
    .then(compile)
    .catch(function(err) {
      var embedded = document.getElementById('jsx-src');
      if (embedded) {
        compile(embedded.textContent);
      } else {
        document.getElementById('root').innerHTML = '<div style="padding:30px;font-family:monospace;font-size:13px;background:#fff;color:#333;word-break:break-all"><b>Load error:</b> ' + err.message + '</div>';
      }
    });
})();

// ══════════════════════════════════════════════════════════
// AUTO-GLASS — Apply Liquid Glass to ALL card-like elements
// Catches: cards, log rows, headers, night wakes, tiles, etc.
// ══════════════════════════════════════════════════════════
(function(){
  function applyGlass(){
    var root=document.getElementById('root');
    if(!root)return;
    var divs=root.querySelectorAll('div');
    for(var i=0;i<divs.length;i++){
      var d=divs[i];
      var s=d.style;
      var br=parseInt(s.borderRadius)||0;
      var bg=s.background||'';
      var bdFilter=s.backdropFilter||s.webkitBackdropFilter||'';
      var border=s.borderLeft||'';
      var hasBg=bg.indexOf('var(--card-bg')>=0||bg.indexOf('var(--chip-bg')>=0;
      var hasBlur=bdFilter.indexOf('blur')>=0;

      // LARGE CARDS (borderRadius >= 16 + card-bg variable)
      if(br>=16 && hasBg && !d.classList.contains('glass-card')){
        d.classList.add('glass-card');
        continue;
      }

      // CARDS with inline backdrop-filter already set
      if(br>=12 && hasBlur && bg && !d.classList.contains('glass-card') && !d.classList.contains('glass-entry')){
        d.classList.add('glass-card');
        continue;
      }

      // LOG ENTRY ROWS — have borderLeft (colored left edge) + borderRadius 10-16
      // These are the nappy/feed/nap/bedtime/night-wake rows
      if(br>=8 && br<=18 && border && bg && !d.classList.contains('glass-entry') && !d.classList.contains('glass-card')){
        d.classList.add('glass-entry');
        continue;
      }

      // SMALLER ROUNDED ELEMENTS with any card-bg
      if(br>=10 && br<16 && hasBg && !d.classList.contains('glass-entry') && !d.classList.contains('glass-card')){
        d.classList.add('glass-entry');
        continue;
      }
    }
  }

  var timer;
  var obs=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(applyGlass,80);});

  function init(){
    var root=document.getElementById('root');
    if(root){
      obs.observe(root,{childList:true,subtree:true});
      // Multiple passes to catch React renders
      setTimeout(applyGlass,300);
      setTimeout(applyGlass,800);
      setTimeout(applyGlass,2000);
    }else{
      setTimeout(init,150);
    }
  }
  init();
})();

// ── Gender class on body ──
(function(){
  try{
    var sex=localStorage.getItem("sex_v1");
    if(!sex){
      var childrenRaw=localStorage.getItem("children_v1");
      var activeId=localStorage.getItem("active_child");
      if(childrenRaw){
        var children=JSON.parse(childrenRaw);
        var child=activeId?children[activeId]:Object.values(children)[0];
        if(child) sex=child.sex||"";
      }
    }
    if(sex==="girl")document.body.classList.add("girl");
    else if(sex==="boy")document.body.classList.add("boy");
  }catch(e){}
})();

// ── Remove any previously installed service workers ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(reg) { reg.unregister(); });
  });
}
