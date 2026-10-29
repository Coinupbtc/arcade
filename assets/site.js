/* The Arcade — shared page script. No framework; every page works without it. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  function remember(id) {
    var r = store.get('arcade.recent', []).filter(function (x) { return x !== id; });
    r.unshift(id);
    store.set('arcade.recent', r.slice(0, 8));
  }

  // ---- hero carousel
  var track = $('.hero-track');
  if (track) {
    var slides = $$('.slide', track), dots = $$('.dots button'), cur = 0, timer;
    var go = function (i, smooth) {
      cur = (i + slides.length) % slides.length;
      track.scrollTo({ left: slides[cur].offsetLeft - track.offsetLeft, behavior: smooth === false ? 'auto' : 'smooth' });
    };
    var mark = function () {
      var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      cur = i;
      dots.forEach(function (d, j) { if (j === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    };
    dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); restart(); }); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(mark); }, { passive: true });
    var restart = function () {
      clearInterval(timer);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(function () { if (!document.hidden) go(cur + 1); }, 7000);
    };
    track.addEventListener('pointerdown', function () { clearInterval(timer); });
    restart();
  }

  // ---- hover previews (desktop only; loaded on first hover)
  if (!coarse) {
    $$('.tile').forEach(function (t) {
      var pv = $('.pv', t);
      if (!pv) return;
      t.addEventListener('mouseenter', function () {
        if (!pv.src) { pv.onload = function () { pv.classList.add('ready'); }; pv.src = pv.getAttribute('data-src'); }
      });
    });
  }

  // ---- library: search, category chips, sort
  var grid = $('#grid');
  if (grid) {
    var tiles = $$('.tile', grid), q = $('#q'), sel = $('#sort'), cat = 'all', empty = $('#empty');
    var apply = function () {
      var term = (q && q.value || '').trim().toLowerCase(), shown = 0;
      tiles.forEach(function (t) {
        var hit = (cat === 'all' || (' ' + t.dataset.cats + ' ').indexOf(' ' + cat + ' ') >= 0) &&
          (!term || t.dataset.text.indexOf(term) >= 0);
        t.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown > 0;
      var by = sel ? sel.value : 'featured';
      var key = {
        featured: function (t) { return +t.dataset.order; },
        az: function (t) { return t.dataset.title; },
        quality: function (t) { return -(+t.dataset.score); },
        updated: function (t) { return -(+t.dataset.updated); }
      }[by];
      tiles.slice().sort(function (a, b) { var x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; })
        .forEach(function (t) { grid.appendChild(t); });
    };
    $$('.chip[data-cat]').forEach(function (c) {
      c.addEventListener('click', function () {
        cat = c.dataset.cat;
        $$('.chip[data-cat]').forEach(function (o) { o.setAttribute('aria-pressed', o === c ? 'true' : 'false'); });
        apply();
      });
    });
    if (q) {
      q.addEventListener('input', apply);
      var p = new URLSearchParams(location.search).get('q');
      if (p) { q.value = p; }
    }
    if (sel) {
      sel.value = store.get('arcade.sort', 'featured');
      sel.addEventListener('change', function () { store.set('arcade.sort', sel.value); apply(); });
    }
    apply();
    // continue playing
    var recent = store.get('arcade.recent', []), row = $('#recent');
    if (row && recent.length) {
      var byId = {};
      tiles.forEach(function (t) { byId[t.dataset.id] = t; });
      var n = 0;
      recent.forEach(function (id) {
        if (byId[id] && n < 6) { var c = byId[id].cloneNode(true); c.hidden = false; row.appendChild(c); n++; }
      });
      if (n) $('#recent-sec').hidden = false;
    }
  }
  // ---- game page
  var stage = $('.stage[data-src]');
  if (stage) {
    var src = stage.dataset.src, id = stage.dataset.id, poster = $('.poster', stage), frame = null;
    var full = function () { remember(id); location.href = src; };
    var embed = function () {
      remember(id);
      if (frame) return;
      frame = document.createElement('iframe');
      frame.src = src;
      frame.title = stage.dataset.title || 'Game';
      frame.setAttribute('allow', 'autoplay; fullscreen; gamepad; accelerometer; gyroscope');
      frame.setAttribute('allowfullscreen', '');
      frame.addEventListener('load', function () { try { frame.focus(); frame.contentWindow.focus(); } catch (e) {} });
      stage.appendChild(frame);
      poster.remove();
      frame.focus();
    };
    // phones play full screen (iOS has no iframe fullscreen); desktops play in the page
    var phone = coarse || window.innerWidth < 760;
    poster.addEventListener('click', function () { phone ? full() : embed(); });
    poster.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); phone ? full() : embed(); } });
    var fs = $('#fs');
    if (fs) fs.addEventListener('click', function () {
      if (phone) return full();
      embed();
      var el = stage;
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    });
    var rl = $('#reload');
    if (rl) rl.addEventListener('click', function () { if (frame) { frame.src = src; frame.focus(); } else embed(); });
    $$('a[data-full]').forEach(function (a) { a.addEventListener('click', function () { remember(id); }); });
  }

  // ---- control tabs
  $$('.tabs').forEach(function (tabs) {
    var btns = $$('button', tabs), panes = $$('[data-pane]', tabs.parentNode);
    var show = function (name) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'); });
      panes.forEach(function (p) { p.hidden = p.dataset.pane !== name; });
    };
    btns.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });
    show(coarse ? 'touch' : 'desktop');
    window.addEventListener('gamepadconnected', function () { show('gamepad'); });
  });
})();
