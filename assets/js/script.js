const defaultCategories = [{name:'Vivienda',color:'#ff856c'},{name:'Alimentos',color:'#88c9ed'},{name:'Transporte',color:'#c7f36b'},{name:'Ocio',color:'#d5a6e8'}];
const PAYMENT_STATUSES = ['pagado', 'no_pagado', 'pendiente'];
const getPaymentStatus = payment => PAYMENT_STATUSES.includes(payment.status) ? payment.status : 'pagado';
const paymentStatusLabel = status => ({ pagado:'Pagado', no_pagado:'No pagado', pendiente:'Pendiente' }[status] || 'Pagado');
const CATEGORY_PALETTE = [
    { value:'#ff856c', name:'Coral' },
    { value:'#f87171', name:'Rojo suave' },
    { value:'#ef4444', name:'Rojo vivo' },
    { value:'#fdba74', name:'Durazno' },
    { value:'#ffa94d', name:'Naranja' },
    { value:'#f97316', name:'Naranja intenso' },
    { value:'#fbbf24', name:'Ámbar' },
    { value:'#f5ca72', name:'Amarillo' },
    { value:'#d97706', name:'Ocre' },
    { value:'#d9e06b', name:'Limón' },
    { value:'#c7f36b', name:'Lima' },
    { value:'#a3e635', name:'Verde hoja' },
    { value:'#65a30d', name:'Verde bosque' },
    { value:'#6ee7b7', name:'Esmeralda' },
    { value:'#a7f3d0', name:'Verde menta' },
    { value:'#14b8a6', name:'Verde agua' },
    { value:'#7dd3fc', name:'Celeste' },
    { value:'#22d3ee', name:'Cian' },
    { value:'#0ea5e9', name:'Azul cielo' },
    { value:'#60a5fa', name:'Azul' },
    { value:'#818cf8', name:'Índigo' },
    { value:'#2563eb', name:'Azul profundo' },
    { value:'#c4b5fd', name:'Violeta suave' },
    { value:'#9333ea', name:'Púrpura' },
    { value:'#d5a6e8', name:'Lila' },
    { value:'#f0abfc', name:'Orquídea' },
    { value:'#db2777', name:'Magenta' },
    { value:'#f9a8d4', name:'Rosa' },
    { value:'#f472b6', name:'Rosa fuerte' },
    { value:'#94a3b8', name:'Gris acero' }
];
const normalizeColor = color => String(color || '').trim().toLowerCase();
function hslToHex(h, s, l) {
    const a = s / 100 * Math.min(l, 100 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const value = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * value).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
function freeCategoryColor(usedColors) {
    const fromPalette = CATEGORY_PALETTE.find(color => !usedColors.has(normalizeColor(color.value)));
    if (fromPalette) return fromPalette.value;
    for (let hue = 0; hue < 360; hue += 7) {
        const candidate = hslToHex(hue, 72, 68);
        if (!usedColors.has(candidate)) return candidate;
    }
    return '#c7f36b';
}
function categoryColorOwner(color, excludeId) {
    const key = normalizeColor(color);
    if (!key) return null;
    return categories.find(category => category.id !== excludeId && normalizeColor(category.color) === key) || null;
}
function normalizeCategoryColors() {
    const used = new Set();
    const changed = [];
    categories.forEach(category => {
        const key = normalizeColor(category.color);
        if (!key || used.has(key)) {
            const next = freeCategoryColor(used);
            changed.push({ id:category.id, from:category.color, to:next });
            category.color = next;
        }
        used.add(normalizeColor(category.color));
    });
    return changed;
}
function persistCategories() {
    const changed = normalizeCategoryColors();
    localStorage.setItem('cartera_categories', JSON.stringify(categories));
    let collection = null;
    try { collection = typeof userCollection === 'function' ? userCollection('categories') : null; }
    catch (error) { collection = null; }
    if (changed.length && collection) {
        changed.filter(category => !String(category.id).startsWith('local-')).forEach(category => {
            collection.doc(category.id).update({ color:category.to }).catch(error => console.warn('No se pudo actualizar el color', error));
        });
    }
    return changed;
}
function hydrateLocalData() {
    try {
        const savedCategories = JSON.parse(localStorage.getItem('cartera_categories') || 'null');
        if (savedCategories && Array.isArray(savedCategories) && savedCategories.length) {
            categories = savedCategories;
        }
        const savedPayments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
        if (Array.isArray(savedPayments)) {
            payments = dedupePayments(savedPayments.map(payment => ({ ...payment, status:getPaymentStatus(payment) })));
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
        }
    } catch (error) {
        console.warn('No se pudieron cargar los datos guardados localmente.', error);
    }
}
let categories = JSON.parse(localStorage.getItem('cartera_categories') || 'null') || defaultCategories;
let payments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
hydrateLocalData();
persistCategories();
let paymentFilters = { from:'', to:'', category:'', status:'', search:'', page:1, pageSize: Number(localStorage.getItem('cartera_page_size') || 5), focusId:null };
const selectedPayments = new Set();
let editingPaymentId = null;
let paymentSubmitLocked = false;
let incomes = [];
try { incomes = JSON.parse(localStorage.getItem('cartera_incomes') || '[]'); } catch (e) { incomes = []; }
let editingIncomeId = null;
let savingsGoals = [];
try { savingsGoals = JSON.parse(localStorage.getItem('cartera_savings_goals') || '[]'); } catch (e) { savingsGoals = []; }
const FINANCE_NOTES_KEY = 'cartera_finance_notes';
let financialNotes = [];
try { financialNotes = JSON.parse(localStorage.getItem(FINANCE_NOTES_KEY) || '[]'); } catch (error) { financialNotes = []; }
const PAGE_SIZE = paymentFilters.pageSize || 5;
const $ = id => document.getElementById(id);
const SUPPORTED_CURRENCIES = {
    COP: { code:'COP', symbol:'$', locale:'es-CO', decimals:0, label:'Peso colombiano (COP)', rateToCOP:1 },
    USD: { code:'USD', symbol:'US$', locale:'en-US', decimals:2, label:'Dólar estadounidense (USD)', rateToCOP:4200 },
    EUR: { code:'EUR', symbol:'€', locale:'es-ES', decimals:2, label:'Euro (EUR)', rateToCOP:4500 },
    MXN: { code:'MXN', symbol:'Mex$', locale:'es-MX', decimals:2, label:'Peso mexicano (MXN)', rateToCOP:230 }
};
let appCurrency = localStorage.getItem('cartera_currency') || 'COP';

function convertCurrency(amount, fromCur, toCur) {
    const num = Number(amount) || 0;
    const from = String(fromCur || 'COP').toUpperCase();
    const to = String(toCur || appCurrency).toUpperCase();
    if (from === to) return num;
    const fromRate = (SUPPORTED_CURRENCIES[from] && SUPPORTED_CURRENCIES[from].rateToCOP) || 1;
    const toRate = (SUPPORTED_CURRENCIES[to] && SUPPORTED_CURRENCIES[to].rateToCOP) || 1;
    return (num * fromRate) / toRate;
}

const money = (value, currencyCode) => {
    const cur = String(currencyCode || appCurrency || 'COP').toUpperCase();
    const info = SUPPORTED_CURRENCIES[cur] || SUPPORTED_CURRENCIES.COP;
    const num = Number(value) || 0;
    try {
        return new Intl.NumberFormat(info.locale, {
            style: 'currency',
            currency: info.code,
            maximumFractionDigits: info.decimals,
            minimumFractionDigits: info.decimals > 0 ? 2 : 0
        }).format(num);
    } catch (e) {
        return `${info.symbol} ${num.toFixed(info.decimals)}`;
    }
};
const compactMoney = (value, currencyCode) => {
    const cur = String(currencyCode || appCurrency || 'COP').toUpperCase();
    const info = SUPPORTED_CURRENCIES[cur] || SUPPORTED_CURRENCIES.COP;
    const numeric = Number(value) || 0;
    if (numeric >= 1e6) return `${info.symbol} ${new Intl.NumberFormat(info.locale, { maximumFractionDigits: 1 }).format(numeric / 1e6)} M`;
    if (numeric >= 1e3) return `${info.symbol} ${new Intl.NumberFormat(info.locale, { maximumFractionDigits: 0 }).format(numeric / 1e3)} k`;
    return money(numeric, cur);
};
let storage = null;
let fcmMessaging = null;
let syncStatus = 'synced'; // 'synced' | 'syncing' | 'offline' | 'conflict'
let firestoreUnsubscribers = [];
let lastSyncTimestamp = localStorage.getItem('cartera_last_sync') || new Date().toISOString();
let selectedBudgetMonth = new Date().toISOString().slice(0, 7);
let selectedAttachmentFile = null;

function getCategoryBudget(category, monthKey) {
    if (!category) return 0;
    const m = monthKey || selectedBudgetMonth || currentMonth();
    if (category.monthlyBudgets && category.monthlyBudgets[m] !== undefined && category.monthlyBudgets[m] !== null && category.monthlyBudgets[m] !== '') {
        return Number(category.monthlyBudgets[m]) || 0;
    }
    return Number(category.budget) || 0;
}


const formatMoneyInput = value => {
    const digitsOnly = String(value ?? '').replace(/[^\d]/g, '');
    if (!digitsOnly) return '';
    const numeric = Number(digitsOnly);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(numeric);
};
const parseMoneyInput = value => Number(String(value ?? '').replace(/\./g, '').replace(/,/g, '').replace(/[^\d-]/g, '')) || 0;
const authScreen = $('authScreen'), app = document.querySelector('.app');
const firebaseReady = !!(window.firebaseConfig && !Object.values(window.firebaseConfig).some(value => String(value).startsWith('TU_'))) && location.protocol !== 'file:';
const guestUser = { email:'Invitado', uid:'guest-user', displayName:'Invitado', isGuest:true };
function isGuestSession(user = currentUser) {
    return !!user && (user.isGuest || user.uid === 'guest-user' || String(user.email || '').toLowerCase() === 'invitado');
}
function isLocalOnlySession(user = currentUser) {
    if (!user) return true;
    return isGuestSession(user) || String(user.email || '').startsWith('Modo local');
}
let auth, db, currentUser, loadedUid = '';
if (typeof firebase !== 'undefined' && firebaseReady) {
    firebase.initializeApp(window.firebaseConfig);
    auth = firebase.auth(); db = firebase.firestore();
    try { db.enablePersistence({ synchronizeTabs:true }).catch(() => {}); } catch (e) {}
    if (firebase.storage) {
        try { storage = firebase.storage(); } catch (e) { console.warn('Storage no inicializado:', e); }
    }
    if (firebase.messaging && typeof firebase.messaging.isSupported === 'function' && firebase.messaging.isSupported()) {
        try { fcmMessaging = firebase.messaging(); } catch (e) { console.warn('FCM no soportado en este navegador:', e); }
    }
    auth.onAuthStateChanged(user => {
        if (user) {
            loadUserData(user).catch(error => { console.error(error); showAuth(); firebaseError(error); });
        } else if (localStorage.getItem('cartera_guest_session') === '1') {
            currentUser = { ...guestUser };
            showApp(currentUser);
            updateSyncStatusUI('offline', 'Modo invitado');
        } else {
            currentUser = null; categories = []; payments = []; showAuth();
        }
    });
    auth.getRedirectResult().then(result => {
        if (result.user) return loadUserData(result.user);
        if (!auth.currentUser && localStorage.getItem('cartera_guest_session') !== '1') showAuth();
    }).catch(error => { showAuth(); firebaseError(error); });
} else {
    currentUser = { email: 'Modo local' };
    if (localStorage.getItem('cartera_guest_session') === '1') {
        currentUser = { ...guestUser };
        showApp(currentUser);
    } else {
        showApp(currentUser);
    }
    if (!window.firebaseConfig) {
        $('authError').textContent = 'Configura Firebase para habilitar Google.';
    } else if (location.protocol === 'file:') {
        $('authError').textContent = 'Abre la app con un servidor local (python -m http.server 8000) para usar Google. En modo archivo se usa sesión local.';
    }
    // Semilla de ejemplo solo si no hay pagos guardados, para que los gráficos se vean con datos
    if (!payments || payments.length === 0) {
        const hoy = new Date().toISOString().slice(0,10);
        const mes = hoy.slice(0,7);
        const ejemplo = [
            { name:'Arriendo', category:'Vivienda', date:`${mes}-01`, status:'pagado', amount:900000, recurring:true },
            { name:'Mercado', category:'Alimentos', date:`${mes}-05`, status:'pagado', amount:180000 },
            { name:'Mercado', category:'Alimentos', date:`${mes}-12`, status:'pendiente', amount:120000 },
            { name:'Transporte', category:'Transporte', date:`${mes}-08`, status:'pagado', amount:45000 },
            { name:'Internet', category:'Servicios', date:`${mes}-10`, status:'no_pagado', amount:79900 },
            { name:'Ocio', category:'Ocio', date:`${mes}-15`, status:'pendiente', amount:60000 },
        ];
        payments = ejemplo.map((p, i) => ({ id:`local-${i+1}`, ...p }));
        localStorage.setItem('cartera_payments', JSON.stringify(payments));
    }
    render();
    renderReports();
    renderCharts();
    populateMonths();
    syncRecurringPayments();
}
function getUserDisplayName(user) {
    if (!user) return 'Invitado';
    if (user.displayName) return user.displayName.trim();
    if (user.email) return user.email.split('@')[0];
    return 'Cuenta de Google';
}
function getUserInitials(user) {
    const name = getUserDisplayName(user).trim();
    if (!name) return 'I';
    const parts = name.split(/\s+/).slice(0, 2);
    const initials = parts.map(part => part.charAt(0).toUpperCase()).join('');
    return initials || 'I';
}
function updateProfileUI(user) {
    const name = getUserDisplayName(user);
    const initials = getUserInitials(user);
    const profileName = $('profileName');
    const activeUser = $('activeUser');
    const avatar = $('profileAvatar');
    const role = $('profileRole');
    if (profileName) profileName.textContent = name;
    if (activeUser) activeUser.textContent = name;
    if (avatar) avatar.textContent = initials.slice(0, 2);
    if (role) role.textContent = user?.isGuest ? 'Invitado' : (user?.email || 'Usuario');
}
function showApp(user) {
    authScreen.classList.add('hidden');
    app.classList.add('authenticated');
    updateProfileUI(user);
}
function showAuth() {
    app.classList.remove('authenticated');
    authScreen.classList.remove('hidden');
    if ($('profileName')) $('profileName').textContent = 'Invitado';
    if ($('profileRole')) $('profileRole').textContent = 'Invitado';
    if ($('profileAvatar')) $('profileAvatar').textContent = 'I';
    const menu = $('profileMenu');
    if (menu) menu.classList.add('hidden');
}
function firebaseError(error) {
    const messages = {'auth/email-already-in-use':'Este correo ya está registrado.','auth/invalid-credential':'Correo o contraseña incorrectos.','auth/popup-closed-by-user':'Ventana de Google cerrada.','auth/popup-blocked':'El navegador bloqueó la ventana. Intenta otra vez.','auth/unauthorized-domain':'Agrega este dominio en Firebase > Authentication > Settings > Authorized domains.','auth/operation-not-allowed':'Activa Google en Firebase > Authentication > Sign-in method.','auth/weak-password':'La contraseña debe tener al menos 6 caracteres.','permission-denied':'Firebase rechazó el acceso a Firestore. Revisa las reglas de seguridad.','failed-precondition':'Debes crear la base de datos de Firestore.'};
    $('authError').textContent = messages[error.code] || `Firebase: ${error.message || 'no fue posible iniciar sesión.'}`;
}
async function loadUserData(user) {
    if (loadedUid === user.uid) return;
    loadedUid = user.uid;
    currentUser = user;
    updateSyncStatusUI('syncing', 'Sincronizando...');
    const userRef = db.collection('users').doc(user.uid);
    const snapshot = await userRef.collection('categories').get();
    const remoteCategories = snapshot.empty ? defaultCategories.map(category => ({...category})) : snapshot.docs.map(doc => ({id:doc.id, ...doc.data()}));
    
    // Categorias: reconciliar
    categories = remoteCategories;
    persistCategories();
    if (snapshot.empty) {
        categories = await Promise.all(categories.map(async category => {
            const ref = await userRef.collection('categories').add({ ...category, updatedAt: new Date().toISOString() });
            return {...category, id:ref.id};
        }));
    }

    // Pagos: reconciliacion bidireccional
    const paymentsSnapshot = await userRef.collection('payments').get();
    const remotePayments = paymentsSnapshot.docs.map(doc => ({id:doc.id, ...doc.data(), status:getPaymentStatus(doc.data())}));
    const localPayments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
    const mergedMap = new Map();
    remotePayments.forEach(rp => mergedMap.set(rp.id, rp));

    // Si habia pagos creados offline con local-*, subirlos a Firestore
    for (const lp of localPayments) {
        if (String(lp.id).startsWith('local-')) {
            const exists = remotePayments.some(rp => rp.name === lp.name && rp.date === lp.date && Number(rp.amount) === Number(lp.amount));
            if (!exists) {
                try {
                    const toUpload = { ...lp, updatedAt: new Date().toISOString() };
                    delete toUpload._dirty;
                    const ref = await userRef.collection('payments').add(toUpload);
                    mergedMap.set(ref.id, { ...toUpload, id: ref.id });
                } catch (e) {
                    mergedMap.set(lp.id, lp);
                }
            }
        } else if (lp._dirty && mergedMap.has(lp.id)) {
            // Conflicto local vs remoto
            const remoteDoc = mergedMap.get(lp.id);
            const { merged, conflict, pushRemote } = mergeRecords(lp, remoteDoc);
            mergedMap.set(lp.id, merged);
            if (pushRemote) userRef.collection('payments').doc(lp.id).set(merged).catch(() => {});
            if (conflict) showToast('Se sincronizaron cambios concurrentes.', 'info');
        }
    }
    payments = dedupePayments(Array.from(mergedMap.values()));
    localStorage.setItem('cartera_payments', JSON.stringify(payments));

    // Ingresos: reconciliacion
    const incomesSnapshot = await userRef.collection('incomes').get().catch(() => ({ empty: true, docs: [] }));
    const remoteIncomes = incomesSnapshot.empty ? [] : incomesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const localIncomes = JSON.parse(localStorage.getItem('cartera_incomes') || '[]');
    const incomesMap = new Map();
    remoteIncomes.forEach(ri => incomesMap.set(ri.id, ri));
    for (const li of localIncomes) {
        if (String(li.id).startsWith('local-')) {
            const exists = remoteIncomes.some(ri => ri.name === li.name && ri.date === li.date && Number(ri.amount) === Number(li.amount));
            if (!exists) {
                try {
                    const toUpload = { ...li, updatedAt: new Date().toISOString() };
                    const ref = await userRef.collection('incomes').add(toUpload);
                    incomesMap.set(ref.id, { ...toUpload, id: ref.id });
                } catch (e) { incomesMap.set(li.id, li); }
            }
        }
    }
    incomes = Array.from(incomesMap.values());
    localStorage.setItem('cartera_incomes', JSON.stringify(incomes));

    populateMonths();
    const defaultMonth = new Date().toISOString().slice(0,7);
    $('monthFilter').value = defaultMonth;
    paymentFilters.page = 1;
    render();
    showApp(user);
    syncRecurringPayments();
    startRealtimeSync(user);
    registerFcmToken();
    checkAndNotifyDuePayments();
    updateSyncStatusUI('synced', 'Sincronizado');
}
$('googleBtn').onclick = async () => {
    if (!firebaseReady || typeof firebase === 'undefined' || !firebase.auth) {
        $('authError').textContent = 'Firebase no está disponible en este momento. Usa el modo local o reconfigura la conexión.';
        return;
    }
    if (!auth) { $('authError').textContent = 'Firebase no se pudo iniciar. Recarga la página.'; return; }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    $('googleBtn').disabled = true; $('googleBtn').textContent = 'Conectando con Google...'; $('authError').textContent = '';

    try {
        await auth.signInWithPopup(provider);
    } catch (error) {
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            try {
                await auth.signInWithRedirect(provider);
                return;
            } catch (redirectError) {
                error = redirectError;
            }
        }
        $('googleBtn').disabled = false; $('googleBtn').textContent = 'Continuar con Google'; firebaseError(error);
    }
};
$('guestBtn').onclick = () => {
    localStorage.setItem('cartera_guest_session', '1');
    currentUser = { ...guestUser };
    $('authError').textContent = '';
    showApp(currentUser);
    updateSyncStatusUI('offline', 'Modo invitado');
};
async function disconnectSession() {
    if (currentUser && currentUser.isGuest) {
        localStorage.removeItem('cartera_guest_session');
        currentUser = null;
        showAuth();
        $('authError').textContent = 'Sesión de invitado cerrada.';
        return;
    }
    if (!auth) {
        localStorage.removeItem('cartera_guest_session');
        currentUser = null;
        showAuth();
        return;
    }
    const logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.disabled = true;
    try {
        await auth.signOut();
        localStorage.removeItem('cartera_guest_session');
    }
    catch (error) {
        $('authError').textContent = `No fue posible cerrar sesión: ${error.message}`;
    }
    finally {
        if (logoutBtn) logoutBtn.disabled = false;
        currentUser = null;
        showAuth();
    }
}
const logoutBtn = $('logoutBtn');
if (logoutBtn) logoutBtn.onclick = disconnectSession;
$('profileLogoutBtn').onclick = disconnectSession;
const profileButton = $('profileButton');
const profileMenu = $('profileMenu');
if (profileButton) {
    profileButton.onclick = () => {
        if (!profileMenu) return;
        const shouldOpen = profileMenu.classList.toggle('hidden');
        profileButton.setAttribute('aria-expanded', String(!shouldOpen));
    };
}
document.addEventListener('click', (event) => {
    if (!profileMenu || !profileButton) return;
    const isInside = profileButton.contains(event.target) || profileMenu.contains(event.target);
    if (!isInside) {
        profileMenu.classList.add('hidden');
        profileButton.setAttribute('aria-expanded', 'false');
    }
});
const currentMonth = () => $('monthFilter').value || new Date().toISOString().slice(0,7);
function getFilteredPayments() {
    return payments.slice().filter(payment => {
        if (paymentFilters.from && payment.date < paymentFilters.from) return false;
        if (paymentFilters.to && payment.date > paymentFilters.to) return false;
        if (paymentFilters.category && payment.category !== paymentFilters.category) return false;
        if (paymentFilters.status && getPaymentStatus(payment) !== paymentFilters.status) return false;
        if (paymentFilters.search) {
            const haystack = `${payment.name || ''} ${payment.category || ''}`.toLowerCase();
            if (!haystack.includes(paymentFilters.search.toLowerCase())) return false;
        }
        return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
}
function syncFilterCategoryOptions() {
    const selected = paymentFilters.category;
    $('filterCategory').innerHTML = `<option value="">Todas</option>${categories.map(category => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('')}`;
    if (selected && categories.some(category => category.name === selected)) {
        $('filterCategory').value = selected;
    } else {
        paymentFilters.category = '';
        $('filterCategory').value = '';
    }
    const reportCatSelect = $('reportFilterCategory');
    if (reportCatSelect) {
        reportCatSelect.innerHTML = `<option value="">Todas</option>${categories.map(category => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('')}`;
        if (reportFiltersExtended.category && categories.some(category => category.name === reportFiltersExtended.category)) {
            reportCatSelect.value = reportFiltersExtended.category;
        } else {
            reportFiltersExtended.category = '';
            reportCatSelect.value = '';
        }
    }
}
function renderRecentPayments() {
    const rows = getFilteredPayments();
    const pageSize = Number(paymentFilters.pageSize) || PAGE_SIZE;
    const selectedTotal = rows.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (paymentFilters.focusId) {
        const focusIndex = rows.findIndex(payment => payment.id === paymentFilters.focusId);
        if (focusIndex >= 0) paymentFilters.page = Math.floor(focusIndex / pageSize) + 1;
        paymentFilters.focusId = null;
    }
    if (paymentFilters.page > totalPages) paymentFilters.page = totalPages;
    const start = (paymentFilters.page - 1) * pageSize;
    const paginatedRows = rows.slice(start, start + pageSize);
    $('selectedTotal').textContent = money(selectedTotal);
    $('pageInfo').textContent = `Página ${paymentFilters.page} de ${totalPages}`;
    $('prevPage').disabled = paymentFilters.page <= 1;
    $('nextPage').disabled = paymentFilters.page >= totalPages;

    if (rows.length === 0) {
        $('payments').innerHTML = '';
        $('emptyState').textContent = payments.length ? 'No hay pagos con ese filtro.' : 'Todavía no hay pagos. Añade el primero para empezar.';
        $('emptyState').classList.remove('hidden');
        $('payments').parentElement.classList.add('hidden');
        return;
    }

    $('payments').innerHTML = paginatedRows.map((payment, index) => {
        const rowNumber = (paymentFilters.page - 1) * (Number(paymentFilters.pageSize) || PAGE_SIZE) + index + 1;
        const checked = selectedPayments.has(payment.id) ? 'checked' : '';
        return `
        <tr data-row-id="${escapeHtml(payment.id)}">
            <td><input type="checkbox" class="row-select" data-select-id="${escapeHtml(payment.id)}" ${checked} aria-label="Seleccionar ${escapeHtml(payment.name)}"></td>
            <td style="font-weight:700; color:var(--muted);">${rowNumber}</td>
            <td>${escapeHtml(payment.name)}${payment.recurring ? '<span class="recurring-tag" title="Pago recurrente: se repite cada mes">↻ mensual</span>' : ''}</td>
            <td><span class="cat"><i class="dot" style="background:${(categories.find(category => category.name === payment.category) || {}).color || '#aaa'}"></i>${escapeHtml(payment.category)}</span></td>
            <td class="date">${new Date(payment.date + 'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td>
            <td><select class="payment-status" data-status-id="${escapeHtml(payment.id)}" aria-label="Estado de ${escapeHtml(payment.name)}"><option value="pagado" ${getPaymentStatus(payment) === 'pagado' ? 'selected' : ''}>Pagado</option><option value="no_pagado" ${getPaymentStatus(payment) === 'no_pagado' ? 'selected' : ''}>No pagado</option><option value="pendiente" ${getPaymentStatus(payment) === 'pendiente' ? 'selected' : ''}>Pendiente</option></select></td>
            <td style="text-align:right;font-weight:800">${money(payment.amount, payment.currency || appCurrency)}${payment.currency && payment.currency !== appCurrency ? `<br><small style="font-size:10px;color:var(--muted);font-weight:500">≈ ${money(convertCurrency(payment.amount, payment.currency, appCurrency), appCurrency)}</small>` : ''}</td>
            <td>${payment.attachment ? `<button type="button" class="row-actions receipt-btn" data-view-receipt="${escapeHtml(payment.id)}" title="Ver comprobante (${escapeHtml(payment.attachment.name)})">📎</button>` : ''}<button class="row-actions" data-edit-payment="${escapeHtml(payment.id)}" title="Editar">✎</button> <button class="row-actions" data-delete="${payment.id}" title="Eliminar">×</button></td>
        </tr>
    `;
    }).join('');
    $('emptyState').classList.add('hidden');
    $('payments').parentElement.classList.remove('hidden');

    updateBulkBar();

    if (document.getElementById('simulatorIncome')) {
        updateSimulator();
    }
}
function updateBulkBar() {
    const bar = $('bulkBar');
    const countEl = $('bulkCount');
    if (!bar || !countEl) return;
    const n = selectedPayments.size;
    countEl.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
    bar.classList.toggle('hidden', n === 0);
    const selectAll = $('selectAllPayments');
    if (selectAll) {
        const visibleIds = [...document.querySelectorAll('.row-select')].map(cb => cb.dataset.selectId);
        selectAll.checked = visibleIds.length > 0 && visibleIds.every(id => selectedPayments.has(id));
        selectAll.indeterminate = visibleIds.some(id => selectedPayments.has(id)) && !selectAll.checked;
    }
}
function buildPaymentsAggregate(list) {
    const aggregate = { count: 0, total: 0, paid: 0, pending: 0, byCategory: new Map(), byMonth: new Map(), byStatus: new Map() };
    list.forEach(payment => {
        const amount = convertCurrency(payment.amount, payment.currency, appCurrency);
        const status = getPaymentStatus(payment);
        const isPaid = status === 'pagado';
        const dateKey = String(payment.date || '').slice(0, 7);

        aggregate.count += 1;
        aggregate.total += amount;
        if (isPaid) aggregate.paid += amount; else aggregate.pending += amount;

        const categoryName = payment.category || 'Sin categoría';
        const categoryEntry = aggregate.byCategory.get(categoryName) || { name: categoryName, count: 0, total: 0 };
        categoryEntry.count += 1;
        categoryEntry.total += amount;
        aggregate.byCategory.set(categoryName, categoryEntry);

        const monthEntry = aggregate.byMonth.get(dateKey) || { key: dateKey, count: 0, total: 0, paid: 0, pending: 0 };
        monthEntry.count += 1;
        monthEntry.total += amount;
        if (isPaid) monthEntry.paid += amount; else monthEntry.pending += amount;
        aggregate.byMonth.set(dateKey, monthEntry);

        const statusEntry = aggregate.byStatus.get(status) || { key: status, count: 0, total: 0 };
        statusEntry.count += 1;
        statusEntry.total += amount;
        aggregate.byStatus.set(status, statusEntry);
    });
    return aggregate;
}
function formatMonthLabel(monthKey) {
    if (!monthKey || monthKey === 'sin-fecha') return 'Sin fecha';
    const parsed = new Date(`${monthKey}-02`);
    if (Number.isNaN(parsed.getTime())) return monthKey;
    return parsed.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
function categoryColor(categoryName) {
    const category = categories.find(item => item.name === categoryName);
    return category ? category.color : '#dfe4dc';
}
function categoryBudgetState(spent, budget) {
    const safeBudget = Number(budget) || 0;
    if (safeBudget <= 0) return null;
    const ratio = (Number(spent) || 0) / safeBudget;
    const percent = Math.round(ratio * 100);
    if (ratio >= 1) return { key:'exceeded', percent, label:'Excedido' };
    if (ratio >= .8) return { key:'warn', percent, label:'Cerca del límite' };
    return { key:'ok', percent, label:'En camino' };
}
function renderBudgetBanner(byMonthSpend) {
    const banner = $('budgetBanner');
    if (!banner) return;
    const month = currentMonth();
    const flagged = categories
        .map(category => ({ name: category.name, state: categoryBudgetState(byMonthSpend[category.name] || 0, getCategoryBudget(category, month)) }))
        .filter(entry => entry.state && entry.state.key !== 'ok');
    const exceeded = flagged.filter(entry => entry.state.key === 'exceeded');
    const warn = flagged.filter(entry => entry.state.key === 'warn');
    if (exceeded.length) {
        banner.textContent = `⚠ ${exceeded.length === 1 ? 'Una categoría superó' : `${exceeded.length} categorías superaron`} su presupuesto: ${exceeded.map(entry => entry.name).join(', ')}.`;
        banner.className = 'budget-banner is-danger';
    } else if (warn.length) {
        banner.textContent = `👀 ${warn.length === 1 ? 'Una categoría está' : `${warn.length} categorías están`} cerca del límite: ${warn.map(entry => entry.name).join(', ')}.`;
        banner.className = 'budget-banner is-warn';
    } else {
        banner.textContent = '';
        banner.className = 'budget-banner hidden';
    }
}
function render() {
    const month = currentMonth();
    const filtered = payments.filter(payment => payment.date.startsWith(month));
    const aggregates = buildPaymentsAggregate(payments);

    const byCat = {};
    let total = 0;
    filtered.forEach(payment => {
        const converted = convertCurrency(payment.amount, payment.currency, appCurrency);
        total += converted;
        byCat[payment.category] = (byCat[payment.category] || 0) + converted;
    });

    $('monthTotal').innerHTML = `${money(total, appCurrency)} <small id="currencyBadge">${appCurrency}</small>`;
    $('monthDelta').textContent = `${filtered.length} pago${filtered.length === 1 ? '' : 's'}`;
    const monthIncomeEl = $('monthIncome');
    if (monthIncomeEl) {
        const monthIncomeTotal = incomes.filter(i => String(i.date || '').startsWith(month)).reduce((s, i) => s + convertCurrency(i.amount, i.currency, appCurrency), 0);
        monthIncomeEl.textContent = money(monthIncomeTotal, appCurrency);
    }
    $('dailyAverage').textContent = money(total / new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate(), appCurrency);

    const statusBuckets = {};
    filtered.forEach(payment => {
        const status = getPaymentStatus(payment);
        const bucket = statusBuckets[status] || (statusBuckets[status] = { count: 0, total: 0 });
        bucket.count += 1;
        bucket.total += Number(payment.amount || 0);
    });
    $('statusAverages').innerHTML = PAYMENT_STATUSES.map(status => {
        const bucket = statusBuckets[status] || { count: 0, total: 0 };
        const average = bucket.count ? bucket.total / bucket.count : 0;
        return `<tr><td>${paymentStatusLabel(status)}</td><td>${bucket.count}</td><td style="text-align:right">${money(bucket.total)}</td><td style="text-align:right;font-weight:800">${money(average)}</td></tr>`;
    }).join('');

    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    $('topCategory').textContent = top ? top[0] : '—';
    $('categories').innerHTML = categories.map(category => {
        const spent = byCat[category.name] || 0;
        const catBudget = getCategoryBudget(category, month);
        const state = categoryBudgetState(spent, catBudget);
        const budgetBlock = state ? `<div class="category-budget"><div class="category-budget-track"><i class="is-${state.key}" style="width:${Math.min(100, state.percent)}%"></i></div><span class="category-budget-copy is-${state.key}">${state.percent}% · ${money(spent)} de ${money(catBudget)}</span></div>` : '';
        return `<div class="category"><div class="category-info"><i class="dot" style="background:${escapeHtml(category.color)}"></i>${escapeHtml(category.name)}</div><div class="category-total">${money(spent)}</div>${budgetBlock}</div>`;
    }).join('');
    renderBudgetBanner(byCat);
    renderCategoryTable(aggregates);

    const categoryChart = $('categoryChart');
    const categoryChartTotal = $('categoryChartTotal');
    const chartTooltip = $('chartTooltip');
    const categoryChartPanel = $('categoryChartPanel');
    const categoryChartLegend = $('categoryChartLegend');
    const categoryChartLegendText = $('categoryChartLegendText');
    if (categoryChart && categoryChartTotal) {
        const categoryValues = categories.map(category => ({ name: category.name, color: category.color, value: byCat[category.name] || 0 })).filter(item => item.value > 0);
        const chartTotal = categoryValues.reduce((sum, item) => sum + item.value, 0);
        categoryChartTotal.textContent = chartTotal > 0 ? money(chartTotal) : '$ 0';
        if (categoryChartLegendText) categoryChartLegendText.textContent = chartTotal > 0 ? 'Total gastado' : 'Sin datos';
        categoryChart.dataset.values = JSON.stringify(categoryValues);
        categoryChart.setAttribute('aria-label', chartTotal > 0 ? `Gasto por categoría: ${money(chartTotal)}` : 'Gasto por categoría: sin datos');
        if (chartTotal > 0) {
            let current = 0;
            categoryChart.style.background = `conic-gradient(${categoryValues.map(({ color, value }) => {
                const start = current;
                const end = current + (value / chartTotal) * 360;
                current = end;
                return `${color} ${start}deg ${end}deg`;
            }).join(', ')})`;
            if (categoryChartLegend) {
                categoryChartLegend.innerHTML = categoryValues.map(({ name, color, value }) => {
                    const pct = chartTotal > 0 ? (value / chartTotal) * 100 : 0;
                    return `<div class="donut-legend-item"><span class="donut-legend-dot" style="background:${escapeHtml(color)}"></span><span class="donut-legend-label">${escapeHtml(name)}</span><span class="donut-legend-value">${money(value)} · ${pct.toFixed(0)}%</span></div>`;
                }).join('');
            }
        } else {
            categoryChart.style.background = 'conic-gradient(#dfe4dc 0deg 360deg)';
            if (chartTooltip) chartTooltip.textContent = 'Sin datos';
            if (categoryChartLegend) categoryChartLegend.innerHTML = '<div class="donut-empty">Sin datos para mostrar</div>';
        }
    }
    if (categoryChartPanel) {
        categoryChartPanel.classList.remove('hidden');
    }
    if (categoryChart) {
        categoryChart.onmousemove = event => {
            const values = JSON.parse(categoryChart.dataset.values || '[]');
            if (!values.length) return;
            const total = values.reduce((sum, entry) => sum + entry.value, 0);
            const rect = categoryChart.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const x = event.clientX - cx;
            const y = event.clientY - cy;
            const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
            let cumulative = 0;
            let match = null;
            for (const item of values) {
                const slice = (item.value / total) * 360;
                if (angle >= cumulative && angle < cumulative + slice) {
                    match = item;
                    break;
                }
                cumulative += slice;
            }
            if (!match && values.length) match = values[values.length - 1];
            if (chartTooltip && match) {
                const pct = (match.value / total) * 100;
                chartTooltip.textContent = `${match.name}: ${money(match.value)} (${pct.toFixed(1)}%)`;
            }
        };
        categoryChart.onmouseleave = () => {
            if (chartTooltip) chartTooltip.textContent = 'Sin datos';
        };
    }

    const hasMonthData = filtered.length > 0;
    const buckets = Array.from({ length: 6 }, () => 0);
    filtered.forEach(payment => {
        const day = new Date(payment.date).getDate();
        if (Number.isNaN(day)) return;
        const index = Math.min(5, Math.max(0, Math.floor((day - 1) / 5)));
        buckets[index] += Number(payment.amount);
    });
    const max = Math.max(...buckets, 1);
    const bucketTotal = buckets.reduce((sum, value) => sum + value, 0);
    const todayISO = new Date().toISOString().slice(0, 10);
    const today = todayISO.startsWith(month) ? Number(todayISO.slice(8, 10)) : null;
    if (!hasMonthData) {
        $('chart').innerHTML = '<div class="chart-empty">Sin pagos este mes</div>';
    } else {
        $('chart').innerHTML = buckets.map((value, index) => {
            const dayStart = index * 5 + 1;
            const dayEnd = Math.min(dayStart + 4, 31);
            const isCurrent = today !== null && dayStart <= today && today <= dayEnd;
            const heightPx = value === 0 ? 8 : Math.max(value / max * 140, 8);
            const pct = bucketTotal > 0 ? Math.round(value / bucketTotal * 100) : 0;
            const valueLabel = value > 0 ? `<div class="bar-value"><span class="bar-value-amount">${compactMoney(value)}</span><span class="bar-value-pct">${pct}%</span></div>` : '';
            return `<div class="bar-wrap" role="img" aria-label="${dayStart}–${dayEnd}: ${money(value)}">${valueLabel}<div class="bar ${isCurrent ? 'current' : ''}${value === 0 ? ' is-zero' : ''}" style="height:${heightPx}px" title="${money(value)}"></div><span>${dayStart}–${dayEnd}</span></div>`;
        }).join('');
    }
    syncFilterCategoryOptions();
    renderRecentPayments();
    renderBalance(aggregates);
    renderNotifications();
    renderReports();
    renderCharts();
    renderIncomes();
    renderSavingsGoals();
    if (document.getElementById('simulatorIncome')) {
        updateSimulator();
    }
}
function renderCategoryTable(aggregates) {
    const categoryList = $('categoryList');
    if (!categoryList) return;

    const monthSelect = $('categoryBudgetMonthSelect');
    if (monthSelect) {
        const availableMonths = [...new Set([selectedBudgetMonth, currentMonth(), ...payments.map(p => String(p.date || '').slice(0, 7))])].filter(Boolean).sort().reverse();
        monthSelect.innerHTML = availableMonths.map(m => `<option value="${m}" ${m === selectedBudgetMonth ? 'selected' : ''}>${formatMonthLabel(m)}</option>`).join('');
    }

    const totals = aggregates ? aggregates.byCategory : new Map();
    categoryList.innerHTML = categories.map(category => {
        const stats = totals.get(category.name) || { count: 0, total: 0 };
        const color = escapeHtml(category.color);
        const budget = getCategoryBudget(category, selectedBudgetMonth);
        const hasMonthOverride = category.monthlyBudgets && category.monthlyBudgets[selectedBudgetMonth] !== undefined && category.monthlyBudgets[selectedBudgetMonth] !== null;
        let budgetCell = '<span class="budget-none">—</span>';
        if (budget > 0) {
            const monthSpent = payments
                .filter(payment => payment.category === category.name && String(payment.date || '').startsWith(selectedBudgetMonth))
                .reduce((sum, payment) => sum + convertCurrency(payment.amount, payment.currency, appCurrency), 0);
            const state = categoryBudgetState(monthSpent, budget);
            budgetCell = `<span class="budget-cell"><strong>${money(budget)}</strong>${hasMonthOverride ? '<span class="category-budget-badge" title="Presupuesto específico de este mes">mes</span>' : ''}<em class="is-${state.key}">${state.percent}%</em></span>`;
        }
        return `<tr class="category-row" data-category-id="${escapeHtml(category.id)}">
            <td><span class="category-info"><i class="dot" style="background:${color}"></i><span class="category-name">${escapeHtml(category.name)}</span></span></td>
            <td><span class="category-color"><i class="swatch" style="background:${color}"></i>${color}</span></td>
            <td style="text-align:right">${stats.count}</td>
            <td style="text-align:right;font-weight:800">${money(stats.total)}</td>
            <td class="category-budget-cell">${budgetCell}</td>
            <td class="category-actions">
                <button type="button" class="category-edit" data-action="edit" data-category-id="${escapeHtml(category.id)}">Editar</button>
                <button type="button" class="category-delete" data-action="delete" data-category-id="${escapeHtml(category.id)}" title="Eliminar categoría" aria-label="Eliminar ${escapeHtml(category.name)}">×</button>
            </td>
        </tr>`;
    }).join('');
    const categoriesCount = $('categoriesCount');
    if (categoriesCount) categoriesCount.textContent = `${categories.length} ${categories.length === 1 ? 'categoría' : 'categorías'}`;
    const categoriesEmpty = $('categoriesEmpty');
    if (categoriesEmpty) categoriesEmpty.classList.toggle('hidden', categories.length > 0);
}
function renderBalance(aggregates) {
    if (!$('balanceTotal')) return;
    const data = aggregates || buildPaymentsAggregate(payments);

    $('balanceTotal').innerHTML = `${money(data.total)} <small>COP</small>`;
    $('balanceCount').textContent = `${data.count} pago${data.count === 1 ? '' : 's'}`;
    $('balancePaid').textContent = money(data.paid);
    $('balancePending').textContent = money(data.pending);
    $('balanceAverage').textContent = money(data.count ? data.total / data.count : 0);
    const incomeEl = $('balanceIncome');
    if (incomeEl) incomeEl.textContent = money(incomes.reduce((sum, i) => sum + Number(i.amount || 0), 0));

    const months = [...data.byMonth.values()].sort((a, b) => b.key.localeCompare(a.key));
    $('balanceMonths').innerHTML = months.map(entry => `<tr><td>${escapeHtml(formatMonthLabel(entry.key))}</td><td style="text-align:right">${entry.count}</td><td style="text-align:right">${money(entry.paid)}</td><td style="text-align:right">${money(entry.pending)}</td><td style="text-align:right;font-weight:800">${money(entry.total)}</td></tr>`).join('');
    $('balanceMonthsEmpty').classList.toggle('hidden', months.length > 0);

    const categoryEntries = [...data.byCategory.values()].sort((a, b) => b.total - a.total);
    $('balanceCategories').innerHTML = categoryEntries.map(entry => {
        const share = data.total ? entry.total / data.total * 100 : 0;
        return `<tr><td><span class="cat"><i class="dot" style="background:${escapeHtml(categoryColor(entry.name))}"></i>${escapeHtml(entry.name)}</span></td><td style="text-align:right">${entry.count}</td><td style="text-align:right;font-weight:800">${money(entry.total)}</td><td style="text-align:right">${share.toFixed(1)} %</td></tr>`;
    }).join('');
    $('balanceCategoriesEmpty').classList.toggle('hidden', categoryEntries.length > 0);

    $('balanceStatuses').innerHTML = PAYMENT_STATUSES.map(status => {
        const entry = data.byStatus.get(status) || { count: 0, total: 0 };
        const share = data.total ? entry.total / data.total * 100 : 0;
        return `<tr><td>${paymentStatusLabel(status)}</td><td style="text-align:right">${entry.count}</td><td style="text-align:right;font-weight:800">${money(entry.total)}</td><td style="text-align:right">${share.toFixed(1)} %</td></tr>`;
    }).join('');
}
function renderIncomes() {
    const list = $('incomes');
    if (!list) return;
    const total = incomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const recurring = incomes.filter(i => i.recurring).reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthTotal = incomes.filter(i => String(i.date || '').startsWith(monthKey)).reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const monthCount = incomes.filter(i => String(i.date || '').startsWith(monthKey)).length;
    if ($('incomeMonthTotal')) $('incomeMonthTotal').innerHTML = `${money(monthTotal)} <small>COP</small>`;
    if ($('incomeMonthCount')) $('incomeMonthCount').textContent = `${monthCount} ingreso${monthCount === 1 ? '' : 's'}`;
    if ($('incomeRecurringTotal')) $('incomeRecurringTotal').textContent = money(recurring);
    if ($('incomeAverage')) $('incomeAverage').textContent = money(incomes.length ? total / incomes.length : 0);
    if ($('incomeMeta')) $('incomeMeta').textContent = `${incomes.length} ingreso${incomes.length === 1 ? '' : 's'} · Total ${money(total)}`;
    list.innerHTML = incomes.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((income, index) => `
        <tr>
            <td style="font-weight:700; color:var(--muted);">${index + 1}</td>
            <td>${escapeHtml(income.name)}${income.recurring ? '<span class="recurring-tag">↻ mensual</span>' : ''}</td>
            <td><span class="cat"><i class="dot" style="background:${escapeHtml(categoryColor(income.category))}"></i>${escapeHtml(income.category || 'Sin categoría')}</span></td>
            <td class="date">${new Date(income.date + 'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}</td>
            <td style="text-align:right;font-weight:800">${money(income.amount)}</td>
            <td><button class="row-actions" data-edit-income="${escapeHtml(income.id)}" title="Editar">✎</button> <button class="row-actions" data-delete-income="${escapeHtml(income.id)}" title="Eliminar">×</button></td>
        </tr>
    `).join('');
    const empty = $('incomeEmpty');
    if (empty) empty.classList.toggle('hidden', incomes.length > 0);
    if (incomes.length === 0 && list.parentElement) list.parentElement.classList.add('hidden');
    else if (list.parentElement) list.parentElement.classList.remove('hidden');
}
function persistIncomes() {
    localStorage.setItem('cartera_incomes', JSON.stringify(incomes));
    const collection = userCollection('incomes');
    if (!collection) return;
    // sync: upsert all (simple)
    incomes.forEach(income => {
        if (String(income.id).startsWith('local-')) return;
        collection.doc(income.id).set(income).catch(() => {});
    });
}
function persistSavingsGoals() {
    localStorage.setItem('cartera_savings_goals', JSON.stringify(savingsGoals));
}
function renderSavingsGoals() {
    const list = $('savingsGoalsList');
    if (!list) return;
    if (savingsGoals.length === 0) {
        list.innerHTML = '';
        $('savingsGoalsEmpty')?.classList.remove('hidden');
        return;
    }
    $('savingsGoalsEmpty')?.classList.add('hidden');
    list.innerHTML = savingsGoals.map(goal => {
        const target = Number(goal.target || 0);
        const current = Number(goal.current || 0);
        const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
        return `<div class="savings-goal">
            <div class="savings-goal-head">
                <strong>${escapeHtml(goal.name)}</strong>
                <button class="row-actions" data-delete-goal="${escapeHtml(goal.id)}" title="Eliminar">×</button>
            </div>
            <div class="savings-goal-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
            <div class="savings-goal-meta">
                <span>${money(current)} de ${money(target)}</span>
                <span>${pct.toFixed(0)}%</span>
            </div>
        </div>`;
    }).join('');
}
const debouncedSave = (key, value) => {
    if (window.__saveTimers) clearTimeout(window.__saveTimers[key]);
    else window.__saveTimers = {};
    window.__saveTimers[key] = setTimeout(() => {
        try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
        const indicator = $('saveIndicator');
        if (indicator) {
            indicator.classList.add('is-visible');
            setTimeout(() => indicator.classList.remove('is-visible'), 1200);
        }
    }, 300);
};
let reportRange = { from:'', to:'', preset:'quarter' };
let reportFiltersExtended = { category:'', status:'', recurring:false, amountFrom:'', amountTo:'' };
// ---------- Diagramas ----------
let chartsRange = 'half';
let chartsDateFrom = '';
let chartsDateTo = '';
let chartsMonth = new Date().toISOString().slice(0, 7);
let chartsFilters = { category:'', status:'', recurring:false, amountFrom:'', amountTo:'' };
const CHART_STATUS_COLORS = { pagado:'#7bab3a', no_pagado:'#e04a2f', pendiente:'#efa13c' };

function reportPresetRange(preset) {
    const today = new Date();
    const to = formatDateKey(today);
    if (preset === 'all') return { from:'', to:'' };
    if (preset === 'month') return { from: formatDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to };
    if (preset === 'year') return { from: `${today.getFullYear()}-01-01`, to };
    return { from: formatDateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to };
}
function reportDateLabel(key) {
    if (!key) return null;
    return new Date(`${key}T12:00:00`).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
}
function reportRangeLabel(range) {
    const from = reportDateLabel(range.from);
    const to = reportDateLabel(range.to);
    if (!from && !to) return 'Todo el historial';
    if (!from) return `Hasta el ${to}`;
    if (!to) return `Desde el ${from}`;
    return `${from} – ${to}`;
}
function reportPreviousRange(range) {
    if (!range.from || !range.to) return null;
    const from = new Date(`${range.from}T12:00:00`);
    const to = new Date(`${range.to}T12:00:00`);
    const days = Math.round((to - from) / 86400000) + 1;
    if (!(days > 0)) return null;
    const previousTo = new Date(from);
    previousTo.setDate(previousTo.getDate() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setDate(previousFrom.getDate() - days + 1);
    return { from: formatDateKey(previousFrom), to: formatDateKey(previousTo), days };
}
function reportShare(part, total) {
    return total > 0 ? (Number(part) / total) * 100 : 0;
}
function reportDeltaText(current, previous, reference) {
    if (previous === null || previous === undefined) return { text: reference === 'mes' ? 'primer mes del rango' : 'sin periodo anterior', dir: '' };
    if (!previous) return { text: current ? 'sin base de comparación' : 'sin cambios', dir: '' };
    const pct = ((Number(current) - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) < 0.5) return { text: 'sin cambios', dir: '' };
    return { text: `${pct > 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)} % ${reference}`, dir: pct > 0 ? 'up' : 'down' };
}
function computeReports() {
    const range = { from: reportRange.from, to: reportRange.to };
    const list = payments.filter(payment => {
        if (range.from && payment.date < range.from) return false;
        if (range.to && payment.date > range.to) return false;
        if (reportFiltersExtended.category && payment.category !== reportFiltersExtended.category) return false;
        if (reportFiltersExtended.status && getPaymentStatus(payment) !== reportFiltersExtended.status) return false;
        if (reportFiltersExtended.recurring && !payment.recurring) return false;
        const amount = Number(payment.amount || 0);
        if (reportFiltersExtended.amountFrom && amount < reportFiltersExtended.amountFrom) return false;
        if (reportFiltersExtended.amountTo && amount > reportFiltersExtended.amountTo) return false;
        return true;
    });
    const aggregate = buildPaymentsAggregate(list);
    const previousRange = reportPreviousRange(range);
    const previousList = previousRange ? payments.filter(payment => payment.date >= previousRange.from && payment.date <= previousRange.to) : [];
    const previousAggregate = previousRange ? buildPaymentsAggregate(previousList) : null;

    const months = Array.from(aggregate.byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));
    const monthCount = Math.max(1, months.length);
    const maxMonth = months.reduce((max, month) => Math.max(max, Number(month.total) || 0), 0) || 1;
    const average = aggregate.count ? Math.round(aggregate.total / aggregate.count) : 0;
    const previousAverage = previousAggregate && previousAggregate.count ? Math.round(previousAggregate.total / previousAggregate.count) : null;
    const paidShare = reportShare(aggregate.paid, aggregate.total);
    const pendingShare = reportShare(aggregate.pending, aggregate.total);

    const statuses = PAYMENT_STATUSES.map(key => {
        const entry = aggregate.byStatus.get(key) || { count: 0, total: 0 };
        return { key, label: paymentStatusLabel(key), count: entry.count, total: entry.total, share: reportShare(entry.total, aggregate.total), average: entry.count ? Math.round(entry.total / entry.count) : 0 };
    });

    const categories = Array.from(aggregate.byCategory.values()).sort((a, b) => b.total - a.total).map(entry => {
        const category = categoriesList().find(item => item.name === entry.name) || {};
        const averageMonthly = entry.total / monthCount;
        const budget = Number(category.budget) || 0;
        return {
            name: entry.name,
            color: category.color || '#dfe4dc',
            count: entry.count,
            total: entry.total,
            share: reportShare(entry.total, aggregate.total),
            budget,
            budgetState: categoryBudgetState(averageMonthly, budget)
        };
    });

    const top = list.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 10);
    const peakMonth = months.reduce((best, month) => (!best || month.total > best.total ? month : best), null);
    const budgetExceeded = categories.filter(entry => entry.budgetState && entry.budgetState.key === 'exceeded');
    const budgetWarn = categories.filter(entry => entry.budgetState && entry.budgetState.key === 'warn');
    const topFiveShare = reportShare(top.slice(0, 5).reduce((sum, payment) => sum + Number(payment.amount || 0), 0), aggregate.total);

    const recurringList = list.filter(payment => payment.recurring);
    const recurringTotal = recurringList.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const statusDistribution = PAYMENT_STATUSES.map(key => {
        const entry = aggregate.byStatus.get(key) || { count: 0, total: 0 };
        return { key, label: paymentStatusLabel(key), count: entry.count, total: entry.total, share: reportShare(entry.total, aggregate.total) };
    });
    const currentDate = new Date();
    const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const previousMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthTotal = aggregate.byMonth.get(currentMonthKey) || { key: currentMonthKey, count: 0, total: 0 };
    const previousMonthTotal = aggregate.byMonth.get(previousMonthKey) || { key: previousMonthKey, count: 0, total: 0 };
    const monthDelta = previousMonthTotal.total ? reportDeltaText(currentMonthTotal.total, previousMonthTotal.total, 'vs. mes anterior') : { text: 'sin mes anterior', dir: '' };

    const hasPrevious = Boolean(previousAggregate && previousAggregate.count);
    const deltas = {
        total: reportDeltaText(aggregate.total, hasPrevious ? previousAggregate.total : null, 'vs. periodo anterior'),
        paid: reportDeltaText(aggregate.paid, hasPrevious ? previousAggregate.paid : null, 'vs. periodo anterior'),
        pending: reportDeltaText(aggregate.pending, hasPrevious ? previousAggregate.pending : null, 'vs. periodo anterior'),
        average: reportDeltaText(average, hasPrevious ? previousAverage : null, 'vs. periodo anterior')
    };

    const days = range.from && range.to ? Math.round((new Date(`${range.to}T12:00:00`) - new Date(`${range.from}T12:00:00`)) / 86400000) + 1 : null;
    const summary = [];
    if (!aggregate.count) {
        summary.push('No hay pagos dentro de este rango: cambia las fechas o prueba otro rango rápido.');
    } else {
        const previousPhrase = !hasPrevious
            ? ' (sin periodo anterior)'
            : deltas.total.dir === 'up'
                ? `, <strong>${deltas.total.text.replace(' vs. periodo anterior', '')}</strong> por encima de los <strong>${money(previousAggregate.total)}</strong> del periodo anterior`
                : deltas.total.dir === 'down'
                    ? `, <strong>${deltas.total.text.replace(' vs. periodo anterior', '')}</strong> por debajo de los <strong>${money(previousAggregate.total)}</strong> del periodo anterior`
                    : `, prácticamente igual a los <strong>${money(previousAggregate.total)}</strong> del periodo anterior`;
        summary.push(`Se registran <strong>${aggregate.count}</strong> pago${aggregate.count === 1 ? '' : 's'} por <strong>${money(aggregate.total)}</strong>${previousPhrase}.`);
        summary.push(`Se pagó el <strong>${paidShare.toFixed(1)} %</strong> del total y quedan <strong>${money(aggregate.pending)}</strong> pendientes${aggregate.pending ? ` en ${statuses.filter(entry => entry.key !== 'pagado').reduce((sum, entry) => sum + entry.count, 0)} pagos` : ''}.`);
        if (top.length) summary.push(`El pago más alto fue <strong>${money(Number(top[0].amount))}</strong> por “${escapeHtml(top[0].name)}”; los 5 mayores concentran el <strong>${topFiveShare.toFixed(1)} %</strong> del gasto del periodo.`);
        if (categories.length) summary.push(`La categoría con más peso es <strong>${escapeHtml(categories[0].name)}</strong> con ${money(categories[0].total)} (${categories[0].share.toFixed(1)} %)${categories[1] ? `, seguida de <strong>${escapeHtml(categories[1].name)}</strong> con ${money(categories[1].total)}` : ''}.`);
        if (peakMonth) summary.push(`El mes de mayor gasto fue <strong>${formatMonthLabel(peakMonth.key)}</strong> con ${money(peakMonth.total)} en ${peakMonth.count} pago${peakMonth.count === 1 ? '' : 's'}.`);
        summary.push(`Por estado: <strong>${statuses.find(entry => entry.key === 'pagado').count} pagados</strong>, <strong>${statuses.find(entry => entry.key === 'pendiente').count} pendientes</strong> y <strong>${statuses.find(entry => entry.key === 'no_pagado').count} no pagados</strong>.`);
        if (budgetExceeded.length) summary.push(`⚠ <strong>${budgetExceeded.length}</strong> categoría${budgetExceeded.length === 1 ? '' : 's'} supera${budgetExceeded.length === 1 ? '' : 'n'} su presupuesto mensual (promedio del periodo): ${budgetExceeded.map(entry => escapeHtml(entry.name)).join(', ')}.`);
        else if (budgetWarn.length) summary.push(`👀 <strong>${budgetWarn.length}</strong> categoría${budgetWarn.length === 1 ? '' : 's'} está cerca del límite: ${budgetWarn.map(entry => escapeHtml(entry.name)).join(', ')}.`);
        else if (categories.some(entry => entry.budget)) summary.push('Ninguna categoría se pasa de su presupuesto mensual dentro de este rango. ✔');
        if (days) summary.push(`El rango abarca <strong>${days} día${days === 1 ? '' : 's'}</strong> y ${monthCount} mes${monthCount === 1 ? '' : 'es'}, con un promedio de <strong>${money(Math.round(aggregate.total / monthCount))}</strong> al mes.`);
    }

    return {
        range, rangeLabel: reportRangeLabel(range), days, monthCount,
        aggregate, previousAggregate, statuses, categories, months, top, maxMonth,
        average, previousAverage, paidShare, pendingShare, deltas, summary,
        recurringList, recurringTotal, statusDistribution,
        currentMonthTotal, previousMonthTotal, monthDelta,
        meta: aggregate.count ? `${aggregate.count} pago${aggregate.count === 1 ? '' : 's'}${days ? ` · ${days} días` : ''}` : 'Sin pagos en el rango'
    };
}
function categoriesList() { return categories; }
function setReportDelta(id, delta) {
    const element = $(id);
    if (!element) return;
    element.textContent = delta.text;
    element.className = `report-delta ${delta.dir}`.trim();
}
function reportEmptyRow(columns, message) {
    return `<tr><td colspan="${columns}" class="report-empty">${message}</td></tr>`;
}
function renderReports() {
    const view = $('reportsView');
    if (!view || view.classList.contains('hidden')) return;
    const data = computeReports();
    const aggregate = data.aggregate;

    $('reportRangeLabel').textContent = data.rangeLabel;
    $('reportMeta').textContent = data.meta;
    $('reportMonthsMeta').textContent = `${data.months.length} mes${data.months.length === 1 ? '' : 'es'} en el rango`;
    $('reportCategoriesMeta').textContent = `${data.categories.length} categoría${data.categories.length === 1 ? '' : 'ies'}`;
    $('reportTopMeta').textContent = `Top ${Math.min(10, data.top.length)} de ${aggregate.count}`;

    $('reportTotal').innerHTML = `${money(aggregate.total)} <small>COP</small>`;
    $('reportPaid').textContent = money(aggregate.paid);
    $('reportPending').textContent = money(aggregate.pending);
    $('reportAverage').textContent = money(data.average);
    setReportDelta('reportTotalDelta', data.deltas.total);
    setReportDelta('reportPaidDelta', data.deltas.paid);
    setReportDelta('reportPendingDelta', data.deltas.pending);
    setReportDelta('reportAverageDelta', data.deltas.average);

    $('reportSummary').innerHTML = data.summary.map(item => `<li>${item}</li>`).join('');

    $('reportStatus').innerHTML = data.statuses.map(entry =>
        `<tr><td>${entry.label}</td><td style="text-align:right">${entry.count}</td><td style="text-align:right;font-weight:800">${money(entry.total)}</td><td style="text-align:right">${entry.share.toFixed(1)} %</td><td style="text-align:right">${money(entry.average)}</td></tr>`
    ).join('') + `<tr class="report-total-row"><td>Total</td><td style="text-align:right">${aggregate.count}</td><td style="text-align:right">${money(aggregate.total)}</td><td style="text-align:right">100 %</td><td style="text-align:right">${money(data.average)}</td></tr>`;

    $('reportBars').innerHTML = data.months.length
        ? data.months.map(month => `<div class="report-bar"><span class="report-bar-label">${escapeHtml(formatMonthLabel(month.key))}</span><div class="report-bar-track"><i style="width:${reportShare(month.total, data.maxMonth).toFixed(1)}%"></i></div><strong>${money(month.total)}</strong></div>`).join('')
        : '<div class="report-bar-zero">Sin movimientos en el rango seleccionado.</div>';

    $('reportMonths').innerHTML = data.months.length
        ? data.months.map((month, index) => {
            const previous = index > 0 ? data.months[index - 1].total : null;
            const delta = reportDeltaText(month.total, previous, 'vs. mes anterior');
            return `<tr><td>${escapeHtml(formatMonthLabel(month.key))}</td><td style="text-align:right">${month.count}</td><td style="text-align:right">${money(month.paid)}</td><td style="text-align:right">${money(month.pending)}</td><td style="text-align:right;font-weight:800">${money(month.total)}</td><td style="text-align:right"><span class="report-delta ${delta.dir}" style="float:none;margin:0">${delta.text}</span></td></tr>`;
        }).join('')
        : reportEmptyRow(6, 'No hay pagos en este rango.');

    $('reportCategories').innerHTML = data.categories.length
        ? data.categories.map(entry => {
            const budgetCell = entry.budget
                ? `<span class="budget-cell"><strong>${money(entry.budget)}/mes</strong><em class="is-${entry.budgetState.key}">${entry.budgetState.percent}%</em></span>`
                : '<span class="budget-none">Sin presupuesto</span>';
            return `<tr><td><span class="cat"><i class="dot" style="background:${entry.color}"></i>${escapeHtml(entry.name)}</span></td><td style="text-align:right">${entry.count}</td><td style="text-align:right;font-weight:800">${money(entry.total)}</td><td style="text-align:right">${entry.share.toFixed(1)} %</td><td>${budgetCell}</td></tr>`;
        }).join('')
        : reportEmptyRow(5, 'No hay pagos en este rango.');

    $('reportTop').innerHTML = data.top.length
        ? data.top.map((payment, index) => `<tr><td style="color:var(--muted)">${index + 1}</td><td>${escapeHtml(payment.name)}${payment.recurring ? '<span class="recurring-tag">↻ mensual</span>' : ''}</td><td><span class="cat"><i class="dot" style="background:${categoryColor(payment.category)}"></i>${escapeHtml(payment.category || 'Sin categoría')}</span></td><td class="date">${escapeHtml(payment.date)}</td><td style="text-align:right;font-weight:800">${money(payment.amount)}</td></tr>`).join('')
        : reportEmptyRow(5, 'No hay pagos en este rango.');

    // Distribución por estado (donut)
    const reportStatusDonut = $('reportStatusDonut');
    const reportStatusLegend = $('reportStatusLegend');
    if (reportStatusDonut && reportStatusLegend) {
        const distValues = data.statusDistribution.filter(entry => entry.total > 0);
        const distTotal = distValues.reduce((sum, entry) => sum + entry.total, 0);
        const statusColors = { pagado: '#7bab3a', no_pagado: '#e04a2f', pendiente: '#efa13c' };
        if (distTotal > 0) {
            let current = 0;
            reportStatusDonut.style.background = `conic-gradient(${distValues.map(entry => {
                const color = statusColors[entry.key] || '#dfe4dc';
                const start = current;
                const end = current + (entry.total / distTotal) * 360;
                current = end;
                return `${color} ${start}deg ${end}deg`;
            }).join(', ')})`;
            reportStatusDonut.setAttribute('aria-label', `Distribución por estado: ${money(distTotal)}`);
            reportStatusLegend.innerHTML = distValues.map(entry => {
                const color = statusColors[entry.key] || '#dfe4dc';
                const pct = (entry.total / distTotal) * 100;
                return `<div class="donut-legend-item"><span class="donut-legend-dot" style="background:${escapeHtml(color)}"></span><span class="donut-legend-label">${escapeHtml(entry.label)}</span><span class="donut-legend-value">${money(entry.total)} · ${pct.toFixed(0)}%</span></div>`;
            }).join('');
        } else {
            reportStatusDonut.style.background = 'conic-gradient(#dfe4dc 0deg 360deg)';
            reportStatusDonut.setAttribute('aria-label', 'Distribución por estado: sin datos');
            reportStatusLegend.innerHTML = '<div class="donut-empty">Sin datos para mostrar</div>';
        }
    }

    // Comparativa mes actual vs. mes anterior
    $('reportCurrentMonthTotal').textContent = money(data.currentMonthTotal.total);
    $('reportPreviousMonthTotal').textContent = money(data.previousMonthTotal.total);
    const cmDeltaEl = $('reportCurrentMonthDelta');
    cmDeltaEl.textContent = data.monthDelta.text;
    cmDeltaEl.className = `report-delta ${data.monthDelta.dir}`.trim();

    // Pagos recurrentes
    $('reportRecurring').innerHTML = data.recurringList.length
        ? data.recurringList.map(payment => `<tr><td>${escapeHtml(payment.name)}</td><td><span class="cat"><i class="dot" style="background:${categoryColor(payment.category)}"></i>${escapeHtml(payment.category || 'Sin categoría')}</span></td><td style="text-align:right;font-weight:800">${money(payment.amount)}</td><td>${paymentStatusLabel(getPaymentStatus(payment))}</td></tr>`).join('')
        : '<tr><td colspan="4" class="report-recurring-empty">No hay pagos recurrentes en este rango.</td></tr>';
}
// ---------- Diagramas ----------
function chartsRangeBounds() {
    return { from: chartsDateFrom || '', to: chartsDateTo || '' };
}
function chartsRangeText() {
    if (chartsRange === 'custom') {
        if (chartsDateFrom && chartsDateTo) return `${reportDateLabel(chartsDateFrom)} – ${reportDateLabel(chartsDateTo)}`;
        if (chartsDateFrom) return `Desde ${reportDateLabel(chartsDateFrom)}`;
        if (chartsDateTo) return `Hasta ${reportDateLabel(chartsDateTo)}`;
        return 'Rango personalizado';
    }
    return { month:'Este mes', quarter:'Últimos 3 meses', half:'Últimos 6 meses', year:'Este año', all:'Todo el historial' }[chartsRange] || 'Últimos 6 meses';
}
function chartsApplyPreset(preset) {
    const today = new Date();
    const to = formatDateKey(today);
    chartsRange = preset;
    if (preset === 'all') { chartsDateFrom = ''; chartsDateTo = ''; }
    else if (preset === 'month') { chartsDateFrom = formatDateKey(new Date(today.getFullYear(), today.getMonth(), 1)); chartsDateTo = to; }
    else if (preset === 'quarter') { chartsDateFrom = formatDateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1)); chartsDateTo = to; }
    else if (preset === 'half') { chartsDateFrom = formatDateKey(new Date(today.getFullYear(), today.getMonth() - 5, 1)); chartsDateTo = to; }
    else if (preset === 'year') { chartsDateFrom = `${today.getFullYear()}-01-01`; chartsDateTo = to; }
    const fromInput = $('chartsFrom');
    const toInput = $('chartsTo');
    if (fromInput) fromInput.value = chartsDateFrom;
    if (toInput) toInput.value = chartsDateTo;
}
function syncChartsPresetHighlight() {
    document.querySelectorAll('.charts-presets .chip').forEach(chip => {
        chip.classList.toggle('is-active', chip.dataset.chartRange === chartsRange);
    });
}
function monthKeysBetween(fromKey, toKey) {
    const keys = [];
    let [year, month] = String(fromKey).split('-').map(Number);
    const [endYear, endMonth] = String(toKey).split('-').map(Number);
    if (!year || !month || !endYear || !endMonth) return keys;
    while (year < endYear || (year === endYear && month <= endMonth)) {
        keys.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        if (keys.length > 240) break;
    }
    return keys;
}
function monthShortLabel(monthKey) {
    const parsed = new Date(`${monthKey}-02`);
    return Number.isNaN(parsed.getTime()) ? monthKey : parsed.toLocaleDateString('es-CO', { month:'short' }).replace('.', '');
}
function chartsFilteredList() {
    const bounds = chartsRangeBounds();
    return payments.filter(payment => {
        const date = String(payment.date || '');
        if (!date) return false;
        if (bounds.from && date < bounds.from) return false;
        if (bounds.to && date > bounds.to) return false;
        if (chartsFilters.category && payment.category !== chartsFilters.category) return false;
        if (chartsFilters.status && getPaymentStatus(payment) !== chartsFilters.status) return false;
        if (chartsFilters.recurring && !payment.recurring) return false;
        const amount = Number(payment.amount || 0);
        if (chartsFilters.amountFrom && amount < chartsFilters.amountFrom) return false;
        if (chartsFilters.amountTo && amount > chartsFilters.amountTo) return false;
        return true;
    });
}
function computeCharts() {
    const bounds = chartsRangeBounds();
    const list = chartsFilteredList();
    const aggregate = buildPaymentsAggregate(list);
    const nowKey = formatDateKey(new Date()).slice(0, 7);
    const earliestKey = list.map(payment => String(payment.date || '').slice(0, 7)).filter(key => /^\d{4}-\d{2}$/.test(key)).sort()[0];
    const startKey = chartsRange === 'all' ? (earliestKey || nowKey) : (bounds.from ? bounds.from.slice(0, 7) : nowKey);
    const allMonths = monthKeysBetween(startKey, nowKey).map(key => aggregate.byMonth.get(key) || { key, count: 0, total: 0, paid: 0, pending: 0 });
    const months = allMonths.slice(-12);
    const maxMonth = months.reduce((max, month) => Math.max(max, month.total), 0) || 1;

    const categoriesData = Array.from(aggregate.byCategory.values())
        .sort((a, b) => b.total - a.total)
        .map(entry => ({ name: entry.name, color: categoryColor(entry.name), total: entry.total, count: entry.count }));
    const statuses = PAYMENT_STATUSES.map(key => {
        const entry = aggregate.byStatus.get(key) || { count: 0, total: 0 };
        return { key, label: paymentStatusLabel(key), total: entry.total, count: entry.count, color: CHART_STATUS_COLORS[key] };
    });
    const recurringTotal = list.filter(payment => payment.recurring).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const uniqueTotal = Math.max(0, aggregate.total - recurringTotal);
    const topCategories = categoriesData.slice(0, 6);
    const maxTop = topCategories.reduce((max, entry) => Math.max(max, entry.total), 0) || 1;

    const weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekdayTotals = Array(7).fill(0);
    list.forEach(payment => {
        const day = new Date(String(payment.date || '') + 'T12:00:00').getDay();
        if (!Number.isNaN(day)) weekdayTotals[day] += Number(payment.amount || 0);
    });
    const weekdayData = weekdayLabels.map((label, index) => ({ label, total: weekdayTotals[index] })).sort((a, b) => b.total - a.total);
    const maxWeekday = weekdayData.reduce((max, entry) => Math.max(max, entry.total), 0) || 1;

    const [year, month] = chartsMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate() || 31;
    const daily = Array(daysInMonth).fill(0);
    list.forEach(payment => {
        const date = String(payment.date || '');
        if (!date.startsWith(chartsMonth)) return;
        const day = Number(date.slice(8, 10));
        if (day >= 1 && day <= daysInMonth) daily[day - 1] += Number(payment.amount || 0);
    });
    const cumulative = [];
    let running = 0;
    daily.forEach(value => { running += value; cumulative.push(running); });

    const filterBits = [];
    if (chartsFilters.category) filterBits.push(`Categoría: ${chartsFilters.category}`);
    if (chartsFilters.status) filterBits.push(`Estado: ${paymentStatusLabel(chartsFilters.status)}`);
    if (chartsFilters.recurring) filterBits.push('Solo recurrentes');
    if (chartsFilters.amountFrom) filterBits.push(`Desde ${money(chartsFilters.amountFrom)}`);
    if (chartsFilters.amountTo) filterBits.push(`Hasta ${money(chartsFilters.amountTo)}`);

    return { list, aggregate, months, monthsTotal: allMonths.length, maxMonth, categoriesData, statuses, recurringTotal, uniqueTotal, topCategories, maxTop, weekdayData, maxWeekday, cumulative, daysInMonth, monthTotal: running, filterBits };
}
function chartsFiltersActive() {
    return !!(chartsFilters.category || chartsFilters.status || chartsFilters.recurring || chartsFilters.amountFrom || chartsFilters.amountTo);
}
function renderChartsDonut(donutId, totalId, legendId, entries) {
    const donut = $(donutId);
    if (!donut) return;
    const totalEl = $(totalId);
    const legend = $(legendId);
    const values = entries.filter(entry => Number(entry.value) > 0);
    const total = values.reduce((sum, entry) => sum + Number(entry.value), 0);
    if (totalEl) totalEl.textContent = total > 0 ? money(total) : '$ 0';
    donut.dataset.values = JSON.stringify(values);
    if (total <= 0) {
        donut.style.background = 'conic-gradient(#dfe4dc 0deg 360deg)';
        donut.setAttribute('aria-label', 'Sin datos para mostrar');
        if (legend) legend.innerHTML = '<div class="donut-empty">Sin datos para mostrar</div>';
        return;
    }
    let current = 0;
    donut.style.background = `conic-gradient(${values.map(entry => {
        const start = current;
        const end = current + (Number(entry.value) / total) * 360;
        current = end;
        return `${entry.color} ${start}deg ${end}deg`;
    }).join(', ')})`;
    donut.setAttribute('aria-label', `Total ${money(total)}`);
    if (legend) {
        legend.innerHTML = values.map(entry => {
            const pct = total > 0 ? (Number(entry.value) / total) * 100 : 0;
            return `<div class="donut-legend-item"><span class="donut-legend-dot" style="background:${escapeHtml(entry.color)}"></span><span class="donut-legend-label">${escapeHtml(entry.label)}</span><span class="donut-legend-value">${money(entry.value)} · ${pct.toFixed(0)}%</span></div>`;
        }).join('');
    }
}
function chartsAreaSvg(cumulative, days, total) {
    if (!cumulative.length) return '<div class="chart-empty">Sin datos para mostrar</div>';
    const W = 680, H = 210, padX = 10, padTop = 14, padBottom = 12;
    const max = Math.max(total, 1);
    const x = index => days <= 1 ? W / 2 : padX + (index / (days - 1)) * (W - padX * 2);
    const y = value => H - padBottom - (value / max) * (H - padTop - padBottom);
    const points = cumulative.map((value, index) => [x(index), y(value)]);
    const line = points.map(([px, py], index) => `${index === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
    const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${H - padBottom} L ${points[0][0].toFixed(1)} ${H - padBottom} Z`;
    const grid = [0, 0.5, 1].map(ratio => {
        const gy = (padTop + ratio * (H - padTop - padBottom)).toFixed(1);
        return `<line x1="${padX}" y1="${gy}" x2="${W - padX}" y2="${gy}" class="charts-grid-line" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const last = points[points.length - 1];
    const ticks = [1, Math.round(days * 0.25), Math.round(days * 0.5), Math.round(days * 0.75), days]
        .filter((day, index, arr) => day >= 1 && day <= days && arr.indexOf(day) === index);
    return `<div class="charts-area-wrap"><svg class="charts-area" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gasto acumulado: ${money(total)}">${grid}<path d="${area}" class="charts-area-fill"/><path d="${line}" class="charts-area-line" vector-effect="non-scaling-stroke"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" class="charts-area-dot" vector-effect="non-scaling-stroke"/></svg><div class="charts-axis">${ticks.map(day => `<span>${day}</span>`).join('')}</div></div>`;
}
function renderCharts() {
    const view = $('chartsView');
    if (!view || view.classList.contains('hidden')) return;
    const currentKey = formatDateKey(new Date()).slice(0, 7);

    const categorySelect = $('chartsFilterCategory');
    if (categorySelect) {
        const names = Array.from(new Set([...categories.map(category => category.name), ...payments.map(payment => payment.category).filter(Boolean)])).sort((a, b) => a.localeCompare(b, 'es'));
        if (chartsFilters.category && !names.includes(chartsFilters.category)) chartsFilters.category = '';
        categorySelect.innerHTML = '<option value="">Todas</option>' + names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        categorySelect.value = chartsFilters.category;
    }
    const statusSelect = $('chartsFilterStatus');
    if (statusSelect) statusSelect.value = chartsFilters.status;
    const recurringCheck = $('chartsFilterRecurring');
    if (recurringCheck) recurringCheck.checked = chartsFilters.recurring;

    const monthKeys = Array.from(new Set(chartsFilteredList().map(payment => String(payment.date || '').slice(0, 7)).filter(key => /^\d{4}-\d{2}$/.test(key)))).sort().reverse();
    if (!monthKeys.length) monthKeys.push(currentKey);
    if (!monthKeys.includes(chartsMonth)) chartsMonth = monthKeys[0];

    const data = computeCharts();
    $('chartsFilterMeta').textContent = data.filterBits.length ? data.filterBits.join(' · ') : 'Sin filtros';
    $('chartsMeta').textContent = `${data.list.length} pago${data.list.length === 1 ? '' : 's'} · ${chartsRangeText()}${data.filterBits.length ? ' · filtros activos' : ''}`;
    const monthsMeta = data.monthsTotal > data.months.length
        ? `${data.months.length} de ${data.monthsTotal} meses · ${money(data.aggregate.total)}`
        : `${data.months.length} mes${data.months.length === 1 ? '' : 'es'} · ${money(data.aggregate.total)}`;
    $('chartsEvolutionMeta').textContent = monthsMeta;

    const evolution = $('chartsEvolution');
    if (evolution) {
        evolution.style.gridTemplateColumns = `repeat(${Math.max(1, data.months.length)}, minmax(0,1fr))`;
        evolution.innerHTML = data.months.length
            ? data.months.map(month => {
                const heightPx = month.total === 0 ? 8 : Math.max((month.total / data.maxMonth) * 140, 8);
                const pct = data.aggregate.total > 0 ? Math.round((month.total / data.aggregate.total) * 100) : 0;
                const label = month.total > 0 ? `<div class="bar-value"><span class="bar-value-amount">${compactMoney(month.total)}</span><span class="bar-value-pct">${pct}%</span></div>` : '';
                const fullLabel = formatMonthLabel(month.key);
                return `<div class="bar-wrap" role="img" aria-label="${escapeHtml(fullLabel)}: ${money(month.total)}">${label}<div class="bar ${month.key === currentKey ? 'current' : ''}${month.total === 0 ? ' is-zero' : ''}" style="height:${heightPx}px" title="${escapeHtml(fullLabel)}: ${money(month.total)}"></div><span>${escapeHtml(monthShortLabel(month.key))}</span></div>`;
            }).join('')
            : '<div class="chart-empty">Sin meses para mostrar</div>';
    }

    renderChartsDonut('chartsCategoryDonut', 'chartsCategoryTotal', 'chartsCategoryLegend', data.categoriesData.map(entry => ({ label: entry.name, value: entry.total, color: entry.color })));
    renderChartsDonut('chartsStatusDonut', 'chartsStatusTotal', 'chartsStatusLegend', data.statuses.map(entry => ({ label: entry.label, value: entry.total, color: entry.color })));
    renderChartsDonut('chartsRecurringDonut', 'chartsRecurringTotal', 'chartsRecurringLegend', [
        { label:'Recurrentes', value:data.recurringTotal, color:'#c7f36b' },
        { label:'Únicos', value:data.uniqueTotal, color:'#88c9ed' }
    ]);

    const topEl = $('chartsTopCategories');
    if (topEl) {
        topEl.innerHTML = data.topCategories.length
            ? data.topCategories.map(entry => `<div class="report-bar"><span class="report-bar-label">${escapeHtml(entry.name)}</span><div class="report-bar-track"><i style="width:${((entry.total / data.maxTop) * 100).toFixed(1)}%;background:${escapeHtml(entry.color)}"></i></div><strong>${money(entry.total)}</strong></div>`).join('')
            : '<div class="report-bar-zero">Sin gastos en el periodo.</div>';
    }
    const weekdayEl = $('chartsWeekday');
    if (weekdayEl) {
        weekdayEl.innerHTML = data.weekdayData.some(entry => entry.total > 0)
            ? data.weekdayData.filter(entry => entry.total > 0).map(entry => `<div class="report-bar"><span class="report-bar-label">${escapeHtml(entry.label)}</span><div class="report-bar-track"><i style="width:${((entry.total / data.maxWeekday) * 100).toFixed(1)}%;background:var(--blue)"></i></div><strong>${money(entry.total)}</strong></div>`).join('')
            : '<div class="report-bar-zero">Sin gastos en el periodo.</div>';
    }

    const select = $('chartsMonthSelect');
    if (select) {
        select.innerHTML = monthKeys.map(key => `<option value="${key}">${escapeHtml(formatMonthLabel(key))}</option>`).join('');
        select.value = chartsMonth;
    }

    const accumulated = $('chartsAccumulated');
    if (accumulated) {
        accumulated.innerHTML = data.monthTotal > 0
            ? chartsAreaSvg(data.cumulative, data.daysInMonth, data.monthTotal)
            : '<div class="chart-empty">Sin gastos registrados este mes.</div>';
    }
    $('chartsAccumulatedMeta').textContent = `${formatMonthLabel(chartsMonth)} · ${money(data.monthTotal)}`;
}
function exportChartsCsv() {
    const data = computeCharts();
    const bounds = chartsRangeBounds();
    const period = bounds.from ? `${bounds.from} a ${bounds.to}` : 'Todo el historial';
    const filtersText = data.filterBits.length ? data.filterBits.join(' · ') : 'Ninguno';
    const rows = [['Seccion', 'Elemento', 'Pagos', 'Monto', 'Porcentaje', 'Detalle']];
    rows.push(['Periodo', chartsRangeText(), data.list.length, data.aggregate.total, '100 %', period]);
    rows.push(['Filtros', filtersText, '', '', '', '']);
    data.months.forEach(month => rows.push(['Mes', formatMonthLabel(month.key), month.count, month.total, `${reportShare(month.total, data.aggregate.total).toFixed(1)} %`, '']));
    data.categoriesData.forEach(entry => rows.push(['Categoria', entry.name, entry.count, entry.total, `${reportShare(entry.total, data.aggregate.total).toFixed(1)} %`, '']));
    data.statuses.forEach(entry => rows.push(['Estado', entry.label, entry.count, entry.total, `${reportShare(entry.total, data.aggregate.total).toFixed(1)} %`, '']));
    data.weekdayData.forEach(entry => rows.push(['Día de la semana', entry.label, '', entry.total, `${reportShare(entry.total, data.aggregate.total).toFixed(1)} %`, '']));
    rows.push(['Recurrencia', 'Recurrentes', '', data.recurringTotal, `${reportShare(data.recurringTotal, data.aggregate.total).toFixed(1)} %`, '']);
    rows.push(['Recurrencia', 'Unicos', '', data.uniqueTotal, `${reportShare(data.uniqueTotal, data.aggregate.total).toFixed(1)} %`, '']);
    rows.push(['Acumulado', formatMonthLabel(chartsMonth), '', data.monthTotal, '', 'Gasto acumulado del mes']);
    downloadCsv(`diagramas-${formatDateKey(new Date())}.csv`, rows);
}
function csvSafe(value) {
    const text = String(value ?? '');
    return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}
function showToast(message, type, action) {
    const container = $('toastContainer');
    if (!container) { console.warn(message); return; }
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' is-' + type : '');
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    if (action) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = action.label;
        btn.onclick = () => { try { action.onClick(); } catch (e) { console.error(e); } toast.remove(); };
        toast.appendChild(btn);
    }
    container.appendChild(toast);
    const duration = action ? 5000 : 3200;
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .2s ease'; setTimeout(() => toast.remove(), 220); }, duration);
}
async function exportPdf(viewId) {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('Librerías PDF no disponibles. Usa Imprimir / PDF.', 'error');
        window.print();
        return;
    }
    const target = $(viewId) || document.querySelector('main');
    if (!target) { showToast('No hay vista para exportar.', 'error'); return; }
    showToast('Generando PDF...', 'success');
    try {
        const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: getComputedStyle(document.body).backgroundColor });
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: canvas.width > canvas.height * 1.2 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth - 20;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 10;
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight, '', 'FAST');
        heightLeft -= (pageHeight - 20);
        while (heightLeft > 0) {
            position = 10 - (imgHeight - heightLeft);
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight, '', 'FAST');
            heightLeft -= (pageHeight - 20);
        }
        pdf.save(`cartera-${viewId || 'informe'}-${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('PDF generado.', 'success');
        return;


        showToast('PDF generado.', 'success');
    } catch (e) {
        console.error(e);
        showToast('No fue posible generar el PDF. Usa Imprimir / PDF.', 'error');
    }
}
function downloadCsv(filename, rows) {
    const csv = rows.map(row => row.map(value => '"' + csvSafe(value).replaceAll('"', '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}
function exportReportCsv() {
    const data = computeReports();
    const aggregate = data.aggregate;
    const rows = [['Seccion', 'Elemento', 'Pagos', 'Monto', 'Porcentaje', 'Detalle']];
    const strip = text => String(text).replace(/<[^>]+>/g, '');
    const push = (section, element, count, amount, share, detail) => rows.push([section, element, count ?? '', amount ?? '', share ?? '', detail ?? '']);

    push('Periodo', data.rangeLabel, aggregate.count, aggregate.total, '', `${data.days || 'sin límite'} dias · ${data.monthCount} mes(es)`);
    push('KPI', 'Gasto del periodo', '', aggregate.total, '', data.deltas.total.text);
    push('KPI', 'Pagado', '', aggregate.paid, `${data.paidShare.toFixed(1)} %`, data.deltas.paid.text);
    push('KPI', 'Pendiente', '', aggregate.pending, `${data.pendingShare.toFixed(1)} %`, data.deltas.pending.text);
    push('KPI', 'Promedio por pago', '', data.average, '', data.deltas.average.text);
    data.months.forEach(month => push('Mes', formatMonthLabel(month.key), month.count, month.total, `${reportShare(month.total, aggregate.total).toFixed(1)} %`, `Pagado ${month.paid} · Pendiente ${month.pending}`));
    data.categories.forEach(entry => push('Categoria', entry.name, entry.count, entry.total, `${entry.share.toFixed(1)} %`, entry.budget ? `Presupuesto ${entry.budget}/mes${entry.budgetState ? ` (${entry.budgetState.label} ${entry.budgetState.percent}%)` : ''}` : 'Sin presupuesto'));
    data.statuses.forEach(entry => push('Estado', entry.label, entry.count, entry.total, `${entry.share.toFixed(1)} %`, `Promedio ${entry.average}`));
    data.top.forEach((payment, index) => push('Top', `${index + 1}. ${payment.name}`, '', payment.amount, '', `${payment.category || 'Sin categoria'} · ${payment.date}`));
    data.summary.forEach(item => push('Resumen', strip(item)));

    downloadCsv(`reporte-pagos-${formatDateKey(new Date())}.csv`, rows);
}
function setReportRange(preset) {
    reportRange = Object.assign(reportPresetRange(preset), { preset });
    $('reportFrom').value = reportRange.from;
    $('reportTo').value = reportRange.to;
    document.querySelectorAll('.report-presets .chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.range === preset));
    renderReports();
}
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function populateMonths() {
    const months = [...new Set([new Date().toISOString().slice(0,7), ...payments.map(payment => payment.date.slice(0,7))])].sort().reverse();
    $('monthFilter').innerHTML = months.map(month => `<option value="${month}">${new Date(month + '-02').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>`).join('');
}
function openModal(id) { $(id).classList.add('open'); }
function closeModals() { document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.remove('open')); }
function exportData() {
    const header = ['Concepto', 'Categoria', 'Fecha', 'Estado', 'Importe', 'Recurrente'];
    const rows = payments.map(payment => [payment.name, payment.category, payment.date, paymentStatusLabel(getPaymentStatus(payment)), payment.amount, payment.recurring ? 'Sí' : 'No']);
    const csv = [header, ...rows].map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'cartera-pagos.csv';
    link.click();
    URL.revokeObjectURL(link.href);
}
function splitCsvLine(line, delimiter) {
    const cells = [];
    let current = '';
    let insideQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (insideQuotes) {
            if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
            else if (char === '"') insideQuotes = false;
            else current += char;
        } else if (char === '"') insideQuotes = true;
        else if (char === delimiter) { cells.push(current); current = ''; }
        else current += char;
    }
    cells.push(current);
    return cells.map(cell => cell.trim());
}
function parseCsvRows(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const lines = clean.split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return { header: [], rows: [] };
    const delimiter = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
    const other = delimiter === ',' ? ';' : ',';
    const countIn = (line, char) => line.split(char).length - 1;
    const parsed = lines.map(line => {
        const cells = splitCsvLine(line, delimiter);
        if (cells.length === 1 && countIn(line, other) >= 2) return splitCsvLine(line, other);
        return cells;
    });
    const first = parsed[0].map(cell => cell.toLowerCase());
    const hasHeader = first.some(cell => ['concepto', 'nombre', 'categoría', 'categoria', 'fecha', 'importe', 'monto'].includes(cell));
    return hasHeader ? { header: parsed[0], rows: parsed.slice(1) } : { header: [], rows: parsed };
}
function importStatus(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return 'pendiente';
    if (key === 'no_pagado' || key.startsWith('no pagad') || key.startsWith('sin pagar')) return 'no_pagado';
    if (key === 'pagado' || key.startsWith('pagada') || key === 'si' || key === 'sí') return 'pagado';
    if (key.startsWith('pend')) return 'pendiente';
    return PAYMENT_STATUSES.includes(key) ? key : 'pendiente';
}
function findImportDate(value) {
    const parsed = normalizePaymentDate(value);
    if (!parsed) return null;
    return formatDateKey(parsed);
}
async function importData(text) {
    const { header, rows } = parseCsvRows(text);
    const indexOf = names => header.length ? header.findIndex(cell => names.includes(cell)) : -1;
    const map = {
        name: indexOf(['concepto', 'nombre']),
        category: indexOf(['categoría', 'categoria', 'rubro']),
        date: indexOf(['fecha']),
        status: indexOf(['estado']),
        amount: indexOf(['importe', 'monto', 'valor']),
        recurring: indexOf(['recurrente', 'repetir'])
    };
    const order = { name: 0, category: 1, date: 2, status: 3, amount: 4, recurring: 5 };
    const cell = (row, field) => {
        const explicit = map[field];
        const value = explicit >= 0 ? row[explicit] : undefined;
        return value === undefined ? row[order[field]] : value;
    };
    let imported = 0;
    let skipped = 0;
    let createdCategories = 0;
    const used = new Set(categories.map(category => normalizeColor(category.color)));
    rows.forEach(row => {
        const name = String(cell(row, 'name') || '').trim();
        const date = findImportDate(cell(row, 'date'));
        const amount = parseMoneyInput(cell(row, 'amount'));
        if (!name || !date || !amount || amount <= 0) { skipped += 1; return; }
        const duplicated = payments.some(payment => payment.name === name && String(payment.date) === date && Number(payment.amount) === amount);
        if (duplicated) { skipped += 1; return; }
        const categoryName = String(cell(row, 'category') || '').trim() || 'Sin categoría';
        if (!categories.some(category => category.name.toLowerCase() === categoryName.toLowerCase())) {
            const color = freeCategoryColor(used);
            used.add(normalizeColor(color));
            categories.push({ id: `local-${Date.now()}-${createdCategories}`, name: categoryName, color });
            createdCategories += 1;
        }
        const recurringRaw = String(cell(row, 'recurring') || '').trim().toLowerCase();
        const payment = { name, category: categoryName, date, status: importStatus(cell(row, 'status')), amount };
        if (['sí', 'si', 'true', '1', 's'].includes(recurringRaw)) payment.recurring = true;
        payments.push({ ...payment, id: `local-${Date.now()}-${imported}-${Math.random().toString(36).slice(2, 7)}` });
        imported += 1;
    });
    if (createdCategories) persistCategories();
    if (imported) {
        localStorage.setItem('cartera_payments', JSON.stringify(payments));
        const collection = userCollection('payments');
        if (collection) {
            const batch = db.batch();
            payments.slice(-imported).forEach(payment => {
                batch.set(collection.doc(payment.id), payment);
            });
            await batch.commit().catch(() => {});
        }
        populateMonths();
        render();
    }
    showToast(imported
        ? `Importación lista: ${imported} pago${imported === 1 ? '' : 's'} añadido${imported === 1 ? '' : 's'}${createdCategories ? ` y ${createdCategories} categoría${createdCategories === 1 ? '' : 's'} nueva${createdCategories === 1 ? '' : 's'}` : ''}.${skipped ? ` ${skipped} fila${skipped === 1 ? '' : 's'} omitida${skipped === 1 ? '' : 's'} (vacía o duplicada).` : ''}`
        : 'No se importó ningún pago: revisa que el archivo sea un CSV con las columnas Concepto, Categoría, Fecha, Estado e Importe.', imported ? 'success' : 'error');
    return { imported, skipped, createdCategories };
}
function nextMonthDate(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return null;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const lastDay = new Date(nextYear, nextMonth, 0).getDate();
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
function normalizePaymentText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function paymentRecordSignature(payment) {
    if (!payment) return '';
    const name = normalizePaymentText(payment.name);
    const category = normalizePaymentText(payment.category);
    const date = String(payment.date || '').trim();
    const amount = Number(payment.amount || 0);
    const currency = String(payment.currency || appCurrency || 'COP').toUpperCase();
    return `${name}|${category}|${date}|${amount}|${currency}`;
}
function dedupePayments(list = []) {
    const unique = [];
    const seen = new Set();
    list.forEach(payment => {
        if (!payment || !payment.name || !payment.date) return;
        const signature = paymentRecordSignature(payment);
        if (!signature || seen.has(signature)) return;
        seen.add(signature);
        unique.push(payment);
    });
    return unique;
}
function isExistingPaymentRecord(candidate, list = payments) {
    if (!candidate) return false;
    const signature = paymentRecordSignature(candidate);
    return list.some(existing => {
        if (!existing || existing.id === candidate.id) return false;
        return paymentRecordSignature(existing) === signature;
    });
}
async function syncRecurringPayments() {
    const currentMonth = todayKey().slice(0, 7);
    const collection = userCollection('payments');
    let created = 0;
    const seeds = payments.filter(payment => payment.recurring);
    for (const seed of seeds) {
        let date = seed.date;
        for (let guard = 0; guard < 60; guard += 1) {
            const next = nextMonthDate(date);
            if (!next || next.slice(0, 7) > currentMonth) break;
            const candidate = { name: seed.name, category: seed.category, amount: Number(seed.amount) || 0, date: next, status: 'pendiente', recurring: true };
            const exists = isExistingPaymentRecord(candidate, payments);
            date = next;
            if (exists) continue;
            const clone = { ...candidate };
            if (collection && !String(seed.id).startsWith('local-')) {
                try {
                    const ref = await collection.add(clone);
                    payments.push({ ...clone, id: ref.id });
                } catch (error) {
                    payments.push({ ...clone, id: `local-${Date.now()}-${created}` });
                }
            } else {
                payments.push({ ...clone, id: `local-${Date.now()}-${created}-${Math.random().toString(36).slice(2, 7)}` });
            }
            created += 1;
        }
    }
    if (created || payments.length !== dedupePayments(payments).length) {
        payments = dedupePayments(payments);
        localStorage.setItem('cartera_payments', JSON.stringify(payments));
        populateMonths();
        render();
    }
    return created;
}
function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function getCurrentWeekRange() {
    const today = new Date();
    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(today.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
        start: formatDateKey(monday),
        end: formatDateKey(sunday)
    };
}
function normalizePaymentDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T12:00:00`);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [d,m,y] = raw.split('/');
        return new Date(`${y}-${m}-${d}T12:00:00`);
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function getCurrentWeekPayments() {
    const { start, end } = getCurrentWeekRange();
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59`);
    return payments.filter(payment => {
        if (!payment || !payment.date) return false;
        const pd = normalizePaymentDate(payment.date);
        if (!pd) return false;
        return pd >= startDate && pd <= endDate;
    });
}
function getCurrentWeekSpend() {
    return getCurrentWeekPayments().reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}
function calendarMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function weeksLeftInMonth() {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(1, (daysInMonth - now.getDate() + 1) / 7);
}
function analyzeRealSpending(monthKey) {
    const monthPayments = payments.filter(payment => String(payment.date || '').startsWith(monthKey));
    const total = monthPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const historyByCategory = new Map();
    const monthsWithHistory = new Set();
    payments.forEach(payment => {
        const month = String(payment.date || '').slice(0, 7);
        if (!month) return;
        monthsWithHistory.add(month);
        const name = payment.category || 'Sin categoría';
        if (!historyByCategory.has(name)) historyByCategory.set(name, new Set());
        historyByCategory.get(name).add(month);
    });
    const threshold = Math.max(2, Math.ceil(monthsWithHistory.size * 0.5));
    const byCategory = new Map();
    monthPayments.forEach(payment => {
        const name = payment.category || 'Sin categoría';
        const entry = byCategory.get(name) || { name, total: 0, count: 0 };
        entry.total += Number(payment.amount || 0);
        entry.count += 1;
        byCategory.set(name, entry);
    });
    let fixed = 0;
    let variable = 0;
    const rows = [...byCategory.values()].map(entry => {
        const recurring = (historyByCategory.get(entry.name) || new Set()).size >= threshold;
        if (recurring) fixed += entry.total; else variable += entry.total;
        return { ...entry, recurring, share: total ? entry.total / total * 100 : 0 };
    }).sort((a, b) => b.total - a.total);
    return { monthPayments, total, count: monthPayments.length, fixed, variable, rows };
}
function buildBudgetPlan(income, monthSpend, weekSpend) {
    const monthIncome = Number(income) || 0;
    const spent = Number(monthSpend) || 0;
    const weekSpent = Number(weekSpend) || 0;
    const weeksLeft = weeksLeftInMonth();
    const monthAvailable = monthIncome - spent;
    const allowedSpend = Math.max(0, monthAvailable / weeksLeft);
    const delta = allowedSpend - weekSpent;
    const monthMargin = monthIncome - spent;

    let advice = 'Estás dentro del plan.';
    if (monthIncome <= 0) advice = 'Ingresa un ingreso mensual válido.';
    else if (monthAvailable < 0) advice = 'Ya superaste tu ingreso de este mes.';
    else if (delta < 0) advice = 'Debes bajar tu gasto de esta semana.';

    let summary;
    if (monthIncome <= 0) {
        summary = 'Ingresa tu ingreso mensual para compararlo con tus gastos reales.';
    } else if (monthAvailable < 0) {
        summary = `Gastaste ${money(spent)} y solo entraron ${money(monthIncome)}: estás ${money(Math.abs(monthAvailable))} por encima de tu ingreso.`;
    } else {
        const weeksLabel = weeksLeft <= 1.05 ? 'el resto de esta semana' : `los próximos ${weeksLeft.toFixed(1)} semanas`;
        summary = `Te quedan ${money(monthAvailable)} para ${weeksLabel}: puedes gastar ${money(allowedSpend)} por semana.`;
        if (delta < 0) summary += ` Ya llevas ${money(weekSpent)} esta semana, ${money(Math.abs(delta))} por encima de tu límite.`;
    }

    return { allowedSpend, delta, monthAvailable, monthMargin, weeksLeft, advice, summary, ok: monthIncome > 0 && monthAvailable >= 0 && delta >= 0 };
}
function signedMoney(value) {
    return value >= 0 ? `+${money(value)}` : money(value);
}
function updateSimulator() {
    const incomeInput = $('simulatorIncome');
    if (!incomeInput) return;
    const monthKey = calendarMonthKey();
    const weekPayments = getCurrentWeekPayments();
    const weekSpend = weekPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const monthData = analyzeRealSpending(monthKey);
    const income = parseMoneyInput(incomeInput.value);
    const plan = buildBudgetPlan(income, monthData.total, weekSpend);
    const monthLabel = formatMonthLabel(monthKey);

    $('simulatorMonthLabel').textContent = monthLabel;
    $('simulatorBreakdownMonth').textContent = monthLabel;
    $('simulatorRealMonth').textContent = money(monthData.total);
    $('simulatorRealCount').textContent = `${monthData.count} pago${monthData.count === 1 ? '' : 's'}`;

    $('simulatorSpendLimit').textContent = money(plan.allowedSpend);
    $('simulatorActualSpend').textContent = money(weekSpend);
    $('simulatorWeekCount').textContent = `${weekPayments.length} pago${weekPayments.length === 1 ? '' : 's'}`;
    $('simulatorMonthAvailable').textContent = signedMoney(plan.monthAvailable);
    $('simulatorMargin').textContent = signedMoney(plan.delta);

    const marginEl = $('simulatorMargin');
    marginEl.classList.toggle('is-ok', plan.delta >= 0);
    marginEl.classList.toggle('is-alert', plan.delta < 0);
    const availableEl = $('simulatorMonthAvailable');
    availableEl.classList.toggle('is-ok', plan.monthAvailable >= 0);
    availableEl.classList.toggle('is-alert', plan.monthAvailable < 0);
    const adviceEl = $('simulatorAdvice');
    adviceEl.textContent = plan.advice;
    adviceEl.classList.toggle('is-ok', plan.ok);
    adviceEl.classList.toggle('is-alert', !plan.ok && plan.monthAvailable < 0);
    $('simulatorSummary').textContent = plan.summary;

    $('simFixed').textContent = money(monthData.fixed);
    $('simVariable').textContent = money(monthData.variable);
    const monthlyMargin = plan.monthMargin;
    const marginCard = $('simMonthlyMargin');
    marginCard.textContent = signedMoney(monthlyMargin);
    marginCard.classList.toggle('is-ok', monthlyMargin >= 0);
    marginCard.classList.toggle('is-alert', monthlyMargin < 0);

    const breakdown = $('simulatorBreakdown');
    breakdown.innerHTML = monthData.rows.length
        ? monthData.rows.slice(0, 6).map(row => `<div class="breakdown-row">
            <div class="breakdown-name"><i class="dot" style="background:${escapeHtml(categoryColor(row.name))}"></i><span>${escapeHtml(row.name)}</span>${row.recurring ? '<em>Recurrente</em>' : ''}</div>
            <div class="breakdown-bar"><i style="width:${Math.max(2, Math.round(row.share))}%"></i></div>
            <strong>${money(row.total)}</strong>
            <span class="breakdown-share">${row.share.toFixed(0)} %</span>
        </div>`).join('')
        : '<p class="savings-tip">Aún no registras pagos este mes: añade tu primer pago para ver cómo se reparte tu gasto.</p>';

    localStorage.setItem('cartera_simulator', JSON.stringify({ income: incomeInput.value }));
}
const SAVINGS_TOTAL_STEPS = 4;
const savingsStorageKey = 'cartera_savings_plan';
let savingsStep = 1;

function savingsMode() {
    const checked = document.querySelector('input[name="savingsMode"]:checked');
    return checked ? checked.value : 'monthly';
}
function formatMonthYear(date) {
    return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
function monthsUntil(targetDate) {
    const now = new Date();
    const diff = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    return diff > 0 ? diff : 1;
}
function addMonthsFromToday(months) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    return date;
}
function toInputDate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}
function computeSavingsPlan() {
    const name = $('savingsName').value.trim();
    const goal = parseMoneyInput($('savingsGoal').value);
    const current = parseMoneyInput($('savingsCurrent').value);
    const mode = savingsMode();
    const monthly = parseMoneyInput($('savingsMonthly').value);
    const rawTarget = $('savingsTargetDate').value;
    const targetDate = rawTarget ? new Date(`${rawTarget}T00:00:00`) : null;
    const remaining = Math.max(0, goal - current);
    const progress = goal > 0 ? Math.min(100, current / goal * 100) : 0;
    const reached = goal > 0 && remaining === 0;

    let months = 0;
    let contribution = mode === 'monthly' ? monthly : 0;
    let eta = null;

    if (reached) {
        months = 0;
        contribution = 0;
    } else if (mode === 'date' && targetDate) {
        months = monthsUntil(targetDate);
        contribution = Math.ceil(remaining / months);
        eta = targetDate;
    } else if (mode === 'monthly' && monthly > 0) {
        months = Math.ceil(remaining / monthly);
        eta = addMonthsFromToday(months);
    }

    return { name, goal, current, mode, monthly, targetDate, remaining, progress, reached, months, contribution, eta };
}
function validateSavingsStep(step, plan) {
    const data = plan || computeSavingsPlan();
    if (step === 1) return data.goal > 0 ? '' : 'Ingresa una meta mayor a cero para continuar.';
    if (step === 2) return data.current >= 0 ? '' : 'El ahorro actual no puede ser negativo.';
    if (step === 3) {
        if (data.reached) return '';
        if (data.mode === 'monthly') return data.monthly > 0 ? '' : 'Define un aporte mensual mayor a cero para continuar.';
        return data.targetDate && data.targetDate > new Date() ? '' : 'Elige una fecha futura como objetivo.';
    }
    return '';
}
function canVisitSavingsStep(step) {
    for (let index = 1; index < step; index += 1) {
        if (validateSavingsStep(index)) return false;
    }
    return true;
}
function renderSavingsMilestones(plan) {
    const list = $('savingsMilestones');
    if (!list) return;
    if (plan.months <= 0 || plan.contribution <= 0) {
        list.innerHTML = '<li class="milestone-empty">Completa el paso anterior para ver tus próximos aportes.</li>';
        return;
    }
    const rows = [];
    const shown = Math.min(plan.months, 6);
    for (let index = 1; index <= shown; index += 1) {
        const balance = Math.min(plan.goal, plan.current + plan.contribution * index);
        rows.push(`<li><span>${escapeHtml(formatMonthYear(addMonthsFromToday(index)))}</span><strong>${money(balance)}</strong></li>`);
    }
    if (plan.months > shown) {
        rows.push(`<li class="milestone-final"><span>${escapeHtml(formatMonthYear(plan.eta))} · meta</span><strong>${money(plan.goal)}</strong></li>`);
    }
    list.innerHTML = rows.join('');
}
function updateSavingsStepper() {
    const plan = computeSavingsPlan();
    document.querySelectorAll('#savingsStepper .step').forEach(button => {
        const step = Number(button.dataset.step);
        button.disabled = !canVisitSavingsStep(step);
        button.classList.toggle('is-active', step === savingsStep);
        button.classList.toggle('is-done', step < savingsStep && canVisitSavingsStep(step));
    });
    $('savingsStepCounter').textContent = `Paso ${savingsStep} de ${SAVINGS_TOTAL_STEPS}`;
    $('savingsPrevBtn').hidden = savingsStep === 1;
    $('savingsNextBtn').hidden = savingsStep === SAVINGS_TOTAL_STEPS;
    $('savingsNextBtn').disabled = Boolean(validateSavingsStep(savingsStep, plan));
    $('savingsStepHint').textContent = savingsStep === SAVINGS_TOTAL_STEPS ? '' : validateSavingsStep(savingsStep, plan);
}
function goToSavingsStep(step) {
    let target = Math.max(1, Math.min(SAVINGS_TOTAL_STEPS, Number(step) || 1));
    if (target > savingsStep || !canVisitSavingsStep(target)) {
        const firstInvalid = Array.from({ length: target }, (_, index) => index + 1).find(index => validateSavingsStep(index));
        target = firstInvalid || target;
    }
    savingsStep = target;
    document.querySelectorAll('.savings-step').forEach(panel => panel.classList.toggle('is-active', Number(panel.dataset.step) === savingsStep));
    updateSavingsStepper();
    saveSavingsPlan();
}
function saveSavingsPlan() {
    localStorage.setItem(savingsStorageKey, JSON.stringify({
        name: $('savingsName').value,
        goal: $('savingsGoal').value,
        current: $('savingsCurrent').value,
        monthly: $('savingsMonthly').value,
        mode: savingsMode(),
        target: $('savingsTargetDate').value,
        step: savingsStep
    }));
}
function updateSavingsSimulator() {
    const plan = computeSavingsPlan();
    const percentText = `${Math.round(plan.progress)} %`;

    $('s1Goal').textContent = money(plan.goal);
    $('s1Current').textContent = money(plan.current);
    $('s1Remaining').textContent = money(plan.remaining);
    $('s2Progress').textContent = percentText;
    $('s2Remaining').textContent = money(plan.remaining);
    $('s3Remaining').textContent = money(plan.remaining);
    $('savingsGoalResult').textContent = money(plan.goal);
    $('savingsRemaining').textContent = money(plan.remaining);

    [$('savingsProgress'), $('savingsResultProgress')].forEach(fill => {
        fill.style.width = `${plan.progress}%`;
        fill.parentElement.setAttribute('aria-valuenow', String(Math.round(plan.progress)));
    });

    $('savingsProgressHint').textContent = plan.goal > 0
        ? `Vas al ${percentText} de tu meta${plan.name ? ` (${plan.name})` : ''}.`
        : 'Completa el paso 1 para ver tu avance.';

    const modeIsMonthly = plan.mode === 'monthly';
    $('savingsMonthlyWrap').classList.toggle('hidden', !modeIsMonthly);
    $('savingsTargetWrap').classList.toggle('hidden', modeIsMonthly);
    $('savingsModeHint').textContent = modeIsMonthly
        ? 'Con un aporte fijo calculamos en cuántos meses llegas a tu meta.'
        : 'Nosotros calculamos cuánto debes ahorrar cada mes para llegar a tiempo.';

    if (modeIsMonthly) {
        $('savingsModeLabel').textContent = 'Tiempo estimado';
        $('savingsModeValue').textContent = plan.reached ? 'Meta alcanzada' : plan.months ? `${plan.months} mes${plan.months === 1 ? '' : 'es'}` : '—';
    } else {
        $('savingsModeLabel').textContent = 'Aporte necesario al mes';
        $('savingsModeValue').textContent = plan.reached ? 'Meta alcanzada' : plan.contribution ? money(plan.contribution) : '—';
    }

    $('savingsPlanTitle').textContent = plan.name ? `Tu plan: ${plan.name}` : 'Tu plan de ahorro';
    $('savingsContribution').textContent = plan.contribution ? money(plan.contribution) : '—';
    $('savingsDuration').textContent = plan.reached ? 'Meta alcanzada' : plan.months ? `${plan.months} mes${plan.months === 1 ? '' : 'es'}` : '—';
    $('savingsEta').textContent = plan.eta ? formatMonthYear(plan.eta) : (plan.reached ? 'Hoy' : '—');

    if (plan.goal <= 0) {
        $('savingsSummary').textContent = 'Ingresa una meta para crear tu plan de ahorro.';
    } else if (plan.reached) {
        $('savingsSummary').textContent = `Ya alcanzaste tu meta de ${money(plan.goal)}. ¡Es momento de fijar una nueva!`;
    } else if (!plan.contribution || !plan.months) {
        $('savingsSummary').textContent = 'Completa el aporte mensual o la fecha objetivo para estimar el plazo.';
    } else if (plan.mode === 'date') {
        $('savingsSummary').textContent = `Ahorrando ${money(plan.contribution)} al mes llegarías a tu meta en ${formatMonthYear(plan.eta)}.`;
    } else {
        $('savingsSummary').textContent = `Ahorrando ${money(plan.contribution)} al mes, alcanzarías tu meta cerca de ${formatMonthYear(plan.eta)}.`;
    }

    renderSavingsMilestones(plan);
    updateSavingsStepper();
    saveSavingsPlan();
}
function setTheme(dark) {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('cartera_theme', dark ? 'dark' : 'light');
    const themeIcon = $('themeIcon');
    const themeLabel = $('themeLabel');
    if (themeIcon) themeIcon.textContent = dark ? '☀' : '☾';
    if (themeLabel) themeLabel.textContent = dark ? 'Tema oscuro' : 'Tema claro';
    if (document.getElementById('simulatorIncome')) updateSimulator();
}
function setPaymentFormCategoryOptions() {
    $('categorySelect').innerHTML = categories.map(category => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('');
}
function setIncomeFormCategoryOptions() {
    const sel = $('incomeCategorySelect');
    if (sel) sel.innerHTML = categories.map(category => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('');
}
const userCollection = name => {
    if (!db || !currentUser || isLocalOnlySession(currentUser)) return null;
    return db.collection('users').doc(currentUser.uid).collection(name);
};
populateMonths();
if ($('pageSizeSelect')) $('pageSizeSelect').value = String(paymentFilters.pageSize || 5);
$('monthFilter').value = new Date().toISOString().slice(0,7);
$('todayLabel').textContent = new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
$('addBtn').onclick = () => {
    editingPaymentId = null;
    selectedAttachmentFile = null;
    $('paymentForm').reset();
    $('paymentForm').elements.date.value = new Date().toISOString().slice(0,10);
    if ($('paymentCurrency')) $('paymentCurrency').value = appCurrency;
    if ($('paymentAttachmentPreview')) $('paymentAttachmentPreview').classList.add('hidden');
    if ($('paymentAttachmentInfo')) $('paymentAttachmentInfo').textContent = '';
    setPaymentFormCategoryOptions();
    const title = $('paymentForm').closest('.modal').querySelector('h2');
    if (title) title.textContent = 'Registrar nuevo pago';
    const btn = $('paymentForm').querySelector('.btn-dark');
    if (btn) btn.textContent = 'Guardar pago';
    const editSeriesField = $('editSeriesField');
    if (editSeriesField) editSeriesField.style.display = 'none';
    openModal('paymentModal');
};
$('exportBtn').onclick = exportData;
const navReports = $('reportsNav'); if (navReports) navReports.onclick = () => {
    showView('reportsView');
    setActiveNav('reportsNav');
    renderReports();
};
$('reportPrintBtn').onclick = () => window.print();
if ($('reportPdfBtn')) $('reportPdfBtn').onclick = () => exportPdf('reportsView');
$('reportCsvBtn').onclick = exportReportCsv;
$('reportBackupBtn').onclick = exportData;
$('reportFrom').onchange = event => {
    reportRange = { from: event.target.value, to: reportRange.to, preset: 'custom' };
    document.querySelectorAll('.report-presets .chip').forEach(chip => chip.classList.remove('is-active'));
    renderReports();
};
$('reportTo').onchange = event => {
    reportRange = { from: reportRange.from, to: event.target.value, preset: 'custom' };
    document.querySelectorAll('.report-presets .chip').forEach(chip => chip.classList.remove('is-active'));
    renderReports();
};
document.querySelectorAll('.report-presets .chip').forEach(chip => {
    chip.onclick = () => setReportRange(chip.dataset.range);
});
setReportRange('quarter');
$('reportFilterCategory').onchange = () => {
    reportFiltersExtended.category = $('reportFilterCategory').value;
    renderReports();
};
$('reportFilterStatus').onchange = () => {
    reportFiltersExtended.status = $('reportFilterStatus').value;
    renderReports();
};
$('reportFilterRecurring').onchange = () => {
    reportFiltersExtended.recurring = $('reportFilterRecurring').checked;
    renderReports();
};
$('reportFilterAmountFrom').oninput = () => {
    reportFiltersExtended.amountFrom = parseMoneyInput($('reportFilterAmountFrom').value);
    renderReports();
};
$('reportFilterAmountTo').oninput = () => {
    reportFiltersExtended.amountTo = parseMoneyInput($('reportFilterAmountTo').value);
    renderReports();
};
$('reportFilterClear').onclick = () => {
    reportFiltersExtended = { category:'', status:'', recurring:false, amountFrom:'', amountTo:'' };
    $('reportFilterCategory').value = '';
    $('reportFilterStatus').value = '';
    $('reportFilterRecurring').checked = false;
    $('reportFilterAmountFrom').value = '';
    $('reportFilterAmountTo').value = '';
    renderReports();
};
const navCalculator = $('calculatorNav');
if (navCalculator) navCalculator.onclick = () => {
    showView('calculatorView');
    setActiveNav('calculatorNav');
    renderFinancialCalculator();
};
const navLabor = $('laborNav');
if (navLabor) navLabor.onclick = () => {
    showView('laborView');
    setActiveNav('laborNav');
    renderLaborSettlement();
};
const navImport = $('importNav'); if (navImport) navImport.onclick = () => openModal('importModal');
$('importTemplateBtn').onclick = () => {
    const header = ['Concepto', 'Categoria', 'Fecha', 'Estado', 'Importe', 'Recurrente'];
    const rows = [
        ['Ejemplo: Arriendo', 'Vivienda', '2026-09-01', 'Pagado', '900000', 'Sí'],
        ['Ejemplo: Mercado', 'Alimentos', '05/09/2026', 'Pendiente', '180.000', 'No'],
        ['Ejemplo: Internet', 'Servicios', '2026-09-10', 'No pagado', '79900', 'No']
    ];
    const csv = [header, ...rows].map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla-pagos.csv';
    link.click();
    URL.revokeObjectURL(link.href);
};
$('importPickBtn').onclick = () => $('importFile').click();
$('importFile').onchange = event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        importData(String(reader.result || '')).catch(() => showToast('No fue posible importar los datos.', 'error'));
        event.target.value = '';
        closeModals();
    };
    reader.onerror = () => {
        showToast('No fue posible leer el archivo.', 'error');
        event.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
};
$('monthFilter').onchange = () => {
    paymentFilters.page = 1;
    render();
};
document.querySelectorAll('.closeModal').forEach(button => button.onclick = closeModals);
$('filterDateFrom').onchange = () => {
    paymentFilters.from = $('filterDateFrom').value;
    paymentFilters.page = 1;
    render();
};
$('filterDateTo').onchange = () => {
    paymentFilters.to = $('filterDateTo').value;
    paymentFilters.page = 1;
    render();
};
$('filterCategory').onchange = () => {
    paymentFilters.category = $('filterCategory').value;
    paymentFilters.page = 1;
    render();
};
$('filterStatus').onchange = () => {
    paymentFilters.status = $('filterStatus').value;
    paymentFilters.page = 1;
    render();
};
const paymentSearchInput = $('paymentSearch');
if (paymentSearchInput) {
    paymentSearchInput.addEventListener('input', () => {
        paymentFilters.search = paymentSearchInput.value;
        paymentFilters.page = 1;
        render();
    });
}
// Acciones masivas
document.addEventListener('change', event => {
    const cb = event.target.closest('.row-select');
    if (cb) {
        if (cb.checked) selectedPayments.add(cb.dataset.selectId);
        else selectedPayments.delete(cb.dataset.selectId);
        updateBulkBar();
        return;
    }
    if (event.target.id === 'selectAllPayments') {
        document.querySelectorAll('.row-select').forEach(box => {
            if (box.checked !== event.target.checked) {
                box.checked = event.target.checked;
                if (event.target.checked) selectedPayments.add(box.dataset.selectId);
                else selectedPayments.delete(box.dataset.selectId);
            }
        });
        updateBulkBar();
    }
});
const bulkMarkPaid = $('bulkMarkPaid');
if (bulkMarkPaid) bulkMarkPaid.onclick = async () => {
    const ids = [...selectedPayments];
    ids.forEach(id => {
        const payment = payments.find(item => item.id === id);
        if (payment) payment.status = 'pagado';
    });
    localStorage.setItem('cartera_payments', JSON.stringify(payments));
    const collection = userCollection('payments');
    if (collection) {
        await Promise.all(ids
            .filter(id => !String(id).startsWith('local-'))
            .map(id => collection.doc(id).update({ status: 'pagado' }).catch(() => {})));
    }
    selectedPayments.clear();
    render();
    showToast('Pagos marcados como pagados.', 'success');
};
const bulkDelete = $('bulkDelete');
if (bulkDelete) bulkDelete.onclick = async () => {
    if (!confirm(`¿Eliminar ${selectedPayments.size} pago${selectedPayments.size === 1 ? '' : 's'} seleccionado${selectedPayments.size === 1 ? '' : 's'}?`)) return;
    const ids = [...selectedPayments];
    const deleted = payments.filter(payment => selectedPayments.has(payment.id));
    payments = payments.filter(payment => !selectedPayments.has(payment.id));
    localStorage.setItem('cartera_payments', JSON.stringify(payments));
    const collection = userCollection('payments');
    if (collection) {
        await Promise.all(ids
            .filter(id => !String(id).startsWith('local-'))
            .map(id => collection.doc(id).delete().catch(() => {})));
    }
    selectedPayments.clear();
    render();
    showToast(`${deleted.length} pago${deleted.length === 1 ? '' : 's'} eliminado${deleted.length === 1 ? '' : 's'}.`, 'success', { label: 'Deshacer', onClick: async () => {
        payments = payments.concat(deleted);
        localStorage.setItem('cartera_payments', JSON.stringify(payments));
        if (collection) {
            await Promise.all(deleted
                .filter(p => !String(p.id).startsWith('local-'))
                .map(p => collection.doc(p.id).set(p).catch(() => {})));
        }
        render();
        showToast('Pagos restaurados.', 'success');
    } });
};
const bulkClearSel = $('bulkClearSel');
if (bulkClearSel) bulkClearSel.onclick = () => {
    selectedPayments.clear();
    render();
};
function resetFilters() {
    paymentFilters = { from:'', to:'', category:'', status:'', page:1, pageSize: Number(localStorage.getItem('cartera_page_size') || 5) };
    $('filterDateFrom').value = '';
    $('filterDateTo').value = '';
    $('filterCategory').selectedIndex = 0;
    $('filterStatus').value = '';
    if ($('pageSizeSelect')) $('pageSizeSelect').value = String(paymentFilters.pageSize);
    render();
}
$('prevPage').onclick = () => {
    if (paymentFilters.page > 1) {
        paymentFilters.page -= 1;
        renderRecentPayments();
    }
};
$('nextPage').onclick = () => {
    const rows = getFilteredPayments();
    const pageSize = Number(paymentFilters.pageSize) || PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (paymentFilters.page < totalPages) {
        paymentFilters.page += 1;
        renderRecentPayments();
    }
};
if ($('pageSizeSelect')) {
    $('pageSizeSelect').onchange = () => {
        const value = Number($('pageSizeSelect').value) || 5;
        paymentFilters.pageSize = value;
        localStorage.setItem('cartera_page_size', String(value));
        paymentFilters.page = 1;
        renderRecentPayments();
    };
}
$('paymentForm').onsubmit = async e => {
    e.preventDefault();
    if (paymentSubmitLocked) return;
    paymentSubmitLocked = true;
    const submitBtn = e.target.querySelector('.btn-dark');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = editingPaymentId ? 'Guardando...' : 'Guardando...';
    }
    const collection = userCollection('payments');
    try {
        const data = Object.fromEntries(new FormData(e.target));
        const recurring = data.recurring === '1';
        delete data.recurring;
        const payment = {
            ...data,
            status: getPaymentStatus(data),
            amount: parseMoneyInput(data.amount),
            currency: data.currency || appCurrency,
            updatedAt: new Date().toISOString()
        };
        if (recurring) payment.recurring = true;
        if (selectedAttachmentFile) {
            const att = await uploadReceiptFile(selectedAttachmentFile, editingPaymentId || Date.now());
            if (att) payment.attachment = att;
        } else if (editingPaymentId) {
            const existing = payments.find(p => p.id === editingPaymentId);
            if (existing && existing._removeAttachment) {
                if (existing.attachment?.path && storage) storage.ref(existing.attachment.path).delete().catch(() => {});
                delete payment.attachment;
            } else if (existing && existing.attachment) {
                payment.attachment = existing.attachment;
            }
        }
        if (editingPaymentId) {
            const idx = payments.findIndex(p => p.id === editingPaymentId);
            const originalName = idx >= 0 ? payments[idx].name : null;
            const originalCategory = idx >= 0 ? payments[idx].category : null;
            if (idx >= 0) {
                payments[idx] = { ...payments[idx], name: payment.name, amount: payment.amount, category: payment.category, date: payment.date, status: payment.status, recurring: payment.recurring };
            }
            if (data.editSeries === '1' && originalName !== null) {
                payments.forEach(p => {
                    if (p.id !== editingPaymentId && p.recurring && p.name === originalName && p.category === originalCategory) {
                        p.name = payment.name;
                        p.category = payment.category;
                        p.amount = payment.amount;
                        p.recurring = payment.recurring;
                    }
                });
            }
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
            if (collection && !String(editingPaymentId).startsWith('local-')) {
                await collection.doc(editingPaymentId).set(payments[idx]).catch(() => {});
                if (data.editSeries === '1') {
                    const clones = payments.filter(p => p.id !== editingPaymentId && p.recurring && p.name === payment.name && p.category === payment.category);
                    await Promise.all(clones.filter(p => !String(p.id).startsWith('local-')).map(p => collection.doc(p.id).set(p).catch(() => {})));
                }
            }
            const editSeriesField = $('editSeriesField');
            if (editSeriesField) editSeriesField.style.display = 'none';
            editingPaymentId = null;
            populateMonths();
            paymentFilters.page = 1;
            render();
            closeModals();
            syncRecurringPayments();
            showToast('Pago actualizado.', 'success');
            return;
        }
        payments = dedupePayments(payments);
        const duplicate = isExistingPaymentRecord({
            name: payment.name,
            category: payment.category,
            amount: payment.amount,
            date: payment.date
        }, payments);
        if (duplicate) {
            showToast('Ya existe un pago igual para esa fecha y concepto.', 'info');
            return;
        }
        if (!collection) {
            payments.push({ ...payment, id: `local-${Date.now()}` });
            payments = dedupePayments(payments);
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
        } else {
            const ref = await collection.add(payment);
            payments.push({ ...payment, id: ref.id });
            payments = dedupePayments(payments);
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
        }
        populateMonths();
        $('monthFilter').value = payment.date.slice(0,7);
        paymentFilters.page = 1;
        render();
        closeModals();
        syncRecurringPayments();
    } catch (error) {
        showToast('No fue posible guardar el pago.', 'error');
    } finally {
        paymentSubmitLocked = false;
        const form = $('paymentForm');
        const activeBtn = form ? form.querySelector('.btn-dark') : null;
        if (activeBtn) {
            const editing = !!editingPaymentId;
            activeBtn.disabled = false;
            activeBtn.textContent = editing ? 'Guardar cambios' : 'Guardar pago';
        }
    }
};
let editingCategoryId = null;
function renderColorPalette() {
    const paletteEl = $('colorPalette');
    const colorInput = $('categoryForm') ? $('categoryForm').elements.color : null;
    if (!paletteEl || !colorInput) return;
    const selected = normalizeColor(colorInput.value);
    paletteEl.innerHTML = CATEGORY_PALETTE.map(color => {
        const owner = categoryColorOwner(color.value, editingCategoryId);
        const isSelected = normalizeColor(color.value) === selected;
        const taken = !!owner && !isSelected;
        const title = owner ? `${color.name} · en uso por ${owner.name}` : color.name;
        return `<button type="button" class="color-swatch${isSelected ? ' is-selected' : ''}${taken ? ' is-taken' : ''}" style="--swatch:${color.value}" data-color="${color.value}" role="radio" aria-checked="${isSelected}" aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">${taken ? '<span class="swatch-check">✓</span>' : ''}</button>`;
    }).join('');
    const currentColor = CATEGORY_PALETTE.find(color => normalizeColor(color.value) === selected);
    const pickLabel = $('colorFieldPick');
    if (pickLabel) pickLabel.textContent = currentColor ? `${currentColor.name} · ${selected}` : (selected || '—');
    const paletteHint = $('colorPaletteHint');
    if (paletteHint && !paletteHint.classList.contains('is-error')) paletteHint.textContent = 'Cada categoría debe tener un color distinto.';
}
function setCategoryColor(color) {
    const colorInput = $('categoryForm').elements.color;
    colorInput.value = normalizeColor(color);
    const paletteHint = $('colorPaletteHint');
    paletteHint.classList.remove('is-error');
    renderColorPalette();
}
function resetColorPaletteHint() {
    const paletteHint = $('colorPaletteHint');
    if (!paletteHint) return;
    paletteHint.textContent = '';
    paletteHint.classList.remove('is-error');
}
$('colorPalette').onclick = event => {
    const swatch = event.target.closest('[data-color]');
    if (!swatch) return;
    const color = swatch.dataset.color;
    const owner = categoryColorOwner(color, editingCategoryId);
    const paletteHint = $('colorPaletteHint');
    if (owner) {
        paletteHint.textContent = `Ese color ya lo usa "${owner.name}". Selecciona otro color.`;
        paletteHint.classList.add('is-error');
        swatch.classList.remove('is-shake');
        void swatch.offsetWidth;
        swatch.classList.add('is-shake');
        return;
    }
    setCategoryColor(color);
};
function freeFormColor() {
    const used = new Set(categories.map(category => normalizeColor(category.color)));
    return normalizeColor(freeCategoryColor(used));
}
function resetCategoryForm() {
    editingCategoryId = null;
    $('categoryForm').reset();
    if ($('categoryFormMonthBudget')) $('categoryFormMonthBudget').value = '';
    $('categoryForm').elements.color.value = freeFormColor();
    $('categoryFormTitle').textContent = 'Nueva categoría';
    $('saveCategoryBtn').textContent = 'Crear categoría';
    $('cancelCategoryBtn').hidden = true;
    $('categoryFormHint').textContent = '';
    resetColorPaletteHint();
    renderColorPalette();
}
function startCategoryEdit(id) {
    const category = categories.find(item => item.id === id);
    if (!category) return;
    editingCategoryId = id;
    $('categoryForm').elements.name.value = category.name;
    $('categoryForm').elements.color.value = category.color;
    $('categoryForm').elements.budget.value = category.budget ? formatMoneyInput(category.budget) : '';
    const mBudget = (category.monthlyBudgets && category.monthlyBudgets[selectedBudgetMonth]);
    if ($('categoryFormMonthBudget')) $('categoryFormMonthBudget').value = mBudget ? formatMoneyInput(mBudget) : '';
    $('categoryFormTitle').textContent = 'Editar categoría';
    $('saveCategoryBtn').textContent = 'Guardar cambios';
    $('cancelCategoryBtn').hidden = false;
    $('categoryFormHint').textContent = '';
    $('categoryForm').elements.name.focus();
    $('categoryForm').elements.name.select();
    resetColorPaletteHint();
    renderColorPalette();
}
async function renamePaymentsCategory(oldName, newName) {
    const affected = payments.filter(payment => payment.category === oldName);
    if (!affected.length) return;
    affected.forEach(payment => { payment.category = newName; });
    localStorage.setItem('cartera_payments', JSON.stringify(payments));
    const collection = userCollection('payments');
    if (!collection) return;
    await Promise.all(affected
        .filter(payment => !String(payment.id).startsWith('local-'))
        .map(payment => collection.doc(payment.id).update({ category: newName })));
}
$('categoryForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const name = String(data.name || '').trim();
    const hint = $('categoryFormHint');
    if (!name) {
        hint.textContent = 'Escribe un nombre para la categoría.';
        return;
    }
    const duplicated = categories.some(category => category.id !== editingCategoryId && category.name.toLowerCase() === name.toLowerCase());
    if (duplicated) {
        hint.textContent = 'Ya existe una categoría con ese nombre.';
        return;
    }
    const color = normalizeColor(data.color) || '#ff856c';
    const colorOwner = categoryColorOwner(color, editingCategoryId);
    if (colorOwner) {
        hint.textContent = `El color seleccionado ya lo usa "${colorOwner.name}". Elige otro color de la paleta.`;
        renderColorPalette();
        return;
    }
    const budget = Math.max(0, parseMoneyInput(data.budget));
    const monthBudgetValue = $('categoryFormMonthBudget') ? parseMoneyInput($('categoryFormMonthBudget').value) : 0;
    const existingCat = editingCategoryId ? categories.find(c => c.id === editingCategoryId) : null;
    const monthlyBudgets = { ...(existingCat?.monthlyBudgets || {}) };
    if (monthBudgetValue > 0) {
        monthlyBudgets[selectedBudgetMonth] = monthBudgetValue;
    } else if (existingCat && monthlyBudgets[selectedBudgetMonth] !== undefined) {
        delete monthlyBudgets[selectedBudgetMonth];
    }
    const collection = userCollection('categories');
    const payload = { name, color, budget, monthlyBudgets, updatedAt: new Date().toISOString() };
    try {
        if (editingCategoryId) {
            const category = categories.find(item => item.id === editingCategoryId);
            if (!category) {
                resetCategoryForm();
                return;
            }
            const previousName = category.name;
            if (collection && !String(category.id).startsWith('local-')) await collection.doc(category.id).update(payload);
            Object.assign(category, payload);
            if (previousName !== name) await renamePaymentsCategory(previousName, name);
            persistCategories();
        } else if (!collection) {
            categories.push({ ...payload, id: `local-${Date.now()}` });
            persistCategories();
        } else {
            const ref = await collection.add(payload);
            categories.push({ ...payload, id: ref.id });
            persistCategories();
        }
        resetCategoryForm();
        render();
    } catch (error) {
        hint.textContent = 'No fue posible guardar la categoría.';
    }
};
$('categoryList').onclick = async e => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.categoryId;
    const category = categories.find(item => item.id === id);
    if (button.dataset.action === 'edit') {
        startCategoryEdit(id);
        return;
    }
    if (button.dataset.action !== 'delete') return;
    const count = category ? payments.filter(payment => payment.category === category.name).length : 0;
    const message = `¿Eliminar la categoría "${category ? category.name : ''}"?${count ? ` Tiene ${count} pago${count === 1 ? '' : 's'} asociado${count === 1 ? '' : 's'} que conservarán su nombre.` : ''}`;
    if (!confirm(message)) return;
    const collection = userCollection('categories');
    try {
        if (collection && !String(id).startsWith('local-')) await collection.doc(id).delete();
        categories = categories.filter(item => item.id !== id);
        persistCategories();
        if (editingCategoryId === id) resetCategoryForm();
        render();
    } catch (error) {
        showToast('No fue posible eliminar la categoría.', 'error');
    }
};
$('newCategoryBtn').onclick = () => {
    resetCategoryForm();
    $('categoryForm').elements.name.focus();
};
$('cancelCategoryBtn').onclick = resetCategoryForm;

/* ---------- Notificaciones de pagos pendientes/vencidos ---------- */
let notifFilter = 'atencion';
let notifShowSeen = false;
const notifSeenKey = 'cartera_notif_seen';
function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function daysUntilDate(dateKey) {
    const today = new Date(`${todayKey()}T12:00:00`);
    const due = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(due.getTime())) return null;
    return Math.round((due.getTime() - today.getTime()) / 86400000);
}
function paymentAlert(payment) {
    const status = getPaymentStatus(payment);
    const due = String(payment.date || '').slice(0, 10);
    const diff = due ? daysUntilDate(due) : null;
    let kind = 'pagado';
    if (status !== 'pagado') kind = diff !== null && diff < 0 ? 'vencido' : 'pendiente';
    const labels = { vencido:'Vencido', pendiente:'Pendiente', pagado:'Pagado' };
    let dueLabel = 'Sin fecha registrada';
    if (diff !== null) {
        const formatted = new Date(`${due}T12:00:00`).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
        if (kind === 'vencido') dueLabel = `Venció ${formatted}${diff < 0 ? ` · hace ${Math.abs(diff)} día${Math.abs(diff) === 1 ? '' : 's'}` : ''}`;
        else if (kind === 'pendiente') dueLabel = diff === 0 ? `Vence hoy · ${formatted}` : `Vence ${formatted} · en ${diff} día${diff === 1 ? '' : 's'}`;
        else dueLabel = `Pagado ${formatted}`;
    }
    return { kind, status, due, diff, dueLabel, label:labels[kind] };
}
function alertSignature(payment, alert) {
    return `${alert.kind}|${getPaymentStatus(payment)}|${Math.round(Number(payment.amount) || 0)}|${payment.date || ''}|${payment.name || ''}`;
}
function readSeenAlerts() {
    try { return JSON.parse(localStorage.getItem(notifSeenKey) || '{}') || {}; }
    catch (error) { return {}; }
}
function getAlertEntries() {
    const seen = readSeenAlerts();
    const order = { vencido:0, pendiente:1, pagado:2 };
    return payments.map(payment => {
        const alert = paymentAlert(payment);
        const signature = alertSignature(payment, alert);
        return { payment, alert, signature, unread:seen[payment.id] !== signature };
    }).sort((a, b) => {
        if (order[a.alert.kind] !== order[b.alert.kind]) return order[a.alert.kind] - order[b.alert.kind];
        if (a.alert.kind === 'pagado') return String(b.payment.date || '').localeCompare(String(a.payment.date || ''));
        return String(a.payment.date || '').localeCompare(String(b.payment.date || ''));
    });
}
function markAlertSeen(paymentId) {
    const payment = payments.find(item => item.id === paymentId);
    if (!payment) return;
    const seen = readSeenAlerts();
    seen[payment.id] = alertSignature(payment, paymentAlert(payment));
    localStorage.setItem(notifSeenKey, JSON.stringify(seen));
}
function markAlertsSeen() {
    const entries = getAlertEntries();
    const seen = readSeenAlerts();
    let changed = false;
    entries.forEach(entry => {
        if (entry.alert.kind === 'pagado') return;
        if (seen[entry.payment.id] !== entry.signature) { seen[entry.payment.id] = entry.signature; changed = true; }
    });
    if (changed) localStorage.setItem(notifSeenKey, JSON.stringify(seen));
}
function renderNotifications() {
    const badge = $('notifBadge');
    if (!badge) return;
    const entries = getAlertEntries();
    const counts = { vencido:0, pendiente:0, pagado:0 };
    entries.forEach(entry => { counts[entry.alert.kind] += 1; });
    const attention = entries.filter(entry => entry.alert.kind !== 'pagado');
    const unseen = attention.filter(entry => entry.unread);

    badge.textContent = unseen.length > 99 ? '99+' : String(unseen.length);
    badge.classList.toggle('hidden', unseen.length === 0);
    $('notifBell').classList.toggle('has-alert', unseen.some(entry => entry.alert.kind === 'vencido'));
    $('notifCountAtencion').textContent = String(unseen.length);
    $('notifCountPendientes').textContent = String(attention.length);
    $('notifCountPagados').textContent = String(counts.pagado);
    document.querySelectorAll('#notifFilters .notif-chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.notifFilter === notifFilter));

    const visible = notifFilter === 'pagados'
        ? entries.filter(entry => entry.alert.kind === 'pagado')
        : notifFilter === 'sinpagar'
            ? attention
            : (notifShowSeen ? attention : unseen);

    const previousUnseen = window.__unseenCount;
    window.__unseenCount = unseen.length;
    if (previousUnseen !== undefined && unseen.length > previousUnseen && navigator.vibrate) {
        navigator.vibrate([120, 60, 120]);
    }

    const itemHtml = entry => {
        const { payment, alert, unread } = entry;
        const color = categoryColor(payment.category);
        const seenClass = unread ? ' is-unread' : (alert.kind !== 'pagado' ? ' is-seen' : '');
        return `<article class="notif-item is-${alert.kind}${seenClass}">
            <div class="notif-item-top">
                <span class="notif-state state-${alert.kind}">${alert.label}</span>
                ${unread ? '<span class="notif-new">Nuevo</span>' : '<span class="notif-new" style="color:var(--muted)">Visto</span>'}
            </div>
            <div>
                <h4>${escapeHtml(payment.name)}</h4>
                <span class="notif-cat"><i class="dot" style="background:${escapeHtml(color)}"></i>${escapeHtml(payment.category || 'Sin categoría')}</span>
            </div>
            <div class="notif-meta">
                <span class="notif-amount">${money(Number(payment.amount) || 0)}</span>
                <span class="notif-due">${alert.dueLabel}</span>
            </div>
            <div class="notif-item-actions">
                ${alert.kind !== 'pagado' ? `<button type="button" class="notif-pay" data-notif-pay="${escapeHtml(payment.id)}">Marcar pagado</button>` : ''}
                <button type="button" data-notif-go="${escapeHtml(payment.id)}">Ver pago</button>
            </div>
        </article>`;
    };

    let html = '';
    if (visible.length) {
        html = visible.map(itemHtml).join('');
    } else if (notifFilter === 'pagados') {
        html = '<p class="notif-empty">Todavía no hay pagos marcados como pagados.</p>';
    } else if (notifFilter === 'sinpagar') {
        html = '<p class="notif-empty">No tienes pagos sin pagar: todo está al día.</p>';
    } else if (attention.length) {
        html = `<p class="notif-empty">Todo revisado: no tienes notificaciones nuevas.<span class="notif-empty-note">Sigues con ${attention.length} pago${attention.length === 1 ? '' : 's'} sin pagar: revísalos en “Sin pagar”.</span></p>`;
    } else {
        html = '<p class="notif-empty">Todo en orden: no tienes pagos pendientes ni vencidos.</p>';
    }
    if (notifFilter === 'atencion' && attention.length) {
        html += notifShowSeen
            ? '<button type="button" class="notif-toggle-seen" data-notif-seen="hide">▲ Ocultar notificaciones vistas</button>'
            : `<button type="button" class="notif-toggle-seen" data-notif-seen="show">▼ Ver notificaciones vistas (${attention.length})</button>`;
    }
    $('notifList').innerHTML = html;

    const markAllButton = $('notifMarkAll');
    markAllButton.disabled = unseen.length === 0;
    markAllButton.textContent = unseen.length ? `✓ Marcar todo como visto (${unseen.length})` : '✓ Todo visto';
}
function openNotifPanel() {
    $('notifPanel').classList.remove('hidden');
    $('notifBell').setAttribute('aria-expanded', 'true');
    renderNotifications();
}
function closeNotifPanel() {
    const panel = $('notifPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    panel.classList.add('hidden');
    $('notifBell').setAttribute('aria-expanded', 'false');
}
function toggleNotifPanel() {
    if ($('notifPanel').classList.contains('hidden')) openNotifPanel(); else closeNotifPanel();
}
function goToPayment(id) {
    const payment = payments.find(item => item.id === id);
    markAlertSeen(id);
    closeNotifPanel();
    if (!payment) return;
    paymentFilters.from = ''; paymentFilters.to = ''; paymentFilters.category = ''; paymentFilters.status = '';
    paymentFilters.page = 1; paymentFilters.focusId = id;
    const values = { filterFrom:'', filterTo:'', filterCategory:'', filterStatus:'' };
    Object.entries(values).forEach(([elementId, value]) => { if ($(elementId)) $(elementId).value = value; });
    showView('summaryView');
    setActiveNav('summaryNav');
    render();
    requestAnimationFrame(() => {
        const row = [...document.querySelectorAll('tr[data-row-id]')].find(element => element.dataset.rowId === id);
        if (!row) return;
        row.classList.add('row-flash');
        row.scrollIntoView({ behavior:'smooth', block:'center' });
        setTimeout(() => row.classList.remove('row-flash'), 2200);
    });
}
$('notifBell').onclick = toggleNotifPanel;
$('notifClose').onclick = closeNotifPanel;
$('notifMarkAll').onclick = () => {
    markAlertsSeen();
    notifShowSeen = false;
    renderNotifications();
};
$('notifFilters').onclick = event => {
    const chip = event.target.closest('[data-notif-filter]');
    if (!chip) return;
    notifFilter = chip.dataset.notifFilter;
    renderNotifications();
};
$('notifSeeAll').onclick = () => {
    closeNotifPanel();
    paymentFilters.from = ''; paymentFilters.to = ''; paymentFilters.category = ''; paymentFilters.status = '';
    paymentFilters.page = 1; paymentFilters.focusId = null;
    Object.keys({ filterFrom:1, filterTo:1, filterCategory:1, filterStatus:1 }).forEach(id => { if ($(id)) $(id).value = ''; });
    showView('summaryView');
    setActiveNav('summaryNav');
    render();
};
$('notifList').onclick = async event => {
    const seenToggle = event.target.closest('[data-notif-seen]');
    if (seenToggle) {
        notifShowSeen = seenToggle.dataset.notifSeen === 'show';
        renderNotifications();
        return;
    }
    const payButton = event.target.closest('[data-notif-pay]');
    if (payButton) {
        const payment = payments.find(item => item.id === payButton.dataset.notifPay);
        if (!payment) return;
        payButton.disabled = true;
        const updated = await changePaymentStatus(payment, 'pagado');
        if (!updated) { payButton.disabled = false; showToast('No fue posible actualizar el pago.', 'error'); }
        return;
    }
    const goButton = event.target.closest('[data-notif-go]');
    if (goButton) goToPayment(goButton.dataset.notifGo);
};
document.addEventListener('click', event => {
    if (event.target.closest('#notifWidget')) return;
    closeNotifPanel();
});
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('simTour').classList.contains('hidden')) { simTourEnd(true); return; }
    closeNotifPanel();
});
setInterval(renderNotifications, 60000);
window.addEventListener('focus', renderNotifications);

async function changePaymentStatus(payment, nextStatus) {
    const previousStatus = getPaymentStatus(payment);
    if (previousStatus === nextStatus) return true;
    const collection = userCollection('payments');
    try {
        if (collection && !String(payment.id).startsWith('local-')) await collection.doc(payment.id).update({ status:nextStatus });
        payment.status = nextStatus;
        localStorage.setItem('cartera_payments', JSON.stringify(payments));
        render();
        return true;
    } catch (error) {
        payment.status = previousStatus;
        return false;
    }
}

/* ---------- Guía paso a paso del simulador ---------- */
const simTourKey = 'cartera_simulator_tour';
const simTourSteps = [
    {
        target:'#simulatorNav',
        title:'1. Inicia el simulador',
        text:'Entra a la sección Simulador desde el menú de la izquierda. Ahí verás tu situación financiera del mes calculada con tus pagos reales.',
        tip:'Puedes volver a ver esta guía en cualquier momento con el botón “¿Cómo usarlo?”.'
    },
    {
        target:'#simulatorIncome',
        title:'2. Ingresa tus datos',
        text:'Solo necesitas tu ingreso mensual. El gasto real del mes, tus categorías y las semanas restantes se calculan solos a partir de tus pagos registrados.',
        tip:'Escribe el valor sin importar los puntos o espacios: el campo lo formatea por ti.'
    },
    {
        target:'#simulateBtn',
        title:'3. Ejecuta la simulación',
        text:'Pulsa “Recalcular plan” para obtener tu plan. También se recalcula automáticamente mientras escribes o cuando cambia el estado de tus pagos.',
        tip:'Usa “Actualizar” si acabas de registrar pagos nuevos y quieres refrescar todo.'
    },
    {
        target:'#simulatorReport',
        title:'4. Interpreta los resultados',
        text:'“Puedes gastar esta semana” es tu límite; “Gasto real de la semana” es lo que ya llevas; “Margen” es la diferencia; “Disponible del mes” es lo que queda de tu ingreso.',
        tip:'Los verdes significan que vas bien; en rojo significa que te saliste del plan. La recomendación te lo dice de una.'
    },
    {
        target:'.simulator-breakdown',
        title:'5. Decide tus siguientes pasos',
        text:'Revisa en qué se va tu gasto: gastos recurrentes vs variables y el desglose por categoría con su porcentaje. Ajusta lo que haga falta y vuelve a simular.',
        tip:'¿Tienes una meta? Usa el enlace “Crea tu plan de ahorro” para llevar ese objetivo a la sección Ahorro.'
    }
];
let simTourIndex = 0;
const savingsTourKey = 'cartera_savings_tour';
const savingsTourSteps = [
    {
        target:'#savingsNav',
        title:'1. Abre la sección Ahorro',
        text:'Desde el menú lateral entra a Ahorro. Ahí encontrarás un asistente de 4 pasos que te lleva desde tu meta hasta la proyección completa de tu ahorro.',
        tip:'Puedes volver a ver esta guía en cualquier momento con el botón “¿Cómo usarlo?”.'
    },
    {
        target:'#savingsStepper',
        title:'2. Sigue el stepper de 4 pasos',
        text:'Meta → Ahorro actual → Aporte → Tu plan. Cada paso se desbloquea cuando completas el anterior y puedes volver a cualquiera que ya esté completo.',
        tip:'El contador de la parte superior te indica siempre en qué paso vas.'
    },
    {
        target:'#savingsName',
        title:'3. Completa tus datos',
        text:'Paso 1: nombre y monto de la meta. Paso 2: cuánto ya tienes ahorrado. Paso 3: si aportas una cantidad al mes o si quieres llegar en una fecha.',
        tip:'El plan se recalcula mientras escribes y todo queda guardado en tu navegador, así que puedes salir y volver después.'
    },
    {
        target:'.wizard-actions',
        title:'4. Avanza con “Continuar”',
        text:'El botón “Continuar →” valida el paso actual y te avisa si falta algún dato; con “← Anterior” corriges lo que necesites.',
        tip:'No hay botón de guardar: al recargar la página tu plan sigue ahí.'
    },
    {
        target:'.savings-report',
        title:'5. Revisa tu proyección',
        text:'A la derecha ves el resumen en vivo: cuánto falta, tu avance y el tiempo estimado. Al terminar el paso 4 verás tu plan completo con los próximos aportes.',
        tip:'Desde el resultado puedes volver a editar tus datos o empezar de nuevo cuando cambie tu meta.'
    }
];
let activeTourSteps = simTourSteps;
let activeTourKey = simTourKey;
function startTour(steps, key) {
    activeTourSteps = steps;
    activeTourKey = key;
    simTourIndex = 0;
    $('simTour').classList.remove('hidden');
    simTourRender();
}
function simTourStart() {
    startTour(simTourSteps, simTourKey);
}
function savingsTourStart() {
    startTour(savingsTourSteps, savingsTourKey);
}
function simTourEnd(markDone) {
    $('simTour').classList.add('hidden');
    $('tourSpotlight').classList.add('hidden');
    if (markDone) localStorage.setItem(activeTourKey, 'done');
}
function simTourRender() {
    const step = activeTourSteps[simTourIndex];
    const isLast = simTourIndex === activeTourSteps.length - 1;
    $('tourStepLabel').textContent = `Paso ${simTourIndex + 1} de ${simTourSteps.length}`;
    $('tourIcon').textContent = String(simTourIndex + 1);
    $('tourTitle').textContent = step.title;
    $('tourText').textContent = step.text;
    $('tourTip').textContent = step.tip || '';
    $('tourDots').innerHTML = activeTourSteps.map((_, index) => `<i class="${index === simTourIndex ? 'is-active' : ''}"></i>`).join('');
    $('tourPrev').disabled = simTourIndex === 0;
    $('tourNext').textContent = isLast ? 'Entendido ✓' : 'Siguiente →';
    requestAnimationFrame(simTourPosition);
}
function simTourPosition() {
    if ($('simTour').classList.contains('hidden')) return;
    const step = activeTourSteps[simTourIndex];
    const card = $('tourCard');
    const spotlight = $('tourSpotlight');
    const target = document.querySelector(step.target);
    // En móvil la tarjeta es una hoja inferior anclada por CSS: no se posiciona con valores en línea.
    const floating = window.innerWidth >= 600;
    if (!floating) {
        card.style.removeProperty('left');
        card.style.removeProperty('top');
        card.style.removeProperty('width');
    }
    const rect = target ? target.getBoundingClientRect() : null;
    const visible = rect && rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight - 10 && rect.bottom > 10;
    if (!visible) {
        spotlight.classList.add('hidden');
        if (floating) {
            const cardWidth = Math.min(364, window.innerWidth - 28);
            card.style.width = `${cardWidth}px`;
            card.style.left = `${Math.max(14, (window.innerWidth - cardWidth) / 2)}px`;
            card.style.top = `${Math.max(14, (window.innerHeight - card.offsetHeight) / 2)}px`;
        }
        return;
    }
    spotlight.classList.remove('hidden');
    spotlight.style.top = `${rect.top - 7}px`;
    spotlight.style.left = `${rect.left - 7}px`;
    spotlight.style.width = `${rect.width + 14}px`;
    spotlight.style.height = `${rect.height + 14}px`;
    if (!floating) return;
    const cardWidth = Math.min(364, window.innerWidth - 28);
    card.style.width = `${cardWidth}px`;
    const cardHeight = card.offsetHeight;
    let top = rect.bottom + 16;
    if (top + cardHeight > window.innerHeight - 12) top = rect.top - cardHeight - 16;
    if (top < 12) top = Math.max(12, window.innerHeight - cardHeight - 12);
    let left = rect.left + rect.width / 2 - cardWidth / 2;
    left = Math.max(14, Math.min(left, window.innerWidth - cardWidth - 14));
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
}
$('simTourBtn').onclick = simTourStart;
$('savingsTourBtn').onclick = savingsTourStart;
$('tourNext').onclick = () => {
    if (simTourIndex >= activeTourSteps.length - 1) { simTourEnd(true); return; }
    simTourIndex += 1;
    simTourRender();
};
$('tourPrev').onclick = () => {
    if (simTourIndex === 0) return;
    simTourIndex -= 1;
    simTourRender();
};
$('tourSkip').onclick = () => simTourEnd(true);
window.addEventListener('resize', () => { if (!$('simTour').classList.contains('hidden')) simTourPosition(); });
window.addEventListener('scroll', () => { if (!$('simTour').classList.contains('hidden')) simTourPosition(); }, true);

$('payments').onclick = async e => {
    const editId = e.target.dataset.editPayment;
    if (editId) {
        const payment = payments.find(item => item.id === editId);
        if (!payment) return;
        editingPaymentId = editId;
        setPaymentFormCategoryOptions();
        const form = $('paymentForm');
        if (form) {
            form.elements.name.value = payment.name || '';
            form.elements.amount.value = formatMoneyInput(String(payment.amount || ''));
            form.elements.category.value = payment.category || '';
            form.elements.date.value = payment.date || '';
            form.elements.status.value = getPaymentStatus(payment);
            if (form.elements.currency) form.elements.currency.value = payment.currency || appCurrency;
            delete payment._removeAttachment;
            selectedAttachmentFile = null;
            const attPreview = $('paymentAttachmentPreview');
            const attInfo = $('paymentAttachmentInfo');
            if (payment.attachment && attPreview && attInfo) {
                attPreview.classList.remove('hidden');
                attInfo.textContent = `${payment.attachment.name} (${Math.round((payment.attachment.size || 0)/1024)} KB)`;
            } else if (attPreview) {
                attPreview.classList.add('hidden');
            }
            const recurring = form.elements.recurring;
            if (recurring) recurring.checked = !!payment.recurring;
            const title = form.closest('.modal').querySelector('h2');
            if (title) title.textContent = 'Editar pago';
            const btn = form.querySelector('.btn-dark');
            if (btn) btn.textContent = 'Guardar cambios';
            const editSeriesField = $('editSeriesField');
            if (editSeriesField) editSeriesField.style.display = payment.recurring ? '' : 'none';
        }
        openModal('paymentModal');
        return;
    }
    const id = e.target.dataset.delete;
    if (id) {
        const payment = payments.find(item => item.id === id);
        const collection = userCollection('payments');
        try {
            if (collection) await collection.doc(id).delete();
            payments = payments.filter(item => item.id !== id);
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
            populateMonths();
            paymentFilters.page = 1;
            render();
            showToast('Pago eliminado.', 'success', payment ? { label: 'Deshacer', onClick: async () => {
                payments.push(payment);
                localStorage.setItem('cartera_payments', JSON.stringify(payments));
                if (collection && !String(payment.id).startsWith('local-')) {
                    await collection.doc(payment.id).set(payment).catch(() => {});
                }
                populateMonths();
                render();
                showToast('Pago restaurado.', 'success');
            } } : null);
        } catch (error) {
            showToast('No fue posible eliminar el pago.', 'error');
        }
    }
};
$('payments').onchange = async e => {
    const statusSelect = e.target.closest('[data-status-id]');
    if (!statusSelect) return;
    const payment = payments.find(item => item.id === statusSelect.dataset.statusId);
    if (!payment) return;
    const previousStatus = getPaymentStatus(payment);
    const nextStatus = PAYMENT_STATUSES.includes(statusSelect.value) ? statusSelect.value : 'pagado';
    const updated = await changePaymentStatus(payment, nextStatus);
    if (!updated) {
        statusSelect.value = previousStatus;
        showToast('No fue posible actualizar el estado del pago.', 'error');
    }
};
$('incomes').onclick = async e => {
    const editId = e.target.dataset.editIncome;
    if (editId) {
        const income = incomes.find(item => item.id === editId);
        if (!income) return;
        editingIncomeId = editId;
        setIncomeFormCategoryOptions();
        const form = $('incomeForm');
        if (form) {
            form.elements.name.value = income.name || '';
            form.elements.amount.value = formatMoneyInput(String(income.amount || ''));
            form.elements.category.value = income.category || '';
            form.elements.date.value = income.date || '';
            form.elements.recurring.checked = !!income.recurring;
            const title = form.closest('.modal').querySelector('h2');
            if (title) title.textContent = 'Editar ingreso';
            const btn = form.querySelector('.btn-dark');
            if (btn) btn.textContent = 'Guardar cambios';
        }
        openModal('incomeModal');
        return;
    }
    const id = e.target.dataset.deleteIncome;
    if (!id) return;
    const income = incomes.find(item => item.id === id);
    incomes = incomes.filter(item => item.id !== id);
    localStorage.setItem('cartera_incomes', JSON.stringify(incomes));
    const collection = userCollection('incomes');
    if (collection && income && !String(income.id).startsWith('local-')) {
        await collection.doc(income.id).delete().catch(() => {});
    }
    renderIncomes();
    showToast('Ingreso eliminado.', 'success', income ? { label: 'Deshacer', onClick: async () => {
        incomes.push(income);
        localStorage.setItem('cartera_incomes', JSON.stringify(incomes));
        if (collection && !String(income.id).startsWith('local-')) await collection.doc(income.id).set(income).catch(() => {});
        renderIncomes();
        showToast('Ingreso restaurado.', 'success');
    } } : null);
};

const incomeForm = $('incomeForm');
if (incomeForm) {
    incomeForm.addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(incomeForm));
        const income = {
            id: `local-${Date.now()}`,
            name: String(data.name || '').trim(),
            amount: parseMoneyInput(data.amount),
            currency: data.currency || appCurrency,
            category: data.category || (categories[0] ? categories[0].name : 'Sin categoría'),
            date: data.date || new Date().toISOString().slice(0, 10),
            recurring: data.recurring === '1',
            updatedAt: new Date().toISOString()
        };
        if (editingIncomeId) {
            const idx = incomes.findIndex(i => i.id === editingIncomeId);
            if (idx >= 0) {
                incomes[idx] = { ...incomes[idx], name: income.name, amount: income.amount, category: income.category, date: income.date, recurring: income.recurring };
                income.id = incomes[idx].id;
            }
            localStorage.setItem('cartera_incomes', JSON.stringify(incomes));
            const collection = userCollection('incomes');
            if (collection && !String(editingIncomeId).startsWith('local-')) {
                await collection.doc(editingIncomeId).set(incomes[idx]).catch(() => {});
            }
            editingIncomeId = null;
            closeModals();
            renderIncomes();
            showToast('Ingreso actualizado.', 'success');
            return;
        }
        incomes.push(income);
        localStorage.setItem('cartera_incomes', JSON.stringify(incomes));
        const collection = userCollection('incomes');
        if (collection) {
            try {
                await collection.doc(income.id).set(income);
            } catch (err) { /* keep local */ }
        }
        closeModals();
        renderIncomes();
        showToast('Ingreso registrado.', 'success');
    });
}

