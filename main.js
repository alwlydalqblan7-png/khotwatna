import './styles.css';
import { supabase, isConfigured } from './supabase.js';
import { categories, incomeSources, money, percent, fmtDate, toast } from './ui.js';

const app = document.getElementById('app');
let session = null;
let profile = null;
let household = null;
let currency = 'SYP';
let data = { transactions:[], savings:[], goals:[], budgets:[], challenges:[] };
let realtimeChannel = null;

document.documentElement.dir = 'rtl';
document.documentElement.lang = 'ar';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});

async function boot(){
  if(!isConfigured){
    renderConfigNeeded();
    return;
  }
  const { data: { session: s } } = await supabase.auth.getSession();
  session = s;
  supabase.auth.onAuthStateChange(async (_event, s2)=>{
    session=s2;
    if(session) await enterApp(); else renderAuth();
  });
  if(session) await enterApp(); else renderAuth();
}

function renderConfigNeeded(){
  app.innerHTML = `<div class="auth-wrap">
    <div class="auth-logo"><h1>خطوتنا</h1><p>نحو الاستقلال المالي ❤️</p></div>
    <div class="form-card">
      <h2>إعداد Supabase مطلوب</h2>
      <div class="notice">ضع رابط مشروع Supabase والمفتاح القابل للنشر داخل <b>src/supabase.js</b>، ثم شغّل ملف <b>supabase/schema.sql</b> في SQL Editor.</div>
      <p style="color:var(--muted)">بعدها يصبح التسجيل، العائلة المشتركة، المصاريف، الدخل، الأهداف والتحديث الفوري فعّالًا.</p>
    </div>
  </div>`;
}

function renderAuth(){
  app.innerHTML = `<div class="auth-wrap">
    <div class="auth-logo"><h1>خطوتنا</h1><p>نحو الاستقلال المالي ❤️</p></div>
    <div class="form-card">
      <div class="tabs"><button id="loginTab" class="active">تسجيل الدخول</button><button id="signupTab">حساب جديد</button></div>
      <form id="authForm">
        <div class="field" id="nameField" style="display:none"><label>الاسم</label><input id="name" autocomplete="name" placeholder="مثلاً: علاء"></div>
        <div class="field"><label>البريد الإلكتروني</label><input id="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>كلمة المرور</label><input id="password" type="password" required minlength="6" autocomplete="current-password"></div>
        <button class="btn primary" type="submit">دخول ❤️</button>
      </form>
      <div id="authMsg"></div>
    </div>
  </div>`;
  let mode='login';
  const loginTab=document.getElementById('loginTab'), signupTab=document.getElementById('signupTab'), nameField=document.getElementById('nameField');
  loginTab.onclick=()=>{mode='login';loginTab.classList.add('active');signupTab.classList.remove('active');nameField.style.display='none'};
  signupTab.onclick=()=>{mode='signup';signupTab.classList.add('active');loginTab.classList.remove('active');nameField.style.display='block'};
  document.getElementById('authForm').onsubmit=async e=>{
    e.preventDefault();
    const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value, name=document.getElementById('name')?.value.trim();
    const msg=document.getElementById('authMsg'); msg.innerHTML='<div class="notice">جاري التنفيذ...</div>';
    if(mode==='signup'){
      const { error }=await supabase.auth.signUp({email,password,options:{data:{display_name:name||'شريك الرحلة'}}});
      if(error) return msg.innerHTML=`<div class="notice">${error.message}</div>`;
      msg.innerHTML='<div class="notice success">تم إنشاء الحساب. إذا كان تأكيد البريد مفعّلًا، افتح رسالة التأكيد ثم سجل الدخول.</div>';
    }else{
      const { error }=await supabase.auth.signInWithPassword({email,password});
      if(error) msg.innerHTML=`<div class="notice">${error.message}</div>`;
    }
  };
}

async function enterApp(){
  const uid=session.user.id;
  let { data:p }=await supabase.from('profiles').select('*').eq('id',uid).maybeSingle();
  profile=p;
  const { data:members }=await supabase.from('household_members').select('household_id, households(*)').eq('user_id',uid).limit(1);
  if(!members?.length){ renderHouseholdSetup(); return; }
  household=members[0].households;
  currency=household.currency || 'SYP';
  await loadData();
  subscribeRealtime();
  renderShell('home');
}

