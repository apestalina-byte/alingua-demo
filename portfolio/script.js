(() => {
  const menu = document.getElementById('menu-toggle');
  const nav = document.getElementById('nav-links');
  const closeMenu = () => {nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Открыть меню');};
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',()=>{
    document.getElementById('brief-plan').value=button.dataset.plan;
    document.getElementById('contact').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
    document.getElementById('brief-message').focus({preventScroll:true});
  }));
  const form=document.getElementById('brief-form');
  const status=document.getElementById('brief-status');
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const plan=document.getElementById('brief-plan').value;
    const message=document.getElementById('brief-message').value.trim()||'Хочу обсудить сайт и узнать стоимость.';
    const contents=`Здравствуйте! Хочу заказать сайт.\nФормат: ${plan}.\nЗадача: ${message}\nПодскажите, пожалуйста, стоимость и сроки.`;
    // The visitor must paste and send the message themselves; nothing is sent by the website.
    window.open('https://t.me/artem10p','_blank','noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(contents);
      status.textContent='Текст скопирован. Вставьте его в чат @artem10p в Telegram и отправьте сообщение.';
    } catch(err) {
      const input=document.createElement('textarea');input.value=contents;input.readOnly=true;input.style.position='fixed';input.style.top='-9999px';document.body.appendChild(input);input.select();const ok=document.execCommand('copy');input.remove();status.textContent=ok?'Текст скопирован. Вставьте его в чат @artem10p в Telegram и отправьте сообщение.':'Не удалось скопировать текст автоматически. Откройте @artem10p и отправьте описание задачи вручную.';
    }
  });
})();
