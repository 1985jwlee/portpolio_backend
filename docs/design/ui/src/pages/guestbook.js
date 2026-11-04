(function(){
  var list=document.getElementById('list');
  var SEED=[
    {id:'e1',name:'손님-a3f9',time:'3분 전',body:'구조 설명이 읽기 편했어요. outbox 흐름을 직접 눌러볼 수 있다는 게 좋네요.',r:{'👍':3,'❤️':1,'🎉':0,'😂':0,'🤔':0,'👀':0},mine:[]},
    {id:'e2',name:'예시 사용자',time:'1시간 전',body:'WebSocket이 끊겼다 붙을 때 놓친 글이 채워지는지 한 번 더 확인해 볼게요.',r:{'👍':1,'❤️':0,'🎉':0,'😂':0,'🤔':2,'👀':1},mine:['🤔'],own:true},
    {id:'e3',name:'손님-7c21',time:'어제',body:'첫 글 남겨요.',r:{'👍':0,'❤️':0,'🎉':1,'😂':0,'🤔':0,'👀':0},mine:[]}
  ];
  var NAMES={'👍':'좋아요','❤️':'하트','🎉':'축하','😂':'웃겨요','🤔':'고민돼요','👀':'지켜봐요'};
  function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function reactions(e){return Object.keys(NAMES).map(function(k){var on=e.mine.indexOf(k)>-1;return '<button class="react" type="button" aria-pressed="'+on+'" aria-label="'+NAMES[k]+' '+e.r[k]+'개" data-emoji="'+k+'"><span aria-hidden="true">'+k+'</span><span class="n">'+(e.r[k]||'')+'</span></button>'}).join('')}
  function card(e,isNew){
    return '<article class="card entry'+(isNew?' is-new':'')+'" data-id="'+e.id+'" aria-labelledby="'+e.id+'-n">'+
      '<div class="entry-meta"><span class="entry-name" id="'+e.id+'-n">'+esc(e.name)+'</span>'+(e.own?'<span class="badge badge-info">내 글</span>':'')+'<time class="xs subtle">'+e.time+'</time>'+
      (e.own?'<div class="entry-actions"><button class="btn btn-ghost" type="button" data-edit>수정</button><button class="btn btn-ghost" type="button" data-del>삭제</button></div>':'')+'</div>'+
      '<p class="entry-body">'+esc(e.body)+'</p>'+
      '<div class="entry-foot"><div class="reactions" role="group" aria-label="반응">'+reactions(e)+'</div><button class="link-btn" type="button" data-report>신고</button></div></article>';
  }
  function render(state){
    list.setAttribute('aria-busy',String(state==='loading'));
    if(state==='loading'){list.innerHTML=[1,2,3].map(function(){return '<div class="card entry" aria-hidden="true"><div class="skeleton" style="width:30%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:70%"></div></div>'}).join('')+'<p class="sr-only" role="status">글을 불러오는 중입니다</p>';return;}
    if(state==='empty'){list.innerHTML='<div class="card empty"><svg class="node node-pending" style="width:2rem;height:2rem" aria-hidden="true"><use href="#n-pending"/></svg><h3>아직 글이 없습니다</h3><p class="muted small">첫 글을 남기면 이 목록의 맨 위에 나타납니다.</p><button class="btn btn-primary" type="button" data-focus-compose>글 남기기</button></div>';return;}
    if(state==='error'){list.innerHTML='<div class="card empty" role="alert"><svg class="node node-error" style="width:2rem;height:2rem" aria-hidden="true"><use href="#n-error"/></svg><h3>글 목록을 불러오지 못했습니다</h3><p class="muted small">잠시 뒤에 다시 시도해 주세요. 이미 쓴 글은 사라지지 않았어요.</p><button class="btn btn-secondary" type="button" data-retry>다시 불러오기</button></div>';return;}
    list.innerHTML=SEED.map(function(e){return card(e)}).join('');
  }
  render('ok');
  document.getElementById('list-select').addEventListener('change',function(){render(this.value)});

  /* 입력·검증·제출(낙관 반영) */
  var body=document.getElementById('body'),counter=document.getElementById('counter'),err=document.getElementById('body-err'),sub=document.getElementById('submit');
  function len(){return Array.from(body.value.trim()).length}
  body.addEventListener('input',function(){var n=len();counter.textContent=n+'/500';counter.setAttribute('data-near',String(n>=450));
    if(n===450||n===500)document.getElementById('live-new').textContent='글자 수 '+n+'자, 한도 500자';
    if(n>0&&!err.hidden){err.hidden=true;body.removeAttribute('aria-invalid')}});
  document.getElementById('compose').addEventListener('submit',function(ev){
    ev.preventDefault();var n=len();
    if(n===0||n>500){err.hidden=false;err.querySelector('span').textContent=n===0?'내용을 입력해 주세요.':'500자를 넘었어요. '+(n-500)+'자를 줄여 주세요.';body.setAttribute('aria-invalid','true');body.focus();return;}
    sub.setAttribute('aria-busy','true');sub.setAttribute('aria-disabled','true');sub.textContent='남기는 중…';
    setTimeout(function(){
      sub.removeAttribute('aria-busy');sub.removeAttribute('aria-disabled');sub.textContent='남기기';
      var nm=document.getElementById('name').value.trim()||'손님-'+Math.random().toString(16).slice(2,6);
      var e={id:'n'+Date.now(),name:nm,time:'방금',body:body.value.trim(),r:{'👍':0,'❤️':0,'🎉':0,'😂':0,'🤔':0,'👀':0},mine:[]};
      if(document.getElementById('list-select').value!=='ok'){document.getElementById('list-select').value='ok';list.innerHTML='';}
      list.insertAdjacentHTML('afterbegin',card(e,true));body.value='';counter.textContent='0/500';
      mock.toast('글을 남겼습니다. 흐름 화면에서 단계를 볼 수 있어요.','ok');
      document.getElementById('live-new').textContent='새 글 1개가 추가되었습니다';
    },900);
  });

  /* 위임 이벤트: 반응·신고·수정·삭제 */
  var conflictShown=false;
  document.addEventListener('click',function(ev){
    var t=ev.target.closest('button');if(!t)return;
    if(t.classList.contains('react')){var on=t.getAttribute('aria-pressed')==='true';t.setAttribute('aria-pressed',String(!on));var n=t.querySelector('.n');var v=(parseInt(n.textContent||'0',10)||0)+(on?-1:1);n.textContent=v>0?v:'';t.setAttribute('aria-label',NAMES[t.dataset.emoji]+' '+v+'개');return;}
    if(t.hasAttribute('data-report')){window._rb=t;var d=document.getElementById('report-dlg');d.showModal();return;}
    if(t.hasAttribute('data-focus-compose')){document.getElementById('body').focus();return;}
    if(t.hasAttribute('data-retry')){document.getElementById('list-select').value='ok';render('ok');return;}
    if(t.hasAttribute('data-del')){if(confirm('이 글을 삭제할까요? 삭제하면 되돌릴 수 없습니다.')){var c=t.closest('.entry');c.remove();mock.toast('글을 삭제했습니다.','ok');}return;}
    if(t.hasAttribute('data-edit')){
      var c=t.closest('.entry'),p=c.querySelector('.entry-body'),old=p.textContent;
      p.outerHTML='<div class="field edit" data-old="'+esc(old)+'"><label class="sr-only" for="ed">글 내용 수정</label><textarea class="textarea" id="ed">'+esc(old)+'</textarea><div class="row"><button class="btn btn-primary" type="button" data-save>저장</button><button class="btn btn-ghost" type="button" data-cancel>취소</button></div><div class="notice" role="alert" hidden><svg class="node node-warn" aria-hidden="true"><use href="#n-warn"/></svg><div>다른 곳에서 먼저 수정되어 최신 내용으로 바꿨어요. 확인하고 다시 저장해 주세요.</div></div></div>';
      c.querySelector('#ed').focus();return;}
    if(t.hasAttribute('data-cancel')){var f=t.closest('.edit');f.outerHTML='<p class="entry-body">'+f.dataset.old+'</p>';return;}
    if(t.hasAttribute('data-save')){var f=t.closest('.edit');
      if(!conflictShown){conflictShown=true;f.querySelector('.notice').hidden=false;f.querySelector('textarea').value=f.dataset.old+' (최신)';return;}
      var txt=f.querySelector('textarea').value;f.outerHTML='<p class="entry-body">'+esc(txt)+'</p>';mock.toast('글을 수정했습니다.','ok');}
  });
  document.getElementById('report-form').addEventListener('submit',function(e){var v=e.submitter&&e.submitter.value;if(v==='ok'){mock.toast('신고를 접수했습니다. 관리자가 확인합니다.','ok');if(window._rb){window._rb.textContent='신고함';window._rb.setAttribute('aria-disabled','true');window._rb.style.pointerEvents='none';window._rb.style.color='var(--color-subtle)';}}});
})();
