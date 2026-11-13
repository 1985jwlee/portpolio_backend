(function(){
  var root=document.documentElement;
  /* 테마: 저장값 → 시스템 설정 순. 구현에서는 서버가 <html data-theme> 를 쓴다(07 §4.1). */
  function applyTheme(t){root.setAttribute('data-theme',t);try{localStorage.setItem('theme',t)}catch(e){}
    document.querySelectorAll('[data-theme-toggle]').forEach(function(b){b.setAttribute('aria-pressed',String(t==='dark'));
      b.setAttribute('aria-label',t==='dark'?'라이트 테마로 전환':'다크 테마로 전환');
      b.innerHTML='<svg class="node" aria-hidden="true"><use href="#'+(t==='dark'?'i-sun':'i-moon')+'"/></svg>';});}
  var saved=null;try{saved=localStorage.getItem('theme')}catch(e){}
  applyTheme(saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-theme-toggle]');if(t){applyTheme(root.getAttribute('data-theme')==='dark'?'light':'dark');}
    var m=e.target.closest('[data-menu]');if(m){var nav=document.getElementById('mobile-nav');var open=nav.getAttribute('data-open')==='true';nav.setAttribute('data-open',String(!open));m.setAttribute('aria-expanded',String(!open));}
    var l=e.target.closest('[data-lang]');if(l){document.querySelectorAll('[data-lang]').forEach(function(x){x.setAttribute('aria-pressed',String(x===l))});}
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){var nav=document.getElementById('mobile-nav');if(nav&&nav.getAttribute('data-open')==='true'){nav.setAttribute('data-open','false');var b=document.querySelector('[data-menu]');if(b){b.setAttribute('aria-expanded','false');b.focus();}}}});

  /* 토스트: role=status 영역에 쌓고 6초 뒤 제거 */
  window.mock=window.mock||{};
  mock.toast=function(msg,kind){
    var box=document.getElementById('toasts');if(!box)return;
    var sym={ok:['n-done','node-done'],warn:['n-warn','node-warn'],err:['n-error','node-error'],info:['n-active','node-active']}[kind||'ok'];
    var d=document.createElement('div');d.className='toast';
    d.innerHTML='<svg class="node '+sym[1]+'" aria-hidden="true"><use href="#'+sym[0]+'"/></svg><div>'+msg+'</div>';
    box.appendChild(d);setTimeout(function(){d.remove()},6000);
  };

  /* 연결 상태(07 §7.3) — 배지는 항상, 배너는 이상 상태에서만 */
  var CONN={
    connected:{sym:'n-done',cls:'node-done',label:'연결됨',banner:null},
    connecting:{sym:'n-active',cls:'node-active',label:'연결 중…',banner:null},
    unstable:{sym:'n-active',cls:'node-warn',label:'불안정',banner:{role:'status',text:'연결이 불안정합니다. 새 글이 늦게 보일 수 있어요. 글 읽기와 쓰기는 계속 쓸 수 있습니다.'}},
    backoff:{sym:'n-warn',cls:'node-warn',label:'재연결 대기 8초',banner:{role:'status',text:'실시간 갱신이 멈췄습니다. 8초 뒤 다시 연결합니다.',action:'지금 다시 연결'}},
    idle:{sym:'n-pending',cls:'node-pending',label:'일시 중지',banner:{role:'status',text:'이 탭이 오래 숨겨져 실시간 연결을 잠시 닫았습니다. 탭으로 돌아오면 자동으로 다시 연결합니다.'}},
    stopped4409:{sym:'n-pending',cls:'node-pending',label:'다른 탭에서 열림',banner:{role:'status',text:'사이트가 다른 탭에서 열려 있어 이 탭의 실시간 갱신은 멈췄습니다.'}},
    stopped4400:{sym:'n-error',cls:'node-error',label:'실시간 비활성',banner:{role:'alert',text:'실시간 연결을 시작하지 못했습니다. 페이지를 새로고침해 주세요.',action:'새로고침'}},
    offline:{sym:'n-error',cls:'node-error',label:'오프라인',banner:{role:'status',text:'인터넷에 연결되어 있지 않습니다. 연결되면 자동으로 다시 시도합니다.'}}
  };
  mock.setConn=function(k){
    var s=CONN[k];if(!s)return;
    document.querySelectorAll('[data-conn-badge]').forEach(function(b){
      b.innerHTML='<svg class="node '+s.cls+'" aria-hidden="true"><use href="#'+s.sym+'"/></svg><span>'+s.label+'</span>';});
    var bn=document.getElementById('conn-banner');if(!bn)return;
    if(!s.banner){bn.hidden=true;bn.innerHTML='';return;}
    bn.hidden=false;bn.setAttribute('role',s.banner.role);
    bn.innerHTML='<svg class="node '+s.cls+'" aria-hidden="true"><use href="#'+s.sym+'"/></svg><div>'+s.banner.text+'</div>'+(s.banner.action?'<button class="btn btn-secondary" style="margin-left:auto" type="button">'+s.banner.action+'</button>':'');
  };
  document.addEventListener('DOMContentLoaded',function(){
    var sel=document.getElementById('conn-select');
    if(sel){sel.addEventListener('change',function(){mock.setConn(sel.value)});mock.setConn(sel.value);}
    else if(document.querySelector('[data-conn-badge]')){mock.setConn('connected');}
    document.querySelectorAll('[data-toast]').forEach(function(b){b.addEventListener('click',function(){mock.toast(b.getAttribute('data-toast'),b.getAttribute('data-kind')||'ok')})});
  });
})();
