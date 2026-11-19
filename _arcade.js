/* The Arcade — "back to the arcade" button for every /g/<id>/ page. One shared file: change it here, every game picks it up.
   arcade-add.py injects it into every shelf copy; older games load it from their own index.html.
   - Hidden when the game is embedded in the arcade's own player (that page has its own chrome) and in fullscreen.
   - Shows "◀ ARCADE" for a few seconds, then folds to a 44 px tab so it stays out of the HUD.
   - When the game is paused, on its menu or on game over (window.__game.state), it unfolds into a big
     "◀ BACK TO ARCADE" button, so leaving is always one tap from the game's own pause/menu screens.
   - During play the folded tab needs a second tap within 3 s ("TAP AGAIN TO LEAVE"), so a stray thumb can't end a run.
   - Goes to the arcade's game select screen: /arcade/#games on the public site, /#games on the tailnet arcade.
   2026-11-19: owner asked for "a way to exit a game back to arcade main game select screen, not just main menu". */
(function () {
  'use strict';
  if (window.__arcadePill) return;
  window.__arcadePill = true;
  var embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (embedded) return;

  var HOME = (location.pathname.indexOf('/arcade/') === 0 ? '/arcade/' : '/') + '#games';
  var CSS = ''
    + '#arcade-home{position:fixed;top:calc(6px + env(safe-area-inset-top));left:calc(6px + env(safe-area-inset-left));'
    + 'z-index:2147483647;display:inline-flex;align-items:center;gap:8px;height:44px;min-width:44px;padding:0 14px 0 12px;'
    + 'border-radius:999px;background:rgba(12,13,17,.78);border:1px solid rgba(255,176,32,.55);color:#f4f2ee;'
    + 'font:700 12px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:.12em;text-decoration:none;'
    + '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer;'
    + 'touch-action:manipulation;-webkit-tap-highlight-color:transparent;overflow:hidden;white-space:nowrap;'
    + 'transition:max-width .3s ease,padding .3s ease,opacity .2s ease,height .2s ease,font-size .2s ease;max-width:150px}'
    + '#arcade-home svg{width:18px;height:18px;flex:none;fill:#ffb020}'
    + '#arcade-home.fold{max-width:44px;padding:0 13px;opacity:.75}'
    + '#arcade-home.fold span{opacity:0}'
    + '#arcade-home.big{max-width:320px;height:52px;padding:0 20px 0 16px;font-size:14px;opacity:1;'
    + 'background:rgba(255,176,32,.95);color:#15120a;border-color:#ffb020}'
    + '#arcade-home.big svg{fill:#15120a}'
    + '#arcade-home.arm{max-width:260px;padding:0 16px 0 12px;opacity:1;background:rgba(255,176,32,.95);color:#15120a}'
    + '#arcade-home.arm svg{fill:#15120a}'
    + '#arcade-home.big span,#arcade-home.arm span{opacity:1}'
    + '#arcade-home:hover,#arcade-home:focus-visible{max-width:320px;padding:0 14px 0 12px;opacity:1}'
    + '#arcade-home:hover span,#arcade-home:focus-visible span{opacity:1}'
    + '#arcade-home span{transition:opacity .2s ease}'
    + '#arcade-home:active{transform:scale(.96)}'
    + '#arcade-home.hide{opacity:0;pointer-events:none}';

  var el, label, armed = 0, folded = false;
  var IDLE = /^(menu|title|paused|pause|over|gameover|game-over|dead|finish|finished|win|lose|results?)$/i;

  function state() {
    try {
      var g = window.__game;
      if (!g) return '';
      var s = typeof g.state === 'object' && g.state ? (g.state.phase || g.state.mode || g.state.name) : (g.state || g.phase || g.mode);
      return String(s || '');
    } catch (e) { return ''; }
  }
  function show(text, cls) {
    label.textContent = text;
    el.classList.remove('big', 'arm', 'fold');
    if (cls) el.classList.add(cls);
  }
  function sync() {
    if (!el) return;
    el.classList.toggle('hide', !!(document.fullscreenElement || document.webkitFullscreenElement));
    if (armed && Date.now() < armed) return;
    armed = 0;
    if (IDLE.test(state())) show('BACK TO ARCADE', 'big');
    else show('ARCADE', folded ? 'fold' : '');
  }
  function leave() { location.href = HOME; }

  function mount() {
    if (document.getElementById('arcade-home') || !document.body) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    el = document.createElement('a');
    el.id = 'arcade-home';
    el.href = HOME;
    el.setAttribute('aria-label', 'Back to The Arcade game select');
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5 8 12l7.5 7.5-1.9 1.9L4.2 12l9.4-9.4z"/></svg><span>ARCADE</span>';
    label = el.querySelector('span');
    // our own taps never reach the game underneath
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (t) {
      el.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });
    el.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var s = state();
      if (!s || IDLE.test(s) || (armed && Date.now() < armed)) return leave();
      armed = Date.now() + 3000;               // in play: ask once, so a stray thumb can't end a run
      show('TAP AGAIN TO LEAVE', 'arm');
      setTimeout(sync, 3100);
    });
    document.body.appendChild(el);
    setTimeout(function () { folded = true; sync(); }, 4000);
    sync();
    setInterval(sync, 400);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