$('clearBtn').onclick = async () => {
    if (payments.length && confirm('¿Eliminar todos los pagos?')) {
        const collection = userCollection('payments');
        try {
            if (collection) await Promise.all(payments.map(payment => collection.doc(payment.id).delete()));
            payments = [];
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
            populateMonths();
            paymentFilters.page = 1;
            render();
        } catch (error) {
            showToast('No fue posible eliminar todos los pagos.', 'error');
        }
    }
};
$('themeBtn').onclick = () => setTheme(!document.body.classList.contains('dark'));
$('savingsNextBtn').onclick = () => {
    const error = validateSavingsStep(savingsStep);
    if (error) {
        $('savingsStepHint').textContent = error;
        return;
    }
    goToSavingsStep(savingsStep + 1);
};
$('savingsPrevBtn').onclick = () => goToSavingsStep(savingsStep - 1);
$('savingsEditBtn').onclick = () => goToSavingsStep(1);
$('savingsResetBtn').onclick = () => {
    if (!confirm('¿Borrar el plan de ahorro y empezar de nuevo?')) return;
    $('savingsName').value = '';
    $('savingsGoal').value = '';
    $('savingsCurrent').value = '';
    $('savingsMonthly').value = '';
    $('savingsTargetDate').value = '';
    document.querySelector('input[name="savingsMode"][value="monthly"]').checked = true;
    updateSavingsSimulator();
    goToSavingsStep(1);
};
setTheme(localStorage.getItem('cartera_theme') === 'dark');
function setActiveNav(buttonId) {
    document.querySelectorAll('nav button').forEach(button => {
        button.classList.toggle('active', button.id === buttonId);
    });
}
const APP_VIEWS = ['summaryView', 'simulatorView', 'savingsView', 'balanceView', 'incomeView', 'calculatorView', 'laborView', 'categoriesView', 'reportsView', 'chartsView'].filter(id => !!$(id));
function showView(viewId) {
    APP_VIEWS.forEach(id => {
        const view = $(id);
        if (view) view.classList.toggle('hidden', id !== viewId);
    });
}
window.setActiveNav = setActiveNav;
// Menú hamburguesa: en móvil/tablet la navegación se abre desde el botón del encabezado.
const sideAside = document.querySelector('aside');
const navToggle = $('navToggle');
function setNavOpen(open) {
    const isOpen = !!open && window.innerWidth < 1024;
    sideAside.classList.toggle('nav-open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    navToggle.firstElementChild.textContent = isOpen ? '✕' : '☰';
}
navToggle.onclick = () => setNavOpen(!sideAside.classList.contains('nav-open'));
$('sideNav').addEventListener('click', event => {
    if (event.target.closest('button')) setNavOpen(false);
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setNavOpen(false);
});
document.addEventListener('click', event => {
    if (!sideAside.classList.contains('nav-open')) return;
    if (!event.target.closest('aside')) setNavOpen(false);
});
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) setNavOpen(false);
});
const navSummary = $('summaryNav'); if (navSummary) navSummary.onclick = () => {
    showView('summaryView');
    setActiveNav('summaryNav');
};
const navSimulator = $('simulatorNav'); if (navSimulator) navSimulator.onclick = () => {
    showView('simulatorView');
    setActiveNav('simulatorNav');
    updateSimulator();
    if (localStorage.getItem(simTourKey) !== 'done') setTimeout(simTourStart, 400);
};
const navSavings = $('savingsNav'); if (navSavings) navSavings.onclick = () => {
    showView('savingsView');
    setActiveNav('savingsNav');
    updateSavingsSimulator();
    renderSavingsGoals();
    if (localStorage.getItem(savingsTourKey) !== 'done') setTimeout(savingsTourStart, 400);
};
const addSavingsGoalBtn = $('addSavingsGoalBtn');
if (addSavingsGoalBtn) addSavingsGoalBtn.onclick = () => {
    const form = $('savingsGoalForm');
    if (form) { form.reset(); form.elements.target.value = ''; form.elements.current.value = ''; }
    openModal('savingsGoalModal');
};
const savingsGoalForm = $('savingsGoalForm');
if (savingsGoalForm) {
    savingsGoalForm.addEventListener('submit', e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(savingsGoalForm));
        const goal = {
            id: `local-${Date.now()}`,
            name: String(data.name || '').trim(),
            target: parseMoneyInput(data.target),
            current: parseMoneyInput(data.current)
        };
        if (!goal.name || !goal.target) { showToast('Completa nombre y meta.', 'error'); return; }
        savingsGoals.push(goal);
        persistSavingsGoals();
        closeModals();
        renderSavingsGoals();
        showToast('Meta creada.', 'success');
    });
}
document.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-goal]');
    if (!btn) return;
    const id = btn.dataset.deleteGoal;
    savingsGoals = savingsGoals.filter(g => g.id !== id);
    persistSavingsGoals();
    renderSavingsGoals();
    showToast('Meta eliminada.', 'success');
});
$('simulatorToSavings').onclick = (event) => {
    event.preventDefault();
    showView('savingsView');
    setActiveNav('savingsNav');
    updateSavingsSimulator();
};
const navCategories = $('categoriesNav'); if (navCategories) navCategories.onclick = () => {
    showView('categoriesView');
    setActiveNav('categoriesNav');
};
const navBalance = $('balanceNav'); if (navBalance) navBalance.onclick = () => {
    showView('balanceView');
    setActiveNav('balanceNav');
    renderBalance();
};
const navIncome = $('incomeNav');
if (navIncome) navIncome.onclick = () => {
    showView('incomeView');
    setActiveNav('incomeNav');
    setIncomeFormCategoryOptions();
    renderIncomes();
};
const navCharts = $('chartsNav');
if (navCharts) navCharts.onclick = () => {
    showView('chartsView');
    setActiveNav('chartsNav');
    renderCharts();
};
$('addIncomeBtn').onclick = () => {
    editingIncomeId = null;
    setIncomeFormCategoryOptions();
    const form = $('incomeForm');
    if (form) {
        form.reset();
        form.elements.date.value = new Date().toISOString().slice(0, 10);
        form.elements.category.value = categories[0] ? categories[0].name : '';
        const title = form.closest('.modal').querySelector('h2');
        if (title) title.textContent = 'Registrar nuevo ingreso';
        const btn = form.querySelector('.btn-dark');
        if (btn) btn.textContent = 'Guardar ingreso';
    }
    openModal('incomeModal');
};
$('chartsPrintBtn').onclick = () => window.print();
$('chartsPdfBtn').onclick = () => exportPdf('chartsView');
$('chartsCsvBtn').onclick = exportChartsCsv;
$('chartsBackupBtn').onclick = exportData;
document.querySelectorAll('.charts-presets .chip').forEach(chip => {
    chip.onclick = () => {
        chartsApplyPreset(chip.dataset.chartRange || 'half');
        syncChartsPresetHighlight();
        renderCharts();
    };
});
$('chartsFrom').onchange = () => {
    chartsDateFrom = $('chartsFrom').value;
    chartsRange = 'custom';
    syncChartsPresetHighlight();
    renderCharts();
};
$('chartsTo').onchange = () => {
    chartsDateTo = $('chartsTo').value;
    chartsRange = 'custom';
    syncChartsPresetHighlight();
    renderCharts();
};
$('chartsMonthSelect').onchange = event => {
    chartsMonth = event.target.value;
    renderCharts();
};
$('chartsFilterCategory').onchange = () => {
    chartsFilters.category = $('chartsFilterCategory').value;
    renderCharts();
};
$('chartsFilterStatus').onchange = () => {
    chartsFilters.status = $('chartsFilterStatus').value;
    renderCharts();
};
$('chartsFilterRecurring').onchange = () => {
    chartsFilters.recurring = $('chartsFilterRecurring').checked;
    renderCharts();
};
$('chartsFilterAmountFrom').oninput = () => {
    chartsFilters.amountFrom = parseMoneyInput($('chartsFilterAmountFrom').value);
    renderCharts();
};
$('chartsFilterAmountTo').oninput = () => {
    chartsFilters.amountTo = parseMoneyInput($('chartsFilterAmountTo').value);
    renderCharts();
};
$('chartsFilterClear').onclick = () => {
    chartsFilters = { category:'', status:'', recurring:false, amountFrom:'', amountTo:'' };
    $('chartsFilterCategory').value = '';
    $('chartsFilterStatus').value = '';
    $('chartsFilterRecurring').checked = false;
    $('chartsFilterAmountFrom').value = '';
    $('chartsFilterAmountTo').value = '';
    chartsMonth = formatDateKey(new Date()).slice(0, 7);
    renderCharts();
};
chartsApplyPreset('half');
syncChartsPresetHighlight();
$('balanceExportBtn').onclick = exportData;
if ($('manageBtn')) {
    $('manageBtn').onclick = () => {
        showView('categoriesView');
        setActiveNav('categoriesNav');
    };
}
function updateConnectionStatus() {
    const el = $('connStatus');
    if (!el) return;
    const online = navigator.onLine;
    el.className = 'conn-status ' + (online ? 'is-online' : 'is-offline');
    el.title = online ? 'En línea' : 'Sin conexión';
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

// Moneda principal selector
const appCurrencySelect = $('appCurrencySelect');
if (appCurrencySelect) {
    appCurrencySelect.value = appCurrency;
    appCurrencySelect.onchange = e => {
        appCurrency = e.target.value;
        localStorage.setItem('cartera_currency', appCurrency);
        render();
        if (typeof updateSimulator === 'function') updateSimulator();
        if (typeof renderReports === 'function') renderReports();
        if (typeof renderCharts === 'function') renderCharts();
        showToast(`Moneda cambiada a ${appCurrency}.`, 'success');
    };
}

// Comprobantes inputs y previews
const paymentAttachmentInput = $('paymentAttachment');
if (paymentAttachmentInput) {
    paymentAttachmentInput.onchange = e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        selectedAttachmentFile = file;
        $('paymentAttachmentPreview').classList.remove('hidden');
        $('paymentAttachmentInfo').textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    };
}
const paymentAttachmentRemove = $('paymentAttachmentRemove');
if (paymentAttachmentRemove) {
    paymentAttachmentRemove.onclick = () => {
        selectedAttachmentFile = null;
        if ($('paymentAttachment')) $('paymentAttachment').value = '';
        $('paymentAttachmentPreview').classList.add('hidden');
        $('paymentAttachmentInfo').textContent = '';
        if (editingPaymentId) {
            const p = payments.find(item => item.id === editingPaymentId);
            if (p) p._removeAttachment = true;
        }
    };
}

