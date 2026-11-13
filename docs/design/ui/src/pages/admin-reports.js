(function(){
  var DATA=[
    {id:'r1',reason:'스팸이나 광고',excerpt:'[예시] 지금 바로 방문하세요 http://… 이 문장은 신고 큐 목업용 가짜 발췌입니다.',at:'3분 전',status:'열림'},
    {id:'r2',reason:'욕설이나 괴롭힘',excerpt:'[예시] 신고 큐 목업용 가짜 발췌입니다. 본문은 80자까지만 보입니다.',at:'1시간 전',status:'열림'},
    {id:'r3',reason:'개인정보 노출',excerpt:'[예시] 신고 큐 목업용 가짜 발췌입니다.',at:'어제',status:'열림'}
  ];
  var rows=document.getElementById('rows'),cards=document.getElementById('cards'),empty=document.getElementById('empty');
  function actions(r){return '<div class="report-actions"><button class="btn btn-ghost" type="button" data-note="'+r.id+'">메모 보기</button><button class="btn btn-secondary" type="button" data-hide="'+r.id+'">숨김</button><button class="btn btn-ghost" type="button" data-dismiss="'+r.id+'">기각</button></div>'}
  function draw(list){
    document.getElementById('q-count').textContent=list.length;
    empty.hidden=list.length>0;document.getElementById('tbl-desk').style.visibility=list.length?'visible':'hidden';
    rows.innerHTML=list.map(function(r){return '<tr data-id="'+r.id+'"><td>'+r.reason+'</td><td class="excerpt">'+r.excerpt+'<div class="note-slot"></div></td><td class="muted">'+r.at+'</td><td><span class="badge badge-warn">'+r.status+'</span></td><td>'+actions(r)+'</td></tr>'}).join('');
    cards.innerHTML=list.map(function(r){return '<article class="card stack" style="--stack:.5rem" data-id="'+r.id+'"><div class="row" style="justify-content:space-between"><strong>'+r.reason+'</strong><span class="badge badge-warn">'+r.status+'</span></div><p class="small">'+r.excerpt+'</p><div class="note-slot"></div><div class="xs subtle">'+r.at+'</div>'+actions(r)+'</article>'}).join('');
  }
  draw(DATA);
  document.getElementById('adm-select').addEventListener('change',function(){var v=this.value;document.getElementById('forbidden').hidden=v!=='forbidden';document.getElementById('admin').hidden=v==='forbidden';if(v==='empty')draw([]);if(v==='ok')draw(DATA);});
  document.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
    var id=b.dataset.hide||b.dataset.dismiss||b.dataset.note;
    if(b.dataset.note){document.querySelectorAll('[data-id="'+id+'"] .note-slot').forEach(function(s){s.innerHTML='<div class="note-box">[예시 메모] 신고자가 남긴 메모가 여기에 복호화되어 보입니다. <span class="subtle">열람 기록이 남습니다.</span></div>'});mock.toast('메모를 열람했습니다. 열람 기록이 남았어요.','info');return;}
    if(b.dataset.hide||b.dataset.dismiss){document.querySelectorAll('[data-id="'+id+'"]').forEach(function(x){x.remove()});var left=document.querySelectorAll('#rows tr').length;document.getElementById('q-count').textContent=left;empty.hidden=left>0;mock.toast(b.dataset.hide?'글을 숨겼습니다.':'신고를 기각했습니다.','ok');}
  });
  /* 쓰기 잠금 스위치 */
  var sw=document.getElementById('lock-sw'),dlg=document.getElementById('lock-dlg');
  sw.addEventListener('click',function(){var on=sw.getAttribute('aria-checked')==='true';if(on){set(false);mock.toast('쓰기 잠금을 풀었습니다.','ok');}else{dlg.showModal();}});
  dlg.addEventListener('close',function(){if(dlg.returnValue==='ok'){set(true);mock.toast('쓰기를 잠갔습니다. 방문자에게 이유가 보입니다.','warn');}});
  function set(on){sw.setAttribute('aria-checked',String(on));document.getElementById('lock-state').textContent=on?'켜짐':'꺼짐';document.getElementById('lock-badge').hidden=!on;}
})();
