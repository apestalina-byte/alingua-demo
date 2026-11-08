const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(){
  const store=new Map();
  const ui=new Map();
  const $=id=>{
    if(!ui.has(id))ui.set(id,{id,value:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{remove(){}},showModal(){}});
    return ui.get(id);
  };
  let data={subjects:[{id:'sub-a',name:'Физкультура',color:'#4f5bb5'}],
            tasks:[{id:'task-a',title:'Посещение №1',subjectId:'sub-a',type:'other',
              due:'2026-11-09',time:'',status:'todo',priority:'normal',notes:'',link:'',
              createdAt:'2026-11-01T12:00:00Z',completedAt:'',updatedAt:''}]};
  let remote={subjects:[],tasks:[]},revision=0;
  const calls=[];
  const fetch=async(url,opts={})=>{
    calls.push({url,method:opts.method});
    if(url.endsWith('/api/v1/pair'))
      return {ok:true,status:200,json:async()=>({token:'long-pairing-device-token-value-1234567891234'})};
    if(url.endsWith('/api/v1/snapshot')&&opts.method==='GET')
      return {ok:true,status:200,json:async()=>({revision,...remote})};
    if(url.endsWith('/api/v1/snapshot')&&opts.method==='PUT'){
      const parsed=JSON.parse(opts.body);
      if(parsed.revision!==revision)
        return {ok:false,status:409,json:async()=>({detail:'conflict'})};
      remote={subjects:parsed.subjects,tasks:parsed.tasks};
      revision++;
      return {ok:true,status:200,json:async()=>({revision})};
    }
    return {ok:true,status:200,json:async()=>({ok:true})};
  };
  const context={window:{},document:{getElementById:$},localStorage:{
    getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)
  },fetch,AbortController,URL,Intl,Date,setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync('studyboard/sync.js','utf8'),context);
  const client=context.window.StudyBoardSync.create({
    getData:()=>data,
    setData:newData=>{data=JSON.parse(JSON.stringify(newData))},
    normalize:x=>({subjects:x.subjects,tasks:x.tasks}),
    showToast:()=>{},
    downloadFile:()=>{},today:()=> '2026-11-08'
  });
  return {client,$,store,calls,remote:()=>remote,setRemote:r=>{remote=r;revision++},data:()=>data};
}

test('pairing preserves existing browser tasks and uploads snapshot',async()=>{
  const x=harness();
  x.$('syncServerUrl').value='https://api.example.com';
  x.$('syncPairCode').value='one-time-code';
  await x.client.connect({preventDefault(){}});
  assert.equal(x.remote().tasks.length,1);
  assert.equal(x.remote().tasks[0].title,'Посещение №1');
  assert.ok(x.store.has('studyboard.sync.recovery.v1'));
  assert.equal(x.calls[0].method,'POST');
});

test('a server-side Telegram completion is downloaded on next sync',async()=>{
  const x=harness();
  x.$('syncServerUrl').value='https://api.example.com';
  x.$('syncPairCode').value='one-time-code';
  await x.client.connect({preventDefault(){}});
  const changed=JSON.parse(JSON.stringify(x.remote()));
  changed.tasks[0].status='done';
  changed.tasks[0].updatedAt='2026-11-09T06:00:00Z';
  x.setRemote(changed);
  await x.client.syncNow();
  assert.equal(x.data().tasks[0].status,'done');
});

test('not connected never schedules a cloud write',async()=>{
  const x=harness();
  x.client.queue();
  assert.equal(x.calls.length,0);
});
