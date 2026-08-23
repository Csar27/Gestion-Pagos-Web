const defaultCategories = [{name:'Vivienda',color:'#ff856c'},{name:'Alimentos',color:'#88c9ed'},{name:'Transporte',color:'#c7f36b'},{name:'Ocio',color:'#d5a6e8'}];
let categories = JSON.parse(localStorage.getItem('cartera_categories') || 'null') || defaultCategories;
let payments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value);
const save = () => { localStorage.setItem('cartera_categories',JSON.stringify(categories)); localStorage.setItem('cartera_payments',JSON.stringify(payments)); };
const authScreen = $('authScreen'), app = document.querySelector('.app'), authForm = $('authForm');
let registerMode = false;
function setAuthMode(register) {
    registerMode = register;
    $('authTitle').textContent = register ? 'Crea tu cuenta' : 'Inicia sesión';
    $('authCopy').textContent = register ? 'Configura tu acceso para empezar.' : 'Accede a tu espacio para continuar.';
    $('authSubmit').textContent = register ? 'Crear cuenta' : 'Iniciar sesión';
    $('authSwitch').textContent = register ? '¿Ya tienes cuenta? Iniciar sesión' : '¿Primera vez? Crear una cuenta';
    $('confirmPasswordLabel').classList.toggle('hidden', !register);
    authForm.elements.confirmPassword.required = register;
    authForm.reset();
    $('authError').textContent = '';
}
function showApp(email) { authScreen.classList.add('hidden'); app.classList.add('authenticated'); $('activeUser').textContent = email; }
function showAuth() { app.classList.remove('authenticated'); authScreen.classList.remove('hidden'); setAuthMode(false); }
authForm.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target)), email = data.email.trim().toLowerCase();
    const storedUser = JSON.parse(localStorage.getItem('cartera_user') || 'null');
    if (registerMode) {
        if (storedUser) { $('authError').textContent = 'Ya existe una cuenta en este dispositivo.'; return; }
        if (data.password !== data.confirmPassword) { $('authError').textContent = 'Las contraseñas no coinciden.'; return; }
        localStorage.setItem('cartera_user', JSON.stringify({email, password:data.password}));
        localStorage.setItem('cartera_session', email); showApp(email); return;
    }
    if (!storedUser || storedUser.email !== email || storedUser.password !== data.password) { $('authError').textContent = 'Correo o contraseña incorrectos.'; return; }
    localStorage.setItem('cartera_session', email); showApp(email);
};
$('authSwitch').onclick = () => setAuthMode(!registerMode);
$('logoutBtn').onclick = () => { localStorage.removeItem('cartera_session'); showAuth(); };
const currentMonth = () => $('monthFilter').value || new Date().toISOString().slice(0,7);
function render() {
    const month = currentMonth(), filtered = payments.filter(p=>p.date.startsWith(month));
    const total = filtered.reduce((sum,p)=>sum+Number(p.amount),0), byCat = {};
    filtered.forEach(p=>byCat[p.category]=(byCat[p.category]||0)+Number(p.amount));
    $('monthTotal').innerHTML = `${money(total)} <small>COP</small>`; $('monthDelta').textContent = `${filtered.length} pago${filtered.length===1?'':'s'}`;
    $('dailyAverage').textContent = money(total / new Date(Number(month.split('-')[0]),Number(month.split('-')[1]),0).getDate());
    const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0]; $('topCategory').textContent = top ? top[0] : '—';
    $('categories').innerHTML = categories.map(c=>`<div class="category"><div class="category-info"><i class="dot" style="background:${c.color}"></i>${escapeHtml(c.name)}</div><div class="category-total">${money(byCat[c.name]||0)}</div></div>`).join('');
    $('categoryList').innerHTML = categories.map(c=>`<div class="category"><div class="category-info"><i class="dot" style="background:${c.color}"></i>${escapeHtml(c.name)}</div><button type="button" class="category-delete" data-category="${escapeHtml(c.name)}" title="Eliminar categoría">×</button></div>`).join('');
    const max = Math.max(...Array.from({length:6},(_,i)=>filtered.filter(p=>new Date(p.date).getDate()>=i*5+1&&new Date(p.date).getDate()<=i*5+5).reduce((s,p)=>s+Number(p.amount),0)),1);
    $('chart').innerHTML = Array.from({length:6},(_,i)=>{const value=filtered.filter(p=>{const d=new Date(p.date).getDate();return d>=i*5+1&&d<=i*5+5}).reduce((s,p)=>s+Number(p.amount),0);return `<div class="bar-wrap"><div class="bar ${i===5?'current':''}" style="height:${Math.max(4,value/max*130)}px" title="${money(value)}"></div><span>${i*5+1}-${Math.min(i*5+5,31)}</span></div>`}).join('');
    const rows = payments.slice().sort((a,b)=>b.date.localeCompare(a.date)); $('payments').innerHTML = rows.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td><span class="cat"><i class="dot" style="background:${(categories.find(c=>c.name===p.category)||{}).color||'#aaa'}"></i>${escapeHtml(p.category)}</span></td><td class="date">${new Date(p.date+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td><td style="text-align:right;font-weight:800">${money(p.amount)}</td><td><button class="row-actions" data-delete="${p.id}" title="Eliminar">×</button></td></tr>`).join(''); $('emptyState').classList.toggle('hidden',rows.length>0); $('payments').parentElement.classList.toggle('hidden',rows.length===0);
}
function escapeHtml(text){return String(text).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function populateMonths(){const months=[...new Set([new Date().toISOString().slice(0,7),...payments.map(p=>p.date.slice(0,7))])].sort().reverse();$('monthFilter').innerHTML=months.map(m=>`<option value="${m}">${new Date(m+'-02').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>`).join('');}
function openModal(id){$(id).classList.add('open')} function closeModals(){document.querySelectorAll('.modal-backdrop').forEach(m=>m.classList.remove('open'))}
function exportData(){const csv=['Concepto,Categoria,Fecha,Importe',...payments.map(p=>[p.name,p.category,p.date,p.amount].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))].join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}), a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cartera-pagos.csv';a.click();URL.revokeObjectURL(a.href)}
function setTheme(dark){document.body.classList.toggle('dark',dark);localStorage.setItem('cartera_theme',dark?'dark':'light');$('themeIcon').textContent=dark?'☀':'☾';$('themeLabel').textContent=dark?'Tema claro':'Tema oscuro'}
populateMonths(); $('monthFilter').value=new Date().toISOString().slice(0,7); render(); $('todayLabel').textContent=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
$('addBtn').onclick=()=>{ $('paymentForm').reset();$('paymentForm').date.value=new Date().toISOString().slice(0,10);$('categorySelect').innerHTML=categories.map(c=>`<option>${escapeHtml(c.name)}</option>`).join('');openModal('paymentModal')}; $('manageBtn').onclick=()=>openModal('categoryModal'); $('categoriesNav').onclick=()=>openModal('categoryModal'); $('exportBtn').onclick=exportData; $('exportNav').onclick=exportData; $('monthFilter').onchange=render; document.querySelectorAll('.closeModal').forEach(b=>b.onclick=closeModals);
$('paymentForm').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));payments.push({...data,amount:Number(data.amount),id:Date.now()});save();populateMonths();$('monthFilter').value=data.date.slice(0,7);render();closeModals()}; $('categoryForm').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(!categories.some(c=>c.name.toLowerCase()===data.name.toLowerCase()))categories.push(data);save();render();e.target.reset()}; $('categoryList').onclick=e=>{const name=e.target.dataset.category;if(name&&confirm(`¿Eliminar la categoría ${name}?`)){categories=categories.filter(c=>c.name!==name);save();render()}}; $('payments').onclick=e=>{const id=e.target.dataset.delete;if(id){payments=payments.filter(p=>p.id!=id);save();populateMonths();render()}}; $('clearBtn').onclick=()=>{if(payments.length&&confirm('¿Eliminar todos los pagos?')){payments=[];save();render()}}; $('themeBtn').onclick=()=>setTheme(!document.body.classList.contains('dark')); setTheme(localStorage.getItem('cartera_theme')==='dark');
const session = localStorage.getItem('cartera_session'); if (session) showApp(session);
