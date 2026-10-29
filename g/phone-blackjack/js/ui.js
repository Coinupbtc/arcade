/**
 * Phone Blackjack UI. The rules live in engine.js; this file paints the table,
 * animates the deal and the dealer's draw, plays the sounds, and owns the
 * window.__game hook the arcade probes read.
 */
(function () {
  "use strict";

  var state = BJ.freshState();
  var seen = Object.create(null);   // card uids already on screen (no re-animation)
  var holeWasDown = true;
  var bannerKey = "";
  var dealerTimer = null;
  var BEST_KEY = "phone-bj-best";
  var best = 100;

  try {
    var raw = localStorage.getItem(BEST_KEY);
    if (raw && !isNaN(parseInt(raw, 10))) best = Math.max(100, parseInt(raw, 10));
  } catch (e) { /* private mode */ }

  function $(id) { return document.getElementById(id); }

  function money(n) {
    return n < 0 ? "−$" + (-n) : "$" + n;
  }

  function screen() {
    if (state.phase === "betting") return state.bank < BJ.MIN_BET ? "over" : "menu";
    return "play";
  }

  function cardEl(card, down) {
    var el = document.createElement("div");
    var red = (card.suit === "♥" || card.suit === "♦");
    el.className = "card" + (down ? " back" : "") + (red && !down ? " red" : "");
    el.dataset.uid = String(card.uid == null ? "" : card.uid);
    if (down) {
      el.innerHTML = "<span class='pip'>◆</span>";
      return el;
    }
    el.innerHTML =
      "<span class='rank'>" + card.rank + "</span>" +
      "<span class='suit'>" + card.suit + "</span>";
    return el;
  }

  /** Paint one fan; animate only cards that were not on screen before. */
  function paintFan(mount, cards, hideSecond) {
    mount.innerHTML = "";
    mount.style.setProperty("--n", String(cards.length));
    for (var i = 0; i < cards.length; i++) {
      var down = hideSecond && i === 1 && cards.length > 1;
      var el = cardEl(cards[i], down);
      var uid = cards[i].uid;
      if (down) {
        holeWasDown = true;
      } else if (uid != null && !seen[uid]) {
        el.classList.add("enter");
        seen[uid] = true;
      } else if (i === 1 && holeWasDown && mount.id === "dealerFan") {
        el.classList.add("flip");
        holeWasDown = false;
      }
      mount.appendChild(el);
    }
  }

  function totalBadge(el, total, bust) {
    el.textContent = total == null ? "" : String(total);
    el.classList.toggle("hot", !!bust);
  }

  function banner() {
    var el = $("banner");
    var text, cls = "";
    if (state.result && state.phase === "betting") {
      var r = state.result;
      text = r.kind === "bj" ? "BLACKJACK " + money(r.delta)
        : r.kind === "win" ? "WIN " + money(r.delta)
        : r.kind === "lose" ? "LOSE " + money(r.delta)
        : "PUSH";
      cls = r.kind;
    } else if (state.phase === "insurance") {
      text = "INSURANCE?";
    } else if (state.phase === "dealer") {
      text = "DEALER PLAYS";
    } else if (state.phase === "player") {
      text = state.hands.length > 1 ? "HAND " + (state.active + 1) + " OF " + state.hands.length : "YOUR MOVE";
    } else if (screen() === "over") {
      text = "OUT OF CHIPS";
      cls = "lose";
    } else {
      text = "PLACE YOUR BET";
    }
    if (text !== bannerKey) {
      bannerKey = text;
      el.className = "banner pop " + cls;
      el.textContent = text;
      // restart the pop animation
      void el.offsetWidth;
    } else {
      el.className = "banner " + cls;
    }
  }

  function paint() {
    $("bank").textContent = "$" + state.bank;
    $("bestLine").textContent = "BEST $" + Math.max(best, state.bank);
    $("wl").textContent = "W " + state.stats.w + " · L " + state.stats.l + " · P " + state.stats.p;
    $("streak").textContent = state.streak > 1 ? state.streak + " in a row" : (state.streak === 1 ? "1 win" : "no streak");
    $("betLabel").textContent = "$" + state.bet;

    ["bet5", "bet10", "bet25"].forEach(function (id) {
      var v = parseInt(id.replace("bet", ""), 10);
      $(id).classList.toggle("sel", state.bet === v);
    });

    // dealer
    paintFan($("dealerFan"), state.dealer, state.hideHole);
    if (!state.dealer.length) {
      $("dealerScore").textContent = "";
      $("dealerScore").classList.remove("hot");
    } else if (state.hideHole) {
      $("dealerScore").textContent = "showing " + BJ.score([state.dealer[0]]).total;
      $("dealerScore").classList.remove("hot");
    } else {
      var d = BJ.score(state.dealer);
      totalBadge($("dealerScore"), d.total, d.total > 21);
    }

    // player
    var wrap = $("playerWrap");
    wrap.innerHTML = "";
    wrap.classList.toggle("multi", state.hands.length > 1);
    if (!state.hands.length) {
      wrap.innerHTML = "<div class='hand idle'>No cards yet — Deal.</div>";
      $("playerScore").textContent = "";
      $("playerScore").classList.remove("hot");
    } else {
      state.hands.forEach(function (h, idx) {
        var block = document.createElement("div");
        block.className = "hand" + (idx === state.active && state.phase === "player" ? " active" : "");
        var label = document.createElement("div");
        label.className = "hand-label";
        var s = BJ.score(h.cards);
        label.textContent = (state.hands.length > 1 ? "HAND " + (idx + 1) + " · " : "") +
          "bet $" + h.bet + " · " + s.total + (s.soft ? " soft" : "");
        var fan = document.createElement("div");
        fan.className = "fan";
        paintFan(fan, h.cards, false);
        block.appendChild(label);
        block.appendChild(fan);
        wrap.appendChild(block);
      });
      var active = state.hands[state.active] || state.hands[0];
      var ps = BJ.score(active.cards);
      $("playerScore").textContent = state.hands.length > 1
        ? state.hands.length + " hands"
        : String(ps.total) + (ps.soft ? " soft" : "");
      $("playerScore").classList.toggle("hot", ps.total > 21);
    }

    // wager chip on the felt
    var live = state.phase !== "betting" && state.hands.length;
    $("pot").hidden = !live;
    if (live) $("potChip").textContent = "$" + state.hands.reduce(function (t, h) { return t + h.bet; }, 0);

    // dock
    var betting = state.phase === "betting";
    var insuring = state.phase === "insurance";
    var over = screen() === "over";
    $("insureRow").hidden = !insuring;
    $("dock").classList.toggle("insuring", insuring);
    $("btnInsure").disabled = false;
    $("btnDecline").disabled = false;
    if (insuring) {
      var maxIns = Math.min(Math.floor(state.bet * 0.5), state.bank);
      $("btnInsure").textContent = "Insure $" + maxIns;
      $("btnInsure").disabled = maxIns < 1;
    }
    $("btnDeal").textContent = over ? "BUY IN $100" : "DEAL";
    $("btnDeal").disabled = !betting || (state.bank < state.bet && !over);
    $("btnDeal").classList.toggle("ready", betting && !over);
    $("btnHit").disabled = !BJ.canHit(state);
    $("btnStand").disabled = !BJ.canStand(state);
    $("btnDouble").disabled = !BJ.canDouble(state);
    $("btnSplit").disabled = !BJ.canSplit(state);
    ["bet5", "bet10", "bet25"].forEach(function (id) { $(id).disabled = !betting; });

    $("msg").textContent = state.msg;
    $("hint").textContent = insuring ? "Tap Insure or No thanks."
      : (window.Input ? Input.hint(betting ? "betting" : "hand") : "");
    banner();
  }

  // ------------------------------------------------------------- dealer animation
  function clearTimer() {
    if (dealerTimer) { clearTimeout(dealerTimer); dealerTimer = null; }
  }

  function animateDealer() {
    clearTimer();
    paint();                       // hole card flips face-up
    if (window.Sfx) Sfx.play("flip");
    dealerTimer = setTimeout(dealerTick, 280);
  }

  function dealerTick() {
    dealerTimer = null;
    if (state.phase !== "dealer") return;
    if (BJ.dealerStep(state)) {
      paint();
      if (window.Sfx) Sfx.play("deal");
      dealerTimer = setTimeout(dealerTick, 300);
    } else {
      state = BJ.finishDealer(state);
      feedback();
    }
  }

  function feedback() {
    var r = state.result;
    if (r && window.Sfx) {
      if (r.kind === "bj") Sfx.play("bj");
      else if (r.kind === "win") Sfx.play("win");
      else if (r.kind === "lose") Sfx.play("bust");
      else Sfx.play("push");
    }
    if (r && state.bank > best) {
      best = state.bank;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
      state.msg += " · new best $" + best;
    }
    paint();
  }

  // ------------------------------------------------------------- actions
  function act(fn, arg, sound) {
    if (sound && window.Sfx) Sfx.play(sound);
    state = arg === undefined ? fn(state) : fn(state, arg);
    if (state.phase === "dealer") { animateDealer(); return; }
    if (state.phase === "betting" && state.result) { feedback(); return; }
    paint();
  }

  function dealNow() {
    if (state.phase !== "betting") return;
    if (window.Sfx) Sfx.play("chipIn");
    state = BJ.deal(state);
    if (state.phase === "dealer") { animateDealer(); return; }
    if (state.phase === "betting" && state.result) { feedback(); return; }
    if (window.Sfx) Sfx.play("deal");
    paint();
  }

  function reset() {
    clearTimer();
    state = BJ.resetAll();
    seen = Object.create(null);
    holeWasDown = true;
    bannerKey = "";
    if (window.Sfx) Sfx.play("click");
    paint();
  }

  function chip(v) {
    if (state.phase !== "betting") return;
    state.bet = Math.max(BJ.MIN_BET, Math.min(v, state.bank));
    if (window.Sfx) Sfx.play("chip");
    paint();
  }

  function betStep(dir) {
    var steps = [5, 10, 25];
    var i = steps.indexOf(state.bet);
    if (i < 0) i = 0;
    var j = Math.min(steps.length - 1, Math.max(0, i + dir));
    chip(steps[j]);
  }

  /** Enter / A / the DEAL button: one function for every start route. */
  function primary() {
    if (screen() === "over") reset();          // buy back in, then deal the same press
    if (state.phase === "player") { act(BJ.hit, undefined, "deal"); return; }
    dealNow();
  }

  function toggleSound() {
    var on = Sfx.toggle();
    $("btnSound").classList.toggle("off", !on);
    $("btnSound").setAttribute("aria-label", on ? "Sound on" : "Sound off");
    if (on) Sfx.play("click");
  }

  function onAction(a) {
    if (state.phase === "insurance") {
      if (a === "double") { act(BJ.buyInsurance, true, "chip"); return; }
      if (a === "stand" || a === "primary") { act(BJ.buyInsurance, false, "click"); return; }
      if (a === "reset") { reset(); return; }
      return;
    }
    if (a === "primary") primary();
    else if (a === "hit") act(BJ.hit, undefined, "deal");
    else if (a === "stand") act(BJ.stand, undefined, "flip");
    else if (a === "double") act(BJ.doubleDown, undefined, "chip");
    else if (a === "split") act(BJ.split, undefined, "chip");
    else if (a === "reset") reset();
    else if (a === "sound") toggleSound();
    else if (a === "bet5") chip(5);
    else if (a === "bet10") chip(10);
    else if (a === "bet25") chip(25);
    else if (a === "betup") betStep(1);
    else if (a === "betdown") betStep(-1);
  }

  // ------------------------------------------------------------- hook
  function uiRect(id, name) {
    var el = $(id);
    if (!el || el.disabled || el.offsetParent === null) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { name: name, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function ui() {
    var out = [];
    [["btnDeal", "deal"], ["btnHit", "hit"], ["btnStand", "stand"], ["btnDouble", "double"],
     ["btnSplit", "split"], ["bet5", "bet5"], ["bet10", "bet10"], ["bet25", "bet25"],
     ["btnReset", "reset"], ["btnSound", "sound"]].forEach(function (p) {
      var r = uiRect(p[0], p[1]);
      if (r) out.push(r);
    });
    if (!$("insureRow").hidden) {
      ["btnInsure", "btnDecline"].forEach(function (id) {
        var r = uiRect(id, id === "btnInsure" ? "insure" : "decline");
        if (r) out.push(r);
      });
    }
    return out;
  }

  window.__game = {
    get state() { return screen(); },
    get score() { return state.bank; },
    get bank() { return state.bank; },
    get best() { return Math.max(best, state.bank); },
    get bet() { return state.bet; },
    get phase() { return state.phase; },
    get hands() { return state.hands; },
    get dealer() { return state.dealer; },
    get handsPlayed() { return state.handsPlayed; },
    get streak() { return state.streak; },
    get insuranceOffered() { return state.insuranceOffered; },
    get result() { return state.result; },
    get shoe() { return state.shoe.length; },
    start: function () { primary(); },
    reset: reset,
    stack: function (cards) { state = BJ.stack(state, cards); paint(); return state.shoe.length; },
    ui: ui
  };

  // Older probes/screenshots used window.__bj; keep it working.
  window.__bj = {
    getState: function () { return state; },
    demoFan: function () { state = BJ.demoFiveCard(state); paint(); }
  };

  window.addEventListener("DOMContentLoaded", function () {
    $("btnDeal").addEventListener("click", primary);
    $("btnHit").addEventListener("click", function () { act(BJ.hit, undefined, "deal"); });
    $("btnStand").addEventListener("click", function () { act(BJ.stand, undefined, "flip"); });
    $("btnDouble").addEventListener("click", function () { act(BJ.doubleDown, undefined, "chip"); });
    $("btnSplit").addEventListener("click", function () { act(BJ.split, undefined, "chip"); });
    $("btnInsure").addEventListener("click", function () { act(BJ.buyInsurance, true, "chip"); });
    $("btnDecline").addEventListener("click", function () { act(BJ.buyInsurance, false, "click"); });
    $("btnReset").addEventListener("click", reset);
    $("btnSound").addEventListener("click", toggleSound);
    $("bet5").addEventListener("click", function () { chip(5); });
    $("bet10").addEventListener("click", function () { chip(10); });
    $("bet25").addEventListener("click", function () { chip(25); });

    Input.install({ onAction: onAction });
    Input.onDeviceChange(function () {
      $("hint").textContent = Input.hint(state.phase === "betting" ? "betting" : "hand");
    });
    $("btnSound").classList.toggle("off", !Sfx.isOn());
    paint();
  });
})();