// Ver comprobante click
document.addEventListener('click', e => {
    const btn = e.target.closest('[data-view-receipt]');
    if (!btn) return;
    const p = payments.find(item => item.id === btn.dataset.viewReceipt);
    if (!p || !p.attachment) return;
    openReceiptModal(p);
});

// Push notification button & status
const notifPushBtn = $('notifPushBtn');
if (notifPushBtn) notifPushBtn.onclick = requestPushPermission;
updatePushStatusUI();

// Mes de presupuesto listener
const catMonthSelect = $('categoryBudgetMonthSelect');
if (catMonthSelect) {
    catMonthSelect.onchange = e => {
        selectedBudgetMonth = e.target.value;
        renderCategoryTable();
    };
}

window.addEventListener('online', flushSyncQueue);

showView('summaryView');
setActiveNav('summaryNav');
document.querySelectorAll('[data-currency-input]').forEach(input => {
    input.addEventListener('input', () => {
        const formatted = formatMoneyInput(input.value);
        input.value = formatted;
    });
});
const savedSimulator = JSON.parse(localStorage.getItem('cartera_simulator') || '{}');
$('simulatorIncome').value = savedSimulator.income || '';
$('simulateBtn').onclick = updateSimulator;
$('simulatorRefreshBtn').onclick = () => {
    render();
    updateSimulator();
};
['simulatorIncome'].forEach(id => $(id).addEventListener('input', updateSimulator));
updateSimulator();
const savedSavingsPlan = JSON.parse(localStorage.getItem(savingsStorageKey) || '{}');
$('savingsName').value = savedSavingsPlan.name || '';
$('savingsGoal').value = savedSavingsPlan.goal || '';
$('savingsCurrent').value = savedSavingsPlan.current || '';
$('savingsMonthly').value = savedSavingsPlan.monthly || '';
$('savingsTargetDate').value = savedSavingsPlan.target || '';
if (savedSavingsPlan.mode === 'date') {
    const dateModeRadio = document.querySelector('input[name="savingsMode"][value="date"]');
    if (dateModeRadio) dateModeRadio.checked = true;
}
[$('savingsName'), $('savingsGoal'), $('savingsCurrent'), $('savingsMonthly'), $('savingsTargetDate')].forEach(input => input.addEventListener('input', updateSavingsSimulator));
document.querySelectorAll('input[name="savingsMode"]').forEach(radio => radio.addEventListener('change', () => {
    if (radio.value === 'date' && radio.checked && !$('savingsTargetDate').value) {
        $('savingsTargetDate').value = toInputDate(addMonthsFromToday(12));
    }
    updateSavingsSimulator();
}));
document.querySelectorAll('#savingsStepper .step').forEach(button => button.addEventListener('click', () => goToSavingsStep(Number(button.dataset.step))));
updateSavingsSimulator();
goToSavingsStep(Number(savedSavingsPlan.step) || 1);
localStorage.removeItem('cartera_palette');
const savedTheme = localStorage.getItem('cartera_theme');
let initialDark;
if (savedTheme) {
    initialDark = savedTheme === 'dark';
} else {
    const hour = new Date().getHours();
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    initialDark = systemDark || (hour >= 19 || hour < 7);
}
setTheme(initialDark);
renderColorPalette();
render();
syncRecurringPayments();

