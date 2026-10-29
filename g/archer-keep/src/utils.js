// Archer.U — small utils + seeded RNG
Archer.U = (function(){
  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  // mulberry32
  function RNG(seed){
    let s = seed>>>0;
    return function(){
      s = (s + 0x6D2B79F5)|0;
      let t = Math.imul(s ^ (s>>>15), 1|s);
      t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t;
      return ((t ^ (t>>>14))>>>0)/4294967296;
    };
  }
  function dist(x1,y1,x2,y2){ const dx=x2-x1, dy=y2-y1; return Math.hypot(dx,dy); }
  function fmt0(v){ return Math.round(v).toString(); }
  function ease(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
  return { clamp, lerp, RNG, dist, fmt0, ease };
})();
