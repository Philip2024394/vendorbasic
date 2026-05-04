import React, { useState, useEffect, useCallback } from 'react'

/* ─── Delivery Zones ─── */
const DELIVERY_ZONES = [
  { name: 'Free (0-2km)', radius: 2, fee: 0 },
  { name: '2-5km', radius: 5, fee: 5000 },
  { name: '5-10km', radius: 10, fee: 8000 },
  { name: '10-15km', radius: 15, fee: 12000 },
]

/* ─── Demo Menu ─── */
const DEMO_MENU = [
  { id: 1, name: 'Nasi Goreng', price: 15000, photo: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=300', desc: 'Fried rice with egg, vegetables, and kecap manis', available: true },
  { id: 2, name: 'Sate Ayam', price: 18000, photo: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300', desc: 'Grilled chicken skewers with peanut sauce', available: true },
  { id: 3, name: 'Bakso', price: 12000, photo: 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=300', desc: 'Meatball soup with noodles and vegetables', available: true },
  { id: 4, name: 'Mie Goreng', price: 13000, photo: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300', desc: 'Stir-fried noodles with vegetables and egg', available: true },
  { id: 5, name: 'Ayam Geprek', price: 20000, photo: 'https://images.unsplash.com/photo-1562967916-eb82221dfb92?w=300', desc: 'Crispy smashed chicken with sambal', available: true },
  { id: 6, name: 'Es Teh Manis', price: 5000, photo: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300', desc: 'Sweet iced tea', available: true },
  { id: 7, name: 'Es Jeruk', price: 7000, photo: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300', desc: 'Fresh orange juice', available: true },
  { id: 8, name: 'Gorengan', price: 5000, photo: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=300', desc: 'Assorted fried snacks — tempe, tahu, bakwan', available: true },
]

/* ─── Helpers ─── */
const fmt = (n) => 'Rp ' + n.toLocaleString('id-ID')

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

/* ─── GPS distance (Haversine) ─── */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* Yogyakarta center as default shop location */
const SHOP_LAT = -7.7956
const SHOP_LON = 110.3695

function getDeliveryFee(distKm) {
  for (let i = DELIVERY_ZONES.length - 1; i >= 0; i--) {
    if (distKm <= DELIVERY_ZONES[i].radius) {
      return DELIVERY_ZONES[i]
    }
  }
  return DELIVERY_ZONES[DELIVERY_ZONES.length - 1]
}

/* ─── Styles ─── */
const S = {
  page: { background: '#0a0a0a', minHeight: '100vh', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', fontSize: 14, paddingBottom: 80 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', position: 'relative' },
  shopLogo: { width: 44, height: 44, borderRadius: 12, objectFit: 'cover', marginRight: 12 },
  shopName: { fontSize: 20, fontWeight: 700, flex: 1 },
  gearBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  vendorBar: { background: 'linear-gradient(135deg,#2d7a0e,#8DC63F)', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 },
  card: { background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, margin: '8px 12px', padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' },
  cardImg: { width: 80, height: 80, borderRadius: 12, objectFit: 'cover', flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: 600, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6, lineHeight: 1.4 },
  cardPrice: { fontSize: 16, fontWeight: 700, color: '#FACC15' },
  addBtn: { position: 'absolute', right: 12, bottom: 12, width: 36, height: 36, borderRadius: 18, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 22, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stickyCart: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'linear-gradient(135deg,#2d7a0e,#8DC63F)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, minHeight: 56 },
  cartText: { fontSize: 15, fontWeight: 600 },
  checkoutBtn: { background: '#fff', color: '#2d7a0e', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, overflowY: 'auto', display: 'flex', justifyContent: 'center' },
  modal: { background: '#111', borderRadius: 20, maxWidth: 420, width: '100%', margin: '24px 12px', padding: 20, position: 'relative', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' },
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  btnGreen: { width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#8DC63F', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  btnOutline: { width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  closeBtnX: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  unavailable: { opacity: 0.4, filter: 'grayscale(1)' },
  toggle: (on) => ({ width: 48, height: 26, borderRadius: 13, background: on ? '#8DC63F' : 'rgba(255,255,255,0.15)', position: 'relative', cursor: 'pointer', border: 'none', flexShrink: 0, transition: 'background 0.2s' }),
  toggleDot: (on) => ({ position: 'absolute', top: 3, left: on ? 24 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s' }),
  vendorBtns: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  smallBtn: (bg) => ({ padding: '6px 12px', borderRadius: 8, border: 'none', background: bg || 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', minHeight: 36 }),
  fab: { position: 'fixed', bottom: 90, right: 16, width: 56, height: 56, borderRadius: 28, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 28, fontWeight: 700, cursor: 'pointer', zIndex: 90, boxShadow: '0 4px 20px rgba(141,198,63,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  closedBanner: { background: 'rgba(255,0,0,0.15)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 12, margin: '8px 12px', padding: '12px 16px', textAlign: 'center', color: '#ff6b6b', fontSize: 15, fontWeight: 600 },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', margin: '16px 0' },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qtyNum: { fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: 'center' },
  zoneBtn: (active) => ({ flex: 1, padding: '10px 6px', borderRadius: 10, border: active ? '2px solid #8DC63F' : '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(141,198,63,0.15)' : 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer', textAlign: 'center' }),
  payBtn: (active) => ({ flex: 1, padding: '14px', borderRadius: 14, border: active ? '2px solid #8DC63F' : '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(141,198,63,0.15)' : 'transparent', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }),
}

/* ─── Main App ─── */
export default function App() {
  /* --- State --- */
  const [menuItems, setMenuItems] = useState(() => loadJSON('vendorbasic_menu', DEMO_MENU))
  const [cart, setCart] = useState([])
  const [isVendor, setIsVendor] = useState(false)
  const [vendorLogin, setVendorLogin] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [itemModal, setItemModal] = useState(null) // item being viewed
  const [modalQty, setModalQty] = useState(1)
  const [editItem, setEditItem] = useState(null) // item being edited by vendor
  const [addingItem, setAddingItem] = useState(false)
  const [shopConfig, setShopConfig] = useState(false) // show shop config

  /* Shop info */
  const [shopName, setShopName] = useState(() => localStorage.getItem('vendorbasic_shopName') || 'Street Food')
  const [shopLogo, setShopLogo] = useState(() => localStorage.getItem('vendorbasic_shopLogo') || '')
  const [shopPhone, setShopPhone] = useState(() => localStorage.getItem('vendorbasic_shopPhone') || '6281234567890')
  const [shopOpen, setShopOpen] = useState(() => loadJSON('vendorbasic_shopOpen', true))

  /* Checkout form */
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custAddress, setCustAddress] = useState('')
  const [payMethod, setPayMethod] = useState('cod')
  const [deliveryZone, setDeliveryZone] = useState(DELIVERY_ZONES[0])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [orderDone, setOrderDone] = useState(false)

  /* Vendor login form */
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')

  /* New / edit item form */
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formPhoto, setFormPhoto] = useState('')
  const [formDesc, setFormDesc] = useState('')

  /* --- Persist menu --- */
  useEffect(() => { saveJSON('vendorbasic_menu', menuItems) }, [menuItems])
  useEffect(() => { localStorage.setItem('vendorbasic_shopName', shopName) }, [shopName])
  useEffect(() => { localStorage.setItem('vendorbasic_shopLogo', shopLogo) }, [shopLogo])
  useEffect(() => { localStorage.setItem('vendorbasic_shopPhone', shopPhone) }, [shopPhone])
  useEffect(() => { saveJSON('vendorbasic_shopOpen', shopOpen) }, [shopOpen])

  /* --- Cart helpers --- */
  const totalItems = cart.reduce((s, c) => s + c.qty, 0)
  const totalPrice = cart.reduce((s, c) => s + c.price * c.qty, 0)

  const addToCart = useCallback((item, qty = 1) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + qty }
        return next
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty }]
    })
  }, [])

  /* --- GPS auto-delivery --- */
  const detectDeliveryZone = useCallback(() => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineKm(SHOP_LAT, SHOP_LON, pos.coords.latitude, pos.coords.longitude)
        setDeliveryZone(getDeliveryFee(dist))
        setGpsLoading(false)
      },
      () => setGpsLoading(false),
      { timeout: 10000 }
    )
  }, [])

  /* --- Vendor login --- */
  const handleVendorLogin = () => {
    const stored = localStorage.getItem('indoo_vendor_pass') || 'vendor123'
    if (loginPass === stored) {
      setIsVendor(true)
      setVendorLogin(false)
      setLoginPass('')
      setLoginError('')
    } else {
      setLoginError('Wrong password')
    }
  }

  /* --- Vendor actions --- */
  const toggleAvailability = (id) => {
    setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, available: !m.available } : m))
  }

  const deleteItem = (id) => {
    setMenuItems((prev) => prev.filter((m) => m.id !== id))
  }

  const startEdit = (item) => {
    setFormName(item.name)
    setFormPrice(String(item.price))
    setFormPhoto(item.photo)
    setFormDesc(item.desc)
    setEditItem(item)
  }

  const saveEdit = () => {
    if (!formName || !formPrice) return
    setMenuItems((prev) =>
      prev.map((m) =>
        m.id === editItem.id ? { ...m, name: formName, price: Number(formPrice), photo: formPhoto, desc: formDesc } : m
      )
    )
    setEditItem(null)
  }

  const startAdd = () => {
    setFormName('')
    setFormPrice('')
    setFormPhoto('')
    setFormDesc('')
    setAddingItem(true)
  }

  const saveAdd = () => {
    if (!formName || !formPrice) return
    const newId = Date.now()
    setMenuItems((prev) => [
      ...prev,
      { id: newId, name: formName, price: Number(formPrice), photo: formPhoto, desc: formDesc, available: true },
    ])
    setAddingItem(false)
  }

  /* --- WhatsApp order --- */
  const sendWhatsApp = () => {
    const lines = [
      `*New Order from Street Food*`,
      ``,
      ...cart.map((c) => `${c.qty}x ${c.name} — ${fmt(c.price * c.qty)}`),
      ``,
      `Subtotal: ${fmt(totalPrice)}`,
      `Delivery: ${fmt(deliveryZone.fee)} (${deliveryZone.name})`,
      `*Total: ${fmt(totalPrice + deliveryZone.fee)}*`,
      ``,
      `Name: ${custName}`,
      `Phone: ${custPhone}`,
      `Address: ${custAddress}`,
      `Payment: ${payMethod === 'cod' ? 'Cash on Delivery' : 'Bank Transfer'}`,
    ]
    const msg = encodeURIComponent(lines.join('\n'))
    const phone = shopPhone.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    setOrderDone(true)
  }

  /* --- Visible menu --- */
  const visibleMenu = isVendor ? menuItems : menuItems.filter((m) => m.available)

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div style={S.page}>
      {/* --- Vendor mode bar --- */}
      {isVendor && (
        <div style={S.vendorBar}>
          <span>Vendor Mode</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.smallBtn('rgba(0,0,0,0.2)'), color: '#fff' }} onClick={() => setShopConfig(true)}>Shop Config</button>
            <button style={{ ...S.smallBtn('rgba(0,0,0,0.3)'), color: '#fff' }} onClick={() => setIsVendor(false)}>Logout</button>
          </div>
        </div>
      )}

      {/* --- Header --- */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {shopLogo && <img src={shopLogo} alt="" style={S.shopLogo} />}
          <span style={S.shopName}>{shopName}</span>
        </div>
        {!isVendor && (
          <button style={S.gearBtn} onClick={() => setVendorLogin(true)} aria-label="Vendor login">
            &#9881;
          </button>
        )}
      </div>

      {/* --- Closed banner --- */}
      {!shopOpen && !isVendor && (
        <div style={S.closedBanner}>This shop is currently closed</div>
      )}

      {/* --- Menu --- */}
      <div style={{ paddingBottom: 12 }}>
        {visibleMenu.map((item) => (
          <div
            key={item.id}
            style={{ ...S.card, ...((!item.available && isVendor) ? S.unavailable : {}) }}
          >
            <img
              src={item.photo || 'https://via.placeholder.com/80'}
              alt={item.name}
              style={S.cardImg}
              onClick={() => { setItemModal(item); setModalQty(1) }}
            />
            <div style={S.cardBody}>
              <div style={S.cardName} onClick={() => { setItemModal(item); setModalQty(1) }}>{item.name}</div>
              <div style={S.cardDesc}>{item.desc}</div>
              <div style={S.cardPrice}>{fmt(item.price)}</div>

              {/* Vendor controls */}
              {isVendor && (
                <div style={S.vendorBtns}>
                  <button style={S.toggle(item.available)} onClick={() => toggleAvailability(item.id)}>
                    <div style={S.toggleDot(item.available)} />
                  </button>
                  <button style={S.smallBtn()} onClick={() => startEdit(item)}>Edit</button>
                  <button style={S.smallBtn('rgba(255,60,60,0.2)')} onClick={() => deleteItem(item.id)}>Delete</button>
                </div>
              )}
            </div>

            {/* Add button (customer) */}
            {!isVendor && shopOpen && item.available && (
              <button style={S.addBtn} onClick={() => addToCart(item)}>+</button>
            )}
          </div>
        ))}

        {visibleMenu.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No items on the menu</div>
        )}
      </div>

      {/* --- FAB add item (vendor) --- */}
      {isVendor && <button style={S.fab} onClick={startAdd}>+</button>}

      {/* --- Sticky Cart Bar --- */}
      {totalItems > 0 && !isVendor && (
        <div style={S.stickyCart}>
          <span style={S.cartText}>{totalItems} item{totalItems > 1 ? 's' : ''} &middot; {fmt(totalPrice)}</span>
          <button style={S.checkoutBtn} onClick={() => { setCheckoutOpen(true); setOrderDone(false); detectDeliveryZone() }}>
            Checkout &rarr;
          </button>
        </div>
      )}

      {/* ═══ ITEM DETAIL MODAL ═══ */}
      {itemModal && (
        <div style={S.overlay} onClick={() => setItemModal(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtnX} onClick={() => setItemModal(null)}>&times;</button>
            <img
              src={itemModal.photo || 'https://via.placeholder.com/300'}
              alt={itemModal.name}
              style={{ width: '100%', borderRadius: 16, marginBottom: 16, maxHeight: 240, objectFit: 'cover' }}
            />
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{itemModal.name}</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>{itemModal.desc}</p>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#FACC15', marginBottom: 8 }}>{fmt(itemModal.price)}</div>

            {/* Quantity selector */}
            <div style={S.qtyRow}>
              <button style={S.qtyBtn} onClick={() => setModalQty(Math.max(1, modalQty - 1))}>-</button>
              <span style={S.qtyNum}>{modalQty}</span>
              <button style={S.qtyBtn} onClick={() => setModalQty(modalQty + 1)}>+</button>
            </div>

            {shopOpen && itemModal.available && (
              <button
                style={S.btnGreen}
                onClick={() => { addToCart(itemModal, modalQty); setItemModal(null) }}
              >
                Add to Cart &middot; {fmt(itemModal.price * modalQty)}
              </button>
            )}
            <button style={S.btnOutline} onClick={() => setItemModal(null)}>Close</button>
          </div>
        </div>
      )}

      {/* ═══ CHECKOUT MODAL ═══ */}
      {checkoutOpen && (
        <div style={S.overlay} onClick={() => setCheckoutOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtnX} onClick={() => setCheckoutOpen(false)}>&times;</button>

            {!orderDone ? (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Checkout</h2>

                {/* Order summary */}
                <div style={{ marginBottom: 16 }}>
                  {cart.map((c) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
                      <span>{c.qty}x {c.name}</span>
                      <span style={{ color: '#FACC15', fontWeight: 600 }}>{fmt(c.price * c.qty)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 10, paddingTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                      <span>Subtotal</span><span>{fmt(totalPrice)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                      <span>Delivery ({deliveryZone.name})</span><span>{fmt(deliveryZone.fee)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, marginTop: 6 }}>
                      <span>Total</span><span style={{ color: '#FACC15' }}>{fmt(totalPrice + deliveryZone.fee)}</span>
                    </div>
                  </div>
                </div>

                {/* Delivery zone picker */}
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'block' }}>
                  Delivery Zone {gpsLoading && '(detecting GPS...)'}
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {DELIVERY_ZONES.map((z) => (
                    <button key={z.radius} style={S.zoneBtn(deliveryZone.radius === z.radius)} onClick={() => setDeliveryZone(z)}>
                      {z.name}<br />{fmt(z.fee)}
                    </button>
                  ))}
                </div>

                {/* Customer info */}
                <input style={S.input} placeholder="Your name" value={custName} onChange={(e) => setCustName(e.target.value)} />
                <input style={S.input} placeholder="Phone number" type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                <input style={S.input} placeholder="Delivery address" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} />

                {/* Payment */}
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'block' }}>Payment Method</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <button style={S.payBtn(payMethod === 'cod')} onClick={() => setPayMethod('cod')}>Cash on Delivery</button>
                  <button style={S.payBtn(payMethod === 'transfer')} onClick={() => setPayMethod('transfer')}>Bank Transfer</button>
                </div>

                <button
                  style={{ ...S.btnGreen, opacity: (custName && custPhone && custAddress) ? 1 : 0.4 }}
                  disabled={!custName || !custPhone || !custAddress}
                  onClick={sendWhatsApp}
                >
                  Place Order via WhatsApp
                </button>
              </>
            ) : (
              /* --- Order Confirmation --- */
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Order Sent!</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>
                  Your order has been sent via WhatsApp.<br />The vendor will confirm shortly.
                </p>
                <button style={S.btnGreen} onClick={() => { setCheckoutOpen(false); setCart([]); setOrderDone(false) }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ VENDOR LOGIN MODAL ═══ */}
      {vendorLogin && (
        <div style={S.overlay} onClick={() => setVendorLogin(false)}>
          <div style={{ ...S.modal, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtnX} onClick={() => setVendorLogin(false)}>&times;</button>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Vendor Login</h2>
            <input
              style={S.input}
              type="password"
              placeholder="Password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVendorLogin()}
            />
            {loginError && <div style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 8 }}>{loginError}</div>}
            <button style={S.btnGreen} onClick={handleVendorLogin}>Login</button>
          </div>
        </div>
      )}

      {/* ═══ VENDOR EDIT ITEM MODAL ═══ */}
      {editItem && (
        <div style={S.overlay} onClick={() => setEditItem(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtnX} onClick={() => setEditItem(null)}>&times;</button>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Edit Item</h2>
            <input style={S.input} placeholder="Name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            <input style={S.input} placeholder="Price (number)" type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} />
            <input style={S.input} placeholder="Photo URL" value={formPhoto} onChange={(e) => setFormPhoto(e.target.value)} />
            <input style={S.input} placeholder="Description" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            <button style={S.btnGreen} onClick={saveEdit}>Save Changes</button>
            <button style={S.btnOutline} onClick={() => setEditItem(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ═══ VENDOR ADD ITEM MODAL ═══ */}
      {addingItem && (
        <div style={S.overlay} onClick={() => setAddingItem(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtnX} onClick={() => setAddingItem(false)}>&times;</button>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Add Item</h2>
            <input style={S.input} placeholder="Name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            <input style={S.input} placeholder="Price (number)" type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} />
            <input style={S.input} placeholder="Photo URL" value={formPhoto} onChange={(e) => setFormPhoto(e.target.value)} />
            <input style={S.input} placeholder="Description" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            <button style={S.btnGreen} onClick={saveAdd}>Add to Menu</button>
            <button style={S.btnOutline} onClick={() => setAddingItem(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ═══ SHOP CONFIG MODAL ═══ */}
      {shopConfig && (
        <div style={S.overlay} onClick={() => setShopConfig(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtnX} onClick={() => setShopConfig(false)}>&times;</button>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Shop Settings</h2>
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Shop Name</label>
            <input style={S.input} value={shopName} onChange={(e) => setShopName(e.target.value)} />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Logo URL</label>
            <input style={S.input} value={shopLogo} onChange={(e) => setShopLogo(e.target.value)} />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>WhatsApp Number (with country code)</label>
            <input style={S.input} value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Shop Status</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button style={S.toggle(shopOpen)} onClick={() => setShopOpen(!shopOpen)}>
                <div style={S.toggleDot(shopOpen)} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{shopOpen ? 'Open' : 'Closed'}</span>
            </div>
            <button style={S.btnGreen} onClick={() => setShopConfig(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