/* ---------- Adjuntos / Recibos ---------- */
async function uploadReceiptFile(file, paymentId) {
    if (!file) return null;
    if (storage && currentUser && currentUser.uid && !isLocalOnlySession(currentUser)) {
        const ext = file.name.split('.').pop() || 'dat';
        const storagePath = `users/${currentUser.uid}/receipts/${paymentId || Date.now()}_${Date.now()}.${ext}`;
        const ref = storage.ref().child(storagePath);
        const snapshot = await ref.put(file);
        const url = await snapshot.ref.getDownloadURL();
        return { name: file.name, url, path: storagePath, type: file.type, size: file.size };
    } else {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, url: reader.result, type: file.type, size: file.size, isLocal: true });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
    }
}

function openReceiptModal(payment) {
    const att = payment.attachment;
    if (!att) return;
    $('receiptModalTitle').textContent = `Comprobante · ${payment.name}`;
    const body = $('receiptPreviewBody');
    const isImage = (att.type && att.type.startsWith('image/')) || /\.(png|jpe?g|webp|gif|svg)$/i.test(att.name || '');
    if (isImage) {
        body.innerHTML = `<img src="${escapeHtml(att.url)}" alt="Comprobante de ${escapeHtml(payment.name)}"><p class="eyebrow" style="margin-top:8px">${escapeHtml(att.name)} (${Math.round((att.size || 0)/1024)} KB)</p>`;
    } else {
        body.innerHTML = `<iframe src="${escapeHtml(att.url)}" title="Comprobante PDF"></iframe><p class="eyebrow" style="margin-top:8px">${escapeHtml(att.name)}</p>`;
    }
    const dl = $('receiptDownloadLink');
    if (dl) {
        dl.href = att.url;
        dl.download = att.name || 'comprobante';
    }
    openModal('receiptModal');
}

