/* BRIDGEWRIGHT — levels, themes, materials, vehicle ladder.
 * World units are pixels. y grows down. Every level is 1000x700 with water at waterY.
 */
(function (root) {
  'use strict';

  const THEMES = {
    sunset: {
      name: 'Sunset Canyon',
      sky: ['#7EC8F0', '#FFD9A0', '#FFE9C4'],
      sun: '#FFF0C0', sunX: 0.74, sunY: 0.20,
      far: '#B98A7A', mid: '#9A6A62', near: '#7A4E48',
      terrain: '#8C5A4A', terrainDark: '#5E3A30', top: '#7FA05A', topLight: '#A8C97A',
      water: '#4E7E9A', waterDeep: '#2E556E', waterLine: '#BFE4F2',
      accent: '#FFD166', prop: 'tree', weather: 'birds', fog: 'rgba(255,220,170,0.30)', outline: '#1E1E1E',
    },
    alpine: {
      name: 'Alpine Pass',
      sky: ['#8FB8DC', '#C8E2F4', '#EFF8FF'],
      sun: '#FFFFFF', sunX: 0.22, sunY: 0.16,
      far: '#8FA3B8', mid: '#6E8296', near: '#4E5A6A',
      terrain: '#5A6472', terrainDark: '#3A4250', top: '#E8F4FF', topLight: '#FFFFFF',
      water: '#5A8AB0', waterDeep: '#2E5470', waterLine: '#D8F0FF',
      accent: '#9FD8FF', prop: 'pine', weather: 'snow', fog: 'rgba(230,245,255,0.34)', outline: '#1E1E1E',
    },
    desert: {
      name: 'Rustic Barrens',
      sky: ['#F2B36A', '#F7D79A', '#FFF0CC'],
      sun: '#FFE7A8', sunX: 0.30, sunY: 0.24,
      far: '#C99A6A', mid: '#B07E52', near: '#8E5E3A',
      terrain: '#C97A3A', terrainDark: '#8A4E22', top: '#E0A15A', topLight: '#F2C07A',
      water: '#B08050', waterDeep: '#7A5230', waterLine: '#F2D6A8',
      accent: '#F2A65A', prop: 'cactus', weather: 'dust', fog: 'rgba(255,220,170,0.28)', outline: '#1E1E1E',
    },
    cyclades: {
      name: 'Serene Cyclades',
      sky: ['#B98AD8', '#E8C4F4', '#FBE6FF'],
      sun: '#FFF4D0', sunX: 0.80, sunY: 0.22,
      far: '#B8A6E8', mid: '#9A8AC8', near: '#7A6AA8',
      terrain: '#E8CFC0', terrainDark: '#B89A88', top: '#FFFFFF', topLight: '#FFFFFF',
      water: '#7FC8E8', waterDeep: '#3E88B0', waterLine: '#E8FBFF',
      accent: '#FF8FA0', prop: 'cypress', weather: 'gulls', fog: 'rgba(255,230,255,0.28)', outline: '#1E1E1E',
    },
    storm: {
      name: 'Storm Surge',
      sky: ['#46545F', '#6E7E8C', '#A8B8C4'],
      sun: '#C8D8E8', sunX: 0.18, sunY: 0.18,
      far: '#3E4A56', mid: '#2E3A44', near: '#22303A',
      terrain: '#5A5A62', terrainDark: '#3A3A42', top: '#6A7A6A', topLight: '#8A9A8A',
      water: '#3E6A80', waterDeep: '#22404E', waterLine: '#C8E4F2',
      accent: '#8FD8FF', prop: 'rock', weather: 'rain', fog: 'rgba(120,150,170,0.36)', outline: '#E8F4FF',
    },
    industrial: {
      name: 'Twisted Turnpike',
      sky: ['#7FB7B0', '#A8D0C8', '#D8F0E8'],
      sun: '#E8FFF4', sunX: 0.62, sunY: 0.18,
      far: '#6B7A6A', mid: '#55645A', near: '#3E4A42',
      terrain: '#6B5A5A', terrainDark: '#463A3A', top: '#8A9A8A', topLight: '#A8B8A8',
      water: '#5A8A8A', waterDeep: '#305050', waterLine: '#C8E8E0',
      accent: '#FFD166', prop: 'tower', weather: 'smoke', fog: 'rgba(180,220,210,0.30)', outline: '#1E1E1E',
    },
    night: {
      name: 'Lantern Narrows',
      sky: ['#10162A', '#1E2842', '#34405E'],
      sun: '#F2E8C8', sunX: 0.24, sunY: 0.16,
      far: '#232C44', mid: '#1A2236', near: '#121828',
      terrain: '#2A3040', terrainDark: '#181E2A', top: '#3A4A5A', topLight: '#4E6274',
      water: '#16283A', waterDeep: '#0C1824', waterLine: '#6FA8C8',
      accent: '#FFC46B', prop: 'lantern', weather: 'fireflies', fog: 'rgba(20,30,50,0.40)', outline: '#C8D4E4',
    },
    gold: {
      name: 'Goldspan',
      sky: ['#FFC98B', '#FFE6B8', '#FFF6DE'],
      sun: '#FFF4D0', sunX: 0.50, sunY: 0.14,
      far: '#C98B7A', mid: '#A76A63', near: '#7E4E46',
      terrain: '#8C5A4A', terrainDark: '#5E3A30', top: '#8FB06A', topLight: '#C0D89A',
      water: '#5A8EA8', waterDeep: '#2E556E', waterLine: '#E8F4FF',
      accent: '#FFD166', prop: 'tree', weather: 'birds', fog: 'rgba(255,230,180,0.30)', outline: '#1E1E1E',
    },
  };

  // stiffness = how little a pin yields (low = flexible, visible sag)
  // maxStretch = joint separation in px at which the beam snaps (strength)
  // mass = weight per px (heavy steel drags the bridge down)
  // v3 balance: road capacity is low, structure multiplies it. Support material strength sets how
  // much credit a brace earns, so a wood truss is not a free steel truss. Carbon is the strongest
  // per beam at the highest price; steel is the value pick.
  const MATS = {
    wood:   { key: 'wood',   label: 'WOOD',   cost: 0, mass: 0.0040, stiffness: 0.62, maxStretch: 4.0, strength: 55,  thick: 20, base: '#C98A4B', grain: '#8A5A2E', short: 'W' },
    steel:  { key: 'steel',  label: 'STEEL',  cost: 0, mass: 0.0080, stiffness: 0.95, maxStretch: 10.0, strength: 120, thick: 20, base: '#9FB3C8', grain: '#5E7488', short: 'S' },
    carbon: { key: 'carbon', label: 'CARBON', cost: 0, mass: 0.0120, stiffness: 0.98, maxStretch: 18.0, strength: 200, thick: 20, base: '#4E5C6A', grain: '#2A3440', short: 'C' },
  };

  // Tier order is the load ladder: every level sends these one at a time, lightest first.
  const VEHICLES = {
    walker: { key: 'walker', label: 'Walker',  tier: 0, mass: 5,   w: 18,  h: 36, speed: 2.3, weight: '80 kg', force: 0.0016, color: '#E86A5A', accent: '#FFD166' },
    bike:   { key: 'bike',   label: 'Cyclist', tier: 1, mass: 8,   w: 34,  h: 32, speed: 3.0, weight: '95 kg', force: 0.0018, color: '#3AA6B9', accent: '#FFE08A' },
    car:    { key: 'car',    label: 'Car',     tier: 2, mass: 16,  w: 58,  h: 26, speed: 3.4, weight: '1.4 t', force: 0.0022, color: '#E4572E', accent: '#FFE08A' },
    truck:  { key: 'truck',  label: 'Truck',   tier: 3, mass: 34,  w: 88,  h: 34, speed: 3.0, weight: '3.2 t', force: 0.0026, color: '#3D6FA8', accent: '#D8E8F4' },
    tanker: { key: 'tanker', label: 'Tanker',  tier: 4, mass: 60,  w: 104, h: 38, speed: 2.6, weight: '6.0 t', force: 0.0030, color: '#6B7A4A', accent: '#C8D8A0' },
    semi:   { key: 'semi',   label: 'Semi',    tier: 5, mass: 90, w: 126, h: 40, speed: 2.4, weight: '12 t',  force: 0.0034, color: '#8A3A3A', accent: '#F2C9A0' },
    lowboy: { key: 'lowboy', label: 'Lowboy',  tier: 6, mass: 140, w: 136, h: 42, speed: 2.2, weight: '20 t',  force: 0.0038, color: '#4A5A6A', accent: '#FFD166' },
    mega:   { key: 'mega',   label: 'Mega',    tier: 7, mass: 190, w: 146, h: 44, speed: 2.0, weight: '30 t',  force: 0.0042, color: '#2E2E36', accent: '#FF9F43' },
    colossus: { key: 'colossus', label: 'Colossus', tier: 8, mass: 260, w: 156, h: 46, speed: 1.8, weight: '40 t', force: 0.0046, color: '#3A2A2A', accent: '#FF6B6B' },
  };

  const LADDER = ['walker', 'bike', 'car', 'truck', 'tanker', 'semi', 'lowboy', 'mega', 'colossus'];

  const LEVELS = [
    {
      id: 'l1', name: 'First Crossing', theme: 'sunset', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 380, top: 360 }, right: { edge: 620, top: 360 }, piers: [],
      anchors: {
        left: [[372, 354], [372, 394], [330, 354], [330, 394]],
        right: [[628, 354], [628, 394], [670, 354], [670, 394]],
        piers: [],
      },
      
      goal: 4, gold: 8, par: 10,
      hint: 'Drag a bolt into empty space. Triangles are rigid; a flat chain sags.',
    },
    {
      id: 'l2', name: 'The Dip', theme: 'alpine', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 360, top: 340 }, right: { edge: 640, top: 420 }, piers: [],
      anchors: {
        left: [[352, 334], [352, 374], [310, 334], [310, 374]],
        right: [[648, 414], [648, 454], [690, 414], [690, 454]],
        piers: [],
      },
      
      goal: 5, gold: 8, par: 14,
      hint: 'A starter post holds 4 tiers here. Steel or carbon holds more.',
    },
    {
      id: 'l3', name: 'Long Span', theme: 'desert', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 320, top: 360 }, right: { edge: 680, top: 360 }, piers: [],
      anchors: {
        left: [[312, 354], [312, 394], [270, 354], [270, 394]],
        right: [[688, 354], [688, 394], [730, 354], [730, 394]],
        piers: [],
      },
      
      goal: 5, gold: 8, par: 15,
      hint: 'A flat deck fails heavy tiers. Fan mid-span joints to the banks.',
    },
    {
      id: 'l4', name: 'Highland Drop', theme: 'cyclades', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 300, top: 300 }, right: { edge: 700, top: 400 }, piers: [],
      anchors: {
        left: [[292, 294], [292, 334], [250, 294], [250, 334]],
        right: [[708, 394], [708, 434], [750, 394], [750, 434]],
        piers: [],
      },
      noUnderDeck: true,
      goal: 5, gold: 7, par: 16,
      hint: 'No under-deck. Build above: short pieces, top chord tied to both banks.',
    },
    {
      id: 'l5', name: 'Storm Surge', theme: 'storm', world: { w: 1000, h: 700, waterY: 500 },
      left: { edge: 280, top: 370 }, right: { edge: 720, top: 390 }, piers: [],
      anchors: {
        left: [[272, 364], [272, 404], [230, 364], [230, 404]],
        right: [[728, 384], [728, 424], [770, 384], [770, 424]],
        piers: [],
      },
      
      goal: 5, gold: 8, par: 18,
      hint: 'The ladder ends at 40 t. A truss above or below carries it.',
    },
    {
      id: 'l6', name: 'Switchback', theme: 'industrial', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 260, top: 280 }, right: { edge: 740, top: 400 }, piers: [],
      anchors: {
        left: [[252, 274], [252, 314], [210, 274], [210, 314]],
        right: [[748, 394], [748, 434], [790, 394], [790, 434]],
        piers: [],
      },
      noUnderDeck: true,
      goal: 4, gold: 7, par: 16,
      hint: 'Steep drop. Short deck pieces, build above, tie the top chord to both banks.',
    },
    {
      id: 'l7', name: 'Lantern Narrows', theme: 'night', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 240, top: 360 }, right: { edge: 760, top: 360 },
      piers: [{ x: 500, top: 358, w: 56 }],
      anchors: {
        left: [[232, 354], [232, 394], [190, 354], [190, 394]],
        right: [[768, 354], [768, 394], [810, 354], [810, 394]],
        piers: [[492, 384], [508, 384], [492, 424], [508, 424]],
      },
      maxBeam: 200,
      goal: 6, gold: 8, par: 22,
      hint: 'The pier splits the span. A starter post holds light rigs; the Colossus needs carbon.',
    },
    {
      id: 'l8', name: 'Goldspan Finale', theme: 'gold', world: { w: 1000, h: 700, waterY: 560 },
      left: { edge: 200, top: 350 }, right: { edge: 800, top: 350 },
      // Round 4: the piers sat at 400/600 and left three 200 px spans, so DECK + BRACE carried the
      // whole ladder with no design thought (measured 9/9, 17 beams). Moved to 300/700 the middle
      // span is 400 px: measured, the same two taps hold 3/9. A hand-built deep truss still holds
      // 7-9, which is what a finale should ask for.
      piers: [{ x: 300, top: 358, w: 56 }, { x: 700, top: 358, w: 56 }],
      anchors: {
        left: [[192, 344], [192, 384], [150, 344], [150, 384]],
        right: [[808, 344], [808, 384], [850, 344], [850, 384]],
        piers: [[292, 384], [308, 384], [692, 384], [708, 384], [292, 424], [308, 424], [692, 424], [708, 424]],
      },
      goal: 5, gold: 8, par: 24,
      hint: 'Two piers leave a 400px middle span. A starter post will not carry it: build deep.',
    },
  ];

  function roadAnchors(level) {
    const top = (arr) => arr.slice().sort((a, b) => a[1] - b[1])[0];
    return {
      left: top(level.anchors.left),
      right: top(level.anchors.right),
      piers: (level.anchors.piers || []).slice(),
    };
  }

  function roadY(level) {
    const a = roadAnchors(level);
    return (a.left[1] + a.right[1]) / 2;
  }

  const api = { THEMES, MATS, VEHICLES, LADDER, LEVELS, roadAnchors, roadY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BW_LEVELS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
