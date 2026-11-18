// frontend

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');

//saved in localStorage
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const state = {
  token: load('qm_token'),        // customer session
  user: load('qm_user'),
  adminToken: load('qm_admin'),   // staff session
  cart: load('qm_cart') || [],    // [{ product_id, name, price, category_id, quantity }]
  filter: { q: '', category: '' },
  adminTab: 'orders',
};


const ICONS = { 1: '📱', 2: '💻', 3: '🎧', 4: '🏠', 5: '🔌' };
const icon = (categoryId) => ICONS[categoryId] || '📦';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
const money = (n) => Number(n).toLocaleString('ru-RU') + ' ₸';
const date = (d) => new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pill = (status) => `<span class="pill st-${esc(status)}">${esc(String(status).replace('_', ' '))}</span>`;
const stars = (r) => (r ? `<span class="stars">★ ${r}</span>` : '');

function stockText(available) {
  if (available <= 0) return '<span class="stock-out">Out of stock</span>';
  if (available <= 3) return `<span class="stock-low">Only ${available} left</span>`;
  return `<span class="stock-ok">In stock: ${available}</span>`;
}

let toastTimer;
function toast(message, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3500);
}

// call our API; throws an Error with the server message if something is wrong
async function api(path, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = admin ? state.adminToken : state.token;
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (admin) { state.adminToken = null; save('qm_admin', null); }
    else if (state.token) { logout(false); }
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

//cart 
function saveCart() { save('qm_cart', state.cart); renderNav(); }
const cartCount = () => state.cart.reduce((s, i) => s + i.quantity, 0);
const cartTotal = () => state.cart.reduce((s, i) => s + i.price * i.quantity, 0);

function addToCart(p, quantity = 1) {
  const item = state.cart.find((i) => i.product_id === p.product_id);
  const already = item ? item.quantity : 0;
  if (already + quantity > p.available) {
    toast(`Sorry, only ${p.available} available`, true);
    return;
  }
  if (item) item.quantity += quantity;
  else state.cart.push({ product_id: p.product_id, name: p.name, price: p.price, category_id: p.category_id, quantity, available: p.available });
  saveCart();
  toast(`Added to cart: ${p.name}`);
}

// auth 
function setCustomer(token, user) {
  state.token = token; state.user = user;
  save('qm_token', token); save('qm_user', user);
}
function logout(redirect = true) {
  state.token = null; state.user = null;
  save('qm_token', null); save('qm_user', null);
  renderNav();
  if (redirect) location.hash = '#/';
}

//navigation bar 
function renderNav() {
  const h = location.hash || '#/';
  const link = (href, text) => `<a href="${href}" class="${h === href ? 'active' : ''}">${text}</a>`;
  const count = cartCount();
  $nav.innerHTML = [
    link('#/', 'Catalog'),
    link('#/cart', `Cart${count ? `<span class="badge">${count}</span>` : ''}`),
    state.user ? link('#/orders', 'My orders') : '',
    state.user ? link('#/support', 'Support') : '',
    link('#/admin', 'Staff'),
    state.user
      ? `<span class="nav-user">${esc(state.user.full_name.split(' ')[0])}</span><a href="#" id="logout">Log out</a>`
      : link('#/login', 'Log in'),
  ].join('');
  const out = document.getElementById('logout');
  if (out) out.onclick = (e) => { e.preventDefault(); logout(); toast('You are logged out'); };
}

// PAGES


// Catalog 
let categoriesCache = null;

async function pageCatalog() {
  if (!categoriesCache) categoriesCache = await api('/products/categories');
  $app.innerHTML = `
    <h1>Catalog</h1>
    <div class="toolbar">
      <input id="search" placeholder="Search products…" value="${esc(state.filter.q)}">
    </div>
    <div class="chips" id="chips">
      <button class="chip ${state.filter.category === '' ? 'active' : ''}" data-cat="">All</button>
      ${categoriesCache.map((c) => `<button class="chip ${String(state.filter.category) === String(c.category_id) ? 'active' : ''}" data-cat="${c.category_id}">${icon(c.category_id)} ${esc(c.name)}</button>`).join('')}
    </div>
    <div id="products" class="grid"></div>`;

  let typingTimer;
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { state.filter.q = e.target.value.trim(); loadProducts(); }, 300);
  });
  document.getElementById('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.filter.category = chip.dataset.cat;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    loadProducts();
  });
  await loadProducts();
}

