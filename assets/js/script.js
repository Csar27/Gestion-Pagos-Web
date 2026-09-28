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
            payments = savedPayments.map(payment => ({ ...payment, status:getPaymentStatus(payment) }));
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
let paymentFilters = { from:'', to:'', category:'', status:'', page:1, pageSize: Number(localStorage.getItem('cartera_page_size') || 5), focusId:null };
const PAGE_SIZE = paymentFilters.pageSize || 5;
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value);
const formatMoneyInput = value => {
    const digitsOnly = String(value ?? '').replace(/[^\d]/g, '');
    if (!digitsOnly) return '';
    const numeric = Number(digitsOnly);
    if (!Number.isFinite(numeric)) return '';
    return new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(numeric);
};
const parseMoneyInput = value => Number(String(value ?? '').replace(/\./g, '').replace(/,/g, '').replace(/[^\d-]/g, '')) || 0;
const authScreen = $('authScreen'), app = document.querySelector('.app');
const firebaseReady = !!(window.firebaseConfig && !Object.values(window.firebaseConfig).some(value => String(value).startsWith('TU_')));
let auth, db, currentUser, loadedUid = '';
if (typeof firebase !== 'undefined' && firebaseReady) {
    firebase.initializeApp(window.firebaseConfig);
    auth = firebase.auth(); db = firebase.firestore();
    auth.onAuthStateChanged(user => {
        if (user) {
            loadUserData(user).catch(error => { console.error(error); showAuth(); firebaseError(error); });
        } else {
            currentUser = null; categories = []; payments = []; showAuth();
        }
    });
    auth.getRedirectResult().then(result => {
        if (result.user) return loadUserData(result.user);
        if (!auth.currentUser) showAuth();
    }).catch(error => { showAuth(); firebaseError(error); });
} else {
    currentUser = { email: 'Modo local' };
    showApp(currentUser);
    if (!window.firebaseConfig) {
        $('authError').textContent = 'Configura Firebase para habilitar Google.';
    }
}
function showApp(user) { authScreen.classList.add('hidden'); app.classList.add('authenticated'); $('activeUser').textContent = user.email || 'Cuenta de Google'; }
function showAuth() { app.classList.remove('authenticated'); authScreen.classList.remove('hidden'); }
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
    payments = paymentsSnapshot.docs.map(doc => ({id:doc.id, ...doc.data(), status:getPaymentStatus(doc.data())}));
    await Promise.all(paymentsSnapshot.docs.filter(doc => !PAYMENT_STATUSES.includes(doc.data().status)).map(doc => doc.ref.update({ status:'pagado' })));
    localStorage.setItem('cartera_payments', JSON.stringify(payments));
    persistCategories();
    if (snapshot.empty) {
        categories = await Promise.all(categories.map(async category => {
            const ref = await userRef.collection('categories').add(category);
            return {...category, id:ref.id};
        }));
    }
    populateMonths();
    const defaultMonth = new Date().toISOString().slice(0,7);
    $('monthFilter').value = defaultMonth;
    paymentFilters.page = 1;
    render();
    showApp(user);
    syncRecurringPayments();
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
$('logoutBtn').onclick = async () => {
    if (!auth) return;
    $('logoutBtn').disabled = true;
    try { await auth.signOut(); }
    catch (error) { $('authError').textContent = `No fue posible cerrar sesión: ${error.message}`; }
    finally { $('logoutBtn').disabled = false; }
};
const currentMonth = () => $('monthFilter').value || new Date().toISOString().slice(0,7);
function getFilteredPayments() {
    return payments.slice().filter(payment => {
        if (paymentFilters.from && payment.date < paymentFilters.from) return false;
        if (paymentFilters.to && payment.date > paymentFilters.to) return false;
        if (paymentFilters.category && payment.category !== paymentFilters.category) return false;
        if (paymentFilters.status && getPaymentStatus(payment) !== paymentFilters.status) return false;
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
        return `
        <tr data-row-id="${escapeHtml(payment.id)}">
            <td style="font-weight:700; color:var(--muted);">${rowNumber}</td>
            <td>${escapeHtml(payment.name)}${payment.recurring ? '<span class="recurring-tag" title="Pago recurrente: se repite cada mes">↻ mensual</span>' : ''}</td>
            <td><span class="cat"><i class="dot" style="background:${(categories.find(category => category.name === payment.category) || {}).color || '#aaa'}"></i>${escapeHtml(payment.category)}</span></td>
            <td class="date">${new Date(payment.date + 'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td>
            <td><select class="payment-status" data-status-id="${escapeHtml(payment.id)}" aria-label="Estado de ${escapeHtml(payment.name)}"><option value="pagado" ${getPaymentStatus(payment) === 'pagado' ? 'selected' : ''}>Pagado</option><option value="no_pagado" ${getPaymentStatus(payment) === 'no_pagado' ? 'selected' : ''}>No pagado</option><option value="pendiente" ${getPaymentStatus(payment) === 'pendiente' ? 'selected' : ''}>Pendiente</option></select></td>
            <td style="text-align:right;font-weight:800">${money(payment.amount)}</td>
            <td><button class="row-actions" data-delete="${payment.id}" title="Eliminar">×</button></td>
        </tr>
    `;
    }).join('');
    $('emptyState').classList.add('hidden');
    $('payments').parentElement.classList.remove('hidden');

    if (document.getElementById('simulatorIncome')) {
        updateSimulator();
    }
}
function buildPaymentsAggregate(list) {
    const aggregate = { count: 0, total: 0, paid: 0, pending: 0, byCategory: new Map(), byMonth: new Map(), byStatus: new Map() };
    list.forEach(payment => {
        const amount = Number(payment.amount || 0);
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
    const flagged = categories
        .map(category => ({ name: category.name, state: categoryBudgetState(byMonthSpend[category.name] || 0, category.budget) }))
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
        total += Number(payment.amount);
        byCat[payment.category] = (byCat[payment.category] || 0) + Number(payment.amount);
    });

    $('monthTotal').innerHTML = `${money(total)} <small>COP</small>`;
    $('monthDelta').textContent = `${filtered.length} pago${filtered.length === 1 ? '' : 's'}`;
    $('dailyAverage').textContent = money(total / new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate());

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
        const state = categoryBudgetState(spent, category.budget);
        const budgetBlock = state ? `<div class="category-budget"><div class="category-budget-track"><i class="is-${state.key}" style="width:${Math.min(100, state.percent)}%"></i></div><span class="category-budget-copy is-${state.key}">${state.percent}% · ${money(spent)} de ${money(category.budget)}</span></div>` : '';
        return `<div class="category"><div class="category-info"><i class="dot" style="background:${escapeHtml(category.color)}"></i>${escapeHtml(category.name)}</div><div class="category-total">${money(spent)}</div>${budgetBlock}</div>`;
    }).join('');
    renderBudgetBanner(byCat);
    renderCategoryTable(aggregates);

    const categoryChart = $('categoryChart');
    const categoryChartTotal = $('categoryChartTotal');
    const chartTooltip = $('chartTooltip');
    const categoryChartPanel = $('categoryChartPanel');
    if (categoryChart && categoryChartTotal) {
        const categoryValues = categories.map(category => ({ name: category.name, color: category.color, value: byCat[category.name] || 0 })).filter(item => item.value > 0);
        const chartTotal = categoryValues.reduce((sum, item) => sum + item.value, 0);
        categoryChartTotal.textContent = chartTotal > 0 ? money(chartTotal) : '$ 0';
        categoryChart.dataset.values = JSON.stringify(categoryValues);
        if (chartTotal > 0) {
            let current = 0;
            const gradient = categoryValues.map(({ color, value }) => {
                const start = current;
                const end = current + (value / chartTotal) * 360;
                current = end;
                return `${color} ${start}deg ${end}deg`;
            }).join(', ');
            categoryChart.style.background = `conic-gradient(${gradient})`;
        } else {
            categoryChart.style.background = 'conic-gradient(#dfe4dc 0deg 360deg)';
            if (chartTooltip) chartTooltip.textContent = 'Sin datos';
        }
    }
    if (categoryChartPanel && $('toggleCategoryChart')) {
        const toggleButton = $('toggleCategoryChart');
        toggleButton.onclick = () => {
            const isHidden = categoryChartPanel.classList.toggle('hidden');
            toggleButton.textContent = isHidden ? 'Mostrar pastel' : 'Ocultar pastel';
            toggleButton.setAttribute('aria-pressed', String(!isHidden));
        };
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
                chartTooltip.textContent = `${match.name}: ${money(match.value)} (${pct.toFixed(0)}%)`;
            }
        };
        categoryChart.onmouseleave = () => {
            if (chartTooltip) chartTooltip.textContent = 'Sin datos';
        };
    }

    const buckets = Array.from({ length: 6 }, () => 0);
    filtered.forEach(payment => {
        const day = new Date(payment.date).getDate();
        if (Number.isNaN(day)) return;
        const index = Math.min(5, Math.max(0, Math.floor((day - 1) / 5)));
        buckets[index] += Number(payment.amount);
    });
    const max = Math.max(...buckets, 1);
    $('chart').innerHTML = buckets.map((value, index) => `<div class="bar-wrap"><div class="bar ${index === 5 ? 'current' : ''}" style="height:${Math.max(4, value / max * 130)}px" title="${money(value)}"></div><span>${index * 5 + 1}-${Math.min(index * 5 + 5, 31)}</span></div>`).join('');
    syncFilterCategoryOptions();
    renderRecentPayments();
    renderBalance(aggregates);
    renderNotifications();
    renderReports();
    if (document.getElementById('simulatorIncome')) {
        updateSimulator();
    }
}
function renderCategoryTable(aggregates) {
    const categoryList = $('categoryList');
    if (!categoryList) return;
    const totals = aggregates ? aggregates.byCategory : new Map();
    categoryList.innerHTML = categories.map(category => {
        const stats = totals.get(category.name) || { count: 0, total: 0 };
        const color = escapeHtml(category.color);
        const budget = Number(category.budget) || 0;
        let budgetCell = '<span class="budget-none">—</span>';
        if (budget > 0) {
            const monthKey = currentMonth();
            const monthSpent = payments
                .filter(payment => payment.category === category.name && String(payment.date || '').startsWith(monthKey))
                .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            const state = categoryBudgetState(monthSpent, budget);
            budgetCell = `<span class="budget-cell"><strong>${money(budget)}</strong><em class="is-${state.key}">${state.percent}%</em></span>`;
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
// ---------- Reportes ----------
let reportRange = { from:'', to:'', preset:'quarter' };

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
    const list = payments.filter(payment => (!range.from || payment.date >= range.from) && (!range.to || payment.date <= range.to));
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
        : '<p class="report-note">Sin movimientos en el rango seleccionado.</p>';

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
}
function downloadCsv(filename, rows) {
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
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
function importData(text) {
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
        populateMonths();
        render();
    }
    alert(imported
        ? `Importación lista: ${imported} pago${imported === 1 ? '' : 's'} añadido${imported === 1 ? '' : 's'}${createdCategories ? ` y ${createdCategories} categoría${createdCategories === 1 ? '' : 's'} nueva${createdCategories === 1 ? '' : 's'}` : ''}.${skipped ? ` ${skipped} fila${skipped === 1 ? '' : 's'} omitida${skipped === 1 ? '' : 's'} (vacía o duplicada).` : ''}`
        : 'No se importó ningún pago: revisa que el archivo sea un CSV con las columnas Concepto, Categoría, Fecha, Estado e Importe.');
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
            const exists = payments.some(payment =>
                payment.name === seed.name &&
                String(payment.category || '') === String(seed.category || '') &&
                String(payment.date || '').slice(0, 7) === next.slice(0, 7));
            date = next;
            if (exists) continue;
            const clone = { name: seed.name, category: seed.category, amount: Number(seed.amount) || 0, date: next, status: 'pendiente', recurring: true };
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
    if (created) {
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
const userCollection = name => {
    if (!db || !currentUser) return null;
    return db.collection('users').doc(currentUser.uid).collection(name);
};
populateMonths();
if ($('pageSizeSelect')) $('pageSizeSelect').value = String(paymentFilters.pageSize || 5);
$('monthFilter').value = new Date().toISOString().slice(0,7);
$('todayLabel').textContent = new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
$('addBtn').onclick = () => {
    $('paymentForm').reset();
    $('paymentForm').elements.date.value = new Date().toISOString().slice(0,10);
    setPaymentFormCategoryOptions();
    openModal('paymentModal');
};
$('exportBtn').onclick = exportData;
$('reportsNav').onclick = () => {
    showView('reportsView');
    setActiveNav('reportsNav');
    renderReports();
};
$('reportPrintBtn').onclick = () => window.print();
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
$('importNav').onclick = () => openModal('importModal');
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
        importData(String(reader.result || ''));
        event.target.value = '';
        closeModals();
    };
    reader.onerror = () => {
        alert('No fue posible leer el archivo.');
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
    const collection = userCollection('payments');
    try {
        const data = Object.fromEntries(new FormData(e.target));
        const recurring = data.recurring === '1';
        delete data.recurring;
        const payment = { ...data, status:getPaymentStatus(data), amount: parseMoneyInput(data.amount) };
        if (recurring) payment.recurring = true;
        if (!collection) {
            payments.push({ ...payment, id: `local-${Date.now()}` });
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
        } else {
            const ref = await collection.add(payment);
            payments.push({ ...payment, id: ref.id });
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
        }
        populateMonths();
        $('monthFilter').value = payment.date.slice(0,7);
        paymentFilters.page = 1;
        render();
        closeModals();
        syncRecurringPayments();
    } catch (error) {
        alert('No fue posible guardar el pago.');
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
    const collection = userCollection('categories');
    const payload = { name, color, budget };
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
        alert('No fue posible eliminar la categoría.');
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
        if (!updated) { payButton.disabled = false; alert('No fue posible actualizar el pago.'); }
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
    const id = e.target.dataset.delete;
    if (id) {
        const collection = userCollection('payments');
        try {
            if (collection) await collection.doc(id).delete();
            payments = payments.filter(payment => payment.id !== id);
            localStorage.setItem('cartera_payments', JSON.stringify(payments));
            populateMonths();
            paymentFilters.page = 1;
            render();
        } catch (error) {
            alert('No fue posible eliminar el pago.');
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
        alert('No fue posible actualizar el estado del pago.');
    }
};
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
            alert('No fue posible eliminar todos los pagos.');
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
const APP_VIEWS = ['summaryView', 'simulatorView', 'savingsView', 'balanceView', 'categoriesView', 'reportsView'];
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
$('summaryNav').onclick = () => {
    showView('summaryView');
    setActiveNav('summaryNav');
};
$('simulatorNav').onclick = () => {
    showView('simulatorView');
    setActiveNav('simulatorNav');
    updateSimulator();
    if (localStorage.getItem(simTourKey) !== 'done') setTimeout(simTourStart, 400);
};
$('savingsNav').onclick = () => {
    showView('savingsView');
    setActiveNav('savingsNav');
    updateSavingsSimulator();
    if (localStorage.getItem(savingsTourKey) !== 'done') setTimeout(savingsTourStart, 400);
};
$('simulatorToSavings').onclick = (event) => {
    event.preventDefault();
    showView('savingsView');
    setActiveNav('savingsNav');
    updateSavingsSimulator();
};
$('categoriesNav').onclick = () => {
    showView('categoriesView');
    setActiveNav('categoriesNav');
};
$('balanceNav').onclick = () => {
    showView('balanceView');
    setActiveNav('balanceNav');
    renderBalance();
};
$('balanceExportBtn').onclick = exportData;
$('manageBtn').onclick = () => {
    showView('categoriesView');
    setActiveNav('categoriesNav');
};
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
setTheme(localStorage.getItem('cartera_theme') === 'dark');
$('categoryForm').elements.color.value = freeFormColor();
renderColorPalette();
render();
syncRecurringPayments();

