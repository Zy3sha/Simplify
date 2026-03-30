// ── Global error handler — styled sleeping baby page ──
window.onerror = function(msg, src, line, col, err) {
  // Ignore cross-origin "Script error" at line 0 — these are non-fatal noise
  // from Firebase/Google Analytics modules loaded from CDN
  if (line === 0 || msg === 'Script error.' || msg === 'Script error') {
    console.warn('[OBubba] Ignored cross-origin script error:', msg);
    return true; // Suppress the error
  }

  // Try to get real error message if cross-origin obscured it
  var detail = msg;
  if (err && err.message) detail = err.message;
  if (err && err.stack) detail += '\n' + err.stack.split('\n').slice(0,3).join('\n');

  document.getElementById('root').innerHTML = '<div style="min-height:100vh;background:linear-gradient(135deg,#FFFEFD 0%,#FDFAF9 40%,#FBF9F8 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;font-family:DM Sans,sans-serif;text-align:center;position:relative;overflow:hidden">'
    + '<style>'
    + '@keyframes babyBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.008)}}'
    + '@keyframes zzz1{0%{opacity:0;transform:translate(0,0) scale(0.6)}30%{opacity:1}100%{opacity:0;transform:translate(15px,-60px) scale(1.2)}}'
    + '@keyframes zzz2{0%{opacity:0;transform:translate(0,0) scale(0.5)}35%{opacity:1}100%{opacity:0;transform:translate(25px,-75px) scale(1.1)}}'
    + '@keyframes zzz3{0%{opacity:0;transform:translate(0,0) scale(0.4)}40%{opacity:1}100%{opacity:0;transform:translate(10px,-90px) scale(1)}}'
    + '@keyframes floatUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}'
    + '</style>'
    + '<div style="position:relative;margin-bottom:28px">'
    + '<img src="sleep-baby.png" alt="" style="width:200px;height:200px;object-fit:contain;animation:babyBreathe 3.5s ease-in-out infinite;filter:drop-shadow(0 16px 32px rgba(217,207,243,0.35))">'
    + '<span style="position:absolute;top:8px;right:-5px;font-size:18px;font-weight:700;color:#D9CFF3;font-family:Playfair Display,serif;font-style:italic;animation:zzz1 2.8s ease-in-out infinite">z</span>'
    + '<span style="position:absolute;top:-8px;right:12px;font-size:24px;font-weight:700;color:#D9CFF3;font-family:Playfair Display,serif;font-style:italic;animation:zzz2 2.8s ease-in-out 0.5s infinite">z</span>'
    + '<span style="position:absolute;top:-28px;right:28px;font-size:16px;font-weight:700;color:#D9CFF3;font-family:Playfair Display,serif;font-style:italic;animation:zzz3 2.8s ease-in-out 1s infinite">z</span>'
    + '</div>'
    + '<div style="font-family:Playfair Display,serif;font-size:26px;font-weight:700;color:#5B4F5F;margin-bottom:10px">Uh oh!</div>'
    + '<div style="font-size:15px;color:#7A6B7E;line-height:1.65;max-width:300px;margin-bottom:6px">Looks like OBubba fell asleep...</div>'
    + '<div style="font-size:14px;color:#A898AC;line-height:1.5;max-width:280px;margin-bottom:28px">Hold tight — we\'ll be back from our nap ASAP. Your data is safe.</div>'
    + '<button onclick="window.location.reload()" style="padding:14px 36px;border-radius:99px;border:none;background:rgba(192,112,136,0.55);backdrop-filter:blur(16px);color:white;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 0 24px rgba(246,221,227,0.40),0 0 48px rgba(217,207,243,0.25);animation:floatUp 3s ease-in-out infinite">Wake Up & Refresh</button>'
    + '<div style="font-size:10px;color:#C8B8C0;margin-top:24px;font-family:monospace;max-width:300px;word-break:break-all">' + detail + ' (line ' + line + ')</div>'
    + '</div>';
};