function renderHouseholdSetup(){
  app.innerHTML=`<div class="auth-wrap">
    <div class="auth-logo"><h1>خطوتنا</h1><p>مساحتكما المالية المشتركة ❤️</p></div>
    <div class="form-card">
      <div class="tabs"><button id="createTab" class="active">إنشاء عائلة</button><button id="joinTab">لدي رمز دعوة</button></div>
      <form id="houseForm">
        <div class="field" id="familyNameField"><label>اسم المساحة</label><input id="familyName" placeholder="مثلاً: بيتنا الصغير"></div>
        <div class="field" id="inviteField" style="display:none"><label>رمز الدعوة</label><input id="inviteCode" maxlength="12" placeholder="مثلاً: AB12CD34"></div>
        <button class="btn primary" type="submit">متابعة ❤️</button>
      </form>
      <div id="houseMsg"></div>
    </div>
  </div>`;
  let mode='create';
  const createTab=document.getElementById('createTab'),joinTab=document.getElementById('joinTab');
  createTab.onclick=()=>{mode='create';createTab.classList.add('active');joinTab.classList.remove('active');document.getElementById('familyNameField').style.display='block';document.getElementById('inviteField').style.display='none'};
  joinTab.onclick=()=>{mode='join';joinTab.classList.add('active');createTab.classList.remove('active');document.getElementById('familyNameField').style.display='none';document.getElementById('inviteField').style.display='block'};
  document.getElementById('houseForm').onsubmit=async e=>{
    e.preventDefault(); const out=document.getElementById('houseMsg');
    out.innerHTML='<div class="notice">جاري التنفيذ...</div>';
    if(mode==='create'){
      const { data:hid, error }=await supabase.rpc('create_household',{p_name:document.getElementById('familyName').value.trim()||'عائلتنا'});
      if(error) return out.innerHTML=`<div class="notice">${error.message}</div>`;
      await enterApp();
    }else{
      const code=document.getElementById('inviteCode').value.trim().toUpperCase();
      const { error }=await supabase.rpc('join_household_by_code',{p_code:code});
      if(error) return out.innerHTML=`<div class="notice">${error.message}</div>`;
      await enterApp();
    }
  };
}

async function loadData(){
  const hid=household.id;
  const [tx,sv,go,bu,ch]=await Promise.all([
    supabase.from('transactions').select('*, profiles(display_name)').eq('household_id',hid).order('occurred_on',{ascending:false}).order('created_at',{ascending:false}).limit(100),
    supabase.from('savings').select('*, profiles(display_name)').eq('household_id',hid).order('saved_on',{ascending:false}).limit(100),
    supabase.from('goals').select('*').eq('household_id',hid).order('created_at',{ascending:false}),
    supabase.from('budgets').select('*').eq('household_id',hid),
    supabase.from('challenges').select('*').eq('household_id',hid).order('created_at',{ascending:false})
  ]);
  data={transactions:tx.data||[],savings:sv.data||[],goals:go.data||[],budgets:bu.data||[],challenges:ch.data||[]};
}

