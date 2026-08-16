export const categories = {
  food:['🍔','طعام'], home:['🏠','منزل'], transport:['🚕','مواصلات'],
  bills:['💡','فواتير'], shopping:['🛍️','مشتريات'], health:['💊','صحة'],
  fun:['🎁','ترفيه'], other:['📦','أخرى']
};

export const incomeSources = {
  salary:['💼','راتب'], freelance:['🔨','عمل إضافي'], project:['💰','مشروع'],
  gift:['🎁','هدية'], other:['📦','أخرى']
};

export function money(value, currency='SYP'){
  const symbols = {SYP:'ل.س', USD:'$', EUR:'€'};
  const n = Number(value || 0);
  return `${new Intl.NumberFormat('ar-SY',{maximumFractionDigits: currency==='SYP'?0:2}).format(n)} ${symbols[currency] || currency}`;
}

export function percent(a,b){
  if(!b) return 0;
  return Math.round((Number(a||0)/Number(b||0))*100);
}

export function fmtDate(date){
  try { return new Intl.DateTimeFormat('ar-SY',{month:'short',day:'numeric'}).format(new Date(date)); }
  catch { return date || ''; }
}

export function toast(message, type='success'){
  const el = document.createElement('div');
  el.className = `notice ${type==='success'?'success':''}`;
  el.textContent = message;
  el.style.position='fixed'; el.style.top='16px'; el.style.left='50%'; el.style.transform='translateX(-50%)';
  el.style.zIndex='999'; el.style.width='min(460px,calc(100% - 30px))'; el.style.boxShadow='0 10px 30px rgba(0,0,0,.12)';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2800);
}
