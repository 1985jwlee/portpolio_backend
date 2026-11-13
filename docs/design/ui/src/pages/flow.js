(function(){
  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rail=document.getElementById('rail'),items=[].slice.call(rail.children);
  var S={pending:['n-pending','node-pending','대기'],active:['n-active','node-active','진행 중'],done:['n-done','node-done','완료'],warn:['n-warn','node-warn','재시도'],error:['n-error','node-error','실패'],dead:['n-dead','node-dead','격리됨'],delay:['n-delay','node-warn','지연']};
  var running=false,seq=0,recent=[];
  function fmt(ms){var d=new Date(ms);function p(n,w){return String(n).padStart(w||2,'0')}return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())+'.'+p(d.getMilliseconds(),3)}
  function set(i,st,text,at){var li=items[i],s=S[st];li.setAttribute('data-state',st);li.querySelector('svg').setAttribute('class','node '+s[1]);li.querySelector('use').setAttribute('href','#'+s[0]);
    var el=li.querySelector('.step-state');el.textContent=text||s[2];el.style.color=st==='pending'?'':'var(--flow-'+(st==='delay'?'warn':st)+')';
    if(at)li.querySelector('.step-time').textContent=at;
    li.setAttribute('aria-label',li.querySelector('.step-name').textContent+': '+(text||s[2])+(at?', '+at:''));}
  function line(i,warn){items[i].setAttribute('data-line','full');if(warn)items[i].setAttribute('data-warn','1');}
  function reset(){items.forEach(function(li,i){set(i,'pending','대기','–');li.removeAttribute('data-line');li.removeAttribute('data-warn');});}
  function sleep(ms){return new Promise(function(r){setTimeout(r,reduced?0:ms)})}
  var summary=document.getElementById('track-summary'),tid=document.getElementById('trace-id'),total=document.getElementById('trace-total');
  function say(t){summary.textContent=t}

  async function run(scn){
    if(running)return;running=true;seq++;var id='0192f3c'+seq+'…';tid.textContent='trace · '+id;total.textContent='';reset();
    document.getElementById('send').setAttribute('aria-busy','true');
    var t0=Date.now();function at(){return fmt(Date.now())}
    function rel(){return '+'+(Date.now()-t0)+'ms'}
    var doneCount=0;
    say('글 작성 흐름을 시작했습니다.');
    for(var i=0;i<5;i++){
      set(i,'active','진행 중');await sleep(i===0?250:520);
      if(i===2&&(scn==='retry'||scn==='dead')){
        set(i,'warn','재시도 1회',at());say('dispatched 단계에서 일시 오류가 나서 다시 시도합니다.');await sleep(900);
        if(scn==='dead'){set(i,'warn','재시도 2회',at());await sleep(800);set(i,'error','실패',at());await sleep(900);set(i,'dead','격리됨',at());line(i-1,false);
          for(var j=i+1;j<5;j++){set(j,'pending','중단','–');}
          say('글 작성 흐름: 5단계 중 '+i+'단계 완료 후 dispatched에서 격리되었습니다. 재시도 한도를 넘었습니다.');total.textContent='격리됨 · 재시도 2회';finish('격리됨 (dispatched)');return;}
        set(i,'active','진행 중');await sleep(600);
      }
      if(i===4&&scn==='delay'){set(i,'delay','지연 · 응답 대기',at());say('processed 단계가 평소보다 오래 걸리고 있습니다. 서버에서 다시 조회합니다.');await sleep(2200);}
      set(i,'done',(scn==='retry'&&i===2)?'완료 · 재시도 1회':'완료',at());doneCount++;if(i>0)line(i-1,scn==='retry'&&i-1===2);
      say('글 작성 흐름: 5단계 중 '+doneCount+'단계 완료');
    }
    total.textContent='처리 완료 · '+rel();say('글 작성 흐름: 5단계 모두 완료되었습니다. '+rel());finish('처리 완료 '+rel());
    function finish(label){running=false;document.getElementById('send').removeAttribute('aria-busy');
      recent.unshift({id:id,label:label,at:fmt(Date.now())});recent=recent.slice(0,5);
      document.getElementById('recent').hidden=false;
      document.getElementById('recent-list').innerHTML=recent.map(function(r){return '<li><span class="mono xs subtle">'+r.at+'</span><span class="mono xs">'+r.id+'</span><span>'+r.label+'</span></li>'}).join('');
      mock.toast('글을 남겼습니다. 방명록에서도 볼 수 있어요.','ok');}
  }
  document.getElementById('send-form').addEventListener('submit',function(e){e.preventDefault();run(document.getElementById('scn').value)});

  /* 전체 요약 */
  var STEPS=[['written','글 저장','n-done',24],['outboxed','이벤트 기록','n-done',24],['dispatched','전달','n-done',24],['received','수신함 저장','n-done',24],['processed','처리 완료','n-done',23],['retried','재시도','n-warn',2],['failed','실패','n-error',0],['dead','격리됨','n-dead',0]];
  var CLS={'n-done':'node-done','n-warn':'node-warn','n-error':'node-error','n-dead':'node-dead'};
  var mul=1,bars=document.getElementById('bars'),tbl=document.getElementById('tbl');
  function draw(){
    var max=Math.max.apply(null,STEPS.map(function(s){return s[3]*mul}))||1;
    bars.innerHTML=STEPS.map(function(s){var n=s[3]*mul;return '<div class="bar-row" role="listitem"><span class="name mono"><svg class="node '+CLS[s[2]]+'" aria-hidden="true"><use href="#'+s[2]+'"/></svg>'+s[0]+'</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="--bar:var(--flow-step-'+s[0]+');width:'+(n/max*100)+'%"></div></div><span class="bar-num" aria-label="'+s[1]+' '+n+'건">'+n+'</span></div>'}).join('');
    tbl.querySelector('tbody').innerHTML=STEPS.map(function(s){return '<tr><td class="mono">'+s[0]+'</td><td>'+s[1]+'</td><td class="mono" style="text-align:right">'+(s[3]*mul)+'</td></tr>'}).join('');
  }
  draw();
  document.querySelectorAll('[data-win]').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('[data-win]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});mul=b.dataset.win==='1h'?12:1;draw();})});
  document.getElementById('table-toggle').addEventListener('click',function(){var on=this.getAttribute('aria-pressed')==='true';this.setAttribute('aria-pressed',String(!on));this.textContent=on?'표로 보기':'막대로 보기';bars.hidden=!on;tbl.hidden=on;});
})();
