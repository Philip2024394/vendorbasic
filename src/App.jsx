import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/* ─── Supabase Vendor Service ─── */
async function vendorSignup(phone, password, name) {
  if (!supabase) return { id: 'local-' + Date.now(), slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-') }
  const { data, error } = await supabase.from('vendor_accounts').insert({
    phone: phone.replace(/[^0-9]/g, ''),
    password_hash: password, // In production, hash this
    shop_name: name,
    shop_phone: phone.replace(/[^0-9]/g, ''),
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 30),
  }).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function vendorLogin(phone, password) {
  if (!supabase) return null
  const { data } = await supabase.from('vendor_accounts')
    .select('*')
    .eq('phone', phone.replace(/[^0-9]/g, ''))
    .eq('password_hash', password)
    .single()
  return data || null
}

async function updateVendorConfig(vendorId, config) {
  if (!supabase || !vendorId || String(vendorId).startsWith('local')) return
  await supabase.from('vendor_accounts').update(config).eq('id', vendorId)
}

async function getVendorBySlug(slug) {
  if (!supabase) return null
  const { data } = await supabase.from('vendor_accounts').select('*').eq('slug', slug).single()
  return data
}

async function getVendorMenuItems(vendorId) {
  if (!supabase || !vendorId) return []
  const { data } = await supabase.from('vendor_menu_items').select('*').eq('vendor_id', vendorId).eq('available', true).order('sort_order')
  return data || []
}

async function saveMenuItem(vendorId, item) {
  if (!supabase || !vendorId || String(vendorId).startsWith('local')) return item
  if (item.supabaseId) {
    await supabase.from('vendor_menu_items').update({
      name: item.name, price: item.price, description: item.desc,
      category: item.category, photo_url: item.photo, available: item.available,
    }).eq('id', item.supabaseId)
    return item
  }
  const { data } = await supabase.from('vendor_menu_items').insert({
    vendor_id: vendorId, name: item.name, price: item.price,
    description: item.desc, category: item.category, photo_url: item.photo,
    available: item.available !== false,
  }).select().single()
  return { ...item, supabaseId: data?.id }
}

async function deleteMenuItemSupa(itemId) {
  if (!supabase || !itemId) return
  await supabase.from('vendor_menu_items').delete().eq('id', itemId)
}

async function uploadMenuImage(vendorId, file) {
  if (!supabase) return null
  const ext = 'jpg'
  const path = `vendor-menu/${vendorId}/${Date.now()}.${ext}`
  // Compress first
  const compressed = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const max = 600
        let w = img.width, h = img.height
        if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r) }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(resolve, 'image/jpeg', 0.7)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
  const { error } = await supabase.storage.from('images').upload(path, compressed, { contentType: 'image/jpeg', upsert: false })
  if (error) return null
  const { data } = supabase.storage.from('images').getPublicUrl(path)
  return data?.publicUrl || null
}

/* ─── Estimated Delivery Costs (based on GoJek/Grab rates) ─── */
const DELIVERY_ZONES = [
  { name: 'Pickup', radius: 0, fee: 0, label: 'Pickup / Walk-in' },
  { name: '0-2 km', radius: 2, fee: 0, label: 'FREE' },
  { name: '2-5 km', radius: 5, fee: 8000, label: '~Rp 8,000' },
  { name: '5-10 km', radius: 10, fee: 15000, label: '~Rp 15,000' },
  { name: '10-15 km', radius: 15, fee: 22000, label: '~Rp 22,000' },
]

