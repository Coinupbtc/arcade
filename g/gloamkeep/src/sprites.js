/* GLOAMKEEP — hand-authored pixel sprites, baked once with a 1px rim. */
window.GK = window.GK || {};

(function () {
  const P = GK.CFG.PAL;

  // towers are 18x28 = 1.75 tiles tall and wider than a tile: they loom over the causeway
  const SPRITES = {
    lantern: {
      pal: { d:P.iron, s:P.stone, S:P.stoneLit, L:P.ember, C:P.flame },
      rows: [
        '..................',
        '........dd........',
        '.......dLLd.......',
        '.......dLCd.......',
        '.......dLLd.......',
        '........dd........',
        '........dd........',
        '........dd........',
        '........dd........',
        '........dd........',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '......sSSSSs......',
        '......sSSSSs......',
        '.....sSSSSSSs.....',
        '.....sSSSSSSs.....',
        '....sSSSSSSSSs....',
        '....sSSSSSSSSs....',
        '...sSSSSSSSSSSs...',
        '...sSSSSSSSSSSs...',
        '..sSSSSSSSSSSSSs..',
        '..ssssssssssssss..',
        '..................',
        '..................'
      ]
    },
    brazier: {
      pal: { d:P.iron, s:P.stone, S:P.stoneLit, f:P.fire, F:P.ember, C:P.flame },
      rows: [
        '..................',
        '..................',
        '..................',
        '..................',
        '..................',
        '..................',
        '..................',
        '..................',
        '....dddddddddd....',
        '...dSSSSSSSSSSd...',
        '...dSfFCCCCFfSd...',
        '...dSCCCCCCCCSd...',
        '...dSfFCCCCFfSd...',
        '...dSSSSSSSSSSd...',
        '....dSSSSSSSSd....',
        '....dddddddddd....',
        '.....sSSSSSSs.....',
        '.....sSSSSSSs.....',
        '.....sSSSSSSs.....',
        '....sSSSSSSSSs....',
        '....sSSSSSSSSs....',
        '...sSSSSSSSSSSs...',
        '...ssssssssssss...',
        '..................',
        '..................',
        '..................',
        '..................',
        '..................'
      ]
    },
    chill: {
      pal: { s:P.stone, S:P.stoneLit, c:P.frost, C:P.frostLit },
      rows: [
        '..................',
        '........c.........',
        '.......cCc........',
        '......cCCCc.......',
        '......cCCCc.......',
        '.....cCCCCCc......',
        '.....cCCCCCc......',
        '.....cCCCCCc......',
        '.....cCCCCCc......',
        '......cCCCc.......',
        '.......cCc........',
        '........c.........',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '......sSSSSs......',
        '......sSSSSs......',
        '.....sSSSSSSs.....',
        '.....sSSSSSSs.....',
        '....sSSSSSSSSs....',
        '....sSSSSSSSSs....',
        '...sSSSSSSSSSSs...',
        '...sSSSSSSSSSSs...',
        '..sSSSSSSSSSSSSs..',
        '..ssssssssssssss..',
        '..................',
        '..................'
      ]
    },
    arc: {
      pal: { s:P.stone, S:P.stoneLit, p:P.arc, P:P.arcLit },
      rows: [
        '..................',
        '.......pPPp.......',
        '......pPPPPp......',
        '.......pPPp.......',
        '........PP........',
        '........PP........',
        '.......pPPp.......',
        '......pPPPPp......',
        '.......pPPp.......',
        '........PP........',
        '........PP........',
        '.......sSSs.......',
        '.......sSSs.......',
        '.......sSSs.......',
        '......sSSSSs......',
        '......sSSSSs......',
        '.....sSSSSSSs.....',
        '.....sSSSSSSs.....',
        '....sSSSSSSSSs....',
        '....sSSSSSSSSs....',
        '...sSSSSSSSSSSs...',
        '...sSSSSSSSSSSs...',
        '..sSSSSSSSSSSSSs..',
        '..sSSSSSSSSSSSSs..',
        '..ssssssssssssss..',
        '..................',
        '..................',
        '..................'
      ]
    },
    wisp: {
      rim: '#d9c0ff',
      pal: { w:P.shade, W:P.shadeLit, C:P.gold },
      rows: [
        '............',
        '............',
        '.....ww.....',
        '....wWWw....',
        '...wWCCWw...',
        '...wWCCWw...',
        '....wWWw....',
        '.....ww.....',
        '....w..w....',
        '............',
        '............',
        '............'
      ]
    },
    hound: {
      rim: '#dcdcf8',
      pal: { h:P.foe, H:P.foeLit, e:P.eye },
      rows: [
        '..............',
        '..h........h..',
        '..hh......hh..',
        '...hhhhhhhh...',
        '..hHHHHHHHHh..',
        '..hHeHHHHeHh..',
        '..hHHHHHHHHh..',
        '...hHHHHHHh...',
        '...h.hhhh.h...',
        '...hh....hh...',
        '..............',
        '..............'
      ]
    },
    husk: {
      rim: '#dcdcf8',
      pal: { h:P.foe, H:P.foeLit, e:P.eye },
      rows: [
        '............',
        '...hhhhhh...',
        '..hHHHHHHh..',
        '..hHeHHeHh..',
        '..hHHHHHHh..',
        '..hHhHHhHh..',
        '...hhhhhh...',
        '..h.hHHh.h..',
        '..h.hHHh.h..',
        '...h.hh.h...',
        '...hh..hh...',
        '............'
      ]
    },
    knight: {
      rim: '#dcdcf8',
      pal: { h:P.foe, H:P.foeLit, e:P.eye },
      rows: [
        '............',
        '....hhhh....',
        '...hHHHHh...',
        '..hHHHHHHh..',
        '..hHeHHeHh..',
        '..hHHHHHHh..',
        '..hHHHHHHh..',
        '..hHHHHHHh..',
        '..hhHHHHhh..',
        '...hHHHHh...',
        '...h.hh.h...',
        '...hh..hh...',
        '............',
        '............'
      ]
    },
    shade: {
      rim: '#d9c0ff',
      pal: { w:P.shade, W:P.shadeLit },
      rows: [
        '............',
        '..w......w..',
        '..ww....ww..',
        '...wwWWww...',
        '....wWWw....',
        '....wWWw....',
        '...wwWWww...',
        '..ww.w..ww..',
        '.....w.w....',
        '............',
        '............',
        '............'
      ]
    },
    gloamling: {
      rim: '#d9c0ff',
      pal: { w:P.shade, W:P.shadeLit, C:P.gold },
      rows: [
        '............',
        '...wwww.....',
        '..wWWWWw....',
        '.wWWCCWWw...',
        '.wWCCCCWw...',
        '.wWWCCWWw...',
        '..wWWWWw....',
        '...wwww.....',
        '............',
        '............',
        '............',
        '............'
      ]
    },
    brute: {
      rim: '#dcdcf8',
      pal: { h:P.foe, H:P.foeLit, e:P.eye },
      rows: [
        '..............',
        '....hhhhhh....',
        '...hHHHHHHh...',
        '..hHHHHHHHHh..',
        '..hHeHHHHeHh..',
        '..hHHHHHHHHh..',
        '..hHHhhhHHHh..',
        '...hHHHHHHh...',
        '..hh.hHHh.hh..',
        '..hh.hHHh.hh..',
        '..hh.hHHh.hh..',
        '...h.hhhh.h...',
        '...hh....hh...',
        '..............'
      ]
    },
    boss: {
      rim: '#e8d6ff',
      pal: { h:P.foe, H:P.foeLit, e:P.eye, y:P.gold, Y:P.goldLit },
      rows: [
        '..................',
        '....y...y...y.....',
        '...yYY.yYY.yYY....',
        '....hhhhhhhhhh....',
        '...hHHHHHHHHHHh...',
        '..hHHeHHHHHHeHHh..',
        '..hHHHHHHHHHHHHh..',
        '..hHHHHHHHHHHHHh..',
        '..hHHHhhhhhhHHHh..',
        '..hHHHHHHHHHHHHh..',
        '...hHHHHHHHHHHh...',
        '..hhh.hHHHH.hhhh..',
        '..hhh.hHHHH.hhhh..',
        '..hhh.hHHHH.hhhh..',
        '..hhh.hHHHH.hhhh..',
        '...hh.hhhhh.hhh...',
        '...hh.......hh....',
        '..................',
        '..................',
        '..................'
      ]
    },
    tree: {
      pal: { g:P.moss, G:P.mossLit },
      rows: [
        '.....g......',
        '....gGg.....',
        '...gGGGg....',
        '....gGg.....',
        '....gGg.....',
        '...gGGGg....',
        '....gGg.....',
        '....gGg.....',
        '....gGg.....',
        '...ggGgg....',
        '....gGg.....',
        '.....g......',
        '............',
        '............',
        '............',
        '............'
      ]
    },
    rock: {
      pal: { r:P.stoneDark, R:P.stone },
      rows: [
        '........',
        '...rr...',
        '..rRRr..',
        '.rRRRRr.',
        '.rRRRRr.',
        '..rrrr..',
        '........',
        '........'
      ]
    },
    reed: {
      pal: { g:P.moss, G:P.mossLit },
      rows: [
        '...g....',
        '..gGg...',
        '..gGg...',
        '.gGGGg..',
        '..gGg...',
        '..gGg...',
        '...g....',
        '...g....',
        '...g....',
        '...g....',
        '........',
        '........'
      ]
    },
    menhir: {
      pal: { s:P.stoneDark, S:P.stoneLit },
      rows: [
        '..ssss..',
        '..sSSs..',
        '..sSSs..',
        '..sSSs..',
        '..sSSs..',
        '..sSSs..',
        '..sSSs..',
        '..ssss..',
        '..sSSs..',
        '..sSSs..',
        '..sSSs..',
        '..ssss..',
        '..sSSs..',
        '..ssss..',
        '........',
        '........'
      ]
    },
    flame: {
      pal: { f:P.fire, F:P.ember, C:P.flame },
      rows: [
        '..f..',
        '.fFf.',
        '.fCf.',
        'fCCCf',
        '.fCf.',
        '..f..'
      ]
    }
  };

  const baked = {};

  function bake(rows, pal, white, rim) {
    const h = rows.length;
    const w = Math.max(...rows.map(r => r.length));
    const cv = document.createElement('canvas');
    cv.width = w + 2; cv.height = h + 2;
    const c = cv.getContext('2d');
    const filled = [];
    const set = new Set();
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (!ch || ch === '.' || !pal[ch]) continue;
        filled.push([x, y, pal[ch]]);
        set.add(x + ',' + y);
      }
    }
    // 1px dark rim so every sprite reads on the dark moor
    c.fillStyle = rim || '#05070b';
    for (const [x, y] of filled) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!set.has((x + dx) + ',' + (y + dy))) c.fillRect(x + dx + 1, y + dy + 1, 1, 1);
      }
    }
    for (const [x, y, col] of filled) {
      c.fillStyle = white ? '#ffffff' : col;
      c.fillRect(x + 1, y + 1, 1, 1);
    }
    return { cv, w, h };
  }

  GK.Spr = {
    get(name) { return baked[name]; },
    init() {
      for (const k in SPRITES) {
        const s = SPRITES[k];
        baked[k] = bake(s.rows, s.pal, false, s.rim);
        baked[k].white = bake(s.rows, s.pal, true, s.rim);
      }
    },
    draw(ctx, name, x, y, opt) {
      const s = baked[name];
      if (!s) return;
      const o = opt || {};
      const sc = o.scale || 1;
      const dx = Math.round(x - s.w * sc / 2) - sc;
      const dy = Math.round(y - s.h * sc / 2) - sc;
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.drawImage(s.cv, dx, dy, (s.w + 2) * sc, (s.h + 2) * sc);
      if (o.flash > 0) {
        ctx.globalAlpha = Math.min(0.9, o.flash);
        ctx.drawImage(s.white.cv, dx, dy, (s.w + 2) * sc, (s.h + 2) * sc);
      }
      ctx.restore();
    },
    drawBottom(ctx, name, x, yBottom, opt) {
      const s = baked[name];
      if (!s) return;
      const o = opt || {};
      const sc = o.scale || 1;
      const dx = Math.round(x - s.w * sc / 2) - sc;
      const dy = Math.round(yBottom - s.h * sc) - sc;
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.drawImage(s.cv, dx, dy, (s.w + 2) * sc, (s.h + 2) * sc);
      if (o.flash > 0) {
        ctx.globalAlpha = Math.min(0.9, o.flash);
        ctx.drawImage(s.white.cv, dx, dy, (s.w + 2) * sc, (s.h + 2) * sc);
      }
      ctx.restore();
    }
  };
})();
