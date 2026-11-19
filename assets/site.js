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

  // ---- motion covers (cluster B loops). Off for reduced motion, Save-Data and 2G.
  var motionOK = function () {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    var c = navigator.connection || {};
    if (c.saveData) return false;
    if (/(^|-)2g$/.test(c.effectiveType || '')) return false;
    return true;
  };
  var codecProbe = document.createElement('video');
  var pickSrc = function (el) {
    var webm = el.getAttribute('data-webm'), mp4 = el.getAttribute('data-mp4');
    if (webm && codecProbe.canPlayType('video/webm; codecs="vp9"')) return webm;
    if (mp4 && codecProbe.canPlayType('video/mp4; codecs="avc1.42E01E"')) return mp4;
    if (mp4 && codecProbe.canPlayType('video/mp4')) return mp4;
    return null;
  };
  var playMotion = function (el) {
    if (!el || !motionOK()) return;
    if (!el.getAttribute('src')) {
      var s = pickSrc(el);
      if (!s) return;
      el.src = s;
    }
    var p = el.play();
    el.classList.add('on');
    if (p && p.catch) p.catch(function () { el.classList.remove('on'); });
  };
  var stopMotion = function (el) {
    if (!el) return;
    el.pause();
    el.classList.remove('on');
  };


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
      slides.forEach(function (s, j) {
        var mv = $('.mv', s);
        if (!mv) return;
        if (j === i) playMotion(mv); else stopMotion(mv);
      });
    };
    dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); restart(); }); });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(mark); }, { passive: true });
    var restart = function () {
      clearInterval(timer);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(function () { if (!document.hidden) go(cur + 1); }, 7000);
    };
    track.addEventListener('pointerdown', function () { clearInterval(timer); });
    mark();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) slides.forEach(function (s) { stopMotion($('.mv', s)); });
      else mark();
    });
    restart();
  }

  // ---- hover previews (desktop only; loaded on first hover)
  if (!coarse) {
    $$('.tile').forEach(function (t) {
      var pv = $('.pv', t), mv = $('.mv', t);
      if (!pv && !mv) return;
      t.addEventListener('mouseenter', function () {
        if (pv && !pv.src) { pv.onload = function () { pv.classList.add('ready'); }; pv.src = pv.getAttribute('data-src'); }
        playMotion(mv);
      });
      t.addEventListener('mouseleave', function () { stopMotion(mv); });
    });
  }

  // ---- search ranking (2026-11-19, owner: "if i type L i should get all games with letter L first, if i spell Lamp
  // i should get all games with lamp in it"). Lower = better; 9 = no match. One letter matches titles only, so "L"
  // lists every game with an L in its name (names that START with L first); 2+ letters also search genre and blurb.
  var esc = function (x) { return String(x).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var matchRank = function (term, title, text) {
    if (!term) return 0;
    title = (title || '').toLowerCase(); text = (text || '').toLowerCase();
    if (title.indexOf(term) === 0) return 0;
    if ((' ' + title).indexOf(' ' + term) >= 0) return 1;
    if (title.indexOf(term) >= 0) return 2;
    if (term.length < 2) return 9;
    if ((' ' + text).indexOf(' ' + term) >= 0) return 3;
    if (text.indexOf(term) >= 0) return 4;
    return 9;
  };
  var markHit = function (title, term) {
    var i = title.toLowerCase().indexOf(term);
    if (!term || i < 0) return esc(title);
    return esc(title.slice(0, i)) + '<mark>' + esc(title.slice(i, i + term.length)) + '</mark>' + esc(title.slice(i + term.length));
  };

  // ---- live results under the search bar on every page except the home grid (which filters itself)
  var sq = $('#q');
  if (sq && !$('#grid')) {
    var box = document.createElement('div'), games = null, selI = -1, items = [];
    box.className = 'qdrop'; box.hidden = true; box.setAttribute('role', 'listbox');
    sq.closest('form').appendChild(box);
    var load = function (cb) {
      if (games) return cb();
      fetch('/arcade/data/games.json').then(function (r) { return r.json(); })
        .then(function (d) { games = d; cb(); }).catch(function () { games = []; cb(); });
    };
    var render = function () {
      var term = sq.value.trim().toLowerCase();
      if (!term) { box.hidden = true; items = []; return; }
      items = games.map(function (g) {
        return { g: g, r: matchRank(term, g.title, [g.title, g.genre, g.engine, g.tagline].join(' ')) };
      }).filter(function (x) { return x.r < 9; })
        .sort(function (a, b) { return a.r - b.r || (a.g.title < b.g.title ? -1 : 1); }).slice(0, 8);
      selI = items.length ? 0 : -1;
      box.innerHTML = items.length ? items.map(function (x, i) {
        return '<a role="option" href="' + '/arcade/game/' + x.g.id + '/' + '" class="qopt' + (i === selI ? ' on' : '') + '">'
          + '<img src="' + '/arcade/media/' + x.g.id + '/cover.webp' + '" alt="" loading="lazy" onerror="this.style.visibility=&quot;hidden&quot;">'
          + '<span><b>' + markHit(x.g.title, term) + '</b><small>' + esc(x.g.genre || '') + '</small></span></a>';
      }).join('') : '<p class="qnone">No games match &ldquo;' + esc(term) + '&rdquo;</p>';
      box.hidden = false;
    };
    sq.addEventListener('input', function () { load(render); });
    sq.addEventListener('focus', function () { if (sq.value.trim()) load(render); });
    sq.addEventListener('keydown', function (e) {
      if (box.hidden || !items.length) { if (e.key === 'Escape') box.hidden = true; return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selI = (selI + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        $$('.qopt', box).forEach(function (o, i) { o.classList.toggle('on', i === selI); });
      } else if (e.key === 'Enter' && selI >= 0) {
        e.preventDefault(); location.href = $$('.qopt', box)[selI].href;
      } else if (e.key === 'Escape') { box.hidden = true; }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('form.search')) box.hidden = true; });
  }

  // ---- library: search, category chips, sort
  var grid = $('#grid');
  if (grid) {
    var tiles = $$('.tile', grid), q = $('#q'), sel = $('#sort'), cat = 'all', empty = $('#empty');
    var head = $('#games .sec-head h2'), headHTML = head ? head.innerHTML : '';
    var apply = function () {
      var term = (q && q.value || '').trim().toLowerCase(), shown = 0;
      tiles.forEach(function (t) {
        t._rank = matchRank(term, t.dataset.title, t.dataset.text);
        var hit = (cat === 'all' || (' ' + t.dataset.cats + ' ').indexOf(' ' + cat + ' ') >= 0) && t._rank < 9;
        t.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown > 0;
      // while typing on the home page, the results are the page: everything above the grid folds away
      document.body.classList.toggle('searching', !!term);
      if (head) head.innerHTML = term ? shown + (shown === 1 ? ' game' : ' games') + ' match &ldquo;' + esc(term) + '&rdquo;' : headHTML;
      var by = sel ? sel.value : 'featured';
      var key = {
        featured: function (t) { return +t.dataset.order; },
        az: function (t) { return t.dataset.title; },
        quality: function (t) { return -(+t.dataset.score); },
        updated: function (t) { return -(+t.dataset.updated); }
      }[by];
      tiles.slice().sort(function (a, b) {
        if (term && a._rank !== b._rank) return a._rank - b._rank;   // best match first, then the chosen sort
        var x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0;
      }).forEach(function (t) { grid.appendChild(t); });
    };
    $$('.chip[data-cat]').forEach(function (c) {
      c.addEventListener('click', function () {
        cat = c.dataset.cat;
        $$('.chip[data-cat]').forEach(function (o) { o.setAttribute('aria-pressed', o === c ? 'true' : 'false'); });
        apply();
      });
    });
    if (q) {
      var first = true;
      q.addEventListener('input', function () {
        apply();
        if (first && q.value.trim()) { first = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
        if (!q.value.trim()) first = true;
      });
      q.closest('form').addEventListener('submit', function (e) { e.preventDefault(); q.blur(); });
      q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; apply(); } });
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
