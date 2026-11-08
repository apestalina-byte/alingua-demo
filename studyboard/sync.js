/* StudyBoard Cloud: opt-in browser-to-server synchronization. */
(()=>{'use strict';
const CONFIG_KEY='studyboard.sync.config.v1';
const BASE_KEY='studyboard.sync.base.v1';
const RECOVERY_KEY='studyboard.sync.recovery.v1';

function create({getData,setData,normalize,showToast,downloadFile,today}){
  const $=id=>document.getElementById(id);
  let config=null, busy=false, pending=false, timer=null;
  try{
    const x=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');
    if(x&&typeof x.apiUrl==='string'&&typeof x.token==='string')config=x;
  }catch{}
  const snapshot=v=>JSON.stringify({subjects:v.subjects,tasks:v.tasks});
  const current=()=>normalize(getData());
  const readBase=()=>{
    try{const x=localStorage.getItem(BASE_KEY);return x?normalize(JSON.parse(x)):null}catch{return null}
  };
  function updateUI(title,detail,state='local'){
    if($('syncStatusTitle'))$('syncStatusTitle').textContent=title;
    if($('syncStatusDetail'))$('syncStatusDetail').textContent=detail;
    if($('syncStatusDot'))$('syncStatusDot').dataset.state=state;
    if($('syncIndicator'))$('syncIndicator').textContent=state==='online'?'В сети':state==='error'?'Ошибка':config?'Ожидает':'Локально';
    if($('syncPairForm'))$('syncPairForm').hidden=!!config;
    if($('syncConnectedActions'))$('syncConnectedActions').hidden=!config;
    if($('syncConnectedUrl'))$('syncConnectedUrl').textContent=config?'Сервер: '+config.apiUrl:'';
    if($('syncRecoveryBtn'))$('syncRecoveryBtn').hidden=!localStorage.getItem(RECOVERY_KEY);
  }
  function endpoint(value){
    const u=new URL(value.trim());
    const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
    if(u.protocol!=='https:'&&!(loopback&&u.protocol==='http:'))throw Error('Для сервера требуется HTTPS');
    if(u.username||u.password||u.search||u.hash)throw Error('Введи только адрес API-сервера');
    return u.origin+(u.pathname.endsWith('/')?u.pathname.slice(0,-1):u.pathname);
  }
  async function request(method,path,payload,token=config?.token){
    if(!config)throw Error('Подключение не настроено');
    const abort=new AbortController();
    const timeout=setTimeout(()=>abort.abort(),14000);
    try{
      const headers={'Accept':'application/json'};
      if(token)headers.Authorization='Bearer '+token;
      if(payload!==undefined)headers['Content-Type']='application/json';
      const r=await fetch(config.apiUrl+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),
        signal:abort.signal,cache:'no-store'});
      const value=await r.json().catch(()=>({}));
      if(!r.ok){
        const e=Error(r.status===401?'Ключ устройства отклонён сервером':r.status===409?'Конфликт версий':value.detail||'HTTP '+r.status);
        e.status=r.status;throw e;
      }
      return value;
    }finally{clearTimeout(timeout)}
  }
  function backup(local,remote){
    try{localStorage.setItem(RECOVERY_KEY,JSON.stringify({date:new Date().toISOString(),local,remote}))}
    catch{showToast('Память браузера заполнена — скачай резервную копию')}
    updateUI('Объединяем изменения','Локальная копия сохранена','pending');
  }
  function merge(remote,local,base){
    const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const subjects=new Map(remote.subjects.map(s=>[s.id,s]));
    for(const s of local.subjects)if(!subjects.has(s.id))subjects.set(s.id,s);
    const old=new Map((base?.tasks||[]).map(t=>[t.id,t]));
    const r=new Map(remote.tasks.map(t=>[t.id,t]));
    const l=new Map(local.tasks.map(t=>[t.id,t]));
    const tasks=[];
    for(const id of new Set([...r.keys(),...l.keys(),...old.keys()])){
      const a=r.get(id),b=l.get(id),prior=old.get(id);
      if(a&&b){
        let winner=a;
        if(prior&&eq(a,prior))winner=b;
        else if(prior&&eq(b,prior))winner=a;
        else if((b.updatedAt||b.createdAt||'')>(a.updatedAt||a.createdAt||''))winner=b;
        tasks.push(winner);
      }else if(a&&!b){
        if(!prior||!eq(a,prior))tasks.push(a);
      }else if(b&&!a){
        if(!prior||!eq(b,prior))tasks.push(b);
      }
    }
    for(const t of tasks){
      if(!subjects.has(t.subjectId)){
        const subject=[...remote.subjects,...local.subjects,...(base?.subjects||[])].find(s=>s.id===t.subjectId);
        if(subject)subjects.set(subject.id,subject);
      }
    }
    return normalize({subjects:[...subjects.values()],tasks});
  }
  function saved(snapshotValue,revision){
    localStorage.setItem(BASE_KEY,snapshot(snapshotValue));
    config.revision=revision;
    localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
    updateUI('Данные синхронизированы','Проверено в '+new Intl.DateTimeFormat('ru-RU',
      {hour:'2-digit',minute:'2-digit'}).format(new Date()),'online');
  }
  async function syncNow(manual=false){
    if(!config)return false;
    if(busy){pending=true;return false}
    busy=true;
    updateUI('Синхронизация…','Проверяем изменения','pending');
    let success=false;
    try{
      for(let i=0;i<3;i++){
        const response=await request('GET','/api/v1/snapshot');
        const remote=normalize(response);
        const local=current();
        const base=readBase();
        const localChanged=!base||snapshot(local)!==snapshot(base);
        const remoteChanged=!base||snapshot(remote)!==snapshot(base);
        let target;
        if(!localChanged)target=remote;
        else if(!remoteChanged)target=local;
        else if(!base&&!remote.tasks.length)target=local;
        else if(!base&&!local.tasks.length)target=remote;
        else{backup(local,remote);target=merge(remote,local,base)}
        if(snapshot(target)===snapshot(remote)){
          if(snapshot(current())===snapshot(local)){
            if(snapshot(remote)!==snapshot(local))setData(remote);
          }else pending=true;
          saved(remote,response.revision);success=true;break;
        }
        try{
          const result=await request('PUT','/api/v1/snapshot',{
            revision:response.revision,subjects:target.subjects,tasks:target.tasks
          });
          if(snapshot(current())===snapshot(local)){
            if(snapshot(target)!==snapshot(local))setData(target);
          }else pending=true;
          saved(target,result.revision);success=true;break;
        }catch(e){
          if(e.status===409&&i<2)continue;
          throw e;
        }
      }
      if(!success)throw Error('Конфликт не разрешён');
      if(manual)showToast('Синхронизация выполнена');
    }catch(e){
      const reason=e.name==='AbortError'?'Превышено время ожидания':e.message||'Сеть недоступна';
      updateUI('Нет синхронизации',reason+' · локальные задания сохранены','error');
      if(manual)showToast('Синхронизация: '+reason);
    }finally{
      busy=false;
      if(pending){pending=false;queue()}
    }
    return success;
  }
  function queue(){
    if(!config)return;
    clearTimeout(timer);
    timer=setTimeout(()=>syncNow(),1100);
  }
  async function connect(event){
    event.preventDefault();
    let apiUrl;
    try{apiUrl=endpoint($('syncServerUrl').value)}catch(e){showToast(e.message);return}
    const code=$('syncPairCode').value.trim();
    if(!code){showToast('Нужен одноразовый код из Telegram');return}
    const btn=$('syncConnectBtn');btn.disabled=true;
    updateUI('Подключаем…','Проверяем одноразовый код','pending');
    try{
      const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),14000);
      let res;
      try{res=await fetch(apiUrl+'/api/v1/pair',{method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({code}),cache:'no-store',signal:abort.signal})}
      finally{clearTimeout(timeout)}
      if(!res.ok)throw Error('Код истёк, неверен или сервер недоступен (HTTP '+res.status+')');
      const payload=await res.json();
      if(typeof payload.token!=='string'||payload.token.length<32)throw Error('Сервер не выдал ключ устройства');
      backup(current(),{subjects:[],tasks:[]});
      config={apiUrl,token:payload.token,revision:0};
      localStorage.setItem(CONFIG_KEY,JSON.stringify(config));
      localStorage.removeItem(BASE_KEY);
      $('syncPairCode').value='';
      updateUI('Подключено','Переносим задания','pending');
      await syncNow(true);
    }catch(e){
      updateUI('Подключение не удалось',e.message||'Сеть недоступна','error');
      showToast(e.message||'Ошибка подключения');
    }finally{btn.disabled=false}
  }
  function open(){
    $('sidebar').classList.remove('open');
    $('mobileBackdrop').classList.remove('visible');
    $('syncDialog').showModal();
    updateUI(config?'Подключено':'Только это устройство',
      config?'Можно синхронизировать задания':'Привязка через Telegram /connect',
      config?'online':'local');
  }
  async function disconnect(){
    if(!config)return;
    if(!confirm('Отключить синхронизацию на этом устройстве? Локальные задания сохранятся.'))return;
    const old=config;
    clearTimeout(timer);
    config=null;
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(BASE_KEY);
    updateUI('Только это устройство','Локальные задания сохранены','local');
    try{
      const result=await fetch(old.apiUrl+'/api/v1/revoke',{method:'POST',
        headers:{Authorization:'Bearer '+old.token},cache:'no-store'});
      showToast(result.ok?'Устройство отключено':'Отключено локально. Не удалось отозвать ключ на сервере.');
    }catch{showToast('Отключено локально. Для отзыва серверного ключа потребуется доступ к серверу.')}
  }
  function downloadRecovery(){
    const backup=localStorage.getItem(RECOVERY_KEY);
    if(backup)downloadFile('studyboard-recovery-'+today()+'.json','application/json;charset=utf-8',backup);
  }
  function init(){
    updateUI(config?'Подключено':'Только это устройство',
      config?'Проверка соединения':'Облачная синхронизация не подключена',
      config?'pending':'local');
    if(config)syncNow();
    setInterval(()=>{if(config&&document.visibilityState==='visible')syncNow()},60000);
    window.addEventListener('online',()=>{if(config)syncNow()});
    document.addEventListener('visibilitychange',()=>{
      if(config&&document.visibilityState==='visible')syncNow()
    });
  }
  return {init,queue,open,connect,syncNow,disconnect,downloadRecovery};
}
window.StudyBoardSync={create};
})();