/* ---------- Push Notifications ---------- */
function updatePushStatusUI() {
    const btn = $('notifPushBtn');
    const desc = $('notifPushDesc');
    if (!btn || !desc) return;
    if (!('Notification' in window)) {
        desc.textContent = 'Tu navegador no admite notificaciones del sistema.';
        btn.hidden = true;
        return;
    }
    if (Notification.permission === 'granted') {
        desc.textContent = 'Notificaciones activadas. Recibirás avisos de vencimiento.';
        btn.textContent = '✓ Activas';
        btn.disabled = true;
    } else if (Notification.permission === 'denied') {
        desc.textContent = 'Permiso denegado en tu navegador.';
        btn.textContent = 'Bloqueadas';
        btn.disabled = true;
    } else {
        desc.textContent = 'Recibe avisos antes de que venzan tus pagos.';
        btn.textContent = 'Activar';
        btn.disabled = false;
    }
}

async function requestPushPermission() {
    if (!('Notification' in window)) {
        showToast('Este navegador no soporta notificaciones.', 'error');
        return;
    }
    try {
        const permission = await Notification.requestPermission();
        updatePushStatusUI();
        if (permission === 'granted') {
            showToast('Notificaciones activadas.', 'success');
            registerFcmToken();
            checkAndNotifyDuePayments(true);
        } else {
            showToast('Permiso de notificaciones no concedido.', 'info');
        }
    } catch (e) {
        console.error(e);
    }
}

