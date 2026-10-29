// Cache-bust guard: if the served BUILD_ID differs from the one this page was loaded with, reload once.
(function(){
  var seen = null;
  try { seen = localStorage.getItem('archer_build'); } catch(e) {}
  fetch('BUILD_ID', {cache:'no-store'}).then(function(r){ return r.text(); }).then(function(t){
    var id = (t||'').trim();
    if(!id) return;
    if(seen && seen !== id){
      try { localStorage.setItem('archer_build', id); } catch(e) {}
      location.reload();
      return;
    }
    try { localStorage.setItem('archer_build', id); } catch(e) {}
  }).catch(function(){});
})();
