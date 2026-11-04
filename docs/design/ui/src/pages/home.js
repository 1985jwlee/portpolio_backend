(function(){
  var rail=document.getElementById('hero-rail'),items=[].slice.call(rail.children);
  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var T={pending:['n-pending','node-pending',''],active:['n-active','node-active','진행 중'],done:['n-done','node-done','완료']};
  function set(li,st){var t=T[st];li.setAttribute('data-state',st);li.querySelector('svg').setAttribute('class','node '+t[1]);li.querySelector('use').setAttribute('href','#'+t[0]);li.querySelector('.step-state').textContent=t[2];li.querySelector('.step-state').style.color='var(--flow-'+(st==='active'?'active':st==='done'?'done':'pending')+')';}
  function reset(){items.forEach(function(li){set(li,'pending');li.setAttribute('data-line','')});}
  function allDone(){items.forEach(function(li,i){set(li,'done');li.setAttribute('data-line',i<items.length-1?'full':'')});}
  if(reduced){allDone();return;}
  var i=0;
  function tick(){
    if(i===0)reset();
    if(i<items.length){set(items[i],'active');if(i>0){set(items[i-1],'done');items[i-1].setAttribute('data-line','full');}i++;setTimeout(tick,820);}
    else{set(items[items.length-1],'done');setTimeout(function(){i=0;tick();},2600);}
  }
  tick();
})();
