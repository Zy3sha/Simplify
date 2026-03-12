// ── Theme System: auto time-switch + manual override ──
// 7pm (19:00) → dark mode, 7am (07:00) → light mode
// Manual toggle overrides until the next 7am/7pm boundary

var isDark = false;

function getTimeTheme() {
  var h = new Date().getHours();
  return (h >= 19 || h < 7) ? 'dark' : 'light';
}

function getNextBoundary() {
  var now = new Date();
  var h = now.getHours();
  var next = new Date(now);
  if (h >= 19) {
    next.setDate(next.getDate() + 1);
    next.setHours(7, 0, 0, 0);
  } else if (h < 7) {
    next.setHours(7, 0, 0, 0);
  } else {
    next.setHours(19, 0, 0, 0);
  }
  return next.getTime();
}

function applyTheme(mode) {
  var body = document.body;
  var meta = document.querySelector('meta[name="theme-color"]');
  isDark = (mode === 'dark');

  if (isDark) {
    body.classList.add('dark-mode');
    body.classList.remove('light-mode');
  } else {
    body.classList.add('light-mode');
    body.classList.remove('dark-mode');
  }

  void body.offsetHeight;

  if (meta) meta.content = isDark ? '#080e1c' : '#F0DDD6';

  var btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';

  try { localStorage.setItem('theme_v1', mode); } catch (e) {}

  if (typeof window._themeCallback === 'function') window._themeCallback();
}

function resolveTheme() {
  try {
    var override = localStorage.getItem('theme_override');
    if (override) {
      var parsed = JSON.parse(override);
      if (parsed.until && Date.now() < parsed.until) {
        return parsed.mode;
      }
      localStorage.removeItem('theme_override');
    }
  } catch (e) {}
  return getTimeTheme();
}

function toggleTheme() {
  var current = isDark ? 'dark' : 'light';
  var next = current === 'dark' ? 'light' : 'dark';

  try {
    localStorage.setItem('theme_override', JSON.stringify({
      mode: next,
      until: getNextBoundary()
    }));
  } catch (e) {}

  applyTheme(next);
}

// Check every 60s if override expired or time boundary crossed
setInterval(function() {
  try {
    var override = localStorage.getItem('theme_override');
    if (override) {
      var parsed = JSON.parse(override);
      if (parsed.until && Date.now() >= parsed.until) {
        localStorage.removeItem('theme_override');
        applyTheme(getTimeTheme());
      }
    } else {
      var timeTheme = getTimeTheme();
      var currentTheme = isDark ? 'dark' : 'light';
      if (timeTheme !== currentTheme) {
        applyTheme(timeTheme);
      }
    }
  } catch (e) {}
}, 60000);

// Apply immediately — no flash
(function () { applyTheme(resolveTheme()); })();