async function loadProducts() {
  const box = document.getElementById('products');
  const params = new URLSearchParams();
  if (state.filter.q) params.set('q', state.filter.q);
  if (state.filter.category) params.set('category', state.filter.category);
  const products = await api('/products?' + params);

  if (!products.length) { box.innerHTML = '<div class="empty">Nothing found</div>'; return; }
  box.innerHTML = products.map((p) => `
    <div class="product">
      <a class="thumb c${p.category_id}" href="#/product/${p.product_id}">${icon(p.category_id)}</a>
      <div class="product-body">
        <a class="product-name" href="#/product/${p.product_id}">${esc(p.name)}</a>
        <div class="row"><span class="price">${money(p.price)}</span><span class="spacer"></span>${stars(p.rating)}</div>
        ${stockText(p.available)}
        <button class="btn btn-block" data-id="${p.product_id}" ${p.available <= 0 ? 'disabled' : ''}>
          ${p.available <= 0 ? 'Out of stock' : 'Add to cart'}</button>
      </div>
    </div>`).join('');

  box.onclick = (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    addToCart(products.find((p) => p.product_id === Number(btn.dataset.id)));
  };
}

// Product page 
async function pageProduct(id) {
  const p = await api('/products/' + id);
  let qty = 1;
  $app.innerHTML = `
    <p><a href="#/" class="muted small">← Back to catalog</a></p>
    <div class="product-page">
      <div class="thumb c${p.category_id}">${icon(p.category_id)}</div>
      <div>
        <div class="muted small">${esc(p.category)} · SKU ${esc(p.sku)}</div>
        <h1>${esc(p.name)}</h1>
        <div class="row"><span class="price" style="font-size:26px">${money(p.price)}</span>
          ${p.rating ? `${stars(p.rating)} <span class="muted small">(${p.reviews_count} reviews)</span>` : ''}</div>
        <p>${esc(p.description)}</p>
        <p>${stockText(p.available)}</p>
        <div class="row">
          <div class="qty"><button id="minus">−</button><span id="qty">1</span><button id="plus">+</button></div>
          <button class="btn btn-accent" id="add" ${p.available <= 0 ? 'disabled' : ''}>Add to cart</button>
        </div>
      </div>
    </div>

    <h2>Reviews</h2>
    <div class="card">
      ${p.reviews.length ? p.reviews.map((r) => `
        <div class="review">
          <div class="row"><b>${esc(r.full_name)}</b><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          <span class="spacer"></span><span class="muted small">${date(r.created_at)}</span></div>
          <div>${esc(r.comment || '')}</div>
        </div>`).join('') : '<div class="muted">No reviews yet.</div>'}

      ${state.user ? `
        <h3 style="margin-top:20px">Write a review</h3>
        <p class="muted small">You can review a product after it is delivered to you.</p>
        <div class="row">
          <select id="rating" style="width:auto">
            ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)} ${n}</option>`).join('')}
          </select>
        </div>
        <label for="comment">Comment</label>
        <textarea id="comment" rows="3" placeholder="What do you think about this product?"></textarea>
        <button class="btn" id="sendReview" style="margin-top:10px">Send review</button>` : ''}
    </div>`;

  const qtyEl = document.getElementById('qty');
  document.getElementById('minus').onclick = () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; };
  document.getElementById('plus').onclick = () => { qty = Math.min(Math.max(p.available, 1), qty + 1); qtyEl.textContent = qty; };
  document.getElementById('add').onclick = () => addToCart(p, qty);

  const send = document.getElementById('sendReview');
  if (send) send.onclick = async () => {
    try {
      await api(`/products/${id}/reviews`, { method: 'POST', body: {
        rating: Number(document.getElementById('rating').value),
        comment: document.getElementById('comment').value,
      } });
      toast('Thank you for your review!');
      pageProduct(id);
    } catch (e) { toast(e.message, true); }
  };
}

// Cart 
function pageCart() {
  if (!state.cart.length) {
    $app.innerHTML = `<h1>Cart</h1><div class="card empty">Your cart is empty.<br><br><a class="btn" href="#/">Go to catalog</a></div>`;
    return;
  }
  $app.innerHTML = `
    <h1>Cart</h1>
    <div class="layout-2">
      <div class="card">
        ${state.cart.map((i, idx) => `
          <div class="cart-item">
            <div class="thumb c${i.category_id}">${icon(i.category_id)}</div>
            <div style="flex:1">
              <a href="#/product/${i.product_id}" class="product-name">${esc(i.name)}</a>
              <div class="muted small">${money(i.price)} each</div>
            </div>
            <div class="qty"><button data-act="minus" data-idx="${idx}">−</button><span>${i.quantity}</span><button data-act="plus" data-idx="${idx}">+</button></div>
            <b style="min-width:110px;text-align:right">${money(i.price * i.quantity)}</b>
            <button class="btn btn-sm btn-light" data-act="remove" data-idx="${idx}">✕</button>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="summary-line"><span>Items</span><span>${cartCount()}</span></div>
        <div class="summary-line"><span>Delivery</span><span>Free</span></div>
        <div class="summary-line summary-total"><span>Total</span><span>${money(cartTotal())}</span></div>
        <a class="btn btn-accent btn-block" href="${state.user ? '#/checkout' : '#/login'}" style="text-align:center;margin-top:12px">
          ${state.user ? 'Go to checkout' : 'Log in to checkout'}</a>
      </div>
    </div>`;

  $app.onclick = (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const item = state.cart[Number(b.dataset.idx)];
    if (b.dataset.act === 'plus') {
      if (item.available && item.quantity >= item.available) return toast(`Only ${item.available} available`, true);
      item.quantity++;
    }
    if (b.dataset.act === 'minus') item.quantity = Math.max(1, item.quantity - 1);
    if (b.dataset.act === 'remove') state.cart.splice(Number(b.dataset.idx), 1);
    saveCart();
    pageCart();
  };
}

// ---------- Checkout ----------
async function pageCheckout() {
  if (!state.user) { location.hash = '#/login'; return; }
  if (!state.cart.length) { location.hash = '#/cart'; return; }
  const me = await api('/auth/me');

  $app.innerHTML = `
    <h1>Checkout</h1>
    <div class="layout-2">
      <div class="card">
        <h3 style="margin-top:0">1. Delivery address</h3>
        ${me.addresses.map((a, i) => `
          <label class="option"><input type="radio" name="address" value="${a.address_id}" ${i === 0 ? 'checked' : ''}>
            ${esc(a.city)}, ${esc(a.street)}${a.apartment ? ', apt ' + esc(a.apartment) : ''}
            ${a.is_default ? '<span class="muted small">(default)</span>' : ''}</label>`).join('')}
        <details><summary class="small" style="cursor:pointer">+ Add another address</summary>
          <div class="form-grid">
            <div><label>City</label><input id="newCity" value="Almaty"></div>
            <div><label>Street, house</label><input id="newStreet"></div>
            <div><label>Apartment</label><input id="newApt"></div>
            <div style="align-self:end"><button class="btn btn-light btn-block" id="addAddress">Save address</button></div>
          </div>
        </details>

        <h3>2. Payment</h3>
        <label class="option"><input type="radio" name="method" value="card" checked> 💳 Bank card</label>
        <label class="option"><input type="radio" name="method" value="qr"> 📲 Kaspi QR</label>
        <label class="option"><input type="radio" name="method" value="cash_on_delivery"> 💵 Cash on delivery</label>
        <div id="cardBox">
          <label for="card">Card number</label>
          <input id="card" inputmode="numeric" placeholder="4400 1234 5678 9012" maxlength="23">
          <div class="hint">Demo payment: any 16 digits are approved. A card ending in <b>0000</b> is declined.</div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Your order</h3>
        ${state.cart.map((i) => `<div class="summary-line"><span>${esc(i.name)} × ${i.quantity}</span><span>${money(i.price * i.quantity)}</span></div>`).join('')}
        <div class="summary-line summary-total"><span>Total</span><span>${money(cartTotal())}</span></div>
        <button class="btn btn-accent btn-block" id="pay" style="margin-top:12px">Place order</button>
        <div class="error" id="err"></div>
        <p class="muted small">Items are reserved for you as soon as the order is placed.</p>
      </div>
    </div>`;

  const cardBox = document.getElementById('cardBox');
  document.querySelectorAll('input[name=method]').forEach((r) =>
    r.addEventListener('change', () => { cardBox.style.display = r.value === 'card' && r.checked ? '' : 'none'; }));

  document.getElementById('addAddress').onclick = async () => {
    try {
      await api('/auth/addresses', { method: 'POST', body: {
        city: document.getElementById('newCity').value,
        street: document.getElementById('newStreet').value,
        apartment: document.getElementById('newApt').value,
      } });
      toast('Address saved');
      pageCheckout();
    } catch (e) { toast(e.message, true); }
  };

  document.getElementById('pay').onclick = async (e) => {
    const btn = e.target;
    const err = document.getElementById('err');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Processing payment…';
    try {
      const result = await api('/orders', { method: 'POST', body: {
        items: state.cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        address_id: Number(document.querySelector('input[name=address]:checked').value),
        method: document.querySelector('input[name=method]:checked').value,
        card_number: document.getElementById('card').value,
      } });
      state.cart = [];
      saveCart();
      toast(`Order #${result.order_id} is placed!`);
      location.hash = '#/orders';
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Place order';
    }
  };
}

// ---------- My orders ----------
const STEPS = ['new', 'paid', 'packed', 'shipped', 'delivered'];

async function pageOrders() {
  if (!state.user) { location.hash = '#/login'; return; }
  const orders = await api('/orders');
  if (!orders.length) {
    $app.innerHTML = `<h1>My orders</h1><div class="card empty">No orders yet.<br><br><a class="btn" href="#/">Start shopping</a></div>`;
    return;
  }
  $app.innerHTML = `<h1>My orders</h1>` + orders.map((o) => {
    const step = STEPS.indexOf(o.status);
    const timeline = ['cancelled', 'returned'].includes(o.status) ? '' :
      `<div class="timeline">${STEPS.map((s, i) => `<div class="${i <= step ? 'done' : ''}">${s}</div>`).join('')}</div>`;
    return `
      <div class="card order">
        <div class="order-head">
          <b>Order #${o.order_id}</b> ${pill(o.status)}
          <span class="muted small">${date(o.order_date)}</span>
          <span class="spacer"></span><b>${money(o.total_amount)}</b>
        </div>
        ${timeline}
        <div class="order-items">
          ${o.items.map((i) => `<div><span>${esc(i.name)} × ${i.quantity}</span><span>${money(i.unit_price * i.quantity)}</span></div>`).join('')}
        </div>
        <p class="muted small">
          Payment: ${esc((o.method || '').replaceAll('_', ' '))} ${o.payment_status ? pill(o.payment_status) : ''} ·
          Address: ${esc(o.city)}, ${esc(o.street)}${o.apartment ? ', apt ' + esc(o.apartment) : ''}
          ${o.tracking_number ? ` · Courier: ${esc(o.courier)}, tracking <b>${esc(o.tracking_number)}</b>` : ''}
        </p>
        <div class="row">
          ${['new', 'paid'].includes(o.status) ? `<button class="btn btn-sm btn-danger" data-cancel="${o.order_id}">Cancel order</button>` : ''}
          ${o.status === 'delivered' ? o.items.map((i) => `<a class="btn btn-sm btn-light" href="#/product/${i.product_id}">Review ${esc(i.name)}</a>`).join('') : ''}
          <a class="btn btn-sm btn-light" href="#/support?order=${o.order_id}">${o.status === 'delivered' ? 'Return / problem' : 'Ask about this order'}</a>
        </div>
      </div>`;
  }).join('');

  $app.onclick = async (e) => {
    const b = e.target.closest('button[data-cancel]');
    if (!b) return;
    try {
      await api(`/orders/${b.dataset.cancel}/cancel`, { method: 'POST' });
      toast('Order cancelled, the money will be returned');
      pageOrders();
    } catch (ex) { toast(ex.message, true); }
  };
}

// ---------- Support ----------
async function pageSupport() {
  if (!state.user) { location.hash = '#/login'; return; }
  const preOrder = new URLSearchParams(location.hash.split('?')[1] || '').get('order') || '';
  const [tickets, orders] = await Promise.all([api('/support'), api('/orders')]);

  $app.innerHTML = `
    <h1>Support</h1>
    <div class="layout-2">
      <div>
        ${tickets.length ? `<div class="table-wrap"><table>
          <tr><th>#</th><th>Type</th><th>Order</th><th>Message</th><th>Status</th></tr>
          ${tickets.map((t) => `<tr>
            <td>${t.ticket_id}</td><td>${esc(t.type)}</td><td>${t.order_id ? '#' + t.order_id : '—'}</td>
            <td>${esc(t.description)}<div class="muted small">${date(t.created_at)}${t.agent ? ' · ' + esc(t.agent) : ''}</div></td>
            <td>${pill(t.status)}</td></tr>`).join('')}
        </table></div>` : '<div class="card empty">You have no requests yet.</div>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">New request</h3>
        <label>Type</label>
        <select id="type">
          <option value="question">Question</option>
          <option value="complaint">Complaint</option>
          <option value="return">Return a product</option>
        </select>
        <label>Order</label>
        <select id="order">
          <option value="">— not about an order —</option>
          ${orders.map((o) => `<option value="${o.order_id}" ${String(o.order_id) === preOrder ? 'selected' : ''}>#${o.order_id} · ${esc(o.status)} · ${money(o.total_amount)}</option>`).join('')}
        </select>
        <label>Message</label>
        <textarea id="desc" rows="4" placeholder="Describe your question or problem"></textarea>
        <button class="btn btn-accent btn-block" id="send" style="margin-top:12px">Send</button>
        <div class="error" id="err"></div>
      </div>
    </div>`;

  document.getElementById('send').onclick = async () => {
    try {
      await api('/support', { method: 'POST', body: {
        type: document.getElementById('type').value,
        order_id: document.getElementById('order').value || null,
        description: document.getElementById('desc').value,
      } });
      toast('Request sent. Our support team will answer soon.');
      location.hash = '#/support';
      pageSupport();
    } catch (e) { document.getElementById('err').textContent = e.message; }
  };
}

// ---------- Log in / Register ----------
function pageLogin() {
  $app.innerHTML = `
    <div class="card form">
      <h1>Log in</h1>
      <label>Email</label><input id="email" type="email" placeholder="demo@qazmarket.kz">
      <label>Password</label><input id="pass" type="password" placeholder="demo1234">
      <button class="btn btn-accent btn-block" id="go" style="margin-top:16px">Log in</button>
      <div class="error" id="err"></div>
      <p class="small">No account? <a href="#/register">Register</a></p>
      <div class="hint">Demo account: <b>demo@qazmarket.kz</b> / <b>demo1234</b></div>
    </div>`;
  const go = async () => {
    try {
      const r = await api('/auth/login', { method: 'POST', body: {
        email: document.getElementById('email').value, password: document.getElementById('pass').value,
      } });
      setCustomer(r.token, r.user);
      toast(`Welcome, ${r.user.full_name}!`);
      location.hash = state.cart.length ? '#/checkout' : '#/';
    } catch (e) { document.getElementById('err').textContent = e.message; }
  };
  document.getElementById('go').onclick = go;
  document.getElementById('pass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

function pageRegister() {
  $app.innerHTML = `
    <div class="card form">
      <h1>Create account</h1>
      <label>Full name *</label><input id="name">
      <div class="form-grid">
        <div><label>Email *</label><input id="email" type="email"></div>
        <div><label>Phone *</label><input id="phone" placeholder="+7 701 000 00 00"></div>
      </div>
      <label>Password * (min 6)</label><input id="pass" type="password">
      <div class="form-grid">
        <div><label>City *</label><input id="city" value="Almaty"></div>
        <div><label>Apartment</label><input id="apt"></div>
      </div>
      <label>Street, house *</label><input id="street">
      <button class="btn btn-accent btn-block" id="go" style="margin-top:16px">Register</button>
      <div class="error" id="err"></div>
      <p class="small">Already have an account? <a href="#/login">Log in</a></p>
    </div>`;
  document.getElementById('go').onclick = async () => {
    const v = (id) => document.getElementById(id).value;
    try {
      const r = await api('/auth/register', { method: 'POST', body: {
        full_name: v('name'), email: v('email'), phone: v('phone'), password: v('pass'),
        city: v('city'), street: v('street'), apartment: v('apt'),
      } });
      setCustomer(r.token, r.user);
      toast('Account created!');
      location.hash = state.cart.length ? '#/checkout' : '#/';
    } catch (e) { document.getElementById('err').textContent = e.message; }
  };
}

// ---------- Staff panel ----------
async function pageAdmin() {
  if (!state.adminToken) {
    $app.innerHTML = `
      <div class="card form">
        <h1>Staff login</h1>
        <p class="muted small">For shop employees: sales, warehouse, support, finance.</p>
        <label>Staff password</label><input id="apass" type="password" placeholder="admin123">
        <button class="btn btn-block" id="go" style="margin-top:16px">Enter</button>
        <div class="error" id="err"></div>
      </div>`;
    const go = async () => {
      try {
        const r = await api('/auth/admin-login', { method: 'POST', body: { password: document.getElementById('apass').value } });
        state.adminToken = r.token; save('qm_admin', r.token);
        pageAdmin();
      } catch (e) { document.getElementById('err').textContent = e.message; }
    };
    document.getElementById('go').onclick = go;
    document.getElementById('apass').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    return;
  }

  const stats = await api('/admin/stats', { admin: true });
  const o = stats.orders;
  const tabs = [['orders', 'Orders'], ['stock', 'Stock & suppliers'], ['tickets', 'Support tickets']];
  $app.innerHTML = `
    <div class="row"><h1 style="margin:0">Staff panel</h1><span class="spacer"></span>
      <button class="btn btn-sm btn-light" id="alogout">Log out</button></div>
    <div class="stats" style="margin-top:16px">
      <div class="stat"><b style="color:var(--blue)">${(o.new || 0) + (o.paid || 0)}</b><span>to pack (new + paid)</span></div>
      <div class="stat"><b style="color:var(--teal)">${(o.packed || 0) + (o.shipped || 0)}</b><span>packed / on the way</span></div>
      <div class="stat"><b style="color:var(--green)">${o.delivered || 0}</b><span>delivered</span></div>
      <div class="stat"><b>${money(stats.revenue)}</b><span>revenue (today ${money(stats.revenue_today)})</span></div>
      <div class="stat"><b style="color:var(--accent)">${stats.low_stock}</b><span>low-stock products</span></div>
      <div class="stat"><b style="color:var(--purple)">${stats.open_tickets}</b><span>open tickets</span></div>
    </div>
    <div class="tabs" style="margin-top:20px">
      ${tabs.map(([k, t]) => `<button class="tab ${state.adminTab === k ? 'active' : ''}" data-tab="${k}">${t}</button>`).join('')}
    </div>
    <div id="adminBody"><div class="loading">Loading…</div></div>`;

  document.getElementById('alogout').onclick = () => { state.adminToken = null; save('qm_admin', null); pageAdmin(); };
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { state.adminTab = b.dataset.tab; pageAdmin(); }));

  const body = document.getElementById('adminBody');
  if (state.adminTab === 'orders') await adminOrders(body);
  if (state.adminTab === 'stock') await adminStock(body);
  if (state.adminTab === 'tickets') await adminTickets(body);
}

const ACTION_TEXT = { packed: 'Mark packed', shipped: 'Ship', delivered: 'Delivered', cancelled: 'Cancel', returned: 'Return' };

async function adminOrders(body) {
  const [orders, partners] = await Promise.all([api('/admin/orders', { admin: true }), api('/admin/delivery-partners', { admin: true })]);
  body.innerHTML = `
    <div class="row" style="margin-bottom:10px">
      <span class="small">Courier for shipping:</span>
      <select id="partner" style="width:auto">${partners.map((p) => `<option value="${p.partner_id}">${esc(p.name)} (~${p.avg_days} d)</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Next step</th></tr>
      ${orders.map((x) => `<tr>
        <td><b>${x.order_id}</b></td>
        <td class="small nowrap">${date(x.order_date).replace(', ', '<br>')}</td>
        <td>${esc(x.customer)}<div class="muted small">${esc(x.phone)} · ${esc(x.city)}, ${esc(x.street)}</div></td>
        <td class="small">${esc(x.items)}${x.tracking_number ? `<div class="muted">Tracking ${esc(x.tracking_number)}</div>` : ''}</td>
        <td class="nowrap"><b>${money(x.total_amount)}</b></td>
        <td class="small">${esc((x.method || '').replaceAll('_', ' '))}<br>${x.payment_status ? pill(x.payment_status) : ''}</td>
        <td>${pill(x.status)}</td>
        <td style="white-space:nowrap">${x.next.map((n) => `<button class="btn btn-sm ${n === 'cancelled' ? 'btn-danger' : ''}" data-order="${x.order_id}" data-to="${n}">${ACTION_TEXT[n]}</button>`).join('') || '<span class="muted small">—</span>'}</td>
      </tr>`).join('')}
    </table></div>`;

  body.onclick = async (e) => {
    const b = e.target.closest('button[data-order]');
    if (!b) return;
    try {
      await api(`/admin/orders/${b.dataset.order}/status`, { method: 'PATCH', admin: true,
        body: { status: b.dataset.to, partner_id: Number(document.getElementById('partner').value) } });
      toast(`Order #${b.dataset.order}: ${b.dataset.to}`);
      pageAdmin();
    } catch (ex) { toast(ex.message, true); }
  };
}

async function adminStock(body) {
  const [stock, pos] = await Promise.all([api('/admin/inventory', { admin: true }), api('/admin/purchase-orders', { admin: true })]);
  body.innerHTML = `
    <p class="muted small">Available = on hand − reserved (reserved = paid orders that have not left the warehouse yet). Orange rows need restocking.</p>
    <div class="table-wrap"><table>
      <tr><th>Product</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Reorder at</th><th>Incoming</th><th>Supplier</th><th>Order from supplier</th></tr>
      ${stock.map((s) => `<tr class="${s.low ? 'low' : ''}">
        <td><b>${esc(s.name)}</b><div class="muted small">${esc(s.sku)}</div></td>
        <td>${s.qty_on_hand}</td><td>${s.qty_reserved}</td>
        <td><b style="color:${s.low ? 'var(--accent)' : 'inherit'}">${s.available}</b></td>
        <td>${s.reorder_level}</td><td>${s.incoming || '—'}</td>
        <td class="small">${esc(s.supplier)}<div class="muted">${s.lead_time_days} days</div></td>
        <td style="white-space:nowrap"><input type="number" min="1" value="${Math.max(s.reorder_level * 3, 10)}" style="width:70px;padding:6px" id="po${s.product_id}">
          <button class="btn btn-sm" data-po="${s.product_id}">Order</button></td>
      </tr>`).join('')}
    </table></div>

    <h2>Purchase orders</h2>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Product</th><th>Supplier</th><th>Qty</th><th>Ordered</th><th>Expected</th><th>Status</th><th></th></tr>
      ${pos.map((p) => `<tr>
        <td>${p.po_id}</td><td>${esc(p.product)}</td><td>${esc(p.supplier)}</td><td>${p.quantity}</td>
        <td class="small">${new Date(p.ordered_at).toLocaleDateString('ru-RU')}</td>
        <td class="small">${p.expected_at ? new Date(p.expected_at).toLocaleDateString('ru-RU') : '—'}</td>
        <td><span class="pill st-${{ received: 'delivered', cancelled: 'cancelled', ordered: 'paid' }[p.status] || 'shipped'}">${esc(p.status)}</span></td>
        <td>${['ordered', 'shipped'].includes(p.status) ? `<button class="btn btn-sm" data-receive="${p.po_id}">Goods received</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No purchase orders</td></tr>'}
    </table></div>`;

  body.onclick = async (e) => {
    const po = e.target.closest('button[data-po]');
    const rc = e.target.closest('button[data-receive]');
    try {
      if (po) {
        const quantity = Number(document.getElementById('po' + po.dataset.po).value);
        await api('/admin/purchase-orders', { method: 'POST', admin: true, body: { product_id: Number(po.dataset.po), quantity } });
        toast('Purchase order sent to supplier');
        pageAdmin();
      }
      if (rc) {
        await api(`/admin/purchase-orders/${rc.dataset.receive}/receive`, { method: 'PATCH', admin: true });
        toast('Stock updated');
        pageAdmin();
      }
    } catch (ex) { toast(ex.message, true); }
  };
}

async function adminTickets(body) {
  const tickets = await api('/admin/tickets', { admin: true });
  body.innerHTML = `
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Customer</th><th>Type</th><th>Order</th><th>Message</th><th>Agent</th><th>Status</th><th>Change</th></tr>
      ${tickets.map((t) => `<tr>
        <td>${t.ticket_id}</td>
        <td>${esc(t.customer)}<div class="muted small">${esc(t.phone)}</div></td>
        <td>${esc(t.type)}</td><td>${t.order_id ? '#' + t.order_id : '—'}</td>
        <td>${esc(t.description)}<div class="muted small">${date(t.created_at)}</div></td>
        <td class="small">${esc(t.agent || '—')}</td>
        <td>${pill(t.status)}</td>
        <td><select data-ticket="${t.ticket_id}" style="width:auto;padding:6px">
          ${['open', 'in_progress', 'resolved', 'closed'].map((s) => `<option ${s === t.status ? 'selected' : ''} value="${s}">${s.replace('_', ' ')}</option>`).join('')}
        </select></td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No tickets</td></tr>'}
    </table></div>`;

  body.onchange = async (e) => {
    const s = e.target.closest('select[data-ticket]');
    if (!s) return;
    try {
      await api(`/admin/tickets/${s.dataset.ticket}`, { method: 'PATCH', admin: true, body: { status: s.value } });
      toast('Ticket updated');
      pageAdmin();
    } catch (ex) { toast(ex.message, true); }
  };
}

// =====================================================================
// ROUTER
// =====================================================================
const routes = [
  [/^#\/?$/, pageCatalog],
  [/^#\/product\/(\d+)$/, pageProduct],
  [/^#\/cart$/, pageCart],
  [/^#\/checkout$/, pageCheckout],
  [/^#\/orders$/, pageOrders],
  [/^#\/support(\?.*)?$/, pageSupport],
  [/^#\/login$/, pageLogin],
  [/^#\/register$/, pageRegister],
  [/^#\/admin$/, pageAdmin],
];

async function router() {
  const hash = location.hash || '#/';
  renderNav();
  $app.onclick = null; // remove click handlers of the previous page
  for (const [pattern, page] of routes) {
    const match = hash.match(pattern);
    if (match) {
      $app.innerHTML = '<div class="loading">Loading…</div>';
      try {
        await page(...match.slice(1));
      } catch (e) {
        $app.innerHTML = `<div class="card empty">${esc(e.message)}<br><br><a class="btn" href="#/">Back to catalog</a></div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', router);
router();
