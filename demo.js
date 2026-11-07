/* Alingua: safe static demonstration based on the original frontend, 2026-10-25.
   No backend, account authentication, payments, CRM, cookies, or submission of data.
*/
// The standalone demo does not use a remote API.
// Public profiles are loaded from the safe runtime configuration.
const SOCIAL_LINKS = {};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

// Shared DOM helper is declared before DOMContentLoaded handlers use it.
const textNode = (tag, className, value) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value == null ? '' : String(value);
  return element;
};

document.addEventListener('DOMContentLoaded', async () => {
  qsa('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
  const configuration = {forms_enabled:true, payment_mode:'static_demo', social:{}};
  let editorial = {};
  try { const response=await fetch('site-content.json',{cache:'no-store'}); if(response.ok){const data=await response.json();if(data&&typeof data==='object'&&!Array.isArray(data))editorial=data;} } catch (_) { /* Safe default copy remains visible. */ }
  const rules = window.AlinguaCatalog;
  const trialCopy=rules.trialText(editorial.trial || {});
  if(qs('#trialTerms')) qs('#trialTerms').textContent=trialCopy;
  qsa('[data-trial-description]').forEach(el=>el.textContent=trialCopy+' Отправка заявки не обязывает оплачивать занятия.');
  Object.assign(SOCIAL_LINKS, configuration.social || {});
  if (configuration.forms_enabled === false) {
    qsa('form button[type="submit"]').forEach(b => {b.disabled = true; b.title = 'Форма временно недоступна';});
  }
  if (configuration.payment_mode && configuration.payment_mode !== 'yookassa_live') {
    const note = textNode('div', 'test-mode-note', 'Публичная демоверсия: данные не отправляются, заказы и оплата отключены.');
    qs('main')?.prepend(note);
  }

  // Social links are configured in SOCIAL_LINKS. Empty values show a clear setup message instead of a broken URL.
  qsa('[data-social]').forEach(link => {
    const network = link.dataset.social;
    const url = SOCIAL_LINKS[network];
    if (url) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.hidden = true;
    }
  });

  // Public-facing certificate placeholders link to real images once files are added to assets/certificates.
  qsa('.certificate-card').forEach(card => {
    card.addEventListener('click', event => {
      const img = qs('img', card);
      if (!img || img.hidden || !img.complete || img.naturalWidth === 0) {
        event.preventDefault();
        alert('Изображение сертификата временно недоступно. Попробуйте позже.');
      }
    });
  });

  // Material information dialog; the purchase button stays a separate action.
  const productDialog = qs('#productDialog');
  let selectedProduct = null;
  let selectedMaterialReviewId = null;
  function openProductDetails(card, route = true) {
    if (!productDialog || !card) return;
    selectedProduct = card;
    selectedMaterialReviewId = Number(card.dataset.materialId) || null;
    if (typeof renderMaterialReviews === 'function') renderMaterialReviews(selectedMaterialReviewId);
    const materialReviewForm = qs('#materialReviewForm');
    if (materialReviewForm) {
      materialReviewForm.reset();
      const formStatus = qs('.form-status', materialReviewForm);
      if (formStatus) { formStatus.textContent = ''; formStatus.style.display = 'none'; formStatus.classList.remove('is-error'); }
    }
    const materialId=Number(card.dataset.materialId);
    const link=new URL(location.href);link.searchParams.set('material',String(materialId));
    const permalink=qs('#productPermalink');if(permalink)permalink.href=link.pathname+link.search+link.hash;
    if(route&&new URLSearchParams(location.search).get('material')!==String(materialId))history.pushState({materialId},'',link.pathname+link.search+link.hash);
    const facts=qs('#productFacts');
    if(facts){facts.replaceChildren();for(const [label,value] of [['Для кого',card.dataset.displayAudience],['Длительность',card.dataset.displayDuration],['В покупку входит',card.dataset.displayFormats]]){if(value){const p=textNode('p','',null);p.append(textNode('strong','',label+': '),document.createTextNode(value));facts.append(p)}}}
    const gallery=qs('#sampleGallery');let readable=0;
    if(gallery){gallery.replaceChildren();const samples=editorial.material_samples?.[String(materialId)];if(Array.isArray(samples))samples.slice(0,6).forEach(sample=>{const src=rules.samplePath(sample.src);if(!src)return;const figure=document.createElement('figure');const img=document.createElement('img');img.src=src;img.alt=String(sample.caption||'Фрагмент материала');img.loading='lazy';figure.append(img,textNode('figcaption','',sample.caption||'Образец'));gallery.append(figure);readable++});gallery.hidden=readable===0;}
    if(qs('#dialogSampleNote'))qs('#dialogSampleNote').textContent=readable?'Показаны демонстрационные фрагменты. Оплата и выдача отключены.':'Доступно обзорное изображение. Полные файлы и платные материалы в демоверсию не включены.';
    const title = qs('h3', card)?.textContent.trim() || 'Методический материал';
    const description = card.dataset.detailedDescription || qs('.material-body p', card)?.textContent.trim() || 'Подробное описание будет добавлено вместе с материалом.';
    const price = qs('.material-bottom > strong', card)?.textContent.trim() || 'Уточняется';
    const tags = qsa('.tag', card).map(tag => tag.textContent.trim()).filter(Boolean);
    const language = card.dataset.language === 'chinese' ? 'Китайский' : 'Английский';
    const level = card.dataset.displayLevel || 'Уточняется';
    const format = card.dataset.displayFormats || 'Формат уточняется';
    const previewImage = qs('.material-cover-image', card);
    if (qs('#dialogTitle')) qs('#dialogTitle').textContent = title;
    if (qs('#dialogDescription')) qs('#dialogDescription').textContent = description.replace(/^[\u{1F300}-\u{1FAFF}\uFE0F]+\s*/gmu, '• ');
    if (qs('#dialogPrice')) qs('#dialogPrice').textContent = price;
    if (qs('#dialogLevel')) qs('#dialogLevel').textContent = level;
    if (qs('#dialogFormat')) qs('#dialogFormat').textContent = format;
    if (qs('#dialogTags')) {
      qs('#dialogTags').replaceChildren(...tags.map(label => { const el = document.createElement('span'); el.textContent = label; return el; }));
    }
    const dialogPreview = qs('#dialogPreview');
    const dialogPreviewImage = qs('#dialogPreviewImage');
    if (dialogPreview && dialogPreviewImage) {
      if (previewImage?.src) {
        dialogPreview.hidden = false;
        dialogPreviewImage.src = previewImage.src;
        dialogPreviewImage.alt = `Защищённое превью материала «${title}»`;
      } else {
        dialogPreview.hidden = true;
        dialogPreviewImage.removeAttribute('src');
      }
    }
    const note = qs('#dialogNote');
    const available = !!qs('.buy-button', card);
    if (note) note.textContent = available
      ? 'Это интерактивная демонстрация оформления. Оплата, выдача файлов и создание заказов отключены.'
      : 'Материал представлен только для знакомства с интерфейсом каталога.';
    const buy = qs('#dialogBuy');
    if (buy) {
      buy.hidden = !available;
      buy.onclick = () => {
        if (!selectedProduct) return;
        const purchaseButton = qs('.buy-button', selectedProduct);
        if (purchaseButton) purchaseButton.click();
      };
    }
    if (typeof productDialog.showModal === 'function') { if(!productDialog.open)productDialog.showModal(); }
    else alert(`${title}\n\n${description}\n\nЦена: ${price}\nУровень: ${level}\nФормат: ${format}`);
  }
  qsa('[data-close-dialog]').forEach(button => button.addEventListener('click', () => {productDialog?.close();clearMaterialRoute();}));
  if (productDialog) productDialog.addEventListener('click', event => {
    if (event.target === productDialog) {productDialog.close();clearMaterialRoute();}
  });

  function clearMaterialRoute(){if(productDialog?.open)return;const url=new URL(location.href);if(url.searchParams.has('material')){url.searchParams.delete('material');history.replaceState(null,'',url.pathname+url.search+url.hash);}}
  productDialog?.addEventListener('close',clearMaterialRoute);
  function restoreMaterialRoute(){if(!grid)return;const raw=new URLSearchParams(location.search).get('material');if(!raw){if(productDialog?.open)productDialog.close();return;}if(!/^[1-9]\d*$/.test(raw))return;const card=qsa('.material-card',grid).find(x=>x.dataset.materialId===raw);if(card)openProductDetails(card,false);else{let note=qs('#materialRouteStatus');if(!note){note=textNode('p','note-box','');note.id='materialRouteStatus';note.setAttribute('role','status');grid?.before(note);}note.textContent='Этот материал сейчас недоступен. Выберите другой материал в каталоге.';}}
  window.addEventListener('popstate',restoreMaterialRoute);

  // Checkout is a UI-only simulation: no fields, requests, tokens or payment links.
  const checkoutDialog = qs('#checkoutDialog');
  const checkoutStatus = qs('#checkoutStatus');
  function openCheckout(materialId) {
    const material = catalogItems.find(item => Number(item.id) === Number(materialId));
    if (!material || !checkoutDialog) return;
    const title = qs('#checkoutProductName');
    const price = qs('#checkoutProductPrice');
    if (title) title.textContent = material.title;
    if (price) price.textContent = material.price_rub ? `${new Intl.NumberFormat('ru-RU').format(material.price_rub)} ₽` : 'Бесплатно';
    if (checkoutStatus) { checkoutStatus.textContent=''; checkoutStatus.style.display='none'; }
    productDialog?.close();
    checkoutDialog.showModal();
  }
  qsa('[data-close-checkout]').forEach(button=>button.addEventListener('click',()=>checkoutDialog?.close()));
  checkoutDialog?.addEventListener('click',e=>{if(e.target===checkoutDialog)checkoutDialog.close();});
  qs('#checkoutSubmit')?.addEventListener('click',()=>{
    if (!checkoutStatus)return;
    checkoutStatus.style.display='block';
    checkoutStatus.textContent='Готово! Это демонстрация оформления: заказ не создан, оплата не проводилась, данные не передавались.';
  });

  // Reviews are stored in PostgreSQL through FastAPI. Only moderator-approved reviews are public.
  function reviewDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  }

  function renderReviewCard(review) {
    const article = document.createElement('article');
    article.className = 'review-card';
    const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
    const stars = textNode('div', 'review-stars', '★'.repeat(rating) + '☆'.repeat(5 - rating));
    stars.setAttribute('aria-label', `Оценка: ${rating} из 5`);
    const body = textNode('p', '', review.text || '');
    const name = textNode('strong', '', review.name || 'Автор отзыва');
    const role = textNode('small', '', [review.role, reviewDate(review.published_at || review.created_at)].filter(Boolean).join(' · '));
    article.append(stars, body, name, role);
    return article;
  }

  async function renderReviews(kind) {
    const list=qs(`[data-review-list="${kind}"]`);
    if(list)list.replaceChildren(textNode('div','review-empty','Демонстрационный режим: реальные отзывы не загружаются, публикация отключена.'));
  }

  qsa('[data-review-form]').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();const status=qs('.form-status',form);
    if(status){status.style.display='block';status.textContent='Демоверсия: отзыв не отправлен и нигде не сохранён.';}
  }));

  // Separate, moderated review streams for each catalog material and each lesson format.
  const scopedReviewRequestIds = new WeakMap();
  let scopedReviewRequestSequence = 0;
  async function loadScopedReviewList(list, url, emptyMessage) {
    if(list)list.replaceChildren(textNode('div','review-empty','Демоверсия: отзывы не загружаются и не публикуются.'));
  }

  async function renderMaterialReviews(materialId) {
    const list = qs('#dialogReviewList');
    if (!list) return;
    if (!materialId) {
      list.replaceChildren(textNode('div', 'review-empty', 'Не удалось определить материал. Закройте карточку и откройте её снова.'));
      return;
    }
    await loadScopedReviewList(
      list,
      'demo-material-reviews',
      'Пока нет опубликованных отзывов об этом материале. Вы можете оставить первый отзыв.'
    );
  }

  const lessonReviewTarget = qs('#lessonReviewTarget');
  const lessonFormatReviewList = qs('#lessonFormatReviewList');
  async function renderLessonFormatReviews() {
    const label = lessonReviewTarget?.value;
    if (!label || !lessonFormatReviewList) return;
    await loadScopedReviewList(
      lessonFormatReviewList,
      'demo-lesson-reviews',
      `Пока нет опубликованных отзывов о формате «${label}». Вы можете оставить первый отзыв.`
    );
  }
  if (lessonReviewTarget) {
    lessonReviewTarget.addEventListener('change', renderLessonFormatReviews);
    renderLessonFormatReviews();
  }
  qsa('[data-review-format]').forEach(link => link.addEventListener('click', () => {
    const label = link.dataset.reviewFormat;
    if (lessonReviewTarget && [...lessonReviewTarget.options].some(option => option.value === label)) {
      lessonReviewTarget.value = label;
      renderLessonFormatReviews();
    }
  }));

  function wireScopedReviewForm(form, makeTarget) {
    if(!form)return;
    form.addEventListener('submit',event=>{
      event.preventDefault();const status=qs('.form-status',form);
      if(status){status.style.display='block';status.textContent='Демоверсия: отзыв не отправлен и не сохранён.';}
    });
  }

  wireScopedReviewForm(qs('#materialReviewForm'), () => ({
    page: 'teachers', target_type: 'material', material_id: selectedMaterialReviewId
  }));
  wireScopedReviewForm(qs('#lessonFormatReviewForm'), () => ({
    page: 'parents', target_type: 'lesson_format', target_label: lessonReviewTarget?.value || ''
  }));

  const menuButton = qs('.menu-toggle');
  const nav = qs('.nav-links');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.textContent = isOpen ? '×' : '☰';
    });
  }

  const bookingForm=qs('.lead-form');
  function setBookingFormat(value){const field=bookingForm?.elements.format;if(field&&[...field.options].some(o=>o.value===value))field.value=value;}
  qsa('[data-booking-format]').forEach(a=>a.addEventListener('click',()=>setBookingFormat(a.dataset.bookingFormat)));
  const requestedLanguage=new URLSearchParams(location.search).get('language');
  if(bookingForm&&['english','chinese'].includes(requestedLanguage))bookingForm.elements.language.value=requestedLanguage==='chinese'?'Китайский':'Английский';
  // Booking is a local, ephemeral UI demonstration. No submissions to the real website.
  qsa('.lead-form').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();const status=qs('.form-status, .status',form);
    if(status){status.style.display='block';status.textContent='Демонстрационная заявка показана успешно. Данные не отправлялись и не сохранялись.';}
  }));

  // Materials catalog: render server-returned products with approved, target-specific rating aggregates.
  const search = qs('#materialSearch');
  const grid = qs('#materialGrid');
  const empty = qs('#catalogEmpty');
  const retryCatalog = qs('#retryCatalog');
  const languageFilter = qs('#filterLanguage');
  const categoryFilter = qs('#filterCategory');
  const levelFilter = qs('#filterLevel');
  const audienceFilter = qs('#filterAudience');
  const formatFilter = qs('#filterFormat');
  const priceFilter = qs('#filterPrice');
  const sortSelect = qs('#sortMaterials');
  const resetFiltersButton = qs('#resetCatalogFilters');
  const showFilteredCatalogButton = qs('#showFilteredCatalog');
  const catalogTab = qs('#catalogTab');
  const filtersTab = qs('#filtersTab');
  const catalogPanel = qs('#catalogPanel');
  const filtersPanel = qs('#filtersPanel');
  const catalogCount = qs('#catalogCount');
  const activeFilterCount = qs('#activeFilterCount');
  const filterResultCount = qs('#filterResultCount');
  let catalogView = 'catalog';
  let catalogReviewSummaries = new Map();
  const money = amount => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(amount) || 0);
  const ratingNumber = value => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) || 0);
  const reviewCountLabel = count => {
    const n = Math.abs(Number(count) || 0) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return 'отзывов';
    if (last === 1) return 'отзыв';
    if (last >= 2 && last <= 4) return 'отзыва';
    return 'отзывов';
  };
  const materialCountLabel = count => {
    const n = Math.abs(Number(count) || 0) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return 'материалов';
    if (last === 1) return 'материал';
    if (last >= 2 && last <= 4) return 'материала';
    return 'материалов';
  };
  function addTag(container, label, style = '') {
    if (!label) return;
    container.append(textNode('span', `tag ${style}`.trim(), label));
  }

  function createMaterialCard(material) {
    const card = document.createElement('article');
    card.className = 'material-card';
    card.dataset.language = material.language || 'english';
    card.dataset.name = [material.title, material.category, material.level, material.audience, ...(material.formats || [])].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU');
    const skills = Array.isArray(material.skills) && material.skills.length ? material.skills : String(material.category || '').split(',').map(v=>v.trim()).filter(Boolean);
    card.dataset.category = skills.map(v=>v.toLocaleLowerCase('ru-RU')).join('|');
    card.dataset.displayAudience = material.audience || '';
    card.dataset.displayDuration = material.duration_label || '';
    card.dataset.displayLevel = material.level || '';
    card.dataset.displayFormats = (material.formats || []).join(' · ');
    card.dataset.level = String(material.level || '').trim().toLocaleLowerCase('ru-RU');
    card.dataset.audience = String(material.audience || 'Не указано').trim().toLocaleLowerCase('ru-RU');
    card.dataset.formats = (material.formats || []).map(value => String(value).trim().toLocaleLowerCase('ru-RU')).join('|');
    card.dataset.price = String(Number(material.price_rub) || 0);
    card.dataset.title = String(material.title || '').toLocaleLowerCase('ru-RU');
    card.dataset.sortOrder = String(Number(material.sort_order) || 0);
    card.dataset.id = String(Number(material.id) || 0);
    card.dataset.materialId = String(material.id);
    const reviewSummary = catalogReviewSummaries.get(Number(material.id)) || {average_rating: 0, review_count: 0};
    card.dataset.rating = String(Number(reviewSummary.average_rating) || 0);
    card.dataset.reviewCount = String(Number(reviewSummary.review_count) || 0);
    card.dataset.createdAt = String(material.created_at || '');
    card.dataset.isDemo = String(Boolean(material.is_demo));
    card.dataset.detailedDescription = String(material.detailed_description || material.description || material.short_description || '').trim();

    const languageLabel = material.language === 'chinese' ? '中文 / ' : 'ENGLISH / ';
    const coverClasses = ['cover-pink', 'cover-blue', 'cover-yellow'];
    const coverIndex = material.language === 'chinese' ? 2 : (String(material.category || '').toLowerCase().includes('лекс') ? 1 : 0);
    const cover = textNode('div', `material-cover material-cover-click ${coverClasses[coverIndex]}`, '');
    cover.dataset.materialDetails = '';
    cover.tabIndex = 0;
    cover.setAttribute('role', 'button');
    cover.setAttribute('aria-label', `Подробнее о материале ${material.title || ''}`);

    const preview = typeof material.preview_image === 'string' ? material.preview_image.trim() : '';
    if (preview) {
      try {
        const url = new URL(preview, window.location.href);
        if (['http:', 'https:'].includes(url.protocol)) {
          const image = document.createElement('img');
          image.className = 'material-cover-image';
          image.src = url.href;
          image.alt = `Превью материала «${material.title || ''}»`;
          image.loading = 'lazy';
          image.onerror = () => { image.remove(); cover.classList.remove('has-preview'); const stamp = qs('.preview-stamp', cover); if (stamp) stamp.remove(); };
          cover.classList.add('has-preview');
          cover.append(image, textNode('span', 'preview-stamp', 'ПРЕВЬЮ'));
        }
      } catch (_) { /* Invalid preview path: use the built-in cover style. */ }
    }

    cover.append(
      textNode('span', 'cover-label', `${languageLabel}${material.level || 'LEVEL'}`),
      textNode('strong', '', material.title || 'Методический материал'),
      textNode('span', 'cover-doodle', material.language === 'chinese' ? '✦' : '✳'),
      textNode('small', '', (material.formats || []).join(' · ') || material.category || 'Материал для урока')
    );

    const body = textNode('div', 'material-body', '');
    const tags = textNode('div', 'tag-row', '');
    addTag(tags, material.level, 'tag-pink');
    skills.forEach(skill => addTag(tags, skill, 'tag-yellow'));
    (material.formats || []).forEach((format, index) => addTag(tags, format, index === 0 ? 'tag-green' : ''));
    if (material.is_demo) addTag(tags, 'Скоро', '');
    body.append(tags, textNode('h3', '', material.title || 'Методический материал'));
    body.append(textNode('p', '', material.short_description || material.description || 'Описание появится позже.'));
    if (material.duration_label) body.append(textNode('small', 'material-duration', `Длительность: ${material.duration_label}`));
    const formatNote = rules.formatNote(material);
    body.append(textNode('small', 'material-format-note', formatNote));

    const ratingRow = textNode('div', 'material-rating', '');
    const publishedReviewCount = Number(reviewSummary.review_count) || 0;
    if (publishedReviewCount > 0) {
      ratingRow.append(
        textNode('span', 'material-rating-star', '★'),
        textNode('strong', 'material-rating-score', ratingNumber(reviewSummary.average_rating)),
        textNode('span', 'material-rating-scale', '/ 5,0'),
        textNode('span', 'material-rating-divider', '·')
      );
      const reviewsLink = textNode('button', 'material-rating-link', `${publishedReviewCount} ${reviewCountLabel(publishedReviewCount)}`);
      reviewsLink.type = 'button';
      reviewsLink.dataset.materialDetails = '';
      reviewsLink.setAttribute('aria-label', 'Открыть отзывы о материале');
      ratingRow.append(reviewsLink);
      ratingRow.setAttribute('aria-label', `Оценка ${ratingNumber(reviewSummary.average_rating)} из 5 по ${publishedReviewCount} отзывам`);
    } else {
      ratingRow.append(textNode('span', 'material-rating-empty', '☆ Пока нет отзывов'));
      ratingRow.setAttribute('aria-label', 'У материала пока нет опубликованных отзывов');
    }

    const bottom = textNode('div', 'material-bottom material-bottom-wrap', '');
    bottom.append(textNode('strong', '', Number(material.price_rub) === 0 ? 'Бесплатно' : `${money(material.price_rub)} ₽`));
    const actions = textNode('div', 'material-actions', '');
    const detailsButton = textNode('button', 'button button-outline', 'Подробнее ↗');
    detailsButton.type = 'button';
    detailsButton.dataset.materialDetails = '';
    actions.append(detailsButton);

    if (material.is_demo) {
      const comingSoonButton = textNode('button', 'button button-outline', 'Скоро');
      comingSoonButton.type = 'button';
      comingSoonButton.dataset.demoMaterial = '';
      actions.append(comingSoonButton);
    } else {
      const buyButton = textNode('button', 'button button-blue buy-button', 'Демо заказа ↗');
      buyButton.type = 'button';
      buyButton.dataset.materialId = String(material.id);
      buyButton.dataset.materialName = String(material.title || 'материал');
      buyButton.dataset.materialPrice = String(material.price_rub ?? 0);
      actions.append(buyButton);
    }

    bottom.append(actions);
    body.append(ratingRow, bottom);
    card.append(cover, body);
    return card;
  }

  let catalogItems = [];
  let catalogLoaded = false;
  let catalogFailed = false;

  function selection(){return {language:languageFilter?.value||'all',category:categoryFilter?.value||'all',level:levelFilter?.value||'all',audience:audienceFilter?.value||'all',format:formatFilter?.value||'all',price:priceFilter?.value||'all',query:search?.value||''};}
  function updateFacetOptions(){
    const state=selection();
    for(const [facet,control,label] of [['language',languageFilter,'Все языки'],['category',categoryFilter,'Любая категория'],['level',levelFilter,'Любой уровень'],['audience',audienceFilter,'Любая аудитория'],['format',formatFilter,'Любой формат'],['price',priceFilter,'Любая цена']]){
      if(!control)continue;const current=state[facet];const options=rules.facetOptions(catalogItems,state,facet);control.replaceChildren(new Option(label,'all'));
      for(const item of options){const option=new Option(`${item.label} (${item.count})`,item.value);option.dataset.label=item.label;control.add(option);}
      control.value=[...control.options].some(option=>option.value===current)?current:'all';
    }
  }
  function initializeCatalogFilters(){
    const scope=catalogItems.filter(item=>!languageFilter||languageFilter.value==='all'||item.language===languageFilter.value);
    for(const [control,values] of [[levelFilter,scope.flatMap(x=>rules.levels(x.level))],[audienceFilter,scope.flatMap(x=>rules.audiences(x.audience||'Не указано'))]]){
      if(control&&control.value!=='all'&&!values.some(x=>x.toLocaleLowerCase('ru-RU')===control.value))control.value='all';
    }
    updateFacetOptions();
  }

  function activeAdvancedFilterCount() {
    return [languageFilter, categoryFilter, levelFilter, audienceFilter, formatFilter, priceFilter]
      .filter(control => control && control.value && control.value !== 'all').length;
  }

  function setCatalogView(view) {
    catalogView = view === 'filters' ? 'filters' : 'catalog';
    if (catalogPanel) catalogPanel.hidden = catalogView !== 'catalog';
    if (filtersPanel) filtersPanel.hidden = catalogView !== 'filters';
    if (catalogTab) {
      catalogTab.classList.toggle('active', catalogView === 'catalog');
      catalogTab.setAttribute('aria-selected', String(catalogView === 'catalog'));
      catalogTab.tabIndex = catalogView === 'catalog' ? 0 : -1;
    }
    if (filtersTab) {
      filtersTab.classList.toggle('active', catalogView === 'filters');
      filtersTab.setAttribute('aria-selected', String(catalogView === 'filters'));
      filtersTab.tabIndex = catalogView === 'filters' ? 0 : -1;
    }
    if (catalogView === 'catalog') updateCatalog();
  }

  function updateCatalogIndicators(visibleCount) {
    const activeCount = activeAdvancedFilterCount();
    qsa('[data-language-choice]').forEach(button=>{const active=button.dataset.languageChoice===(languageFilter?.value||'all');button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const chips=qs('#activeFilterChips');if(chips){chips.replaceChildren();for(const control of [languageFilter,categoryFilter,levelFilter,audienceFilter,formatFilter,priceFilter]){if(!control||control.value==='all')continue;const chip=textNode('button','filter-chip',(control.selectedOptions[0].dataset.label||control.selectedOptions[0].textContent)+' ×');chip.type='button';chip.setAttribute('aria-label','Убрать условие: '+control.selectedOptions[0].textContent);chip.addEventListener('click',()=>{control.value='all';if(control===languageFilter)initializeCatalogFilters();updateCatalog();});chips.append(chip);}}
    if (activeFilterCount) activeFilterCount.textContent = String(activeCount);
    if (filtersTab) filtersTab.classList.toggle('has-active-filters', activeCount > 0);
    if (catalogCount) catalogCount.textContent = String(visibleCount);
    if (filterResultCount) filterResultCount.textContent = `Подходящих: ${visibleCount} ${materialCountLabel(visibleCount)}`;
    if (showFilteredCatalogButton) showFilteredCatalogButton.textContent = `Показать ${visibleCount} ${materialCountLabel(visibleCount)} ↗`;
  }

  function updateCatalog() {
    if (!grid || !catalogLoaded || catalogFailed) return;
    const filterState=selection();
    const itemsById=new Map(catalogItems.map(item=>[Number(item.id),item]));
    const sortMode = sortSelect?.value || 'default';
    const cards = qsa('.material-card', grid);
    let visible = 0;
    cards.forEach(card => {
      const material=itemsById.get(Number(card.dataset.materialId));
      card.hidden=!material||!rules.matches(material,filterState);
      if (!card.hidden) visible++;
    });

    const idAsc = (a, b) => Number(a.dataset.id) - Number(b.dataset.id);
    cards.sort((a, b) => {
      const aPrice = Number(a.dataset.price) || 0;
      const bPrice = Number(b.dataset.price) || 0;
      const aRating = Number(a.dataset.rating) || 0;
      const bRating = Number(b.dataset.rating) || 0;
      const aReviews = Number(a.dataset.reviewCount) || 0;
      const bReviews = Number(b.dataset.reviewCount) || 0;
      if (sortMode === 'price-asc') return aPrice - bPrice || idAsc(a, b);
      if (sortMode === 'price-desc') return bPrice - aPrice || idAsc(a, b);
      if (sortMode === 'title-asc') return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'ru-RU', {sensitivity: 'base'}) || idAsc(a, b);
      if (sortMode === 'newest') return (Date.parse(b.dataset.createdAt || '') || 0) - (Date.parse(a.dataset.createdAt || '') || 0) || idAsc(a, b);
      if (sortMode === 'reviews-desc') return bReviews - aReviews || bRating - aRating || idAsc(a, b);
      if (sortMode === 'rating-desc') {
        // Materials without published ratings always follow rated materials.
        if ((aReviews > 0) !== (bReviews > 0)) return aReviews > 0 ? -1 : 1;
        return bRating - aRating || bReviews - aReviews || idAsc(a, b);
      }
      return Number(a.dataset.sortOrder) - Number(b.dataset.sortOrder) || idAsc(a, b);
    });
    grid.replaceChildren(...cards);
    updateFacetOptions();
    updateCatalogIndicators(visible);
    if (empty) {
      empty.hidden = visible > 0;
      empty.textContent = catalogItems.length === 0
        ? 'Пока нет опубликованных материалов.'
        : 'Ничего не найдено. Попробуйте изменить условия во вкладке «Фильтры» или очистить поиск.';
    }
  }

  async function loadCatalog() {
    if (!grid) return;
    catalogFailed=false;catalogLoaded=false;
    grid.setAttribute('aria-busy','true');
    if (empty) {empty.hidden=false;empty.textContent='Загружаем каталог материалов…';}
    if (retryCatalog) retryCatalog.hidden=true;
    try {
      const response=await fetch('demo-catalog.json');
      if(!response.ok)throw new Error(`Не удалось загрузить каталог: ${response.status}`);
      const result=await response.json();
      if(!Array.isArray(result))throw new Error('Некорректный формат каталога');
      catalogItems=result;catalogReviewSummaries=new Map();
      grid.replaceChildren(...catalogItems.map(createMaterialCard));
      initializeCatalogFilters();catalogLoaded=true;
      grid.setAttribute('aria-busy','false');
      if(empty)empty.hidden=!!catalogItems.length;
      updateCatalog();restoreMaterialRoute();
    } catch(error){
      catalogFailed=true;grid.setAttribute('aria-busy','false');
      if(empty){empty.hidden=false;empty.textContent='Не удалось загрузить каталог. Обновите страницу.';}
      if(retryCatalog)retryCatalog.hidden=false;
      console.error('Ошибка загрузки каталога:',error);
    }
  }

  // Delegated events also work for cards created after the API request completes.
  if (grid) {
    grid.addEventListener('click', event => {
      const detailControl = event.target.closest('[data-material-details]');
      if (detailControl) {
        openProductDetails(detailControl.closest('.material-card'));
        return;
      }
      const buyButton = event.target.closest('.buy-button');
      if (buyButton) {
        openCheckout(Number(buyButton.dataset.materialId));
        return;
      }
      const demoButton = event.target.closest('[data-demo-material]');
      if (demoButton) alert('Этот материал пока не опубликован. Когда он будет готов, Алина сможет добавить его в каталог.');
    });
    grid.addEventListener('keydown', event => {
      const detailControl = event.target.closest('[data-material-details][role="button"]');
      if (detailControl && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openProductDetails(detailControl.closest('.material-card'));
      }
    });
  }

  [catalogTab, filtersTab].forEach(button => {button?.addEventListener('click', () => setCatalogView(button.dataset.catalogView));button?.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const target=event.key==='Home'?catalogTab:event.key==='End'?filtersTab:button===catalogTab?filtersTab:catalogTab;setCatalogView(target.dataset.catalogView);target.focus();});});
  qsa('[data-language-choice]').forEach(button=>button.addEventListener('click',()=>{const value=button.dataset.languageChoice;if(![...languageFilter.options].some(o=>o.value===value))languageFilter.add(new Option(button.textContent,value));languageFilter.value=value;initializeCatalogFilters();updateCatalog();}));
  languageFilter?.addEventListener('change',initializeCatalogFilters);
  if (showFilteredCatalogButton) showFilteredCatalogButton.addEventListener('click', () => setCatalogView('catalog'));
  if (search) search.addEventListener('input', updateCatalog);
  [languageFilter, categoryFilter, levelFilter, audienceFilter, formatFilter, priceFilter, sortSelect].forEach(control => control?.addEventListener('change', updateCatalog));
  if (resetFiltersButton) resetFiltersButton.addEventListener('click', () => {
    if (search) search.value = '';
    [languageFilter, categoryFilter, levelFilter, audienceFilter, formatFilter, priceFilter].forEach(control => { if (control) control.value = 'all'; });
    if (sortSelect) sortSelect.value = 'default';
    updateCatalog();
  });
  if (retryCatalog) retryCatalog.addEventListener('click', loadCatalog);
  setCatalogView('catalog');
  loadCatalog();
});