async function registerFcmToken() {
    try {
        if (typeof firebase !== 'undefined' && firebase.messaging && typeof firebase.messaging.isSupported === 'function' && firebase.messaging.isSupported()) {
            fcmMessaging = firebase.messaging();
            const vapidKey = window.firebaseConfig && window.firebaseConfig.vapidKey;
            const token = await fcmMessaging.getToken(vapidKey ? { vapidKey } : undefined);
            if (token && currentUser && db) {
                await db.collection('users').doc(currentUser.uid).collection('fcmTokens').doc(token).set({
                    token,
                    createdAt: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }).catch(() => {});
            }
            fcmMessaging.onMessage(payload => {
                const title = payload.notification?.title || 'Cartera | Recordatorio';
                const body = payload.notification?.body || 'Tienes un nuevo aviso de pago.';
                showToast(`${title}: ${body}`, 'info');
                if (Notification.permission === 'granted') {
                    navigator.serviceWorker?.ready.then(reg => reg.showNotification(title, { body, icon: '/assets/img/logo-mark.svg' }));
                }
            });
        }
    } catch (e) {
        console.warn('FCM opcional no configurado:', e.message);
    }
}

function checkAndNotifyDuePayments(force) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = todayKey();
    const lastNotified = localStorage.getItem('cartera_last_notif_date');
    if (!force && lastNotified === today) return;

    const dueTodayOrOverdue = payments.filter(p => {
        if (getPaymentStatus(p) === 'pagado') return false;
        const diff = p.date ? daysUntilDate(p.date) : null;
        return diff !== null && diff <= 0;
    });

    if (dueTodayOrOverdue.length) {
        localStorage.setItem('cartera_last_notif_date', today);
        const count = dueTodayOrOverdue.length;
        const title = `Cartera | ${count} pago${count === 1 ? '' : 's'} por atender`;
        const body = count === 1
            ? `“${dueTodayOrOverdue[0].name}” (${money(dueTodayOrOverdue[0].amount, dueTodayOrOverdue[0].currency)}) vence o está vencido.`
            : `Tienes ${count} pagos pendientes o vencidos que requieren tu atención.`;

        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: '/assets/img/logo-mark.svg' }));
        } else {
            try { new Notification(title, { body, icon: '/assets/img/logo-mark.svg' }); } catch (e) {}
        }
    }
}

