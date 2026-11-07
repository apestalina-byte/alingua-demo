/* Pure catalog presentation rules. No private links, files, orders or payment decisions. */
(function(root){
  'use strict';
  const order=['A0','A1','A2','B1','B2','C1','C2'];
  const audiences=value=>[...new Set(String(value||'').split(/[,;|]/).map(x=>x.trim()).filter(Boolean))];
  function levels(value){
    const text=String(value||'').trim().toUpperCase();
    const hsk=text.match(/^HSK\s*(\d)(?:\s*[-–—]\s*(?:HSK\s*)?(\d))?$/);
    if(hsk){const lo=+hsk[1],hi=hsk[2]?+hsk[2]:lo;return lo>0&&hi>=lo&&hi<=9?Array.from({length:hi-lo+1},(_,i)=>`HSK ${lo+i}`):[text];}
    const found=text.match(/[ABC][012]/g)||[];
    if(found.length===2&&/[-–—]/.test(text)){
      const a=order.indexOf(found[0]),b=order.indexOf(found[1]);
      if(a>=0&&b>=a)return order.slice(a,b+1);
    }
    return found.length?[...new Set(found)]:text?[text]:[];
  }
  const has=(values,selected)=>selected==='all'||values.some(x=>x.toLocaleLowerCase('ru-RU')===selected);
  function formatNote(material){
    const f=(material.formats||[]).map(x=>String(x).trim().toLowerCase());const notes=[];
    if(f.includes('pdf'))notes.push([39,72].includes(Number(material.id))?'PDF: рабочая тетрадь. Перед печатью выберите подходящий масштаб.':'PDF: экспорт учебной доски.');
    const boards=['Miro','Holst'].filter(x=>f.includes(x.toLowerCase()));
    if(boards.length)notes.push(`Интерактивные версии: ${boards.join(' и ')}.`);
    return notes.join(' ')||'Состав указан в описании материала.';
  }
  function samplePath(value){return typeof value==='string'&&/^\/assets\/samples\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(value)?value:null;}
  function trialText(trial={}){
    const duration=Number.isInteger(trial.duration_minutes)&&trial.duration_minutes>0?`${trial.duration_minutes} минут`:'длительность согласуем';
    const price=Number.isInteger(trial.price_rub)&&trial.price_rub>=0?(trial.price_rub===0?'бесплатно':`${new Intl.NumberFormat('ru-RU').format(trial.price_rub)} ₽`):'стоимость согласуем до записи';
    return `Первое занятие: ${duration}; ${price}.`;
  }
  const priceChoices=[['free','Бесплатно'],['1-250','До 250 ₽'],['251-500','251–500 ₽'],['501-1000','501–1 000 ₽'],['1001+','От 1 001 ₽']];
  function prices(value){const p=Number(value)||0;return [p===0?'free':p<=250?'1-250':p<=500?'251-500':p<=1000?'501-1000':'1001+'];}
  function values(material,facet){
    switch(facet){
      case 'language':return [material.language];
      case 'category':return material.skills?.length?material.skills:audiences(material.category);
      case 'level':return levels(material.level);
      case 'audience':return audiences(material.audience||'Не указано');
      case 'format':return material.formats||[];
      case 'price':return prices(material.price_rub);
      default:return [];
    }
  }
  function matches(material,selection={},ignore=''){
    const query=String(selection.query||'').trim().toLocaleLowerCase('ru-RU');
    const searchable=[material.title,material.category,material.level,material.audience,material.short_description,material.description,...(material.skills||[]),...(material.formats||[])].join(' ').toLocaleLowerCase('ru-RU');
    if(query&&!searchable.includes(query))return false;
    return ['language','category','level','audience','format','price'].every(facet=>facet===ignore||has(values(material,facet),selection[facet]||'all'));
  }
  function facetOptions(rows,selection,facet){
    const labels=facet==='price'?new Map(priceChoices):new Map(rows.flatMap(item=>values(item,facet)).filter(Boolean).map(v=>[String(v).trim().toLocaleLowerCase('ru-RU'),String(v).trim()]));
    const counts=new Map();for(const item of rows){if(facet!=='language'&&!matches(item,selection,facet))continue;for(const value of new Set(values(item,facet).map(v=>String(v).trim().toLocaleLowerCase('ru-RU'))))counts.set(value,(counts.get(value)||0)+1);}
    const result=[...labels].map(([value,label])=>({value,label,count:counts.get(value)||0}));
    if(facet!=='price')result.sort((a,b)=>a.label.localeCompare(b.label,'ru-RU',{numeric:true}));
    return result.filter(option=>option.count>0||option.value===selection[facet]);
  }
  const api={audiences,levels,has,formatNote,samplePath,trialText,matches,facetOptions};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.AlinguaCatalog=api;
})(typeof window==='undefined'?globalThis:window);