/* ─── Food Type Categories ─── */
const FOOD_TYPES = {
  'Nasi': ['Nasi Goreng', 'Nasi Uduk', 'Nasi Kuning', 'Nasi Padang', 'Nasi Campur', 'Nasi Kucing', 'Nasi Bakar', 'Nasi Pecel', 'Nasi Liwet', 'Lontong Sayur', 'Ketupat Sayur'],
  'Mie': ['Mie Goreng', 'Mie Rebus', 'Mie Ayam', 'Bakmi Jawa', 'Mie Tek-Tek', 'Kwetiau Goreng', 'Bihun Goreng', 'Mie Aceh'],
  'Sop/Soto': ['Soto Ayam', 'Soto Betawi', 'Soto Lamongan', 'Soto Madura', 'Bakso', 'Bakso Urat', 'Rawon', 'Tongseng', 'Sop Iga', 'Sop Buntut'],
  'Sate/Bakar': ['Sate Ayam', 'Sate Kambing', 'Sate Padang', 'Sate Madura', 'Sate Taichan', 'Sate Usus', 'Jagung Bakar', 'Ikan Bakar', 'Ayam Bakar'],
  'Gorengan': ['Bakwan', 'Tahu Goreng', 'Tempe Goreng', 'Tahu Isi', 'Pisang Goreng', 'Ubi Goreng', 'Risoles', 'Cireng', 'Comro', 'Martabak Telur'],
  'Jajanan': ['Siomay', 'Batagor', 'Pempek', 'Cilok', 'Cimol', 'Tahu Bulat', 'Lumpia', 'Seblak', 'Telur Gulung', 'Sempol Ayam', 'Sosis Bakar'],
  'Ayam': ['Ayam Goreng', 'Ayam Bakar', 'Ayam Penyet', 'Ayam Geprek', 'Ayam Kremes', 'Ayam Rica-Rica', 'Pecel Lele'],
  'Seafood': ['Ikan Bakar', 'Ikan Goreng', 'Udang Bakar', 'Cumi Goreng', 'Kerang Rebus', 'Gurame Goreng'],
  'Roti': ['Roti Bakar', 'Martabak Manis', 'Roti Canai', 'Pukis', 'Kue Cubit', 'Kue Pancong'],
  'Minuman': ['Es Teh Manis', 'Es Jeruk', 'Es Kelapa', 'Es Cendol', 'Es Campur', 'Es Cincau', 'Es Teler', 'Jus Alpukat', 'Jus Mangga', 'Wedang Jahe', 'Bandrek', 'Sekoteng', 'Es Buah'],
  'Dessert': ['Klepon', 'Onde-Onde', 'Lupis', 'Dadar Gulung', 'Serabi', 'Kue Putu', 'Kue Lapis', 'Getuk', 'Wingko'],
  'Bubur': ['Bubur Ayam', 'Bubur Kacang Hijau', 'Bubur Sumsum', 'Bubur Ketan Hitam', 'Bubur Manado'],
}
const FOOD_TYPE_KEYS = Object.keys(FOOD_TYPES)