/* ALINA_MOBILE_UI_V2_JS_START
   Progressive enhancement: format newlines and bullet-like lines ONLY below 651px.
   Source text is rendered via textContent, not innerHTML (no markup injection).
   The original description is restored when switching to desktop.
*/
(() => {
  const initialize = () => {
    const description = document.getElementById('dialogDescription');
    if (!description || !window.matchMedia || !window.MutationObserver) return;
    const mobile = window.matchMedia('(max-width: 650px)');
    let savedText = null;
    const bullet = /^(?:[•·◦▪–—\-*✓✔✅☑☐✦★👉🔸🔹]|\d+[.)]|\p{Extended_Pictographic})\s*/u;
    let observer;

    function silentUpdate(fn) {
      observer.disconnect();
      fn();
      observer.observe(description, {childList: true});
    }

    function update() {
      if (!mobile.matches) {
        if (savedText !== null) {
          silentUpdate(() => {
            description.textContent = savedText;
            description.classList.remove('alina-mobile-description-formatted');
          });
          savedText = null;
        }
        return;
      }
      // app.js replaces the old formatted spans with a new text node each time
      // a different material is opened; the observer detects that replacement.
      if (description.querySelector('.alina-mobile-description-line')) return;
      const raw = description.textContent || '';
      if (!raw.includes('\n') || raw.length > 15000) {
        savedText = null;
        description.classList.remove('alina-mobile-description-formatted');
        return;
      }
      savedText = raw;
      const fragment = document.createDocumentFragment();
      const lines = raw.replace(/\r\n?/g, '\n').split('\n');
      lines.forEach((part, index) => {
        const value = part.trim();
        if (!value) {
          if (index > 0 && index < lines.length - 1 && lines[index - 1].trim()) {
            const space = document.createElement('span');
            space.className = 'alina-mobile-description-space';
            space.setAttribute('aria-hidden', 'true');
            fragment.appendChild(space);
          }
          return;
        }
        const line = document.createElement('span');
        line.className = 'alina-mobile-description-line';
        if (bullet.test(value)) line.classList.add('alina-mobile-description-bullet');
        else if (value.length <= 65 && /[:：]$/.test(value)) {
          line.classList.add('alina-mobile-description-heading');
        }
        line.textContent = value;
        fragment.appendChild(line);
      });
      silentUpdate(() => {
        description.replaceChildren(fragment);
        description.classList.add('alina-mobile-description-formatted');
      });
    }

    observer = new MutationObserver(update);
    observer.observe(description, {childList: true});
    if (typeof mobile.addEventListener === 'function') {
      mobile.addEventListener('change', update);
    } else if (typeof mobile.addListener === 'function') {
      mobile.addListener(update);
    }
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once: true});
  else initialize();
})();
/* ALINA_MOBILE_UI_V2_JS_END */