/* ---------- Sincronización y resolución de conflictos ---------- */
function updateSyncStatusUI(status, label) {
    syncStatus = status || syncStatus;
    const el = $('syncStatus');
    if (!el) return;
    el.className = `sync-status is-${syncStatus}`;
    el.textContent = label || (syncStatus === 'synced' ? 'Sincronizado' : syncStatus === 'syncing' ? 'Sincronizando' : syncStatus === 'conflict' ? 'Conflicto resuelto' : 'Modo local');
    el.title = `Estado de sincronización: ${el.textContent}`;
}

function mergeRecords(local, remote) {
    const localTime = new Date(local.updatedAt || 0).getTime();
    const remoteTime = new Date(remote.updatedAt || 0).getTime();
    if (!local._dirty) return { merged: remote, conflict: false };
    if (localTime > remoteTime) return { merged: local, conflict: false, pushRemote: true };
    const merged = { ...remote };
    let hasConflict = false;
    if (local.status !== remote.status && local.status === 'pagado') merged.status = 'pagado';
    if (local.amount !== remote.amount || local.name !== remote.name) hasConflict = true;
    merged.updatedAt = new Date().toISOString();
    delete merged._dirty;
    return { merged, conflict: hasConflict, pushRemote: true };
}

function startRealtimeSync(user) {
    if (!db || !user || String(user.email).startsWith('Modo local')) {
        updateSyncStatusUI('offline', 'Modo local');
        return;
    }
    firestoreUnsubscribers.forEach(unsub => { try { unsub(); } catch (e) {} });
    firestoreUnsubscribers = [];

    const userRef = db.collection('users').doc(user.uid);

    const unsubPayments = userRef.collection('payments').onSnapshot(snapshot => {
        let hasChanges = false;
        let conflictDetected = false;
        snapshot.docChanges().forEach(change => {
            const data = { id: change.doc.id, ...change.doc.data() };
            if (change.type === 'added' || change.type === 'modified') {
                const idx = payments.findIndex(p => p.id === data.id);
                if (idx >= 0) {
                    const local = payments[idx];
                    const { merged, conflict, pushRemote } = mergeRecords(local, data);
                    payments[idx] = merged;
                    if (conflict) conflictDetected = true;
                    if (pushRemote) change.doc.ref.set(merged).catch(() => {});
                    hasChanges = true;
                } else {
                    const localTempIdx = payments.findIndex(p => String(p.id).startsWith('local-') && p.name === data.name && p.date === data.date && Number(p.amount) === Number(data.amount));
                    if (localTempIdx >= 0) {
                        payments[localTempIdx] = data;
                    } else if (!data.isDeleted) {
                        payments.push(data);
                    }
                    hasChanges = true;
                }
            } else if (change.type === 'removed') {
                payments = payments.filter(p => p.id !== change.doc.id);
                hasChanges = true;
            }
        });
        if (hasChanges) {
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
            populateMonths();
            render();
        }
        if (conflictDetected) {
            updateSyncStatusUI('conflict', 'Conflicto resuelto');
            showToast('Se sincronizaron cambios concurrentes desde la nube.', 'info');
        } else {
            lastSyncTimestamp = new Date().toISOString();
            localStorage.setItem('cartera_last_sync', lastSyncTimestamp);
            updateSyncStatusUI('synced', 'Sincronizado');
        }
    }, err => {
        console.warn('Error en listener de pagos:', err);
        updateSyncStatusUI('offline', 'Sin conexión');
    });
    firestoreUnsubscribers.push(unsubPayments);
}

