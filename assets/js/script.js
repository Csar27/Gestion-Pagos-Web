const defaultCategories = [{name:'Vivienda',color:'#ff856c'},{name:'Alimentos',color:'#88c9ed'},{name:'Transporte',color:'#c7f36b'},{name:'Ocio',color:'#d5a6e8'}];
function hydrateLocalData() {
    try {
        const savedCategories = JSON.parse(localStorage.getItem('cartera_categories') || 'null');
        if (savedCategories && Array.isArray(savedCategories) && savedCategories.length) {
            categories = savedCategories;
        }
        const savedPayments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
        if (Array.isArray(savedPayments)) {
            payments = savedPayments;
        }
    } catch (error) {
        console.warn('No se pudieron cargar los datos guardados localmente.', error);
    }
}
let categories = JSON.parse(localStorage.getItem('cartera_categories') || 'null') || defaultCategories;
let payments = JSON.parse(localStorage.getItem('cartera_payments') || '[]');
hydrateLocalData();
let paymentFilters = { from:'', to:'', category:'', page:1, pageSize: Number(localStorage.getItem('cartera_page_size') || 5) };
const PAGE_SIZE = paymentFilters.pageSize || 5;
const palettes = {
    forest: { '--lime':'#c7f36b', '--blue':'#88c9ed', '--orange':'#ff856c', '--pink':'#f5ca72' },
    ocean: { '--lime':'#a7f3d0', '--blue':'#60a5fa', '--orange':'#7dd3fc', '--pink':'#d8b4fe' },
    violet: { '--lime':'#d8b4fe', '--blue':'#c084fc', '--orange':'#f9a8d4', '--pink':'#f5d0fe' },
    sunset: { '--lime':'#fbbf24', '--blue':'#fca5a5', '--orange':'#fb7185', '--pink':'#fdba74' }
};
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
    payments = paymentsSnapshot.docs.map(doc => ({id:doc.id, ...doc.data()}));
    localStorage.setItem('cartera_payments', JSON.stringify(payments));
    localStorage.setItem('cartera_categories', JSON.stringify(categories));
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
        <tr>
            <td style="font-weight:700; color:var(--muted);">${rowNumber}</td>
            <td>${escapeHtml(payment.name)}</td>
            <td><span class="cat"><i class="dot" style="background:${(categories.find(category => category.name === payment.category) || {}).color || '#aaa'}"></i>${escapeHtml(payment.category)}</span></td>
            <td class="date">${new Date(payment.date + 'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}</td>
            <td style="text-align:right;font-weight:800">${money(payment.amount)}</td>
            <td><button class="row-actions" data-delete="${payment.id}" title="Eliminar">×</button></td>
        </tr>
    `;
    }).join('');
    $('emptyState').classList.add('hidden');
    $('payments').parentElement.classList.remove('hidden');

    if (document.getElementById('simulatorWeekSpend')) {
        updateSimulator();
    }
}
function render() {
    const month = currentMonth();
    const filtered = payments.filter(payment => payment.date.startsWith(month));
    const total = filtered.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const byCat = {};
    filtered.forEach(payment => {
        byCat[payment.category] = (byCat[payment.category] || 0) + Number(payment.amount);
    });
    $('monthTotal').innerHTML = `${money(total)} <small>COP</small>`;
    $('monthDelta').textContent = `${filtered.length} pago${filtered.length === 1 ? '' : 's'}`;
    $('dailyAverage').textContent = money(total / new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0).getDate());
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    $('topCategory').textContent = top ? top[0] : '—';
    $('categories').innerHTML = categories.map(category => `<div class="category"><div class="category-info"><i class="dot" style="background:${category.color}"></i>${escapeHtml(category.name)}</div><div class="category-total">${money(byCat[category.name] || 0)}</div></div>`).join('');
    $('categoryList').innerHTML = categories.map(category => `<div class="category"><div class="category-info"><i class="dot" style="background:${category.color}"></i>${escapeHtml(category.name)}</div><button type="button" class="category-delete" data-category-id="${category.id}" title="Eliminar categoría">×</button></div>`).join('');

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

    const max = Math.max(...Array.from({length:6}, (_, index) => filtered.filter(payment => {
        const day = new Date(payment.date).getDate();
        return day >= index * 5 + 1 && day <= index * 5 + 5;
    }).reduce((sum, payment) => sum + Number(payment.amount), 0)), 1);
    $('chart').innerHTML = Array.from({length: 6}, (_, index) => {
        const value = filtered.filter(payment => {
            const day = new Date(payment.date).getDate();
            return day >= index * 5 + 1 && day <= index * 5 + 5;
        }).reduce((sum, payment) => sum + Number(payment.amount), 0);
        return `<div class="bar-wrap"><div class="bar ${index === 5 ? 'current' : ''}" style="height:${Math.max(4, value / max * 130)}px" title="${money(value)}"></div><span>${index * 5 + 1}-${Math.min(index * 5 + 5, 31)}</span></div>`;
    }).join('');
    syncFilterCategoryOptions();
    renderRecentPayments();
    if (document.getElementById('simulatorWeekSpend')) {
        updateSimulator();
    }
}
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function populateMonths() {
    const months = [...new Set([new Date().toISOString().slice(0,7), ...payments.map(payment => payment.date.slice(0,7))])].sort().reverse();
    $('monthFilter').innerHTML = months.map(month => `<option value="${month}">${new Date(month + '-02').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</option>`).join('');
}
function openModal(id) { $(id).classList.add('open'); }
function closeModals() { document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.remove('open')); }
function exportData() {
    const csv = ['Concepto,Categoria,Fecha,Importe', ...payments.map(payment => [payment.name, payment.category, payment.date, payment.amount].map(value => '"' + String(value).replaceAll('"', '""') + '"').join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'cartera-pagos.csv';
    link.click();
    URL.revokeObjectURL(link.href);
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
function buildBudgetRecommendation(income, weeklySpend, savingsGoal) {
    const monthIncome = Number(income) || 0;
    const weekSpend = Number(weeklySpend) || 0;
    const targetSavings = Number(savingsGoal) || 0;
    const monthlyLeft = Math.max(0, monthIncome - targetSavings);
    const allowedSpend = monthlyLeft / 4.33;
    const delta = allowedSpend - weekSpend;

    let advice = 'Estás dentro del plan.';
    if (monthIncome <= 0) {
        advice = 'Ingresa un ingreso mensual válido.';
    } else if (delta >= 0) {
        advice = 'Puedes gastar este monto y todavía cumplir tu meta de ahorro.';
    } else {
        advice = 'Debes reducir este gasto para cumplir tu meta de ahorro.';
    }

    return {
        allowedSpend,
        delta,
        advice,
        summary: monthIncome <= 0 ? 'No se puede simular con un ingreso de cero.' : delta >= 0 ? `Tienes margen para gastar ${money(delta)} más esta semana sin afectar tu ahorro.` : `Te faltan ${money(Math.abs(delta))} para mantener tu meta de ahorro.`
    };
}
function updateSimulator() {
    const incomeInput = $('simulatorIncome');
    const weeklySpendInput = $('simulatorWeekSpend');
    const savingsGoalInput = $('simulatorSavingsGoal');
    const income = parseMoneyInput(incomeInput.value);
    const actualWeekSpend = getCurrentWeekSpend();
    const currentManualValue = parseMoneyInput(weeklySpendInput.value);
    const isWeekEmpty = !weeklySpendInput.value || weeklySpendInput.value.trim() === '';
    const shouldUseCurrentWeek = isWeekEmpty || (currentManualValue === 0 && actualWeekSpend > 0);
    const savingsGoal = parseMoneyInput(savingsGoalInput.value);

    if (shouldUseCurrentWeek) {
        weeklySpendInput.value = formatMoneyInput(actualWeekSpend);
    }

    const weeklySpend = parseMoneyInput(weeklySpendInput.value || actualWeekSpend);
    const result = buildBudgetRecommendation(income, weeklySpend, savingsGoal);

    $('simulatorSpendLimit').textContent = money(result.allowedSpend);
    $('simulatorActualSpend').textContent = money(weeklySpend);
    $('simulatorWeekCount').textContent = `${getCurrentWeekPayments().length} pago${getCurrentWeekPayments().length === 1 ? '' : 's'}`;
    $('simulatorTargetSave').textContent = money(savingsGoal);
    $('simulatorAdvice').textContent = result.advice;
    $('simulatorSummary').textContent = result.summary;
}
function applyPalette(name) {
    const config = palettes[name] || palettes.forest;
    Object.entries(config).forEach(([property, value]) => document.documentElement.style.setProperty(property, value));
    document.body.dataset.palette = name;
    localStorage.setItem('cartera_palette', name);
    document.querySelectorAll('.palette-swatch').forEach(button => button.classList.toggle('is-active', button.dataset.palette === name));
}
function setTheme(dark) {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('cartera_theme', dark ? 'dark' : 'light');
    const themeIcon = $('themeIcon');
    const themeLabel = $('themeLabel');
    if (themeIcon) themeIcon.textContent = dark ? '☀' : '☾';
    if (themeLabel) themeLabel.textContent = dark ? 'Tema oscuro' : 'Tema claro';
    if (document.getElementById('simulatorWeekSpend')) updateSimulator();
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
$('manageBtn').onclick = () => openModal('categoryModal');
$('categoriesNav').onclick = () => openModal('categoryModal');
$('exportBtn').onclick = exportData;
$('exportNav').onclick = exportData;
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
function resetFilters() {
    paymentFilters = { from:'', to:'', category:'', page:1, pageSize: Number(localStorage.getItem('cartera_page_size') || 5) };
    $('filterDateFrom').value = '';
    $('filterDateTo').value = '';
    $('filterCategory').selectedIndex = 0;
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
        const payment = { ...data, amount: parseMoneyInput(data.amount) };
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
    } catch (error) {
        alert('No fue posible guardar el pago.');
    }
};
$('categoryForm').onsubmit = async e => {
    e.preventDefault();
    const collection = userCollection('categories');
    try {
        const data = Object.fromEntries(new FormData(e.target));
        if (categories.some(category => category.name.toLowerCase() === data.name.toLowerCase())) {
            e.target.reset();
            return;
        }
        if (!collection) {
            const newCategory = { ...data, id: `local-${Date.now()}` };
            categories.push(newCategory);
            localStorage.setItem('cartera_categories', JSON.stringify(categories));
        } else {
            const ref = await collection.add(data);
            categories.push({ ...data, id: ref.id });
            localStorage.setItem('cartera_categories', JSON.stringify(categories));
        }
        render();
        e.target.reset();
    } catch (error) {
        alert('No fue posible guardar la categoría.');
    }
};
$('categoryList').onclick = async e => {
    const id = e.target.dataset.categoryId;
    if (id && confirm('¿Eliminar esta categoría?')) {
        const collection = userCollection('categories');
        try {
            if (collection) await collection.doc(id).delete();
            categories = categories.filter(category => category.id !== id);
            localStorage.setItem('cartera_categories', JSON.stringify(categories));
            render();
        } catch (error) {
            alert('No fue posible eliminar la categoría.');
        }
    }
};
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
$('simulateBtn').onclick = updateSimulator;
setTheme(localStorage.getItem('cartera_theme') === 'dark');
function setActiveNav(buttonId) {
    document.querySelectorAll('nav button').forEach(button => {
        button.classList.toggle('active', button.id === buttonId);
    });
}
function toggleSimulatorView(showSimulator) {
    const simulatorSection = $('simulatorSection');
    if (!simulatorSection) return;
    simulatorSection.classList.toggle('hidden', !showSimulator);
    simulatorSection.style.display = showSimulator ? 'block' : 'none';
    simulatorSection.hidden = !showSimulator;
}
window.setActiveNav = setActiveNav;
window.toggleSimulatorView = toggleSimulatorView;
$('summaryNav').onclick = () => {
    toggleSimulatorView(false);
    setActiveNav('summaryNav');
};
$('simulatorNav').onclick = () => {
    toggleSimulatorView(true);
    setActiveNav('simulatorNav');
};
toggleSimulatorView(false);
setActiveNav('summaryNav');
document.querySelectorAll('[data-currency-input]').forEach(input => {
    input.addEventListener('input', () => {
        const formatted = formatMoneyInput(input.value);
        input.value = formatted;
    });
});
$('simulatorIncome').value = '';
$('simulatorWeekSpend').value = formatMoneyInput(getCurrentWeekSpend());
$('simulatorSavingsGoal').value = '';
updateSimulator();
document.querySelectorAll('.palette-swatch').forEach(button => {
    button.onclick = () => applyPalette(button.dataset.palette);
});
const savedPalette = localStorage.getItem('cartera_palette') || 'forest';
applyPalette(savedPalette);
setTheme(localStorage.getItem('cartera_theme') === 'dark');
render();

