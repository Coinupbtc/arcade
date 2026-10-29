/* The Arcade — return pill for every /g/<id>/ page. One shared file: change it here, every game picks it up.
   Hidden when the game is embedded in the arcade's own player (that page has its own chrome) and in fullscreen.
   Shows "◀ ARCADE" for a few seconds, then folds to a 44 px tab so it stays out of the HUD. */
(function () {
  'use strict';
  if (window.__arcadePill) return;
  window.__arcadePill = true;
  var embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (embedded) return;

  var CSS = ''
    + '#arcade-home{position:fixed;top:calc(6px + env(safe-area-inset-top));left:calc(6px + env(safe-area-inset-left));'
    + 'z-index:2147483647;display:inline-flex;align-items:center;gap:8px;height:44px;min-width:44px;padding:0 14px 0 12px;'
    + 'border-radius:999px;background:rgba(12,13,17,.72);border:1px solid rgba(255,176,32,.5);color:#f4f2ee;'
    + 'font:700 12px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;letter-spacing:.12em;text-decoration:none;'
    + '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,.4);'
    + 'touch-action:manipulation;-webkit-tap-highlight-color:transparent;overflow:hidden;white-space:nowrap;'
    + 'transition:max-width .3s ease,padding .3s ease,opacity .2s ease;max-width:140px}'
    + '#arcade-home svg{width:18px;height:18px;flex:none;fill:#ffb020}'
    + '#arcade-home.fold{max-width:44px;padding:0 13px;opacity:.7}'
    + '#arcade-home.fold span{opacity:0}'
    + '#arcade-home:hover,#arcade-home:focus-visible{max-width:140px;padding:0 14px 0 12px;opacity:1}'
    + '#arcade-home:hover span,#arcade-home:focus-visible span{opacity:1}'
    + '#arcade-home span{transition:opacity .2s ease}'
    + '#arcade-home:active{transform:scale(.96)}'
    + '#arcade-home.hide{opacity:0;pointer-events:none}';

  function sync() {
    var el = document.getElementById('arcade-home');
    if (!el) return;
    el.classList.toggle('hide', !!(document.fullscreenElement || document.webkitFullscreenElement));
  }

  function mount() {
    if (document.getElementById('arcade-home') || !document.body) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var a = document.createElement('a');
    a.id = 'arcade-home';
    a.href = '/';
    a.setAttribute('aria-label', 'Back to The Arcade');
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5 8 12l7.5 7.5-1.9 1.9L4.2 12l9.4-9.4z"/></svg><span>ARCADE</span>';
    document.body.appendChild(a);
    setTimeout(function () { a.classList.add('fold'); }, 4000);
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