/* ─── Demo Menu ─── */
const DEMO_MENU = [
  { id: 1, name: 'Nasi Goreng', price: 15000, photo: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=300', desc: 'Fried rice with egg, vegetables, and kecap manis', category: 'Meal', available: true },
  { id: 2, name: 'Sate Ayam', price: 18000, photo: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300', desc: 'Grilled chicken skewers with peanut sauce', category: 'Meal', available: true },
  { id: 3, name: 'Bakso', price: 12000, photo: 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=300', desc: 'Meatball soup with noodles and vegetables', category: 'Meal', available: true },
  { id: 4, name: 'Mie Goreng', price: 13000, photo: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=300', desc: 'Stir-fried noodles with vegetables and egg', category: 'Meal', available: true },
  { id: 5, name: 'Ayam Geprek', price: 20000, photo: 'https://images.unsplash.com/photo-1562967916-eb82221dfb92?w=300', desc: 'Crispy smashed chicken with sambal', category: 'Meal', available: true },
  { id: 6, name: 'Es Teh Manis', price: 5000, photo: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300', desc: 'Sweet iced tea', category: 'Drink', available: true },
  { id: 7, name: 'Es Jeruk', price: 7000, photo: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300', desc: 'Fresh orange juice', category: 'Drink', available: true },
  { id: 8, name: 'Gorengan', price: 5000, photo: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=300', desc: 'Assorted fried snacks — tempe, tahu, bakwan', category: 'Snack', available: true },
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
  page: { background: '#0a0a0a', backgroundImage: 'url(https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20Apr%2030,%202026,%2004_47_24%20PM.png?updatedAt=1777542461928)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', minHeight: '100vh', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', fontSize: 14, paddingBottom: 80 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', position: 'relative' },
  shopLogo: { width: 44, height: 44, borderRadius: 12, objectFit: 'cover', marginRight: 12 },
  shopName: { fontSize: 20, fontWeight: 700, flex: 1 },
  gearBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  vendorBar: { background: 'linear-gradient(135deg,#2d7a0e,#8DC63F)', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 },
  card: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: 'none', borderRadius: 16, margin: '8px 12px', padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative', transition: 'all 0.3s ease' },
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
  const [showLanding, setShowLanding] = useState(true)
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
  const [shopAddress, setShopAddress] = useState(() => localStorage.getItem('vendorbasic_shopAddress') || 'Jl. Malioboro, Yogyakarta')
  const [shopHours, setShopHours] = useState(() => localStorage.getItem('vendorbasic_shopHours') || '17:00 – 23:00')
  const [shopMapsLink, setShopMapsLink] = useState(() => localStorage.getItem('vendorbasic_shopMaps') || '')
  const [shopInstagram, setShopInstagram] = useState(() => localStorage.getItem('vendorbasic_shopIG') || '')
  const [shopTiktok, setShopTiktok] = useState(() => localStorage.getItem('vendorbasic_shopTT') || '')
  const [shopFoodType, setShopFoodType] = useState(() => localStorage.getItem('vendorbasic_shopFoodType') || 'Indonesian & Street Food')
  const [showLocation, setShowLocation] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState([])

  /* Checkout form */
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custAddress, setCustAddress] = useState('')
  const [payMethod, setPayMethod] = useState('cod')
  const [deliveryZone, setDeliveryZone] = useState(DELIVERY_ZONES[0])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [orderDone, setOrderDone] = useState(false)

  /* Vendor login form */
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginMode, setLoginMode] = useState('login') // 'login' or 'signup'
  const [signupName, setSignupName] = useState('')
  const [vendorId, setVendorId] = useState(() => localStorage.getItem('vendorbasic_vendorId') || null)

  /* New / edit item form */
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formCategory, setFormCategory] = useState('Meal')
  const [formPhoto, setFormPhoto] = useState('')
  const [formDesc, setFormDesc] = useState('')

  /* --- Persist menu --- */
  useEffect(() => { if (vendorId) localStorage.setItem('vendorbasic_vendorId', vendorId) }, [vendorId])
  useEffect(() => { saveJSON('vendorbasic_menu', menuItems) }, [menuItems])
  useEffect(() => { localStorage.setItem('vendorbasic_shopName', shopName) }, [shopName])
  useEffect(() => { localStorage.setItem('vendorbasic_shopLogo', shopLogo) }, [shopLogo])
  useEffect(() => { localStorage.setItem('vendorbasic_shopPhone', shopPhone) }, [shopPhone])
  useEffect(() => { saveJSON('vendorbasic_shopOpen', shopOpen) }, [shopOpen])
  useEffect(() => { localStorage.setItem('vendorbasic_shopAddress', shopAddress) }, [shopAddress])
  useEffect(() => { localStorage.setItem('vendorbasic_shopHours', shopHours) }, [shopHours])
  useEffect(() => { localStorage.setItem('vendorbasic_shopMaps', shopMapsLink) }, [shopMapsLink])
  useEffect(() => { localStorage.setItem('vendorbasic_shopIG', shopInstagram) }, [shopInstagram])
  useEffect(() => { localStorage.setItem('vendorbasic_shopTT', shopTiktok) }, [shopTiktok])
  useEffect(() => { localStorage.setItem('vendorbasic_shopFoodType', shopFoodType) }, [shopFoodType])

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
  const handleVendorLogin = async () => {
    if (!loginPhone.trim()) { setLoginError('Enter WhatsApp number'); return }
    if (!loginPass.trim()) { setLoginError('Enter password'); return }
    // Try Supabase first
    const vendor = await vendorLogin(loginPhone, loginPass)
    if (vendor) {
      setVendorId(vendor.id)
      setShopName(vendor.shop_name || shopName)
      setShopPhone(vendor.shop_phone || shopPhone)
      setShopAddress(vendor.shop_address || shopAddress)
      setShopHours(vendor.shop_hours || shopHours)
      setShopFoodType(vendor.shop_food_type || shopFoodType)
      setShopMapsLink(vendor.shop_maps_link || '')
      setShopInstagram(vendor.shop_instagram || '')
      setShopTiktok(vendor.shop_tiktok || '')
      setShopOpen(vendor.shop_open !== false)
      // Load menu from Supabase
      const items = await getVendorMenuItems(vendor.id)
      if (items.length > 0) {
        setMenuItems(items.map(i => ({ id: i.id, supabaseId: i.id, name: i.name, price: i.price, photo: i.photo_url, desc: i.description, category: i.category, available: i.available })))
      }
      localStorage.setItem('indoo_vendor_phone', loginPhone.replace(/[^0-9]/g, ''))
      localStorage.setItem('indoo_vendor_pass', loginPass)
      setIsVendor(true); setVendorLogin(false)
      setLoginPhone(''); setLoginPass(''); setLoginError(''); setLoginMode('login')
      return
    }
    // Fallback to localStorage
    const storedPhone = localStorage.getItem('indoo_vendor_phone') || shopPhone
    const storedPass = localStorage.getItem('indoo_vendor_pass') || 'vendor123'
    if (loginPhone.replace(/[^0-9]/g, '') === storedPhone.replace(/[^0-9]/g, '') && loginPass === storedPass) {
      setIsVendor(true); setVendorLogin(false)
      setLoginPhone(''); setLoginPass(''); setLoginError(''); setLoginMode('login')
    } else {
      setLoginError('Wrong number or password')
    }
  }

  const handleVendorSignup = async () => {
    if (!signupName.trim()) { setLoginError('Enter your name'); return }
    if (!loginPhone.trim()) { setLoginError('Enter WhatsApp number'); return }
    if (!loginPass.trim()) { setLoginError('Create a password'); return }
    if (loginPass.length < 4) { setLoginError('Password min 4 characters'); return }
    try {
      const vendor = await vendorSignup(loginPhone, loginPass, signupName)
      setVendorId(vendor.id)
      localStorage.setItem('indoo_vendor_phone', loginPhone.replace(/[^0-9]/g, ''))
      localStorage.setItem('indoo_vendor_pass', loginPass)
      setShopName(signupName)
      setShopPhone(loginPhone.replace(/[^0-9]/g, ''))
      setIsVendor(true)
      setVendorLogin(false)
      setLoginPhone(''); setLoginPass(''); setSignupName(''); setLoginError(''); setLoginMode('login')
    } catch (e) { setLoginError(e.message || 'Signup failed') }
  }

  /* --- Vendor actions --- */
  const toggleAvailability = (id) => {
    setMenuItems((prev) => prev.map((m) => m.id === id ? { ...m, available: !m.available } : m))
  }

  const deleteItem = (id) => {
    const item = menuItems.find(m => m.id === id)
    if (item?.supabaseId) deleteMenuItemSupa(item.supabaseId).catch(() => {})
    setMenuItems((prev) => prev.filter((m) => m.id !== id))
  }

  const startEdit = (item) => {
    setFormName(item.name)
    setFormPrice(String(item.price))
    setFormPhoto(item.photo)
    setFormDesc(item.desc)
    setFormCategory(item.category || 'Meal')
    setEditItem(item)
  }

  const saveEdit = () => {
    if (!formName || !formPrice) return
    setMenuItems((prev) =>
      prev.map((m) =>
        m.id === editItem.id ? { ...m, name: formName, price: Number(formPrice), photo: formPhoto, desc: formDesc, category: formCategory } : m
      )
    )
    if (vendorId) saveMenuItem(vendorId, { ...menuItems.find(m => m.id === editItem.id), name: formName, price: Number(formPrice), photo: formPhoto, desc: formDesc, category: formCategory }).catch(() => {})
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
      { id: newId, name: formName, price: Number(formPrice), photo: formPhoto, desc: formDesc, category: formCategory, available: true },
    ])
    if (vendorId) saveMenuItem(vendorId, { name: formName, price: Number(formPrice), photo: formPhoto, desc: formDesc, category: formCategory, available: true }).catch(() => {})
    setAddingItem(false)
  }

  /* --- WhatsApp order --- */
  const sendWhatsApp = () => {
    const orderType = payMethod === 'pickup' ? 'Pickup' : 'Delivery'
    const lines = [
      `📋 *New Order — ${shopName}*`,
      ``,
      `🍽️ *Items:*`,
      ...cart.map((c) => `• ${c.qty}x ${c.name} — ${fmt(c.price * c.qty)}`),
      ``,
      `💵 *Total: ${fmt(totalPrice)}*`,
      ``,
      `📍 *${orderType}*`,
      ...(payMethod === 'delivery' ? [
        `Address: ${custAddress}`,
        ``,
        `🛵 _Please arrange your own GoJek/Grab for pickup from our location_`,
      ] : [
        `_Customer will pick up from your location_`,
      ]),
      ``,
      `👤 ${custName}`,
      `📱 ${custPhone}`,
      `💳 Cash on ${orderType}`,
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
      {/* ═══ LANDING PAGE ═══ */}
      {showLanding && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, overflow: 'hidden' }}>
          {/* Background image */}
          <img src="https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%205,%202026,%2007_57_10%20AM.png?updatedAt=1777942652258" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />

          {/* Header — language + vendor login */}
          <div style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Language selector */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { code: 'en', label: 'EN', img: 'https://ik.imagekit.io/nepgaxllc/Untitledxxxx-removebg-preview.png?updatedAt=1777592742536' },
                { code: 'id', label: 'ID', img: 'https://ik.imagekit.io/nepgaxllc/Untitledxxxxcc-removebg-preview.png?updatedAt=1777592820803' },
              ].map(l => (
                <button key={l.code} onClick={() => localStorage.setItem('vendorbasic_lang', l.code)} style={{
                  width: 36, height: 36, borderRadius: '50%', padding: 0,
                  border: (localStorage.getItem('vendorbasic_lang') || 'en') === l.code ? '2px solid #8DC63F' : '2px solid transparent',
                  background: 'rgba(0,0,0,0.5)', cursor: 'pointer', overflow: 'hidden',
                  opacity: (localStorage.getItem('vendorbasic_lang') || 'en') === l.code ? 1 : 0.5,
                }}>
                  <img src={l.img} alt={l.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
            {/* Vendor login */}
            <button onClick={() => setVendorLogin(true)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙️</button>
          </div>

          {/* Content — centered */}
          <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {/* Shop logo */}
            {shopLogo && <img src={shopLogo} alt="" style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover', marginBottom: 16 }} />}

            {/* Burnt text — shop name */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <span style={{
                fontSize: 20, fontWeight: 900, fontFamily: '"Georgia", "Times New Roman", serif',
                color: 'transparent',
                backgroundImage: 'linear-gradient(180deg, rgba(90,45,12,0.65) 0%, rgba(90,45,12,0.65) 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                textShadow: '0 1px 0 rgba(0,0,0,0.2)',
                letterSpacing: '8px', textTransform: 'uppercase', userSelect: 'none',
                filter: 'contrast(1.3)',
              }}>{shopName}</span>
            </div>
          </div>

          {/* Enter button — yellow — bottom */}
          <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 10 }}>
            <style>{`@keyframes landingGlow { 0% { left: -100%; } 100% { left: 200%; } }`}</style>
            <button onClick={() => setShowLanding(false)} style={{
              padding: '14px 50px', border: 'none', background: '#FACC15', borderRadius: 12,
              cursor: 'pointer', color: '#000', fontSize: 16, fontWeight: 800,
              letterSpacing: '3px', textTransform: 'uppercase', fontFamily: 'inherit',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 12 }}>
                <div style={{ position: 'absolute', top: 0, width: '50%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)', animation: 'landingGlow 3s ease-in-out infinite' }} />
              </div>
              <span style={{ position: 'relative', zIndex: 1 }}>Enter</span>
            </button>
          </div>
        </div>
      )}

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
          <div>
            <span style={S.shopName}>{shopName}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginTop: 2 }}>{shopFoodType}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Map/location icon */}
          <button onClick={() => setShowLocation(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: 8, minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            📍
          </button>
        </div>
      </div>

      {/* --- Closed banner --- */}
      {!shopOpen && !isVendor && (
        <div style={S.closedBanner}>This shop is currently closed</div>
      )}

      {/* --- Menu --- */}
      <div style={{ paddingBottom: 12 }}>
        {(() => {
          // Group items by parent category
          const CAT_ICONS = { Nasi: '🍚', Mie: '🍜', 'Sop/Soto': '🍲', 'Sate/Bakar': '🔥', Gorengan: '🍳', Jajanan: '🍡', Ayam: '🍗', Seafood: '🦐', Roti: '🍞', Minuman: '🥤', Dessert: '🍰', Bubur: '🥣' }
          const getParentCat = (itemCat) => {
            for (const [parent, items] of Object.entries(FOOD_TYPES)) {
              if (items.includes(itemCat)) return parent
            }
            return itemCat || 'Other'
          }
          const grouped = {}
          visibleMenu.forEach(item => {
            const parent = getParentCat(item.category)
            if (!grouped[parent]) grouped[parent] = []
            grouped[parent].push(item)
          })
          return Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat}>
              <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{CAT_ICONS[cat] || '🍽️'}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#8DC63F', textTransform: 'uppercase', letterSpacing: 1 }}>{cat}</span>
              </div>
              {catItems.map((item) => (
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
              <button style={S.addBtn} onClick={() => { setItemModal(item); setModalQty(1) }}>+</button>
            )}
          </div>
        ))}
            </div>
          ))
        })()}

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
          <div style={{ ...S.modal, backgroundImage: 'url(https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%203,%202026,%2012_07_40%20PM.png?updatedAt=1777784877580)', backgroundSize: 'cover', backgroundPosition: 'center' }} onClick={(e) => e.stopPropagation()}>
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

      {/* ═══ LOCATION PAGE ═══ */}
      {showLocation && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: '#0a0a0a', overflowY: 'auto' }}>
          {/* Background */}
          <div style={{ position: 'fixed', inset: 0, backgroundImage: 'url(https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20Apr%2030,%202026,%2004_47_24%20PM.png?updatedAt=1777542461928)', backgroundSize: 'cover', backgroundPosition: 'center', pointerEvents: 'none' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setShowLocation(false)} style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Find Us</h2>
            </div>
            {!isVendor && (
              <button onClick={() => { setShowLocation(false); setVendorLogin(true) }} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙️</button>
            )}
          </div>

          <div style={{ padding: '0 16px 40px', position: 'relative', zIndex: 1 }}>
            {/* Address */}
            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 20, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>📍</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{shopName}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{shopAddress}</p>
                </div>
              </div>
            </div>

            {/* Hours */}
            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 20, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>🕐</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Opening Hours</h3>
                  <p style={{ fontSize: 14, color: '#8DC63F', fontWeight: 700 }}>{shopHours}</p>
                </div>
              </div>
            </div>

            {/* Phone */}
            <a href={`https://wa.me/${shopPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 20, marginBottom: 12, textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>📱</span>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>WhatsApp</h3>
                  <p style={{ fontSize: 14, color: '#8DC63F', fontWeight: 700 }}>{shopPhone}</p>
                </div>
              </div>
            </a>

            {/* Google Maps */}
            {shopMapsLink && (
              <a href={shopMapsLink} target="_blank" rel="noopener noreferrer" style={{ display: 'block', background: 'rgba(141,198,63,0.08)', border: '1px solid rgba(141,198,63,0.2)', borderRadius: 16, padding: 20, marginBottom: 12, textDecoration: 'none', textAlign: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#8DC63F' }}>📍 Open in Google Maps</span>
              </a>
            )}

            {/* Social Links */}
            {(shopInstagram || shopTiktok) && (
              <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 20, marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Follow Us</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {shopInstagram && (
                    <a href={`https://instagram.com/${shopInstagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>📸</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#E1306C' }}>@{shopInstagram.replace('@', '')}</span>
                    </a>
                  )}
                  {shopTiktok && (
                    <a href={`https://tiktok.com/@${shopTiktok.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>🎵</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>@{shopTiktok.replace('@', '')}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, marginTop: 6 }}>
                      <span>Food Total</span><span style={{ color: '#FACC15' }}>{fmt(totalPrice)}</span>
                    </div>
                  </div>
                </div>

                {/* Estimated Delivery Cost */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 8, display: 'block' }}>
                    📍 Estimated Delivery Cost
                  </label>
                  <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                    {DELIVERY_ZONES.map((z, i) => (
                      <div key={z.radius} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: i < DELIVERY_ZONES.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}>
                        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{z.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: z.fee === 0 ? '#8DC63F' : '#FACC15' }}>{z.label}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.5 }}>
                    * Prices based on GoJek/Grab estimates. Order delivery from your preferred app. Vendor address will be in your WhatsApp order.
                  </p>
                </div>

                {/* Pickup or Delivery */}
                <label style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 8, display: 'block' }}>Order Type</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <button style={S.payBtn(payMethod === 'pickup')} onClick={() => setPayMethod('pickup')}>🏪 Pickup</button>
                  <button style={S.payBtn(payMethod === 'delivery')} onClick={() => setPayMethod('delivery')}>🛵 Delivery</button>
                </div>

                {/* Customer info */}
                <input style={S.input} placeholder="Your name" value={custName} onChange={(e) => setCustName(e.target.value)} />
                <input style={S.input} placeholder="Phone / WhatsApp" type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
                {payMethod === 'delivery' && (
                  <input style={S.input} placeholder="Delivery address (for GoJek pickup)" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} />
                )}

                {/* Payment */}
                <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(141,198,63,0.06)', border: '1px solid rgba(141,198,63,0.15)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>💵</span>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#8DC63F' }}>Cash on Delivery / Pickup</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'block' }}>Pay when you receive your food</span>
                  </div>
                </div>

                <button
                  style={{ ...S.btnGreen, opacity: (custName && custPhone) ? 1 : 0.4 }}
                  disabled={!custName || !custPhone}
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
        <div style={{ ...S.overlay, alignItems: 'center' }} onClick={() => { setVendorLogin(false); setLoginMode('login'); setLoginError('') }}>
          <div style={{ backgroundImage: 'url(https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20Apr%2022,%202026,%2006_39_04%20AM.png?updatedAt=1776814761653)', backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 14, maxWidth: 270, width: '88%', padding: '16px 14px 12px', position: 'relative', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setVendorLogin(false); setLoginMode('login'); setLoginError('') }} style={{ position: 'absolute', top: 6, right: 10, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 16, cursor: 'pointer' }}>&times;</button>

            {loginMode === 'login' ? (
              <>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10, textAlign: 'center', color: '#fff' }}>Sign In</h3>
                <input style={{ ...S.input, fontSize: 13, padding: '10px 12px', marginBottom: 6 }} type="tel" placeholder="WhatsApp number" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} />
                <input style={{ ...S.input, fontSize: 13, padding: '10px 12px', marginBottom: 6 }} type="password" placeholder="Password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleVendorLogin()} />
                {loginError && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 6 }}>{loginError}</div>}
                <button style={{ ...S.btnGreen, padding: '10px', fontSize: 14, marginTop: 0 }} onClick={handleVendorLogin}>Sign In</button>
                <button onClick={() => { setLoginMode('signup'); setLoginError('') }} style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', marginTop: 8, padding: 4 }}>
                  Don't have an account? <span style={{ color: '#8DC63F', fontWeight: 700 }}>Create Account</span>
                </button>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10, textAlign: 'center', color: '#fff' }}>Create Account</h3>
                <input style={{ ...S.input, fontSize: 13, padding: '10px 12px', marginBottom: 6 }} type="text" placeholder="Your name / business name" value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                <input style={{ ...S.input, fontSize: 13, padding: '10px 12px', marginBottom: 6 }} type="tel" placeholder="WhatsApp number" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} />
                <input style={{ ...S.input, fontSize: 13, padding: '10px 12px', marginBottom: 6 }} type="password" placeholder="Create password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleVendorSignup()} />
                {loginError && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 6 }}>{loginError}</div>}
                <button style={{ ...S.btnGreen, padding: '10px', fontSize: 14, marginTop: 0 }} onClick={handleVendorSignup}>Create Account</button>
                <button onClick={() => { setLoginMode('login'); setLoginError('') }} style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', marginTop: 8, padding: 4 }}>
                  Already have an account? <span style={{ color: '#8DC63F', fontWeight: 700 }}>Sign In</span>
                </button>
              </>
            )}
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
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ ...S.input, appearance: 'auto', fontSize: 13, padding: '10px 12px' }}>
              {FOOD_TYPE_KEYS.map(cat => (
                <optgroup key={cat} label={cat} style={{ background: '#1a1a1a' }}>
                  {FOOD_TYPES[cat].map(item => (
                    <option key={item} value={item} style={{ background: '#1a1a1a' }}>{item}</option>
                  ))}
                </optgroup>
              ))}
              <option value="Other" style={{ background: '#1a1a1a' }}>Other (custom)</option>
            </select>
            <div style={{ marginBottom: 10 }}>
              {formPhoto && <img src={formPhoto} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', marginBottom: 6 }} />}
              <label style={{ display: 'block', padding: '10px 14px', borderRadius: 12, border: '1px dashed rgba(141,198,63,0.4)', background: 'rgba(141,198,63,0.05)', color: '#8DC63F', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                {formPhoto ? 'Change Photo' : '📷 Upload Photo'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  // Try Supabase storage first
                  if (supabase && vendorId && !String(vendorId).startsWith('local')) {
                    const url = await uploadMenuImage(vendorId, file)
                    if (url) { setFormPhoto(url); return }
                  }
                  // Fallback to dataURL
                  const reader = new FileReader()
                  reader.onload = () => {
                    const img = new Image()
                    img.onload = () => {
                      const canvas = document.createElement('canvas')
                      const max = 600
                      let w = img.width, h = img.height
                      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r) }
                      canvas.width = w; canvas.height = h
                      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
                      setFormPhoto(canvas.toDataURL('image/jpeg', 0.7))
                    }
                    img.src = reader.result
                  }
                  reader.readAsDataURL(file)
                }} />
              </label>
            </div>
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
            <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ ...S.input, appearance: 'auto', fontSize: 13, padding: '10px 12px' }}>
              {FOOD_TYPE_KEYS.map(cat => (
                <optgroup key={cat} label={cat} style={{ background: '#1a1a1a' }}>
                  {FOOD_TYPES[cat].map(item => (
                    <option key={item} value={item} style={{ background: '#1a1a1a' }}>{item}</option>
                  ))}
                </optgroup>
              ))}
              <option value="Other" style={{ background: '#1a1a1a' }}>Other (custom)</option>
            </select>
            <div style={{ marginBottom: 10 }}>
              {formPhoto && <img src={formPhoto} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', marginBottom: 6 }} />}
              <label style={{ display: 'block', padding: '10px 14px', borderRadius: 12, border: '1px dashed rgba(141,198,63,0.4)', background: 'rgba(141,198,63,0.05)', color: '#8DC63F', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                {formPhoto ? 'Change Photo' : '📷 Upload Photo'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  // Try Supabase storage first
                  if (supabase && vendorId && !String(vendorId).startsWith('local')) {
                    const url = await uploadMenuImage(vendorId, file)
                    if (url) { setFormPhoto(url); return }
                  }
                  // Fallback to dataURL
                  const reader = new FileReader()
                  reader.onload = () => {
                    const img = new Image()
                    img.onload = () => {
                      const canvas = document.createElement('canvas')
                      const max = 600
                      let w = img.width, h = img.height
                      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r) }
                      canvas.width = w; canvas.height = h
                      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
                      setFormPhoto(canvas.toDataURL('image/jpeg', 0.7))
                    }
                    img.src = reader.result
                  }
                  reader.readAsDataURL(file)
                }} />
              </label>
            </div>
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
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>WhatsApp Number (with country code)</label>
            <input style={S.input} value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Food Type / Description</label>
            <input style={S.input} value={shopFoodType} onChange={(e) => setShopFoodType(e.target.value)} placeholder="e.g. Indonesian & Street Food" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Stall Location</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input style={{ ...S.input, flex: 1, marginBottom: 0 }} value={shopAddress} onChange={async (e) => {
                setShopAddress(e.target.value)
                if (e.target.value.length > 3) {
                  try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(e.target.value)}&format=json&limit=3&countrycodes=id`)
                    const data = await res.json()
                    setLocationSuggestions(data.map(d => d.display_name))
                  } catch { setLocationSuggestions([]) }
                } else { setLocationSuggestions([]) }
              }} placeholder="Search address or use GPS" />
              <button onClick={() => {
                if (!navigator.geolocation) return
                navigator.geolocation.getCurrentPosition(async ({ coords }) => {
                  try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`)
                    const data = await res.json()
                    setShopAddress(data.display_name || `${coords.latitude}, ${coords.longitude}`)
                    // Get 3 nearby suggestions
                    const nearby = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(data.address?.road || data.address?.suburb || '')}&format=json&limit=3&countrycodes=id&viewbox=${coords.longitude-0.01},${coords.latitude+0.01},${coords.longitude+0.01},${coords.latitude-0.01}`)
                    const nearbyData = await nearby.json()
                    setLocationSuggestions(nearbyData.map(d => d.display_name))
                  } catch { setShopAddress(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`) }
                }, () => alert('Please allow location access'), { enableHighAccuracy: true, timeout: 10000 })
              }} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#8DC63F', color: '#000', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>📍</button>
            </div>
            {locationSuggestions.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {locationSuggestions.map((s, i) => (
                  <button key={i} onClick={() => { setShopAddress(s); setLocationSuggestions([]) }} style={{
                    width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit',
                  }}>{s}</button>
                ))}
              </div>
            )}
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Opening Hours</label>
            <input style={S.input} value={shopHours} onChange={(e) => setShopHours(e.target.value)} placeholder="17:00 – 23:00" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Google Maps Link</label>
            <input style={S.input} value={shopMapsLink} onChange={(e) => setShopMapsLink(e.target.value)} placeholder="Paste Google Maps link" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Instagram Username</label>
            <input style={S.input} value={shopInstagram} onChange={(e) => setShopInstagram(e.target.value)} placeholder="nasigorengpakjoko" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>TikTok Username</label>
            <input style={S.input} value={shopTiktok} onChange={(e) => setShopTiktok(e.target.value)} placeholder="nasigorengpakjoko" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Shop Status</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button style={S.toggle(shopOpen)} onClick={() => setShopOpen(!shopOpen)}>
                <div style={S.toggleDot(shopOpen)} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{shopOpen ? 'Open' : 'Closed'}</span>
            </div>
            <button style={S.btnGreen} onClick={() => {
              if (vendorId) updateVendorConfig(vendorId, { shop_name: shopName, shop_phone: shopPhone, shop_address: shopAddress, shop_hours: shopHours, shop_food_type: shopFoodType, shop_maps_link: shopMapsLink, shop_instagram: shopInstagram, shop_tiktok: shopTiktok, shop_open: shopOpen }).catch(() => {})
              setShopConfig(false)
            }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