async function flushSyncQueue() {
    if (!navigator.onLine || !db || !currentUser || isLocalOnlySession(currentUser)) return;
    updateSyncStatusUI('syncing', 'Sincronizando...');
    const localPayments = payments.filter(p => String(p.id).startsWith('local-') || p._dirty);
    const collection = userCollection('payments');
    if (collection && localPayments.length) {
        for (const p of localPayments) {
            try {
                const toSave = { ...p, updatedAt: new Date().toISOString() };
                delete toSave._dirty;
                if (String(p.id).startsWith('local-')) {
                    const ref = await collection.add(toSave);
                    p.id = ref.id;
                } else {
                    await collection.doc(p.id).set(toSave);
                }
                delete p._dirty;
            } catch (e) {
                console.warn('Error al subir pago pendiente:', e);
            }
        }
        localStorage.setItem('cartera_payments', JSON.stringify(payments));
    }
    updateSyncStatusUI('synced', 'Sincronizado');
}

window.addEventListener('error', event => { console.error('Error global:', event.error || event.message); });
window.addEventListener('unhandledrejection', event => { console.error('Promise rechazada:', event.reason); });
// Atajos de teclado

function formatAmountCOP(value) {
    const numeric = Number(value) || 0;
    return money(numeric, 'COP');
}
function setActiveCalculatorTab(tabName) {
    document.querySelectorAll('.calculator-tab').forEach(button => {
        button.classList.toggle('is-active', button.dataset.calcTab === tabName);
    });
    document.querySelectorAll('.calculator-panel').forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.calcPanel === tabName);
    });
}
function renderCalculatorNotes() {
    const list = $('calculatorNotesList');
    if (!list) return;
    if (!financialNotes.length) {
        list.innerHTML = '<li class="empty-note">Aún no guardas resultados.</li>';
        return;
    }
    list.innerHTML = financialNotes.slice(0, 8).map(note => `
        <li>
            <div class="note-label">${escapeHtml(note.type === 'income' ? 'Ingreso estimado' : note.type === 'expense' ? 'Gasto estimado' : 'Nota')}</div>
            <strong>${escapeHtml(note.label)}</strong>
            <span>${escapeHtml(note.value)}</span>
        </li>
    `).join('');
}
function saveFinancialResult(type, label, value) {
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        label,
        value,
        createdAt: new Date().toISOString()
    };
    financialNotes.unshift(entry);
    financialNotes = financialNotes.slice(0, 12);
    localStorage.setItem(FINANCE_NOTES_KEY, JSON.stringify(financialNotes));
    renderCalculatorNotes();
    showToast('Resultado guardado en tus notas.', 'success');
}
function calculateSimpleInterest(capital, ratePercent, years) {
    const principal = Number(capital) || 0;
    const rate = Number(ratePercent) || 0;
    const time = Number(years) || 0;
    const interest = principal * (rate / 100) * time;
    const total = principal + interest;
    return { principal, rate, time, interest, total };
}
function calculateCompoundInterest(capital, ratePercent, periodsPerYear, years) {
    const principal = Number(capital) || 0;
    const rate = Number(ratePercent) || 0;
    const periods = Number(periodsPerYear) || 1;
    const time = Number(years) || 0;
    const futureValue = principal * Math.pow(1 + (rate / 100) / periods, periods * time);
    const totalInterest = futureValue - principal;
    return { principal, rate, periods, time, futureValue, totalInterest };
}
function calculateLoanAmortization(principalAmount, annualRatePercent, totalMonths) {
    const principal = Number(principalAmount) || 0;
    const months = Math.max(1, Number(totalMonths) || 1);
    const rate = Number(annualRatePercent) || 0;
    const monthlyRate = rate / 100 / 12;
    const monthlyPayment = principal === 0 ? 0 : (monthlyRate === 0 ? principal / months : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
    let balance = principal;
    const schedule = [];
    let totalInterest = 0;
    let totalPaid = 0;
    for (let month = 1; month <= months; month += 1) {
        const interest = balance * monthlyRate;
        const principalPayment = monthlyPayment - interest;
        balance = Math.max(0, balance - principalPayment);
        totalInterest += interest;
        totalPaid += monthlyPayment;
        schedule.push({ month, cuota: monthlyPayment, interest, principalPayment, balance });
    }
    return { monthlyPayment, totalPaid, totalInterest, schedule };
}
function calculateSavingsPlan(monthlyContribution, annualRatePercent, months) {
    const contribution = Number(monthlyContribution) || 0;
    const totalMonths = Math.max(1, Number(months) || 1);
    const rate = Number(annualRatePercent) || 0;
    const monthlyRate = rate / 100 / 12;
    const futureValue = monthlyRate === 0
        ? contribution * totalMonths
        : contribution * (((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate));
    const totalContributed = contribution * totalMonths;
    const totalInterest = futureValue - totalContributed;
    return { contribution, rate, months: totalMonths, futureValue, totalContributed, totalInterest };
}
function calculateRateConversion({ eaValue, nominalValue, effectiveValue }) {
    const ea = Number(eaValue) || 0;
    const nominal = Number(nominalValue) || 0;
    const effective = Number(effectiveValue) || 0;
    if (ea) {
        const effectiveMonthly = (Math.pow(1 + (ea / 100), 1 / 12) - 1) * 100;
        const nominalMonthly = effectiveMonthly * 12;
        return { ea, effectiveMonthly, nominalMonthly, nominal: nominalMonthly };
    }
    if (nominal) {
        const effectiveMonthly = nominal / 12;
        const annualEffective = (Math.pow(1 + (effectiveMonthly / 100), 12) - 1) * 100;
        return { ea: annualEffective, effectiveMonthly, nominal };
    }
    if (effective) {
        const annualEffective = (Math.pow(1 + (effective / 100), 12) - 1) * 100;
        const nominalMonthly = ((Math.pow(1 + (effective / 100), 1 / 12) - 1) * 12) * 100;
        return { ea: annualEffective, effectiveMonthly: effective, nominal: nominalMonthly };
    }
    return { ea: 0, effectiveMonthly: 0, nominal: 0 };
}
function clearCalculatorForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.reset();
    const resultBox = document.getElementById(formId.replace('Form', 'Result'));
    if (resultBox) {
        resultBox.classList.add('hidden');
        resultBox.innerHTML = '';
    }
}
function renderCalculatorResult(resultBoxId, title, stats, extraHtml) {
    const box = document.getElementById(resultBoxId);
    if (!box) return;
    box.classList.remove('hidden');
    const statsHtml = stats.map(stat => `<div class="calc-stat"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(stat.value)}</strong></div>`).join('');
    box.innerHTML = `<h3>${escapeHtml(title)}</h3><div class="calc-stat-grid">${statsHtml}</div>${extraHtml ? `<div class="calc-extra">${extraHtml}</div>` : ''}<div class="calc-result-actions"><button type="button" class="btn btn-light" data-save-calculator="note" data-save-label="${escapeHtml(title)}" data-save-value="${escapeHtml(stats[0].value)}">Guardar nota</button><button type="button" class="btn btn-light" data-save-calculator="expense" data-save-label="${escapeHtml(title)}" data-save-value="${escapeHtml(stats[0].value)}">Guardar gasto estimado</button><button type="button" class="btn btn-light" data-save-calculator="income" data-save-label="${escapeHtml(title)}" data-save-value="${escapeHtml(stats[0].value)}">Guardar ingreso estimado</button></div>`;
}

document.addEventListener('click', event => {
    const tab = event.target.closest('.calculator-tab');
    if (tab) {
        setActiveCalculatorTab(tab.dataset.calcTab);
        return;
    }
    const clearButton = event.target.closest('[data-calc-clear]');
    if (clearButton) {
        const formId = `${clearButton.dataset.calcClear}Form`;
        clearCalculatorForm(formId);
        return;
    }
    const saveButton = event.target.closest('[data-save-calculator]');
    if (saveButton) {
        const type = saveButton.dataset.saveCalculator || 'note';
        const label = saveButton.dataset.saveLabel || 'Resultado financiero';
        const value = saveButton.dataset.saveValue || '0';
        saveFinancialResult(type, label, value);
    }
});

document.getElementById('simpleInterestForm').addEventListener('submit', event => {
    event.preventDefault();
    const capital = document.getElementById('simpleCapital').value;
    const rate = document.getElementById('simpleRate').value;
    const time = document.getElementById('simpleTime').value;
    if (!capital || !rate || !time || Number(capital) < 0 || Number(rate) < 0 || Number(time) < 0) {
        showToast('Ingresa valores válidos y no negativos para interés simple.', 'error');
        return;
    }
    const result = calculateSimpleInterest(capital, rate, time);
    renderCalculatorResult('simpleInterestResult', 'Interés simple', [
        { label: 'Interés generado', value: formatAmountCOP(result.interest) },
        { label: 'Monto final', value: formatAmountCOP(result.total) },
        { label: 'Capital', value: formatAmountCOP(result.principal) }
    ], '<p>Fórmula: I = C × r × t; Monto final = C + I.</p>');
});

document.getElementById('compoundInterestForm').addEventListener('submit', event => {
    event.preventDefault();
    const capital = document.getElementById('compoundCapital').value;
    const rate = document.getElementById('compoundRate').value;
    const periods = document.getElementById('compoundPeriods').value;
    const time = document.getElementById('compoundTime').value;
    if (!capital || !rate || !time || Number(capital) < 0 || Number(rate) < 0 || Number(time) < 0) {
        showToast('Ingresa valores válidos y no negativos para interés compuesto.', 'error');
        return;
    }
    const result = calculateCompoundInterest(capital, rate, periods, time);
    renderCalculatorResult('compoundInterestResult', 'Interés compuesto', [
        { label: 'Valor futuro', value: formatAmountCOP(result.futureValue) },
        { label: 'Total intereses', value: formatAmountCOP(result.totalInterest) },
        { label: 'Capital', value: formatAmountCOP(result.principal) }
    ], '<p>Fórmula: VF = C × (1 + r / n)^(n × t).</p>');
});

document.getElementById('loanInstallmentForm').addEventListener('submit', event => {
    event.preventDefault();
    const principal = document.getElementById('loanAmount').value;
    const rate = document.getElementById('loanRate').value;
    const months = document.getElementById('loanMonths').value;
    if (!principal || !rate || !months || Number(principal) < 0 || Number(rate) < 0 || Number(months) < 1) {
        showToast('Completa monto, tasa y plazo válidos.', 'error');
        return;
    }
    const result = calculateLoanAmortization(principal, rate, months);
    const rows = result.schedule.slice(0, 6).map(item => `<tr><td>${item.month}</td><td>${formatAmountCOP(item.cuota)}</td><td>${formatAmountCOP(item.interest)}</td><td>${formatAmountCOP(item.principalPayment)}</td><td>${formatAmountCOP(item.balance)}</td></tr>`).join('');
    renderCalculatorResult('loanInstallmentResult', 'Cuota de préstamo', [
        { label: 'Cuota mensual', value: formatAmountCOP(result.monthlyPayment) },
        { label: 'Total pagado', value: formatAmountCOP(result.totalPaid) },
        { label: 'Total intereses', value: formatAmountCOP(result.totalInterest) }
    ], `<table class="calc-amortization-table"><thead><tr><th>Mes</th><th>Cuota</th><th>Interés</th><th>Abono</th><th>Saldo</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Sin amortización</td></tr>'}</tbody></table>`);
});

document.getElementById('savingsPlanForm').addEventListener('submit', event => {
    event.preventDefault();
    const contribution = document.getElementById('savingsAmount').value;
    const rate = document.getElementById('savingsRate').value;
    const months = document.getElementById('savingsMonths').value;
    if (!contribution || !rate || !months || Number(contribution) < 0 || Number(rate) < 0 || Number(months) < 1) {
        showToast('Completa aporte mensual, tasa y tiempo válidos.', 'error');
        return;
    }
    const result = calculateSavingsPlan(contribution, rate, months);
    renderCalculatorResult('savingsPlanResult', 'Ahorro con aportes periódicos', [
        { label: 'Valor futuro', value: formatAmountCOP(result.futureValue) },
        { label: 'Aportes totales', value: formatAmountCOP(result.totalContributed) },
        { label: 'Intereses acumulados', value: formatAmountCOP(result.totalInterest) }
    ], '<p>Fórmula: VF = A × [((1 + i)^n - 1) / i] × (1 + i).</p>');
});

document.getElementById('rateConversionForm').addEventListener('submit', event => {
    event.preventDefault();
    const ea = document.getElementById('rateEa').value;
    const nominal = document.getElementById('rateNominal').value;
    const effective = document.getElementById('rateEffective').value;
    if (!ea && !nominal && !effective) {
        showToast('Ingresa al menos una tasa para convertir.', 'error');
        return;
    }
    const result = calculateRateConversion({ eaValue: ea, nominalValue: nominal, effectiveValue: effective });
    renderCalculatorResult('rateConversionResult', 'Conversión de tasas', [
        { label: 'EA', value: `${(Number(result.ea) || 0).toFixed(2)} %` },
        { label: 'Nominal MV', value: `${(Number(result.nominal) || 0).toFixed(2)} %` },
        { label: 'Efectiva mensual', value: `${(Number(result.effectiveMonthly) || 0).toFixed(2)} %` }
    ], '<p>La conversión usa la relación entre tasa efectiva anual, nominal mes vencido y efectiva mensual.</p>');
});

function countBusinessDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count += 1;
        current.setDate(current.getDate() + 1);
    }
    return count;
}
function calculateLaborSettlement(data) {
    const salary = Number(data.monthlySalary || 0);
    const startDate = data.startDate;
    const endDate = data.endDate;
    const minimumWage = Number(data.minimumWage || 0);
    const transportAllowance = Number(data.transportAllowance || 0);
    const workingDays = countBusinessDays(startDate, endDate) || 0;
    const appliesTransport = salary <= (minimumWage * 2 || Number.MAX_SAFE_INTEGER);
    const monthlyBase = salary + (appliesTransport ? transportAllowance : 0);
    const cesantias = (monthlyBase * workingDays) / 360;
    const interesesCesantias = (cesantias * workingDays * 0.12) / 360;
    const prima = (monthlyBase * workingDays) / 360;
    const vacationDays = Math.max(0, 15 - Number(data.vacationDaysTaken || 0));
    const vacations = (salary * vacationDays) / 720;
    const variableIncome = Number(data.variableIncome || 0);
    let indemnizacion = 0;
    let indemnizacionFormula = 'No aplica';
    if (data.terminationReason === 'despido_sin_justa_causa' && data.contractType === 'indefinido') {
        const yearsWorked = workingDays / 360;
        const dayEquivalent = yearsWorked <= 1 ? 30 * yearsWorked : 30 + (20 * Math.max(0, yearsWorked - 1));
        indemnizacion = salary * dayEquivalent;
        indemnizacionFormula = `Indefinido: 30 días del primer año + 20 días por cada año posterior proporcional. ${dayEquivalent.toFixed(2)} días equivalentes.`;
    } else if (data.terminationReason === 'despido_sin_justa_causa' && data.contractType === 'fijo') {
        const remainingDays = Math.max(0, Math.round((workingDays || 0) * 0.5));
        indemnizacion = (salary * remainingDays) / 30;
        indemnizacionFormula = `Fijo: salario proporcional al tiempo restante del contrato: ${remainingDays} días respecto a 30 días del mes.`;
    }
    const totalConcepts = cesantias + interesesCesantias + prima + vacations;
    const total = totalConcepts + indemnizacion + variableIncome;
    return { workingDays, appliesTransport, monthlyBase, cesantias, interesesCesantias, prima, vacations, indemnizacion, indemnizacionFormula, variableIncome, totalConcepts, total };
}
function renderLaborSettlement() {
    const resultBox = document.getElementById('laborSettlementResult');
    if (!resultBox) return;
    const startDate = document.getElementById('laborStartDate').value;
    const endDate = document.getElementById('laborEndDate').value;
    const salary = Number(document.getElementById('laborSalary').value || 0);
    const minimumWage = Number(document.getElementById('laborMinWage').value || 0);
    if (!startDate || !endDate || !salary || salary < 0 || minimumWage < 0) {
        resultBox.className = 'labor-result-box empty-state-box';
        resultBox.innerHTML = 'Completa la fecha de inicio, terminación, salario básico y salario mínimo vigente para calcular la liquidación.';
        return;
    }
    if (new Date(`${endDate}T00:00:00`) < new Date(`${startDate}T00:00:00`)) {
        resultBox.className = 'labor-result-box empty-state-box';
        resultBox.innerHTML = 'La fecha de terminación debe ser igual o posterior a la fecha de inicio del contrato.';
        return;
    }
    const result = calculateLaborSettlement({
        startDate,
        endDate,
        monthlySalary: salary,
        variableIncome: Number(document.getElementById('laborVariable').value || 0),
        contractType: document.getElementById('laborContractType').value,
        terminationReason: document.getElementById('laborTerminationReason').value,
        vacationDaysTaken: Number(document.getElementById('laborVacationTaken').value || 0),
        transportAllowance: Number(document.getElementById('laborTransportAllowance').value || 0),
        minimumWage
    });
    const rows = [
        { label: 'Cesantías', formula: '(Salario + auxilio si aplica) × días laborados / 360', value: result.cesantias },
        { label: 'Intereses sobre cesantías', formula: 'Cesantías × días laborados × 12% / 360', value: result.interesesCesantias },
        { label: 'Prima de servicios', formula: '(Salario + auxilio si aplica) × días del semestre trabajados / 360', value: result.prima },
        { label: 'Vacaciones', formula: 'Salario básico × días pendientes / 720', value: result.vacations },
        { label: 'Indemnización', formula: result.indemnizacionFormula, value: result.indemnizacion },
        { label: 'Otros devengados variables', formula: 'Promedio de comisiones y horas extra', value: result.variableIncome }
    ];
    resultBox.className = 'labor-result-box';
    resultBox.innerHTML = `
        <h3>Resultado estimado</h3>
        <div class="labor-summary-row"><span>Días laborados considerados</span><strong>${result.workingDays}</strong></div>
        <div class="labor-summary-row"><span>Auxilio de transporte aplica</span><strong>${result.appliesTransport ? 'Sí' : 'No'}</strong></div>
        <table class="labor-result-table"><thead><tr><th>Concepto</th><th>Fórmula</th><th style="text-align:right">Valor</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.formula)}</td><td style="text-align:right;font-weight:700;">${formatAmountCOP(row.value)}</td></tr>`).join('')}</tbody></table>
        <div class="labor-total-box"><span>Total estimado a pagar</span><strong>${formatAmountCOP(result.total)}</strong></div>
    `;
}

document.getElementById('laborSettlementForm').addEventListener('submit', event => {
    event.preventDefault();
    renderLaborSettlement();
});
document.getElementById('laborResetBtn').addEventListener('click', () => {
    document.getElementById('laborSettlementForm').reset();
    const box = document.getElementById('laborSettlementResult');
    box.className = 'labor-result-box empty-state-box';
    box.innerHTML = 'Completa el formulario para ver el desglose y el total estimado.';
});
document.getElementById('laborPrintBtn').addEventListener('click', () => window.print());
document.getElementById('laborExportBtn').addEventListener('click', () => {
    const resultBox = document.getElementById('laborSettlementResult');
    if (!resultBox || resultBox.classList.contains('empty-state-box')) {
        showToast('Primero calcula una liquidación para exportarla.', 'info');
        return;
    }
    const summaryRows = [...document.querySelectorAll('.labor-result-table tbody tr')].map(row => row.innerText.split('\t').join(',').trim());
    const total = document.querySelector('.labor-total-box strong')?.textContent || '0';
    const csv = [
        ['Concepto', 'Valor'],
        ...summaryRows.map(row => row.split('\n').map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')),
        ['Total estimado', total]
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'liquidacion-laboral-colombia.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Resumen exportado como CSV.', 'success');
});

renderCalculatorNotes();
setActiveCalculatorTab('simpleInterest');

// Atajos de teclado
document.addEventListener('keydown', event => {
    const tag = (event.target && event.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (event.key === 'Escape') { closeModals(); setNavOpen(false); return; }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'n' || event.key === 'N') { event.preventDefault(); openModal('paymentModal'); }
    else if (event.key === '/') { event.preventDefault(); const s = $('paymentSearch'); if (s) s.focus(); }
    else if (event.key === '?') { event.preventDefault(); showToast('Atajos: N nuevo pago · / buscar · Esc cerrar menú/modal', 'success'); }
});