function subscribeRealtime(){
  if(realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel=supabase.channel(`household:${household.id}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'transactions',filter:`household_id=eq.${household.id}`},refreshRealtime)
    .on('postgres_changes',{event:'*',schema:'public',table:'savings',filter:`household_id=eq.${household.id}`},refreshRealtime)
    .on('postgres_changes',{event:'*',schema:'public',table:'goals',filter:`household_id=eq.${household.id}`},refreshRealtime)
    .subscribe();
}
async function refreshRealtime(){ await loadData(); const active=document.querySelector('.view.active')?.id?.replace('view-','')||'home'; renderView(active); }

function thisMonth(items,dateKey){
  const now=new Date(), y=now.getFullYear(), m=now.getMonth();
  return items.filter(x=>{const d=new Date(x[dateKey]);return d.getFullYear()===y&&d.getMonth()===m});
}
function sum(arr,key='amount'){return arr.reduce((a,x)=>a+Number(x[key]||0),0)}

function renderShell(active='home'){
  app.innerHTML=`<main class="app-shell">
    <div id="view-home" class="view"></div><div id="view-expenses" class="view"></div><div id="view-goals" class="view"></div><div id="view-analysis" class="view"></div><div id="view-settings" class="view"></div>
  </main>
  <nav class="bottom-nav">
    ${[['home','🏠','الرئيسية'],['expenses','💸','المصاريف'],['goals','🎯','الأهداف'],['analysis','📊','التحليل'],['settings','⚙️','الإعدادات']].map(([id,ico,lab])=>`<button class="nav-btn" data-view="${id}"><span>${ico}</span>${lab}</button>`).join('')}
  </nav>
  <div id="modal" class="modal"><div class="sheet" id="sheet"></div></div>`;
  document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>renderView(b.dataset.view));
  document.getElementById('modal').onclick=e=>{if(e.target.id==='modal') closeModal()};
  renderView(active);
}

function renderView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  const v=document.getElementById(`view-${name}`); if(!v)return; v.classList.add('active');
  if(name==='home') renderHome(v);
  if(name==='expenses') renderExpenses(v);
  if(name==='goals') renderGoals(v);
  if(name==='analysis') renderAnalysis(v);
  if(name==='settings') renderSettings(v);
}

function calc(){
  const mtx=thisMonth(data.transactions,'occurred_on');
  const income=sum(mtx.filter(x=>x.type==='income'));
  const expenses=sum(mtx.filter(x=>x.type==='expense'));
  const saved=sum(thisMonth(data.savings,'saved_on'));
  return {income,expenses,saved,balance:income-expenses,rate:percent(saved,income)};
}

function renderHome(v){
  const c=calc(), goal=data.goals[0], gp=goal?percent(goal.current_amount,goal.target_amount):0;
  v.innerHTML=`<div class="topbar"><div class="brand"><h1>صباح الخير ❤️</h1><p>رحلتنا مستمرة نحو الاستقلال المالي</p></div><div class="avatar">💚</div></div>
  <section class="hero"><small>رصيدنا المتاح</small><div class="balance">${money(c.balance,currency)}</div><small>إجمالي الدخل − إجمالي المصاريف</small></section>
  <div class="grid">
    <div class="card metric"><span>مصروفنا هذا الشهر</span><b>${money(c.expenses,currency)}</b></div>
    <div class="card metric"><span>دخلنا هذا الشهر</span><b>${money(c.income,currency)}</b></div>
    <div class="card metric"><span>وفرنا هذا الشهر</span><b>${money(c.saved,currency)}</b></div>
    <div class="card metric"><span>نسبة التوفير</span><b>${c.rate}%</b></div>
  </div>
  <div class="section-title"><h2>هدفنا الحالي 🎯</h2></div>
  <div class="card">${goal?`<div class="between row"><b>${goal.icon||'🎯'} ${goal.name}</b><span>${gp}%</span></div><p>${money(goal.current_amount,currency)} / ${money(goal.target_amount,currency)}</p><div class="progress"><i style="width:${Math.min(gp,100)}%"></i></div>`:'<div class="empty">لم نضف هدفًا بعد. لنبدأ بهدف صغير ❤️</div>'}</div>
  <div class="actions"><button class="btn primary" id="addExpense">إضافة مصروف 💸</button><button class="btn soft" id="addIncome">إضافة دخل 💰</button></div>
  <div class="section-title"><h2>آخر العمليات</h2><span class="pill">مشتركة</span></div>
  <div class="card">${data.transactions.slice(0,6).map(txRow).join('')||'<div class="empty">لا توجد عمليات بعد</div>'}</div>
  <div class="section-title"><h2>تحدي الأسبوع ❤️</h2></div>
  <div class="card">${renderChallenge()}</div>`;
  document.getElementById('addExpense').onclick=()=>openTransaction('expense');
  document.getElementById('addIncome').onclick=()=>openTransaction('income');
}

function txRow(t){
  const dict=t.type==='expense'?categories:incomeSources; const info=dict[t.category]||dict[t.source]||['📦','أخرى'];
  return `<div class="tx"><div class="icon">${info[0]}</div><div class="meta"><b>${info[1]}</b><small>${fmtDate(t.occurred_on)} • ${t.profiles?.display_name||'أحدنا'}</small></div><div class="amount ${t.type}">${t.type==='expense'?'−':'+'}${money(t.amount,currency)}</div></div>`;
}
function renderChallenge(){
  const ch=data.challenges.find(x=>x.status==='active');
  if(!ch)return `<div class="empty">لا يوجد تحدٍ نشط الآن</div>`;
  const p=percent(ch.current_amount,ch.target_amount);
  return `<b>${ch.title}</b><p>${ch.description||''}</p><div class="progress"><i style="width:${Math.min(p,100)}%"></i></div><p>${money(ch.current_amount,currency)} / ${money(ch.target_amount,currency)}</p>`;
}

function renderExpenses(v){
  const expenses=data.transactions.filter(x=>x.type==='expense');
  v.innerHTML=`<div class="topbar"><div class="brand"><h1>مصروفنا 💸</h1><p>نراقبه معًا بدون ضغط</p></div><button class="btn soft" id="newExpense">+ إضافة</button></div>
  <div class="card">${expenses.map(txRow).join('')||'<div class="empty">لا توجد مصاريف بعد 🎉</div>'}</div>
  <div class="section-title"><h2>الميزانية الشهرية</h2></div>
  ${renderBudgets()}`;
  document.getElementById('newExpense').onclick=()=>openTransaction('expense');
}
function renderBudgets(){
  if(!data.budgets.length)return `<div class="card empty">لم تحددا ميزانية للتصنيفات بعد</div>`;
  const monthExp=thisMonth(data.transactions.filter(x=>x.type==='expense'),'occurred_on');
  return data.budgets.map(b=>{
    const spent=sum(monthExp.filter(x=>x.category===b.category));
    const p=percent(spent,b.limit_amount); const info=categories[b.category]||['📦','أخرى'];
    return `<div class="card"><div class="between row"><b>${info[0]} ${info[1]}</b><span class="pill">${p}%</span></div><p>${money(spent,currency)} / ${money(b.limit_amount,currency)}</p><div class="progress"><i style="width:${Math.min(p,100)}%;${p>90?'background:#dc2626':''}"></i></div>${p>=80?'<div class="notice">اقتربنا من حد الميزانية لهذا التصنيف.</div>':''}</div>`;
  }).join('');
}

function renderGoals(v){
  v.innerHTML=`<div class="topbar"><div class="brand"><h1>أهدافنا 🎯</h1><p>خطوات صغيرة نحو أحلام كبيرة</p></div><button class="btn soft" id="newGoal">+ هدف</button></div>
  ${data.goals.map(g=>{
    const p=percent(g.current_amount,g.target_amount);
    return `<div class="card"><div class="between row"><b>${g.icon||'🎯'} ${g.name}</b><span>${p}%</span></div><p>${money(g.current_amount,currency)} / ${money(g.target_amount,currency)}</p><div class="progress"><i style="width:${Math.min(p,100)}%"></i></div><div class="actions"><button class="btn soft addGoalMoney" data-id="${g.id}">+ أضف مبلغًا</button><button class="btn ghost">❤️ معًا</button></div></div>`;
  }).join('')||'<div class="card empty">ابدآ بأول هدف مشترك ❤️</div>'}
  <div class="section-title"><h2>توفيرنا 🐷</h2><button class="btn soft" id="addSaving">+ أضف مبلغًا</button></div>
  <div class="card"><div class="grid"><div class="metric"><span>إجمالي المدخرات</span><b>${money(sum(data.savings),currency)}</b></div><div class="metric"><span>هذا الشهر</span><b>${money(sum(thisMonth(data.savings,'saved_on')),currency)}</b></div></div></div>`;
  document.getElementById('newGoal').onclick=openGoal;
  document.getElementById('addSaving').onclick=openSaving;
  document.querySelectorAll('.addGoalMoney').forEach(b=>b.onclick=()=>openGoalContribution(b.dataset.id));
}

function renderAnalysis(v){
  const c=calc(), expenses=thisMonth(data.transactions.filter(x=>x.type==='expense'),'occurred_on');
  const day=(new Date()).getDate(), avg=day?c.expenses/day:0;
  const catVals=Object.keys(categories).map(k=>[k,sum(expenses.filter(x=>x.category===k))]);
  const max=Math.max(...catVals.map(x=>x[1]),1);
  v.innerHTML=`<div class="topbar"><div class="brand"><h1>تحليلنا 📊</h1><p>نفهم أموالنا لنقرر معًا</p></div></div>
  <div class="kpi-row"><div class="kpi"><span>الدخل</span><b>${money(c.income,currency)}</b></div><div class="kpi"><span>المصاريف</span><b>${money(c.expenses,currency)}</b></div><div class="kpi"><span>التوفير</span><b>${money(c.saved,currency)}</b></div></div>
  <div class="card"><div class="between row"><span>متوسط المصروف اليومي</span><b>${money(avg,currency)}</b></div><div class="between row" style="margin-top:10px"><span>نسبة التوفير من الدخل</span><b>${c.rate}%</b></div></div>
  <div class="section-title"><h2>المصاريف حسب التصنيف</h2></div>
  <div class="card"><div class="bar-chart">${catVals.map(([k,val])=>`<div class="bar"><i style="height:${Math.max(5,(val/max)*130)}px"></i><small>${categories[k][0]}</small></div>`).join('')}</div></div>
  <div class="section-title"><h2>رحلتنا ❤️</h2></div>
  <div class="card"><p>🏆 أول مبلغ تم توفيره</p><p>🏅 أسبوع بدون مصاريف غير ضرورية</p><p>🐷 وصلنا لأول 100,000 ل.س</p><p>🎯 نحتفل بكل هدف نكمله معًا</p></div>`;
}

function renderSettings(v){
  v.innerHTML=`<div class="topbar"><div class="brand"><h1>الإعدادات ⚙️</h1><p>مساحتنا المالية المشتركة</p></div></div>
  <div class="form-card">
    <div class="field"><label>الاسم</label><input id="profileName" value="${profile?.display_name||''}"></div>
    <div class="field"><label>العملة</label><select id="currency"><option value="SYP" ${currency==='SYP'?'selected':''}>ل.س — الليرة السورية</option><option value="USD" ${currency==='USD'?'selected':''}>$ — الدولار</option><option value="EUR" ${currency==='EUR'?'selected':''}>€ — اليورو</option></select></div>
    <button class="btn primary" id="saveSettings">حفظ الإعدادات</button>
  </div>
  <div class="section-title"><h2>إدارة العائلة ❤️</h2></div>
  <div class="card"><span>رمز دعوة الزوج/الزوجة</span><div class="balance" style="color:var(--green);font-size:26px">${household.invite_code}</div><button class="btn soft" id="copyInvite">نسخ الرمز</button></div>
  <div class="card"><div class="between row"><span>الإشعارات</span><span class="pill">جاهزة للإضافة لاحقًا</span></div><p style="color:var(--muted)">بنية البيانات مناسبة لإضافة Push Notifications لاحقًا.</p></div>
  <button class="btn danger" id="logout">تسجيل الخروج</button>`;
  document.getElementById('saveSettings').onclick=async()=>{
    const name=document.getElementById('profileName').value.trim(), cur=document.getElementById('currency').value;
    await supabase.from('profiles').update({display_name:name}).eq('id',session.user.id);
    const {error}=await supabase.from('households').update({currency:cur}).eq('id',household.id);
    if(error)return toast(error.message,'error');
    profile.display_name=name; household.currency=cur; currency=cur; toast('تم حفظ الإعدادات ❤️'); renderView('settings');
  };
  document.getElementById('copyInvite').onclick=()=>navigator.clipboard.writeText(household.invite_code).then(()=>toast('تم نسخ رمز الدعوة'));
  document.getElementById('logout').onclick=()=>supabase.auth.signOut();
}

function openModal(html){document.getElementById('sheet').innerHTML=html;document.getElementById('modal').classList.add('open')}
function closeModal(){document.getElementById('modal').classList.remove('open')}

function openTransaction(type){
  const isExpense=type==='expense', dict=isExpense?categories:incomeSources;
  openModal(`<div class="between row"><h2>${isExpense?'إضافة مصروف 💸':'إضافة دخل 💰'}</h2><button class="btn ghost" id="closeM">✕</button></div>
  <form id="txForm">
    <div class="field"><label>المبلغ</label><input id="amount" type="number" min="0" step="0.01" required inputmode="decimal"></div>
    <div class="field"><label>${isExpense?'التصنيف':'مصدر الدخل'}</label><select id="kind">${Object.entries(dict).map(([k,x])=>`<option value="${k}">${x[0]} ${x[1]}</option>`).join('')}</select></div>
    <div class="field"><label>التاريخ</label><input id="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
    ${!isExpense?`<div class="field"><label>نوع الدخل</label><select id="recurring"><option value="false">لمرة واحدة</option><option value="true">متكرر</option></select></div>`:''}
    <div class="field"><label>ملاحظة اختيارية</label><textarea id="note" rows="3"></textarea></div>
    <button class="btn primary" type="submit">${isExpense?'حفظ المصروف':'حفظ الدخل'}</button>
  </form>`);
  document.getElementById('closeM').onclick=closeModal;
  document.getElementById('txForm').onsubmit=async e=>{
    e.preventDefault();
    const kind=document.getElementById('kind').value;
    const payload={household_id:household.id,user_id:session.user.id,type,amount:Number(document.getElementById('amount').value),occurred_on:document.getElementById('date').value,note:document.getElementById('note').value||null,category:isExpense?kind:null,source:!isExpense?kind:null,is_recurring:!isExpense?document.getElementById('recurring').value==='true':false};
    const {error}=await supabase.from('transactions').insert(payload);
    if(error)return toast(error.message,'error');
    closeModal(); await loadData(); renderView('home'); toast(isExpense?'تم حفظ مصروفنا ❤️':'تمت إضافة دخلنا ❤️');
  };
}

function openGoal(){
  openModal(`<div class="between row"><h2>هدف جديد 🎯</h2><button class="btn ghost" id="closeM">✕</button></div>
  <form id="goalForm"><div class="field"><label>اسم الهدف</label><input id="gname" required placeholder="مثلاً: صندوق الطوارئ"></div><div class="field"><label>المبلغ المطلوب</label><input id="gtarget" type="number" min="1" required></div><div class="field"><label>رمز</label><select id="gicon"><option>🛡️</option><option>🏡</option><option>🚗</option><option>💼</option><option>✈️</option><option>💰</option></select></div><div class="field"><label>تاريخ مستهدف اختياري</label><input id="gdate" type="date"></div><button class="btn primary">إنشاء الهدف</button></form>`);
  document.getElementById('closeM').onclick=closeModal;
  document.getElementById('goalForm').onsubmit=async e=>{e.preventDefault();const {error}=await supabase.from('goals').insert({household_id:household.id,name:document.getElementById('gname').value,target_amount:Number(document.getElementById('gtarget').value),icon:document.getElementById('gicon').value,target_date:document.getElementById('gdate').value||null});if(error)return toast(error.message,'error');closeModal();await loadData();renderView('goals');toast('تم إنشاء هدفنا الجديد 🎯')};
}
function openGoalContribution(id){
  openModal(`<div class="between row"><h2>إضافة مبلغ للهدف</h2><button class="btn ghost" id="closeM">✕</button></div><form id="contrib"><div class="field"><label>المبلغ</label><input id="camount" type="number" min="0" required></div><button class="btn primary">إضافة</button></form>`);
  document.getElementById('closeM').onclick=closeModal;
  document.getElementById('contrib').onsubmit=async e=>{e.preventDefault();const g=data.goals.find(x=>x.id===id);const val=Number(document.getElementById('camount').value);const {error}=await supabase.from('goals').update({current_amount:Number(g.current_amount)+val}).eq('id',id);if(error)return toast(error.message,'error');closeModal();await loadData();renderView('goals');toast('اقتربنا من هدفنا أكثر ❤️')};
}
function openSaving(){
  openModal(`<div class="between row"><h2>أضف مبلغًا وفرناه 🐷</h2><button class="btn ghost" id="closeM">✕</button></div><form id="savingForm"><div class="field"><label>المبلغ</label><input id="samount" type="number" min="0" required></div><div class="field"><label>التاريخ</label><input id="sdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>ملاحظة</label><input id="snote"></div><button class="btn primary">حفظ التوفير</button></form>`);
  document.getElementById('closeM').onclick=closeModal;
  document.getElementById('savingForm').onsubmit=async e=>{e.preventDefault();const {error}=await supabase.from('savings').insert({household_id:household.id,user_id:session.user.id,amount:Number(document.getElementById('samount').value),saved_on:document.getElementById('sdate').value,note:document.getElementById('snote').value||null});if(error)return toast(error.message,'error');closeModal();await loadData();renderView('goals');toast('أحسنتم! زادت مدخراتنا 🐷')};
}

boot();
