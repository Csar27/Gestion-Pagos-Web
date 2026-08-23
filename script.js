const defaultCategories = [{name:'Vivienda',color:'#ff856c'},{name:'Alimentos',color:'#88c9ed'},{name:'Transporte',color:'#c7f36b'},{name:'Ocio',color:'#d5a6e8'}];
let categories = JSON.parse(localStorage.getItem('cartera_categories') || 'null') || defaultCategories;
let payments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value);
const authScreen = $('authScreen'), app = document.querySelector('.app'), authForm = $('authForm');
const firebaseReady = window.firebaseConfig && !Object.values(window.firebaseConfig).some(value => String(value).startsWith('TU_'));
let auth, db, currentUser, loadedUid = '';
let registerMode = false;
if (firebaseReady) {
    firebase.initializeApp(window.firebaseConfig);
    auth = firebase.auth(); db = firebase.firestore();
    auth.onAuthStateChanged(user => {
        if (user) loadUserData(user).catch(error => { console.error(error); showAuth(); firebaseError(error); });
        else { currentUser = null; categories = []; payments = []; showAuth(); }
    });
    auth.getRedirectResult().then(result => {
        if (result.user) return loadUserData(result.user);
        if (!auth.currentUser) showAuth();
    }).catch(error => { showAuth(); firebaseError(error); });
}
function showApp(user) { authScreen.classList.add('hidden'); app.classList.add('authenticated'); $('activeUser').textContent = user.email || 'Cuenta de Google'; }
function showAuth() { app.classList.remove('authenticated'); authScreen.classList.remove('hidden'); }
function setAuthMode(register) {
    registerMode = register;
    $('authTitle').textContent = register ? 'Crea tu cuenta' : 'Inicia sesión';
    $('authCopy').textContent = register ? 'Configura tu acceso para empezar.' : 'Accede a tu espacio para continuar.';
    $('authSubmit').textContent = register ? 'Crear cuenta' : 'Iniciar sesión';
    $('authSwitch').textContent = register ? '¿Ya tienes cuenta? Iniciar sesión' : '¿Primera vez? Crear una cuenta';
    $('confirmPasswordLabel').classList.toggle('hidden', !register);
    authForm.elements.confirmPassword.required = register;
    authForm.reset(); $('authError').textContent = '';
}
function firebaseError(error) {
    const messages = {'auth/email-already-in-use':'Este correo ya está registrado.','auth/invalid-credential':'Correo o contraseña incorrectos.','auth/popup-closed-by-user':'Ventana de Google cerrada.','auth/popup-blocked':'El navegador bloqueó la ventana. Intenta otra vez.','auth/unauthorized-domain':'Agrega este dominio en Firebase > Authentication > Settings > Authorized domains.','auth/operation-not-allowed':'Activa Google en Firebase > Authentication > Sign-in method.','auth/weak-password':'La contraseña debe tener al menos 6 caracteres.','permission-denied':'Firebase rechazó el acceso a Firestore. Revisa las reglas de seguridad.','failed-precondition':'Debes crear la base de datos de Firestore.'};
    $('authError').textContent = messages[error.code] || `Firebase: ${error.message || 'no fue posible iniciar sesión.'}`;
}
async function loadUserData(user) {
    if (loadedUid === user.uid) return;
    loadedUid = user.uid;
    currentUser = user;
    const userRef = db.collection('users').doc(user.uid), snapshot = await userRef.collection('categories').get();
    categories = snapshot.empty ? defaultCategories.map(category => ({...category})) : snapshot.docs.map(doc => ({id:doc.id, ...doc.data()}));
    const paymentsSnapshot = await userRef.collection('payments').get();
    payments = paymentsSnapshot.docs.map(doc => ({id:doc.id, ...doc.data()}));
    if (snapshot.empty) {
        categories = await Promise.all(categories.map(async category => {
            const ref = await userRef.collection('categories').add(category);
            return {...category, id:ref.id};
        }));
    }
    populateMonths(); $('monthFilter').value = new Date().toISOString().slice(0,7); render(); showApp(user);
}
authForm.onsubmit = async e => {
    e.preventDefault();
    if (!firebaseReady) { $('authError').textContent = 'Configura Firebase en firebase-config.js para continuar.'; return; }
    const data = Object.fromEntries(new FormData(e.target)), email = data.email.trim().toLowerCase();
    try {
        if (registerMode) {
            if (data.password !== data.confirmPassword) { $('authError').textContent = 'Las contraseñas no coinciden.'; return; }
            await auth.createUserWithEmailAndPassword(email, data.password);
        } else await auth.signInWithEmailAndPassword(email, data.password);
    } catch (error) { firebaseError(error); }
};
$('authSwitch').onclick = () => setAuthMode(!registerMode);
$('googleBtn').onclick = async () => {
    if (!firebaseReady) { $('authError').textContent = 'Configura Firebase en firebase-config.js para continuar.'; return; }
    if (!auth) { $('authError').textContent = 'Firebase no se pudo iniciar. Recarga la página.'; return; }
    const provider = new firebase.auth.GoogleAuthProvider();
    $('googleBtn').disabled = true; $('googleBtn').textContent = 'Conectando con Google...'; $('authError').textContent = '';
    try { await auth.signInWithRedirect(provider); }
    catch (error) { $('googleBtn').disabled = false; $('googleBtn').innerHTML = '<span class="google-mark">G</span> Google'; firebaseError(error); }
};
$('logoutBtn').onclick = async () => {
    if (!auth) return;
    $('logoutBtn').disabled = true;
    try { await auth.signOut(); }
    catch (error) { $('authError').textContent = `No fue posible cerrar sesión: ${error.message}`; }
    finally { $('logoutBtn').disabled = false; }
};
const currentMonth = () => $('monthFilter').value || new Date().toISOString().slice(0,7);
function render() {
    const month = currentMonth(), filtered = payments.filter(p=>p.date.startsWith(month));
    const total = filtered.reduce((sum,p)=>sum+Number(p.amount),0), byCat = {};
    filtered.forEach(p=>byCat[p.category]=(byCat[p.category]||0)+Number(p.amount));
    $('monthTotal').innerHTML = `${money(total)} <small>COP</small>`; $('monthDelta').textContent = `${filtered.length} pago${filtered.length===1?'':'s'}`;
    $('dailyAverage').textContent = money(total / new Date(Number(month.split('-')[0]),Number(month.split('-')[1]),0).getDate());
    const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0]; $('topCategory').textContent = top ? top[0] : '—';
    $('categories').innerHTML = categories.map(c=>`<div class="category"><div class="category-info"><i class="dot" style="background:${c.color}"></i>${escapeHtml(c.name)}</div><div class="category-total">${money(byCat[c.name]||0)}</div></div>`).join('');
        $('categoryList').innerHTML = categories.map(c=>`<div class="category"><div class="category-info"><i class="dot" style="background:${c.color}"></i>${escapeHtml(c.name)}</div><button type="button" class="category-delete" data-category-id="${c.id}" title="Eliminar categoría">×</button></div>`).join('');
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
$('paymentForm').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));const payment={...data,amount:Number(data.amount)};const ref=await userCollection('payments').add(payment);payments.push({...payment,id:ref.id});populateMonths();$('monthFilter').value=data.date.slice(0,7);render();closeModals()}catch(error){alert('No fue posible guardar el pago en Firebase.')}}; $('categoryForm').onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(e.target));if(!categories.some(c=>c.name.toLowerCase()===data.name.toLowerCase())){const ref=await userCollection('categories').add(data);categories.push({...data,id:ref.id});render()}e.target.reset()}catch(error){alert('No fue posible guardar la categoría en Firebase.')}}; $('categoryList').onclick=async e=>{const id=e.target.dataset.categoryId;if(id&&confirm('¿Eliminar esta categoría?')){try{await userCollection('categories').doc(id).delete();categories=categories.filter(c=>c.id!==id);render()}catch(error){alert('No fue posible eliminar la categoría.')}}}; $('payments').onclick=async e=>{const id=e.target.dataset.delete;if(id){try{await userCollection('payments').doc(id).delete();payments=payments.filter(p=>p.id!=id);populateMonths();render()}catch(error){alert('No fue posible eliminar el pago.')}}}; $('clearBtn').onclick=async()=>{if(payments.length&&confirm('¿Eliminar todos los pagos?')){try{await Promise.all(payments.map(payment=>userCollection('payments').doc(payment.id).delete()));payments=[];populateMonths();render()}catch(error){alert('No fue posible eliminar todos los pagos.')}}}; $('themeBtn').onclick=()=>setTheme(!document.body.classList.contains('dark')); setTheme(localStorage.getItem('cartera_theme')==='dark');
const userCollection = name => db.collection('users').doc(currentUser.uid).collection(name);
