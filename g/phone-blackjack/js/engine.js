/**
 * Blackjack rules + shoe. UI stays in ui.js so a 5-card fan never
 * depends on one giant HTML dump (the failure that hung smeagle).
 */
(function (global) {
  "use strict";

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var START_BANK = 100;
  var MIN_BET = 5;
  var STORAGE_KEY = "phone-bj-v1";
  var seq = 0;

  /**
   * The top six cards of a fresh shoe are a fixed teaching hand:
   * dealer shows 6 against a 10 hole, you hold 17. Standing wins (the dealer
   * draws a 6 to 22); hitting busts (17 + 6). That makes the first hand at any
   * fresh table the same real decision, and it lets the arcade probes rely on
   * one known opening instead of a random shuffle.
   */
  var OPENING = [
    { rank: "6", suit: "♣" },   // dealer up
    { rank: "10", suit: "♦" },  // dealer hole
    { rank: "10", suit: "♥" },  // you
    { rank: "7", suit: "♠" },   // you
    { rank: "6", suit: "♥" },   // your first hit → 23
    { rank: "10", suit: "♠" }   // dealer draw → 22
  ];

  function makeShoe(decks) {
    var i, s, r, out = [];
    for (i = 0; i < decks; i++) {
      for (s = 0; s < SUITS.length; s++) {
        for (r = 0; r < RANKS.length; r++) {
          out.push({ rank: RANKS[r], suit: SUITS[s] });
        }
      }
    }
    for (i = out.length - 1; i > 0; i--) {
      r = Math.floor(Math.random() * (i + 1));
      s = out[i];
      out[i] = out[r];
      out[r] = s;
    }
    // draw() pops from the end, so the opening goes on top in reverse.
    out.length -= OPENING.length;
    for (i = OPENING.length - 1; i >= 0; i--) {
      out.push({ rank: OPENING[i].rank, suit: OPENING[i].suit });
    }
    return out;
  }

  function draw(state) {
    if (!state.shoe.length) { state.shoe = makeShoe(6); state.stacked = false; }
    else if (state.shoe.length < 20 && !state.stacked) state.shoe = makeShoe(6);
    var c = state.shoe.pop();
    c.uid = ++seq;
    return c;
  }

  /** Ace = 11 until the hand would bust, then 1. */
  function score(cards) {
    var total = 0, aces = 0, i, r;
    for (i = 0; i < cards.length; i++) {
      r = cards[i].rank;
      if (r === "A") {
        aces += 1;
        total += 11;
      } else if (r === "J" || r === "Q" || r === "K") {
        total += 10;
      } else {
        total += parseInt(r, 10);
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return { total: total, soft: aces > 0 };
  }

  function isBj(cards) {
    return cards.length === 2 && score(cards).total === 21;
  }

  function loadPersist() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function savePersist(state) {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ bank: state.bank, stats: state.stats })
      );
    } catch (e) { /* private mode */ }
  }

  function freshState() {
    var persisted = loadPersist();
    return {
      bank: persisted && typeof persisted.bank === "number" ? persisted.bank : START_BANK,
      stats: persisted && persisted.stats
        ? persisted.stats
        : { w: 0, l: 0, p: 0 },
      phase: "betting",
      bet: MIN_BET,
      shoe: makeShoe(6),
      dealer: [],
      hideHole: true,
      hands: [],
      active: 0,
      insurance: 0,
      insuranceOffered: false,
      splitAces: false,
      startBank: null,
      result: null,
      handsPlayed: 0,
      streak: 0,
      msg: "Bet, then Deal."
    };
  }

  function resetAll() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
    var s = freshState();
    s.bank = START_BANK;
    s.stats = { w: 0, l: 0, p: 0 };
    s.msg = "Reset — $100. Bet, then Deal.";
    return s;
  }

  function canAfford(state, extra) {
    return state.bank >= extra;
  }

  function upIsAceOrTen(state) {
    var up = state.dealer[0];
    if (!up) return false;
    return up.rank === "A" || up.rank === "10" || up.rank === "J" || up.rank === "Q" || up.rank === "K";
  }

  function deal(state) {
    if (state.phase !== "betting") return state;
    // Never let a stale bet exceed what you can afford — auto-lower it so the
    // game never strands you with an impossible bet (which disabled Split/Double).
    if (state.bank < state.bet) {
      state.bet = Math.max(MIN_BET, state.bank);
    }
    if (state.bank < MIN_BET) {
      state.msg = "Out of chips — press Reset.";
      return state;
    }
    state.startBank = state.bank;
    state.result = null;
    state.bank -= state.bet;
    // dealer[0] = face-up upcard, dealer[1] = face-down hole card.
    // The UI shows all dealer cards but paints dealer[1] (via hideHole) as the card back.
    state.dealer = [draw(state), draw(state)];
    state.hideHole = true;
    state.hands = [{ cards: [draw(state), draw(state)], bet: state.bet, stood: false, doubled: false }];
    state.active = 0;
    state.insurance = 0;
    state.insuranceOffered = false;
    state.splitAces = false;

    var up = state.dealer[0];

    // ---- Player holds a natural blackjack ----
    if (isBj(state.hands[0].cards)) {
      // Peek if the upcard could make a dealer blackjack.
      if (upIsAceOrTen(state)) {
        state.hideHole = false;           // peek

        if (isBj(state.dealer)) {
          // both blackjack -> push, no choices given
          return settle(state, true);
        }
        state.hideHole = true;            // no dealer BJ: hide the hole again
      }
      // Player blackjack wins outright (3:2)
      return settle(state, true);
    }

    // ---- Player does NOT have blackjack ----
    if (up.rank === "A") {
      // Offer insurance before anything else (before the peek is revealed).
      state.insuranceOffered = true;
      state.phase = "insurance";
      state.msg = "Dealer shows Ace — take Insurance? Up to half bet.";
      savePersist(state);
      return state;
    }

    // ---- Dealer peek on a 10-value upcard ----
    if (upIsAceOrTen(state)) {
      state.hideHole = false;             // peek
      if (isBj(state.dealer)) {
        // dealer blackjack: hand ends immediately, you lose this bet
        return settle(state, true);
      }
      state.hideHole = true;              // no dealer BJ, hide the hole again
    }

    // ---- Normal play ----
    state.phase = "player";
    state.msg = "Hit, Stand, Double, or Split.";
    savePersist(state);
    return state;
  }

  function canInsurance(state) {
    return state.phase === "insurance" && state.insuranceOffered && !!state.dealer.length && state.dealer[0].rank === "A";
  }

  /** Player decides whether to buy insurance (max half the bet). */
  function buyInsurance(state, take) {
    if (!canInsurance(state)) return state;
    if (take) {
      var maxIns = Math.floor(state.bet * 0.5);
      if (maxIns > state.bank) maxIns = state.bank;
      if (maxIns >= 1) {
        state.insurance = maxIns;
        state.bank -= maxIns;
      }
    }
    state.insuranceOffered = false;

    // After the insurance decision, peek to see if the dealer actually has blackjack.
    state.hideHole = false;               // reveal hole
    if (isBj(state.dealer)) {
      // dealer has blackjack: if we took insurance it pays 2:1 below in settle; hand itself loses (resolved now)
      return settle(state, true);
    }
    state.hideHole = true;                // no dealer BJ, continue play with hole down

    state.phase = "player";
    state.msg = "No dealer blackjack" + (state.insurance ? " — insurance bet loses." : ".") + " Hit, Stand, Double, or Split.";
    savePersist(state);
    return state;
  }

  function activeHand(state) {
    return state.hands[state.active];
  }

  function canHit(state) {
    if (state.phase !== "player") return false;
    var h = activeHand(state);
    return h && !h.stood && score(h.cards).total < 21;
  }

  function canStand(state) {
    return state.phase === "player" && activeHand(state) && !activeHand(state).stood;
  }

  function canDouble(state) {
    if (state.phase !== "player") return false;
    var h = activeHand(state);
    return h && h.cards.length === 2 && !h.doubled && canAfford(state, h.bet);
  }

  /** 10, J, Q and K are all worth ten, so any two of them are a pair (K-Q splits). */
  function splitValue(rank) {
    return (rank === "J" || rank === "Q" || rank === "K") ? "10" : rank;
  }

  function canSplit(state) {
    if (state.phase !== "player") return false;
    var h = activeHand(state);
    if (!h || h.cards.length !== 2) return false;
    if (splitValue(h.cards[0].rank) !== splitValue(h.cards[1].rank)) return false;
    // No re-splitting aces, and no further split after aces were split.
    if (state.splitAces) return false;
    // Cap total split hands at 4.
    if (state.hands.length >= 4) return false;
    return canAfford(state, h.bet);
  }

  function advanceOrDealer(state) {
    var i, h;
    for (i = state.active; i < state.hands.length; i++) {
      h = state.hands[i];
      if (!h.stood && score(h.cards).total < 21) {
        state.active = i;
        state.msg = state.hands.length > 1 ? "Playing split hand " + (i + 1) + "." : "Your play.";
        return state;
      }
      h.stood = true;
    }
    return beginDealer(state);
  }

  function hit(state) {
    if (!canHit(state)) return state;
    var h = activeHand(state);
    h.cards.push(draw(state));
    if (score(h.cards).total >= 21) {
      h.stood = true;
      return advanceOrDealer(state);
    }
    state.msg = "Hit or Stand.";
    return state;
  }

  function stand(state) {
    if (!canStand(state)) return state;
    activeHand(state).stood = true;
    return advanceOrDealer(state);
  }

  function doubleDown(state) {
    if (!canDouble(state)) return state;
    var h = activeHand(state);
    state.bank -= h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(state));
    h.stood = true;
    savePersist(state);
    return advanceOrDealer(state);
  }

  function split(state) {
    if (!canSplit(state)) return state;
    var ai = state.active;
    var h = state.hands[ai];
    var a = h.cards[0];
    var b = h.cards[1];
    state.bank -= h.bet;

    // Splitting aces: each ace gets exactly one more card, then that hand stands
    // (a split ace pair hitting 21 is 21, NOT a natural blackjack).
    var isAces = (a.rank === "A");
    if (isAces) state.splitAces = true;

    // The pair becomes hand with card `a`; a brand-new hand with card `b` is
    // inserted right after it, then both draw a second card.
    h.cards = [a, draw(state)];
    var newHand = { cards: [b, draw(state)], bet: h.bet, stood: isAces, doubled: false };
    // mark original hand stood if splitting aces (it must stand after one card)
    if (isAces) h.stood = true;
    state.hands.splice(ai + 1, 0, newHand);
    state.active = ai;

    if (isAces) {
      // all split-ace hands stand -> dealer plays
      state.msg = "Split aces — one card each.";
      savePersist(state);
      return beginDealer(state);
    }
    savePersist(state);
    // A split hand dealt to 21 has nothing left to decide: move on like hit() does.
    if (score(h.cards).total >= 21) return advanceOrDealer(state);
    state.msg = "Split — playing hand " + (ai + 1) + ".";
    return state;
  }

  /** Turn the hand over to the dealer; the UI animates the draw from here. */
  function beginDealer(state) {
    state.phase = "dealer";
    state.hideHole = false;
    return state;
  }

  /** Draw one dealer card if the dealer must hit. Returns true when it drew. */
  function dealerStep(state) {
    if (state.phase !== "dealer") return false;
    if (score(state.dealer).total < 17) {
      state.dealer.push(draw(state));
      return true;
    }
    return false;
  }

  function finishDealer(state) {
    return settle(state, false);
  }

  /** Whole dealer round in one call — tests and any non-animated caller. */
  function dealerPlay(state) {
    beginDealer(state);
    while (dealerStep(state)) { /* one card at a time */ }
    return finishDealer(state);
  }

  function settle(state, naturalsOnly) {
    state.phase = "settle";
    state.hideHole = false;
    var dScore = score(state.dealer).total;
    var dBj = isBj(state.dealer);
    var notes = [];
    var i, h, p, pBj, won;

    // Insurance: stake was taken when it was bought, so a win returns the
    // stake plus 2:1 profit = 3x the stake, which offsets the lost hand.
    if (dBj && state.insurance > 0) {
      state.bank += state.insurance * 3;
      notes.push("Insurance pays $" + (state.insurance * 2));
    } else if (state.insurance > 0) {
      notes.push("Insurance lost $" + state.insurance);
    }
    state.insurance = 0;
    state.insuranceOffered = false;

    for (i = 0; i < state.hands.length; i++) {
      h = state.hands[i];
      state.handsPlayed += 1;
      p = score(h.cards).total;
      // A split hand can never be a "natural" blackjack (3:2). Splitting aces
      // or any stood/split hand reaching 21 counts as a plain 21, not a BJ.
      pBj = (state.hands.length === 1) && !state.splitAces && isBj(h.cards);
      won = 0;
      if (naturalsOnly && pBj && dBj) {
        won = h.bet;
        state.stats.p += 1;
        notes.push("Push (both BJ)");
      } else if (naturalsOnly && pBj) {
        won = h.bet + Math.floor(h.bet * 1.5);
        state.stats.w += 1;
        notes.push("Blackjack 3:2");
      } else if (naturalsOnly && dBj) {
        state.stats.l += 1;
        notes.push("Dealer blackjack");
      } else if (p > 21) {
        state.stats.l += 1;
        notes.push("Bust");
      } else if (dScore > 21) {
        won = h.bet * 2;
        state.stats.w += 1;
        notes.push("Dealer bust");
      } else if (p > dScore) {
        won = h.bet * 2;
        state.stats.w += 1;
        notes.push("You " + p + " vs " + dScore);
      } else if (p < dScore) {
        state.stats.l += 1;
        notes.push("Dealer " + dScore);
      } else {
        won = h.bet;
        state.stats.p += 1;
        notes.push("Push " + p);
      }
      state.bank += won;
    }
    state.phase = "betting";
    var delta = state.startBank === null ? 0 : state.bank - state.startBank;
    var bj = state.hands.length === 1 && !state.splitAces && isBj(state.hands[0].cards) && delta > 0;
    var kind = bj ? "bj" : (delta > 0 ? "win" : (delta < 0 ? "lose" : "push"));
    if (delta > 0) state.streak += 1;
    else if (delta < 0) state.streak = 0;
    state.result = { kind: kind, delta: delta, text: notes.join(" · ") };
    state.msg = notes.join(" · ") +
      (delta > 0 ? " · +$" + delta : delta < 0 ? " · −$" + (-delta) : " · bet again.");
    if (state.bank < MIN_BET) state.msg += " Out of chips — buy in $100.";
    savePersist(state);
    return state;
  }

  /**
   * Demo-only: force a 5-card player fan so screenshots prove layout.
   * Not used in real play.
   */
  function demoFiveCard(state) {
    state.bank = Math.max(state.bank, 20);
    state.bet = 5;
    state.bank -= 5;
    state.dealer = [
      { rank: "K", suit: "♠" },
      { rank: "7", suit: "♦" }
    ];
    state.hideHole = true;
    state.hands = [{
      cards: [
        { rank: "A", suit: "♥" },
        { rank: "2", suit: "♣" },
        { rank: "3", suit: "♦" },
        { rank: "4", suit: "♠" },
        { rank: "5", suit: "♥" }
      ],
      bet: 5,
      stood: false,
      doubled: false
    }];
    state.active = 0;
    state.phase = "player";
    state.msg = "Demo 5-card fan (soft 15).";
    return state;
  }

  /**
   * Test-only: put an exact shoe on top so a script can prove split, double or
   * insurance with known cards. cards[0] is the next draw. Not used in play.
   */
  function stack(state, cards) {
    state.shoe = cards.slice().reverse().map(function (c) {
      return { rank: c.rank, suit: c.suit };
    });
    state.stacked = true;
    return state;
  }

  global.BJ = {
    START_BANK: START_BANK,
    MIN_BET: MIN_BET,
    freshState: freshState,
    resetAll: resetAll,
    score: score,
    deal: deal,
    hit: hit,
    stand: stand,
    doubleDown: doubleDown,
    split: split,
    beginDealer: beginDealer,
    dealerStep: dealerStep,
    finishDealer: finishDealer,
    dealerPlay: dealerPlay,
    stack: stack,
    canHit: canHit,
    canStand: canStand,
    canDouble: canDouble,
    canSplit: canSplit,
    canInsurance: canInsurance,
    buyInsurance: buyInsurance,
    demoFiveCard: demoFiveCard,
  };
})(window);