// ── Load and compile JSX from external file ──
// Guard: prevent double-execution (Capacitor + service worker can cause re-runs)
if (window.__obAppLoaded) { console.warn('[OBubba] loader.js skipped — app already loaded'); }
else {
window.__obAppLoaded = true;
(function() {
  var errorPage = function(title, detail) {
    document.getElementById('root').innerHTML = '<div style="min-height:100vh;background:linear-gradient(135deg,#FFFEFD 0%,#FDFAF9 40%,#FBF9F8 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;font-family:DM Sans,sans-serif;text-align:center">'
      + '<style>@keyframes babyBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.008)}}@keyframes zzz1{0%{opacity:0;transform:translate(0,0) scale(0.6)}30%{opacity:1}100%{opacity:0;transform:translate(15px,-60px) scale(1.2)}}@keyframes zzz2{0%{opacity:0;transform:translate(0,0) scale(0.5)}35%{opacity:1}100%{opacity:0;transform:translate(25px,-75px) scale(1.1)}}@keyframes zzz3{0%{opacity:0;transform:translate(0,0) scale(0.4)}40%{opacity:1}100%{opacity:0;transform:translate(10px,-90px) scale(1)}}@keyframes floatUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}</style>'
      + '<div style="position:relative;margin-bottom:28px"><img src="sleep-baby.png" alt="" style="width:200px;height:200px;object-fit:contain;animation:babyBreathe 3.5s ease-in-out infinite;filter:drop-shadow(0 16px 32px rgba(217,207,243,0.35))"><span style="position:absolute;top:8px;right:-5px;font-size:18px;font-weight:700;color:#D9CFF3;font-family:Playfair Display,serif;font-style:italic;animation:zzz1 2.8s ease-in-out infinite">z</span><span style="position:absolute;top:-8px;right:12px;font-size:24px;font-weight:700;color:#D9CFF3;font-family:Playfair Display,serif;font-style:italic;animation:zzz2 2.8s ease-in-out 0.5s infinite">z</span><span style="position:absolute;top:-28px;right:28px;font-size:16px;font-weight:700;color:#D9CFF3;font-family:Playfair Display,serif;font-style:italic;animation:zzz3 2.8s ease-in-out 1s infinite">z</span></div>'
      + '<div style="font-family:Playfair Display,serif;font-size:26px;font-weight:700;color:#5B4F5F;margin-bottom:10px">Uh oh!</div>'
      + '<div style="font-size:15px;color:#7A6B7E;line-height:1.65;max-width:300px;margin-bottom:6px">Looks like OBubba fell asleep...</div>'
      + '<div style="font-size:14px;color:#A898AC;line-height:1.5;max-width:280px;margin-bottom:28px">Hold tight — we\'ll be back from our nap ASAP. Your data is safe.</div>'
      + '<button onclick="window.location.reload()" style="padding:14px 36px;border-radius:99px;border:none;background:rgba(192,112,136,0.55);backdrop-filter:blur(16px);color:white;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 0 24px rgba(246,221,227,0.40);animation:floatUp 3s ease-in-out infinite">Wake Up & Refresh</button>'
      + '<div style="font-size:10px;color:#C8B8C0;margin-top:24px;font-family:monospace;max-width:300px;word-break:break-all">' + title + ': ' + detail + '</div>'
      + '</div>';
  };

  function compile(src) {
    try {
      if (typeof Babel === 'undefined') throw new Error('Babel not loaded');
      if (typeof React === 'undefined') throw new Error('React not loaded');
      var result = Babel.transform(src, { presets: ['react'] });
      // Use Blob URL — do NOT wrap code in try/catch as it breaks const/let/class scoping
      var blob = new Blob([result.code], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var s = document.createElement('script');
      s.src = url;
      s.onload = function() { URL.revokeObjectURL(url); };
      s.onerror = function(e) { errorPage('Script load', 'Failed to execute compiled code'); };
      document.body.appendChild(s);
    } catch(e) {
      errorPage('Compile', e.message);
    }
  }

  fetch('app.jsx?v=' + Date.now())
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
        errorPage('Fetch', err.message);
      }
    });
})();
} // end guard: window.__obAppLoaded

