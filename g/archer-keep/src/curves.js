// Archer.Curves — one new enemy type per wave + "new enemy" teaching banner (M2)
Archer.Curves = (function(){
  const C = () => Archer.CFG;
  // Intro order — used for the teaching banner: "NEW ENEMY: <name> — hint"
  const INTROS = [
    { round: 3,  key: 'screech', hint: 'Fast! Lead your shots further ahead.' },
    { round: 4,  key: 'gobArch', hint: 'Shoots from afar — kill it first.' },
    { round: 6,  key: 'brute',   hint: 'Armored! Use PIERCE arrows.' },
    { round: 8,  key: 'shaman',  hint: 'Magic caster — priority target.' },
    { round: 11, key: 'warg',    hint: 'Fast AND tough — try FROST.' },
    { round: 12, key: 'troll',   hint: 'Siege tank — burn it with FIRE.' },
    { round: 16, key: 'dragon',  hint: 'FLIES! Bomb its dive or lead the sky.' },
  ];
  function introFor(round){
    return INTROS.find(i => i.round === round) || null;
  }
  function nameOf(key){ const d = C().ENEMIES[key]; return d ? d.name : key; }
  return { introFor, nameOf };
})();