// ══════════════════════════════════════════════════════════
// AUTO-GLASS — Optimized: tracks processed elements,
// skips re-scanning on theme change, uses requestAnimationFrame
// ══════════════════════════════════════════════════════════
(function(){
  var processed = new WeakSet();

  function classifyElement(d) {
    if (processed.has(d)) return;
    var s = d.style;
    var br = parseInt(s.borderRadius) || 0;
    var bg = s.background || '';
    var bdFilter = s.backdropFilter || s.webkitBackdropFilter || '';
    var border = s.borderLeft || '';
    var hasBg = bg.indexOf('var(--card-bg') >= 0 || bg.indexOf('var(--chip-bg') >= 0;
    var hasBlur = bdFilter.indexOf('blur') >= 0;

    // LARGE CARDS (borderRadius >= 16 + card-bg variable)
    if (br >= 16 && hasBg) {
      d.classList.add('glass-card');
      processed.add(d);
      return;
    }

    // CARDS with inline backdrop-filter
    if (br >= 12 && hasBlur && bg) {
      d.classList.add('glass-card');
      processed.add(d);
      return;
    }

    // LOG ENTRY ROWS — borderLeft + borderRadius 8-18
    if (br >= 8 && br <= 18 && border && bg) {
      d.classList.add('glass-entry');
      processed.add(d);
      return;
    }

    // SMALLER ROUNDED ELEMENTS with card-bg
    if (br >= 10 && br < 16 && hasBg) {
      d.classList.add('glass-entry');
      processed.add(d);
      return;
    }
  }

  function applyGlass() {
    var root = document.getElementById('root');
    if (!root) return;
    var divs = root.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      classifyElement(divs[i]);
    }
  }

  var pending = false;
  function scheduleGlass() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function() {
      applyGlass();
      pending = false;
    });
  }

  var obs = new MutationObserver(function(mutations) {
    // Only process if actual DOM nodes were added (not just attribute/class changes)
    var hasNewNodes = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) scheduleGlass();
  });

  function init() {
    var root = document.getElementById('root');
    if (root) {
      // Only watch for childList changes, NOT attributes
      obs.observe(root, { childList: true, subtree: true });
      // Initial passes
      setTimeout(applyGlass, 200);
      setTimeout(applyGlass, 600);
    } else {
      setTimeout(init, 150);
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

// ── Register Service Worker for offline support (web/PWA only, not native) ──
// On native (Capacitor), unregister any existing SW to prevent stale caches
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      regs.forEach(function(r) { r.unregister(); });
    });
    // Also clear all caches
    if ('caches' in window) { caches.keys().then(function(names) { names.forEach(function(n) { caches.delete(n); }); }); }
  }
} else if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
  window.addEventListener('load', function() {
    try { navigator.serviceWorker.register('/sw.js').then(function(reg) {
      // Check for updates every 30 minutes
      setInterval(function() { reg.update(); }, 30 * 60 * 1000);
      // Listen for sync requests from service worker
      navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'sync_requested') {
          // Trigger cloud sync from main thread
          if (window._fb && window._fbUid) {
            console.log('[OBubba] Service worker requested sync');
          }
        }
        if (event.data && event.data.type === 'notification_action') {
          window.dispatchEvent(new CustomEvent('nativeAction', { detail: { action: event.data.action } }));
        }
      });
    }).catch(function(err) {
      console.warn('[OBubba] SW registration failed:', err);
    }); } catch(e) { console.warn('[OBubba] SW not supported here'); }
  });
}

// native-plugins.js is loaded via index.html <script defer> — no duplicate load needed
