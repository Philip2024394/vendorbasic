import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import AdminDashboard from './AdminDashboard'
import ActivatePage from './ActivatePage'
import { useAppLocale, LANGUAGES } from './i18n'

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

/* ─── Estimated Delivery Costs — built from admin settings ─── */
function buildDeliveryZones(minCharge = 7000, minKm = 2, perKm = 2500, maxKm = 15, roundTo = 1000, currency = 'Rp') {
  // minCharge covers 0 to minKm (flat fee)
  // After minKm, each additional km adds perKm
  const calc = (km) => {
    if (km <= minKm) return minCharge
    const extra = km - minKm
    return Math.ceil((minCharge + extra * perKm) / roundTo) * roundTo
  }
  const zones = [
    { name: 'Pickup', radius: 0, fee: 0, label: 'Pickup / Walk-in' },
    { name: `0-${minKm} km`, radius: minKm, fee: minCharge, label: `~${currency} ${minCharge.toLocaleString()}` },
  ]
  if (maxKm > minKm) zones.push({ name: `${minKm}-5 km`, radius: 5, fee: calc(5), label: `~${currency} ${calc(5).toLocaleString()}` })
  if (maxKm > 5) zones.push({ name: '5-10 km', radius: 10, fee: calc(10), label: `~${currency} ${calc(10).toLocaleString()}` })
  if (maxKm > 10) zones.push({ name: '10-15 km', radius: 15, fee: calc(15), label: `~${currency} ${calc(15).toLocaleString()}` })
  if (maxKm > 15) zones.push({ name: '15-20 km', radius: 20, fee: calc(20), label: `~${currency} ${calc(20).toLocaleString()}` })
  return zones
}

const DEFAULT_DELIVERY_ZONES = buildDeliveryZones()

/* ─── City/Country Delivery Defaults (GoJek/Grab research 2025) ─── */
const DELIVERY_DEFAULTS = {
  // Indonesia — based on GoJek/Grab bike rates per city
  ID: {
    currency: 'Rp', cities: {
      Jakarta: { minCharge: 10000, minKm: 4, perKm: 2500, maxKm: 25 },
      Surabaya: { minCharge: 8000, minKm: 3, perKm: 2000, maxKm: 20 },
      Bandung: { minCharge: 8000, minKm: 3, perKm: 2000, maxKm: 20 },
      Yogyakarta: { minCharge: 7000, minKm: 3, perKm: 2000, maxKm: 15 },
      Semarang: { minCharge: 7000, minKm: 3, perKm: 2000, maxKm: 15 },
      Medan: { minCharge: 8000, minKm: 3, perKm: 2000, maxKm: 20 },
      Makassar: { minCharge: 7000, minKm: 3, perKm: 2000, maxKm: 15 },
      Bali: { minCharge: 10000, minKm: 4, perKm: 2500, maxKm: 25 },
      Malang: { minCharge: 7000, minKm: 3, perKm: 2000, maxKm: 15 },
      Palembang: { minCharge: 7000, minKm: 3, perKm: 2000, maxKm: 15 },
      Tangerang: { minCharge: 9000, minKm: 4, perKm: 2500, maxKm: 20 },
      Bekasi: { minCharge: 9000, minKm: 4, perKm: 2500, maxKm: 20 },
      Depok: { minCharge: 9000, minKm: 4, perKm: 2500, maxKm: 20 },
      Bogor: { minCharge: 8000, minKm: 3, perKm: 2000, maxKm: 20 },
      _default: { minCharge: 7000, minKm: 3, perKm: 2000, maxKm: 15 },
    }
  },
  MY: { currency: 'RM', cities: { _default: { minCharge: 5, minKm: 3, perKm: 1.5, maxKm: 20 } } },
  SG: { currency: 'S$', cities: { _default: { minCharge: 3, minKm: 3, perKm: 1, maxKm: 15 } } },
  TH: { currency: '฿', cities: { _default: { minCharge: 25, minKm: 3, perKm: 8, maxKm: 20 } } },
  VN: { currency: '₫', cities: { _default: { minCharge: 15000, minKm: 3, perKm: 5000, maxKm: 20 } } },
  PH: { currency: '₱', cities: { _default: { minCharge: 49, minKm: 3, perKm: 15, maxKm: 20 } } },
  IN: { currency: '₹', cities: { _default: { minCharge: 30, minKm: 3, perKm: 10, maxKm: 20 } } },
  AU: { currency: 'A$', cities: { _default: { minCharge: 6, minKm: 3, perKm: 2, maxKm: 15 } } },
  GB: { currency: '£', cities: { _default: { minCharge: 3, minKm: 3, perKm: 1.5, maxKm: 15 } } },
  US: { currency: '$', cities: { _default: { minCharge: 4, minKm: 3, perKm: 1.5, maxKm: 15 } } },
  AE: { currency: 'AED', cities: { _default: { minCharge: 8, minKm: 3, perKm: 2, maxKm: 20 } } },
  SA: { currency: 'SAR', cities: { _default: { minCharge: 8, minKm: 3, perKm: 2, maxKm: 20 } } },
  JP: { currency: '¥', cities: { _default: { minCharge: 300, minKm: 3, perKm: 100, maxKm: 15 } } },
  KR: { currency: '₩', cities: { _default: { minCharge: 3000, minKm: 3, perKm: 1000, maxKm: 15 } } },
  DE: { currency: '€', cities: { _default: { minCharge: 3, minKm: 3, perKm: 1.5, maxKm: 15 } } },
  FR: { currency: '€', cities: { _default: { minCharge: 3, minKm: 3, perKm: 1.5, maxKm: 15 } } },
}

function getDeliveryDefaults(countryCode, city) {
  const country = DELIVERY_DEFAULTS[countryCode] || DELIVERY_DEFAULTS.ID
  const cityRates = country.cities[city] || country.cities._default
  return { ...cityRates, currency: country.currency }
}

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

function getDeliveryFee(distKm, zones) {
  const z = zones || DEFAULT_DELIVERY_ZONES
  for (let i = z.length - 1; i >= 0; i--) {
    if (distKm <= z[i].radius) return z[i]
  }
  return z[z.length - 1]
}

const PLACEHOLDER_SM = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27%3E%3Crect width=%2780%27 height=%2780%27 fill=%27%23222%27/%3E%3C/svg%3E"
const PLACEHOLDER_LG = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27300%27 height=%27300%27%3E%3Crect width=%27300%27 height=%27300%27 fill=%27%23222%27/%3E%3C/svg%3E"

const THEME_PRESETS = [
  { id: 'default', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png', label: 'Wood', category: 'Indonesian Street Food' },
  { id: 'dark', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%204,%202026,%2004_43_21%20PM.png?updatedAt=1777887818629', label: 'Dark', category: 'Street Food' },
  { id: 'bamboo', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20Apr%2030,%202026,%2004_47_24%20PM.png?updatedAt=1777542461928', label: 'Bamboo', category: 'Asian Cuisine' },
  { id: 'kebab', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_46_43%20PM.png', label: 'Kebab', category: 'Kebabs' },
  { id: 'burger', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_47_38%20PM.png', label: 'Burgers', category: 'Burgers' },
  { id: 'donut', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_49_41%20PM.png', label: 'Donuts', category: 'Donuts' },
  { id: 'asia', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_03_53%20PM.png', label: 'Asia', category: 'Asian Cuisine' },
  { id: 'satay', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2002_02_22%20PM.png', label: 'Satay', category: 'Chicken Satay' },
  { id: 'juice', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2002_03_51%20PM.png', label: 'Juice', category: 'Fresh Juice' },
  { id: 'friedrice', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2002_07_16%20PM.png', label: 'Fried Rice', category: 'Fried Rice' },
  { id: 'noodle', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2006_02_12%20PM.png?updatedAt=1778065351273', label: 'Noodle Soup', category: 'Noodle Soup' },
  { id: 'meatball', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2006_05_19%20PM.png', label: 'Meatball Soup', category: 'Meatball Soup' },
  { id: 'chicken', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2006_08_26%20PM.png', label: 'Crispy Chicken', category: 'Crispy Chicken' },
  { id: 'coffee', img: 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2006_11_39%20PM.png', label: 'Coffee', category: 'Coffee' },
]
const FOOD_CATEGORIES = [...new Set(THEME_PRESETS.map(t => t.category))]

/* ─── Styles ─── */
const S = {
  page: { background: 'transparent', minHeight: '100%', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', fontSize: 14, paddingBottom: 80, position: 'relative' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px', position: 'sticky', top: 0, zIndex: 10 },
  shopLogo: { width: 44, height: 44, borderRadius: 12, objectFit: 'cover', marginRight: 12 },
  shopName: { fontSize: 22, fontWeight: 700, flex: 1, textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.5)' },
  gearBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  vendorBar: { background: 'rgba(0,0,0,0.4)', padding: '4px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' },
  card: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: 'none', borderRadius: 16, margin: '8px 12px', padding: 12, display: 'flex', gap: 12, alignItems: 'center', position: 'relative', transition: 'all 0.3s ease', height: 104, overflow: 'hidden' },
  cardImg: { width: 80, height: 80, borderRadius: 12, objectFit: 'cover', flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0, height: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' },
  cardName: { fontSize: 16, fontWeight: 600, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardDesc: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 5 },
  cardPrice: { fontSize: 16, fontWeight: 700, color: '#FACC15' },
  addBtn: { position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: 14, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: 'none', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stickyCart: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'linear-gradient(135deg,#2d7a0e,#8DC63F)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100, minHeight: 56 },
  cartText: { fontSize: 15, fontWeight: 600 },
  checkoutBtn: { background: '#fff', color: '#2d7a0e', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 200, overflowY: 'auto', display: 'flex', justifyContent: 'center' },
  modal: { background: '#111', borderRadius: 20, maxWidth: 420, width: '100%', margin: '24px 12px', padding: 20, position: 'relative', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' },
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  btnGreen: { width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: '#8DC63F', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  btnOutline: { width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  closeBtnX: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#8B0000', fontSize: 24, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  unavailable: {},
  toggle: (on) => ({ width: 48, height: 26, borderRadius: 13, background: on ? '#8DC63F' : 'rgba(255,255,255,0.15)', position: 'relative', cursor: 'pointer', border: 'none', flexShrink: 0, transition: 'background 0.2s' }),
  toggleDot: (on) => ({ position: 'absolute', top: 3, left: on ? 24 : 3, width: 20, height: 20, borderRadius: 10, background: '#fff', transition: 'left 0.2s' }),
  vendorBtns: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  smallBtn: (bg) => ({ padding: '6px 12px', borderRadius: 8, border: 'none', background: bg || 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', minHeight: 36 }),
  fab: { position: 'fixed', bottom: 90, right: 16, width: 56, height: 56, borderRadius: 28, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 28, fontWeight: 700, cursor: 'pointer', zIndex: 90, boxShadow: '0 4px 20px rgba(141,198,63,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  closedBanner: { background: 'rgba(255,0,0,0.15)', border: '1px solid rgba(255,0,0,0.3)', borderRadius: 12, margin: '8px 12px', padding: '12px 16px', textAlign: 'center', color: '#ff6b6b', fontSize: 15, fontWeight: 600 },
  qtyRow: { display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', margin: '16px 0' },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, border: 'none', background: '#1a1a1a', color: '#FFD600', fontSize: 22, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qtyNum: { fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: 'center' },
  zoneBtn: (active) => ({ flex: 1, padding: '10px 6px', borderRadius: 10, border: active ? '2px solid #8DC63F' : '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(141,198,63,0.15)' : 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer', textAlign: 'center' }),
  payBtn: (active) => ({ flex: 1, padding: '14px', borderRadius: 14, border: active ? '2px solid #8DC63F' : '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(141,198,63,0.15)' : 'transparent', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }),
}

/* ─── Main App ─── */
export default function App() {
  // Route to admin or activate page
  const params = new URLSearchParams(window.location.search)
  const viewMode = params.get('view') || (window.location.pathname === '/admin' ? 'admin' : window.location.pathname === '/activate' ? 'activate' : null)

  if (viewMode === 'admin') return <AdminDashboard />
  if (viewMode === 'activate') return <ActivatePage />

  /* --- i18n --- */
  const { locale, setLocale, t, nativeLang } = useAppLocale()

  /* --- Check vendor activation status for public visitors --- */
  const [publicVendorStatus, setPublicVendorStatus] = useState(null)
  const [publicVendorName, setPublicVendorName] = useState('')
  const [publicVendorLogo, setPublicVendorLogo] = useState('')
  useEffect(() => {
    // Check if this is a vendor's public page (has slug in URL or stored vendor ID)
    const storedId = localStorage.getItem('vendorbasic_vendorId')
    if (storedId && !String(storedId).startsWith('local') && supabase) {
      supabase.from('vendor_accounts').select('status,shop_name,shop_logo').eq('id', storedId).single().then(({ data }) => {
        if (data) {
          setPublicVendorStatus(data.status || 'pending')
          setPublicVendorName(data.shop_name || '')
          setPublicVendorLogo(data.shop_logo || '')
        }
      })
    }
  }, [])

  /* --- State --- */
  const [showLanding, setShowLanding] = useState(() => {
    const id = new URLSearchParams(window.location.search).get('vendor') || localStorage.getItem('vendorbasic_vendorId') || localStorage.getItem('indoo_vendor_id')
    return !id
  })
  const [menuItems, setMenuItems] = useState(() => loadJSON('vendorbasic_menu', DEMO_MENU))
  const [cart, setCart] = useState([])
  const [isVendor, setIsVendor] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const urlVendor = params.get('vendor')
    const urlCity = params.get('city')
    const urlCountry = params.get('country')
    if (urlVendor) {
      localStorage.setItem('vendorbasic_vendorId', urlVendor)
      localStorage.setItem('indoo_vendor_id', urlVendor)
      if (urlCity) localStorage.setItem('vendorbasic_shopCity', urlCity)
      if (urlCountry) localStorage.setItem('vendorbasic_shopCountry', urlCountry)
      // Auto-set delivery rates for new vendors
      const countryCode = params.get('cc')
      if (countryCode && !localStorage.getItem('vendorbasic_delRatesSet')) {
        const rates = getDeliveryDefaults(countryCode, urlCity)
        localStorage.setItem('vendorbasic_delMin', rates.minCharge)
        localStorage.setItem('vendorbasic_delMinKm', rates.minKm)
        localStorage.setItem('vendorbasic_delPerKm', rates.perKm)
        localStorage.setItem('vendorbasic_delMax', rates.maxKm)
        localStorage.setItem('vendorbasic_delCurrency', rates.currency)
        localStorage.setItem('vendorbasic_delRatesSet', 'true')
      }
    }
    const id = urlVendor || localStorage.getItem('vendorbasic_vendorId') || localStorage.getItem('indoo_vendor_id')
    return !!id
  })
  const [vendorLogin, setVendorLogin] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [itemModal, setItemModal] = useState(null) // item being viewed
  const [modalQty, setModalQty] = useState(1)
  const [editItem, setEditItem] = useState(null) // item being edited by vendor
  const [addingItem, setAddingItem] = useState(false)
  const [shopConfig, setShopConfig] = useState(false) // show shop config
  const [showDeliverySettings, setShowDeliverySettings] = useState(false)
  const [vendorDrawer, setVendorDrawer] = useState(false)
  const [shopTheme, setShopTheme] = useState(() => localStorage.getItem('vendorbasic_theme') || 'default')
  const [delBaseFee, setDelBaseFee] = useState(() => parseInt(localStorage.getItem('vendorbasic_delBase')) || 5000)
  const [delPerKm, setDelPerKm] = useState(() => parseInt(localStorage.getItem('vendorbasic_delPerKm')) || 2500)
  const [delMinCharge, setDelMinCharge] = useState(() => parseInt(localStorage.getItem('vendorbasic_delMin')) || 7000)
  const [delMaxKm, setDelMaxKm] = useState(() => parseInt(localStorage.getItem('vendorbasic_delMax')) || 15)
  const [delFreeAbove, setDelFreeAbove] = useState(() => parseInt(localStorage.getItem('vendorbasic_delFree')) || 0)
  const [delCurrency, setDelCurrency] = useState(() => localStorage.getItem('vendorbasic_delCurrency') || 'Rp')
  const [delMinKm, setDelMinKm] = useState(() => parseInt(localStorage.getItem('vendorbasic_delMinKm')) || 2)
  const [delEnabled, setDelEnabled] = useState(() => localStorage.getItem('vendorbasic_delEnabled') !== 'false')

  /* Shop info */
  const [shopName, setShopName] = useState(() => localStorage.getItem('vendorbasic_shopName') || 'Chicken Satay')
  const [shopLogo, setShopLogo] = useState(() => localStorage.getItem('vendorbasic_shopLogo') || '')
  const [shopPhone, setShopPhone] = useState(() => localStorage.getItem('vendorbasic_shopPhone') || '6281234567890')
  const [shopOpen, setShopOpen] = useState(() => loadJSON('vendorbasic_shopOpen', true))
  const [shopAddress, setShopAddress] = useState(() => localStorage.getItem('vendorbasic_shopAddress') || 'Jl. Malioboro, Yogyakarta')
  const [shopHours, setShopHours] = useState(() => localStorage.getItem('vendorbasic_shopHours') || '17:00 – 23:00')
  const defaultSchedule = { mon: { open: '17:00', close: '23:00', off: false }, tue: { open: '17:00', close: '23:00', off: false }, wed: { open: '17:00', close: '23:00', off: false }, thu: { open: '17:00', close: '23:00', off: false }, fri: { open: '17:00', close: '23:00', off: false }, sat: { open: '17:00', close: '23:00', off: false }, sun: { open: '17:00', close: '23:00', off: true } }
  const [shopSchedule, setShopSchedule] = useState(() => loadJSON('vendorbasic_shopSchedule', defaultSchedule))
  const [shopMapsLink, setShopMapsLink] = useState(() => localStorage.getItem('vendorbasic_shopMaps') || '')
  const [shopInstagram, setShopInstagram] = useState(() => localStorage.getItem('vendorbasic_shopIG') || '')
  const [shopTiktok, setShopTiktok] = useState(() => localStorage.getItem('vendorbasic_shopTT') || '')
  const [shopFacebook, setShopFacebook] = useState(() => localStorage.getItem('vendorbasic_shopFB') || '')
  const [shopYoutube, setShopYoutube] = useState(() => localStorage.getItem('vendorbasic_shopYT') || '')
  const [shopWebsite, setShopWebsite] = useState(() => localStorage.getItem('vendorbasic_shopWeb') || '')
  const [shopBio, setShopBio] = useState(() => localStorage.getItem('vendorbasic_shopBio') || '')
  const [shopCity, setShopCity] = useState(() => localStorage.getItem('vendorbasic_shopCity') || '')
  const [shopCountry, setShopCountry] = useState(() => localStorage.getItem('vendorbasic_shopCountry') || '')
  const [shopFoodType, setShopFoodType] = useState(() => localStorage.getItem('vendorbasic_shopFoodType') || 'Indonesian Street Food')
  const [showLocation, setShowLocation] = useState(false)
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [userDistance, setUserDistance] = useState(null)
  const [showDeals, setShowDeals] = useState(false)
  const [menuView, setMenuView] = useState('all') // 'all' or 'promo'
  const [dailyDeals, setDailyDeals] = useState(() => loadJSON('vendorbasic_dailyDeals', []))
  const [showCustomers, setShowCustomers] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem('vendorbasic_installDismissed') === 'true')
  const [customerSearch, setCustomerSearch] = useState('')
  const [promoMsg, setPromoMsg] = useState('')

  /* Checkout form */
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custAddress, setCustAddress] = useState('')
  const [payMethod, setPayMethod] = useState('cod')
  const [deliveryZones, setDeliveryZones] = useState(DEFAULT_DELIVERY_ZONES)
  const [deliveryZone, setDeliveryZone] = useState(DEFAULT_DELIVERY_ZONES[0])
  const [gpsLoading, setGpsLoading] = useState(false)
  const [orderDone, setOrderDone] = useState(false)

  /* Vendor login form */
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginMode, setLoginMode] = useState('login') // 'login' or 'signup'
  const [signupName, setSignupName] = useState('')
  const [signupCategory, setSignupCategory] = useState('')
  const [vendorId, setVendorId] = useState(() => new URLSearchParams(window.location.search).get('vendor') || localStorage.getItem('vendorbasic_vendorId') || localStorage.getItem('indoo_vendor_id') || null)
  const [vendorStatus, setVendorStatus] = useState(null) // 'active' | 'expired' | 'pending'
  const [vendorExpiresAt, setVendorExpiresAt] = useState(null)

  /* Auto-detect user distance */
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversineKm(SHOP_LAT, SHOP_LON, pos.coords.latitude, pos.coords.longitude)
        setUserDistance(Math.round(d * 10) / 10)
      },
      () => {}
    )
  }, [])

  /* Load delivery rates from admin settings (Supabase) */
  useEffect(() => {
    if (!supabase) return
    async function loadRates() {
      try {
        const { data } = await supabase.from('admin_settings').select('id,value').in('id', ['delivery_base_fee', 'delivery_per_km', 'delivery_min_charge', 'delivery_max_km', 'delivery_round_to'])
        if (data && data.length > 0) {
          const r = {}
          data.forEach(d => { r[d.id] = Number(d.value) })
          const zones = buildDeliveryZones(r.delivery_base_fee, r.delivery_per_km, r.delivery_min_charge, r.delivery_max_km, r.delivery_round_to)
          setDeliveryZones(zones)
          setDeliveryZone(zones[0])
        }
      } catch (e) { console.warn('Failed to load delivery rates:', e) }
    }
    loadRates()
  }, [])

  /* New / edit item form */
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formPromoPrice, setFormPromoPrice] = useState('')
  const [formPriceMode, setFormPriceMode] = useState('normal')
  const [formSpice, setFormSpice] = useState(0)
  const [formHalal, setFormHalal] = useState(false)
  const [formPopular, setFormPopular] = useState(false)
  const [formCategory, setFormCategory] = useState('Meal')
  const [formPhoto, setFormPhoto] = useState('')
  const [formDesc, setFormDesc] = useState('')

  /* --- Persist to localStorage + sync to Supabase --- */
  useEffect(() => { if (vendorId) localStorage.setItem('vendorbasic_vendorId', vendorId) }, [vendorId])
  useEffect(() => { saveJSON('vendorbasic_menu', menuItems) }, [menuItems])
  useEffect(() => { localStorage.setItem('vendorbasic_shopName', shopName) }, [shopName])
  useEffect(() => { localStorage.setItem('vendorbasic_shopLogo', shopLogo) }, [shopLogo])
  useEffect(() => { localStorage.setItem('vendorbasic_shopPhone', shopPhone) }, [shopPhone])
  useEffect(() => { saveJSON('vendorbasic_shopOpen', shopOpen) }, [shopOpen])
  useEffect(() => { localStorage.setItem('vendorbasic_shopAddress', shopAddress) }, [shopAddress])
  useEffect(() => { localStorage.setItem('vendorbasic_shopHours', shopHours) }, [shopHours])
  useEffect(() => { localStorage.setItem('vendorbasic_shopSchedule', JSON.stringify(shopSchedule)) }, [shopSchedule])
  useEffect(() => { localStorage.setItem('vendorbasic_shopMaps', shopMapsLink) }, [shopMapsLink])
  useEffect(() => { localStorage.setItem('vendorbasic_shopIG', shopInstagram) }, [shopInstagram])
  useEffect(() => { localStorage.setItem('vendorbasic_shopTT', shopTiktok) }, [shopTiktok])
  useEffect(() => { localStorage.setItem('vendorbasic_shopFB', shopFacebook) }, [shopFacebook])
  useEffect(() => { localStorage.setItem('vendorbasic_shopYT', shopYoutube) }, [shopYoutube])
  useEffect(() => { localStorage.setItem('vendorbasic_shopWeb', shopWebsite) }, [shopWebsite])
  useEffect(() => { localStorage.setItem('vendorbasic_shopFoodType', shopFoodType) }, [shopFoodType])
  useEffect(() => { localStorage.setItem('vendorbasic_shopBio', shopBio) }, [shopBio])
  useEffect(() => { localStorage.setItem('vendorbasic_shopCity', shopCity) }, [shopCity])
  useEffect(() => { localStorage.setItem('vendorbasic_shopCountry', shopCountry) }, [shopCountry])
  useEffect(() => { localStorage.setItem('vendorbasic_delBase', delBaseFee) }, [delBaseFee])
  useEffect(() => { localStorage.setItem('vendorbasic_delPerKm', delPerKm) }, [delPerKm])
  useEffect(() => { localStorage.setItem('vendorbasic_delMin', delMinCharge) }, [delMinCharge])
  useEffect(() => { localStorage.setItem('vendorbasic_delMax', delMaxKm) }, [delMaxKm])
  useEffect(() => { localStorage.setItem('vendorbasic_delFree', delFreeAbove) }, [delFreeAbove])
  useEffect(() => { localStorage.setItem('vendorbasic_delCurrency', delCurrency) }, [delCurrency])
  useEffect(() => { localStorage.setItem('vendorbasic_delMinKm', delMinKm) }, [delMinKm])
  useEffect(() => { localStorage.setItem('vendorbasic_delEnabled', delEnabled) }, [delEnabled])

  // Build delivery zones from vendor's own settings
  useEffect(() => {
    const zones = buildDeliveryZones(delMinCharge, delMinKm, delPerKm, delMaxKm, 1000, delCurrency)
    setDeliveryZones(zones)
    setDeliveryZone(zones[0])
  }, [delMinCharge, delMinKm, delPerKm, delMaxKm, delCurrency])

  // Sync shop config to Supabase when vendor changes settings
  const syncTimer = useRef(null)
  useEffect(() => {
    if (!vendorId || String(vendorId).startsWith('local')) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      updateVendorConfig(vendorId, {
        shop_name: shopName, shop_logo: shopLogo, shop_phone: shopPhone,
        shop_open: shopOpen, shop_address: shopAddress, shop_hours: shopHours,
        shop_maps_link: shopMapsLink, shop_instagram: shopInstagram,
        shop_tiktok: shopTiktok, shop_facebook: shopFacebook,
        shop_youtube: shopYoutube, shop_website: shopWebsite,
        shop_food_type: shopFoodType,
        delivery_base_fee: delBaseFee, delivery_per_km: delPerKm,
        delivery_min_charge: delMinCharge, delivery_max_km: delMaxKm,
        delivery_free_above: delFreeAbove, delivery_currency: delCurrency,
        delivery_enabled: delEnabled,
      })
    }, 2000)
  }, [shopName, shopLogo, shopPhone, shopOpen, shopAddress, shopHours, shopMapsLink, shopInstagram, shopTiktok, shopFacebook, shopYoutube, shopWebsite, shopFoodType, delBaseFee, delPerKm, delMinCharge, delMaxKm, delFreeAbove, delCurrency, delEnabled])

  // Load shop config from Supabase on vendor login
  useEffect(() => {
    if (!vendorId || String(vendorId).startsWith('local')) return
    if (!supabase) return
    supabase.from('vendor_accounts').select('*').eq('id', vendorId).single().then(({ data }) => {
      if (!data) return
      if (data.shop_name) setShopName(data.shop_name)
      if (data.shop_logo) setShopLogo(data.shop_logo)
      if (data.shop_phone) setShopPhone(data.shop_phone)
      if (data.shop_address) setShopAddress(data.shop_address)
      if (data.shop_hours) setShopHours(data.shop_hours)
      if (data.shop_maps_link) setShopMapsLink(data.shop_maps_link)
      if (data.shop_instagram) setShopInstagram(data.shop_instagram)
      if (data.shop_tiktok) setShopTiktok(data.shop_tiktok)
      if (data.shop_facebook) setShopFacebook(data.shop_facebook)
      if (data.shop_youtube) setShopYoutube(data.shop_youtube)
      if (data.shop_website) setShopWebsite(data.shop_website)
      if (data.shop_food_type) setShopFoodType(data.shop_food_type)
      if (data.shop_open !== undefined) setShopOpen(data.shop_open)
      if (data.delivery_base_fee) setDelBaseFee(data.delivery_base_fee)
      if (data.delivery_per_km) setDelPerKm(data.delivery_per_km)
      if (data.delivery_min_charge) setDelMinCharge(data.delivery_min_charge)
      if (data.delivery_max_km) setDelMaxKm(data.delivery_max_km)
      if (data.delivery_free_above !== undefined) setDelFreeAbove(data.delivery_free_above)
      if (data.delivery_currency) setDelCurrency(data.delivery_currency)
      if (data.delivery_enabled !== undefined) setDelEnabled(data.delivery_enabled)
    })
  }, [vendorId])

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
      return [...prev, { id: item.id, name: item.name, desc: item.desc, photo: item.photo, price: item.price, qty }]
    })
  }, [])

  /* --- GPS auto-delivery --- */
  const detectDeliveryZone = useCallback(() => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineKm(SHOP_LAT, SHOP_LON, pos.coords.latitude, pos.coords.longitude)
        setDeliveryZone(getDeliveryFee(dist, deliveryZones))
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
      setShopFacebook(vendor.shop_facebook || '')
      setShopYoutube(vendor.shop_youtube || '')
      setShopWebsite(vendor.shop_website || '')
      setShopOpen(vendor.shop_open !== false)
      // Set subscription status
      if (vendor.status) setVendorStatus(vendor.status)
      if (vendor.expires_at) {
        setVendorExpiresAt(vendor.expires_at)
        // Auto-check if expired
        if (new Date(vendor.expires_at) < new Date() && vendor.status === 'active') {
          setVendorStatus('expired')
        }
      }
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
    if (!signupName.trim()) { setLoginError('Enter your business name'); return }
    if (!signupCategory) { setLoginError('Select your food category'); return }
    if (!loginPhone.trim()) { setLoginError('Enter WhatsApp number'); return }
    if (!loginPass.trim()) { setLoginError('Create a password'); return }
    if (loginPass.length < 4) { setLoginError('Password min 4 characters'); return }
    try {
      const vendor = await vendorSignup(loginPhone, loginPass, signupName)
      setVendorId(vendor.id)
      localStorage.setItem('indoo_vendor_phone', loginPhone.replace(/[^0-9]/g, ''))
      localStorage.setItem('indoo_vendor_pass', loginPass)
      setShopName(signupName)
      setShopFoodType(signupCategory)
      localStorage.setItem('vendorbasic_shopFoodType', signupCategory)
      setShopPhone(loginPhone.replace(/[^0-9]/g, ''))
      // Auto-set theme based on category
      const matchedTheme = THEME_PRESETS.find(t => t.category === signupCategory)
      if (matchedTheme) {
        setShopTheme(matchedTheme.id)
        localStorage.setItem('vendorbasic_theme', matchedTheme.id)
        localStorage.setItem('vendorbasic_themeBg', matchedTheme.img)
        const bg = document.getElementById('app-bg')
        if (bg) bg.style.backgroundImage = `url(${matchedTheme.img})`
      }
      updateVendorConfig(vendor.id, { shop_food_type: signupCategory })
      setIsVendor(true)
      setVendorLogin(false)
      setLoginPhone(''); setLoginPass(''); setSignupName(''); setSignupCategory(''); setLoginError(''); setLoginMode('login')
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
    setFormPromoPrice('')
    setFormPriceMode('normal')
    setFormSpice(0)
    setFormHalal(false)
    setFormPopular(false)
    setFormPhoto('')
    setFormDesc('')
    setAddingItem(true)
  }

  const saveAdd = () => {
    if (!formName || !formPrice) return
    const newId = Date.now()
    const promoPrice = formPriceMode === 'promo' && formPromoPrice ? Number(formPromoPrice) : null
    const item = { id: newId, name: formName, price: Number(formPrice), promoPrice, spice: formSpice, halal: formHalal, popular: formPopular, photo: formPhoto, desc: formDesc, category: formCategory, available: true }
    setMenuItems((prev) => [...prev, item])
    if (vendorId) saveMenuItem(vendorId, { name: formName, price: Number(formPrice), promoPrice, spice: formSpice, halal: formHalal, popular: formPopular, photo: formPhoto, desc: formDesc, category: formCategory, available: true }).catch(() => {})
    setAddingItem(false)
  }

  /* --- WhatsApp order --- */
  const sendWhatsApp = () => {
    const note = document.getElementById('orderNote')?.value?.trim()
    const lines = [
      `📋 *New Order — ${shopName}*`,
      ``,
      `🍽️ *Items:*`,
      ...cart.map((c) => `• ${c.qty}x ${c.name} — ${fmt(c.price * c.qty)}`),
      ``,
      ...(note ? [`📝 *Note:* ${note}`, ``] : []),
      `💵 *Total: ${fmt(totalPrice)}*`,
      ``,
      ...(delEnabled && userDistance ? [`📍 Distance: ${userDistance} km`, `Estimated delivery: ${deliveryZone.label}`, ``] : []),
    ]
    const msg = encodeURIComponent(lines.join('\n'))
    const phone = shopPhone.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    // Save customer to directory (localStorage + Supabase)
    const customers = loadJSON('vendorbasic_customers', [])
    const existing = customers.find(c => c.phone === custPhone)
    if (existing) {
      existing.orders = (existing.orders || 0) + 1
      existing.totalSpent = (existing.totalSpent || 0) + totalPrice
      existing.lastOrder = new Date().toISOString()
      existing.name = custName || existing.name
    } else {
      customers.push({ phone: custPhone, name: custName, orders: 1, totalSpent: totalPrice, lastOrder: new Date().toISOString(), firstOrder: new Date().toISOString() })
    }
    saveJSON('vendorbasic_customers', customers)
    // Sync to Supabase
    if (supabase && vendorId && !String(vendorId).startsWith('local')) {
      supabase.from('vendor_customers').upsert({
        vendor_id: vendorId, phone: custPhone, name: custName,
        orders: existing ? existing.orders : 1,
        total_spent: existing ? existing.totalSpent : totalPrice,
        last_order: new Date().toISOString(),
      }, { onConflict: 'vendor_id,phone' }).then(() => {})
      // Save order
      supabase.from('vendor_orders').insert({
        vendor_id: vendorId, customer_name: custName, customer_phone: custPhone,
        items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
        subtotal: totalPrice, delivery_type: 'delivery', payment_method: 'cod',
        note: document.getElementById('orderNote')?.value || '',
      }).then(() => {})
    }
    setOrderDone(true)
  }

  /* --- Visible menu --- */
  const visibleMenu = isVendor ? menuItems : menuItems.filter((m) => m.available)

  // Active daily deals — filter by current time
  const activeDeals = dailyDeals.filter(d => {
    if (!d.active) return false
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const start = new Date(`${today}T${d.startTime || '00:00'}`)
    const end = new Date(`${today}T${d.endTime || '23:59'}`)
    return now >= start && now <= end
  })
  const hasDeals = activeDeals.length > 0

  /* ═══════════════════════ RENDER ══════════════════��════ */

  /* ═══ LANDING PAGE — full screen, no content behind ═══ */
  if (showLanding) {
    return (
      <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        {/* Background image — uses vendor's selected theme */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center' }} />
        {/* Dark overlay for text readability */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)' }} />


        {/* Language toggle — top right, single flag, tap to switch */}
        <button onClick={() => setLocale(locale === 'id' ? 'en' : 'id')} style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 48, height: 48, borderRadius: 24, border: 'none', background: 'none', padding: 0, cursor: 'pointer', overflow: 'hidden' }}>
          <img src={locale === 'id' ? 'https://ik.imagekit.io/nepgaxllc/Untitleddddsssfsdf-removebg-preview.png' : 'https://ik.imagekit.io/nepgaxllc/Untitleddddsss-removebg-preview.png'} alt="lang" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </button>

        {/* Content — centered */}
        <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {/* Shop logo */}
          {shopLogo && <img src={shopLogo} alt="" style={{ width: 90, height: 90, borderRadius: 22, objectFit: 'cover', marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }} />}

          {/* Shop name */}
          <h1 style={{ textAlign: 'center', marginBottom: 8, fontSize: 50, fontWeight: 700, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)', padding: '0 20px', lineHeight: 1.1 }}>{shopName}</h1>

          {/* Food category tagline */}
          {shopFoodType && (
            <h2 style={{ textAlign: 'center', marginBottom: 6, fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{shopFoodType}</h2>
          )}
          {/* City, Country */}
          {(shopCity || shopCountry) && (
            <p style={{ textAlign: 'center', marginBottom: 40, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
              {[shopCity, shopCountry].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        {/* Enter button — yellow — bottom */}
        <div style={{ position: 'absolute', bottom: 50, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10, gap: 14 }}>
          <style>{`@keyframes landingGlow { 0% { left: -100%; } 100% { left: 200%; } }`}</style>
          {/* Set Location / Enter button */}
          <button onClick={() => {
            if (!delEnabled || !navigator.geolocation) { setShowLanding(false); return }
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const d = haversineKm(SHOP_LAT, SHOP_LON, pos.coords.latitude, pos.coords.longitude)
                setUserDistance(Math.round(d * 10) / 10)
                setShowLanding(false)
              },
              () => setShowLanding(false)
            )
          }} style={{
            padding: '14px 44px', border: 'none', background: '#FACC15', borderRadius: 12,
            cursor: 'pointer', color: '#000', fontSize: 15, fontWeight: 700,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 12 }}>
              <div style={{ position: 'absolute', top: 0, width: '50%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)', animation: 'landingGlow 3s ease-in-out infinite' }} />
            </div>
            <span style={{ position: 'relative', zIndex: 1 }}>{delEnabled ? 'Set Location' : 'Enter'}</span>
          </button>
          <a href="https://streetlocal.live" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: 8, letterSpacing: 1, textDecoration: 'none' }}>streetlocal.live</a>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>

      {/* --- Vendor mode bar --- */}

      {/* --- Subscription expired banner --- */}
      {isVendor && vendorStatus === 'expired' && (
        <div style={{ background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: 12, margin: '8px 12px', padding: '12px 16px', textAlign: 'center', color: '#ff6b6b', fontSize: 14, fontWeight: 600 }}>
          Subscription expired — contact admin to renew
        </div>
      )}

      {/* --- Header --- */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          {shopLogo && <img src={shopLogo} alt="" style={S.shopLogo} />}
          <div>
            <span style={S.shopName}>{shopName}</span>
            <span style={{ display: 'block', fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginTop: 2, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{shopFoodType}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Hamburger menu (vendor only) */}
          {isVendor && (
            <button onClick={() => setVendorDrawer(true)} style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 6, minWidth: 38, minHeight: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>☰</button>
          )}
          {/* Cart icon (hidden for vendor) */}
          {!isVendor && <button onClick={() => { if (cart.length > 0) { setCheckoutOpen(true); setOrderDone(false) } }} style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', padding: 6, minWidth: 38, minHeight: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'visible' }}>
            <span style={{ fontSize: 20 }}>🛒</span>
            {cart.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {cart.reduce((s, c) => s + c.qty, 0)}
              </span>
            )}
          </button>}
        </div>
      </div>


      {/* --- Coming Soon overlay for pending vendors (public visitors only) --- */}
      {!isVendor && publicVendorStatus === 'pending' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {publicVendorLogo && <img src={publicVendorLogo} alt="" style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover', marginBottom: 16 }} />}
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8, textAlign: 'center' }}>{publicVendorName || shopName}</h1>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#FFD600', marginBottom: 8 }}>{t.comingSoon || 'Coming Soon!'}</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, maxWidth: 280, marginBottom: 30 }}>
            {locale === 'id' ? 'Kami sedang mempersiapkan menu. Kunjungi lagi segera!' : 'We\'re preparing our menu. Check back shortly!'}
          </p>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20, textAlign: 'center', width: '100%', maxWidth: 280 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Powered by</p>
            <a href="https://streetlocal.live" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#FFD600' }}>StreetLocal</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Get your own food ordering software</div>
              <div style={{ fontSize: 12, color: '#8DC63F', fontWeight: 700, marginTop: 4 }}>from $2.50/month →</div>
            </a>
          </div>
        </div>
      )}

      {/* --- Closed banner --- */}
      {!shopOpen && !isVendor && (
        <div style={S.closedBanner}>{t.shopClosed || 'This shop is currently closed'}</div>
      )}

      {/* Add Item button (vendor) */}
      {isVendor && vendorStatus !== 'expired' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px' }}>
          <button onClick={startAdd} style={{ padding: '6px 14px', borderRadius: 10, border: 'none', background: '#8DC63F', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add Item</button>
        </div>
      )}
      <div style={{ height: 12 }} />
      {/* --- Daily Deals Button + Cards --- */}
      {hasDeals && (
        <div style={{ padding: '0 16px 8px' }}>
          <button onClick={() => setShowDeals(!showDeals)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: 'none', background: '#FFD600', color: '#1a1a1a', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
            🔥 Promo ({activeDeals.length})
            <span style={{ fontSize: 12 }}>{showDeals ? '▲' : '▼'}</span>
          </button>
          {showDeals && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeDeals.map(deal => {
                const now = new Date()
                const today = now.toISOString().slice(0, 10)
                const end = new Date(`${today}T${deal.endTime || '23:59'}`)
                const remaining = Math.max(0, end - now)
                const hrs = Math.floor(remaining / 3600000)
                const mins = Math.floor((remaining % 3600000) / 60000)
                return (
                  <div key={deal.id} style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', borderRadius: 14, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                    {deal.photo && <img src={deal.photo} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{deal.name}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: '#FFD600' }}>{fmt(deal.dealPrice)}</span>
                        <span style={{ fontSize: 12, color: '#888', textDecoration: 'line-through' }}>{fmt(deal.originalPrice)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700, marginTop: 4 }}>
                        ⏰ {hrs}h {mins}m remaining
                      </div>
                    </div>
                    <button onClick={() => {
                      const existing = cart.find(c => c.id === 'deal-' + deal.id)
                      if (existing) { setCart(cart.map(c => c.id === 'deal-' + deal.id ? { ...c, qty: c.qty + 1 } : c)) }
                      else { setCart([...cart, { id: 'deal-' + deal.id, name: deal.name + ' (Deal)', price: deal.dealPrice, qty: 1, photo: deal.photo }]) }
                    }} style={{ background: '#FFD600', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 800, color: '#1a1a1a', cursor: 'pointer', flexShrink: 0 }}>
                      + Add
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* --- Menu --- */}
      <div style={{ padding: '36px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Menu Items</span>
        {!isVendor && <button onClick={() => setShowLocation(true)} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Visit Us</button>}
      </div>
      <div style={{ paddingBottom: 12 }}>
        {visibleMenu.map((item) => (
          <div
            key={item.id}
            style={{ ...S.card, ...(!item.available && isVendor ? { background: 'rgba(139,0,0,0.4)', border: '1px solid rgba(255,60,60,0.2)' } : {}) }}
          >
            {/* Toggle — top right (vendor only) */}
            {isVendor && vendorStatus !== 'expired' && (
              <button style={{ ...S.toggle(item.available), position: 'absolute', top: 8, right: 8, zIndex: 2 }} onClick={() => toggleAvailability(item.id)}>
                <div style={S.toggleDot(item.available)} />
              </button>
            )}
            <img
              src={item.photo || PLACEHOLDER_SM}
              alt={item.name}
              style={S.cardImg}
              onClick={() => { setItemModal(item); setModalQty(1) }}
            />
            {/* Badges on image */}
            {item.halal && (
              <span style={{ position: 'absolute', bottom: 8, left: isVendor ? 40 : 8, fontSize: 10, background: 'rgba(34,197,94,0.8)', color: '#fff', borderRadius: 4, padding: '1px 4px', fontWeight: 700, zIndex: 2 }}>Halal</span>
            )}
            {item.popular && (
              <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, background: 'rgba(250,204,21,0.9)', color: '#000', borderRadius: 4, padding: '1px 5px', fontWeight: 800, zIndex: 2 }}>⭐ Popular</span>
            )}
            {/* Delete — round button on image lower-left corner */}
            {isVendor && vendorStatus !== 'expired' && (
              <button onClick={() => deleteItem(item.id)} style={{ position: 'absolute', bottom: 8, left: 8, width: 26, height: 26, borderRadius: 13, border: 'none', background: '#8B0000', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>&times;</button>
            )}
            {/* Price — absolute for customer, in body for vendor */}
            {!isVendor && (
              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                {item.promoPrice ? (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through', display: 'block' }}>{fmt(item.price)}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#EF4444' }}>{fmt(item.promoPrice)}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#FACC15', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{fmt(item.price)}</span>
                )}
              </div>
            )}
            <div style={S.cardBody}>
              <div style={S.cardName} onClick={() => { setItemModal(item); setModalQty(1) }}>{item.name}{item.spice > 0 && <span style={{ marginLeft: 4 }}>{'🌶️'.repeat(item.spice)}</span>}</div>
              <div style={S.cardDesc}>{item.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {isVendor ? (
                  <div>
                    {item.promoPrice ? (
                      <><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through', marginRight: 6 }}>{fmt(item.price)}</span><span style={{ fontSize: 14, fontWeight: 800, color: '#EF4444' }}>{fmt(item.promoPrice)}</span></>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#FACC15' }}>{fmt(item.price)}</span>
                    )}
                  </div>
                ) : <div />}
                {isVendor && vendorStatus !== 'expired' && (
                  <button style={S.smallBtn()} onClick={() => startEdit(item)}>Edit</button>
                )}
              </div>
            </div>

            {/* Add button (customer) — tap card to view */}
            {!isVendor && shopOpen && item.available && (
              <button style={S.addBtn} onClick={() => { setItemModal(item); setModalQty(1) }}>+</button>
            )}
          </div>
        ))}

        {visibleMenu.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>{t.noItems || 'No items on the menu'}</div>
        )}
      </div>


      {/* --- StreetLocal Footer Link --- */}
      {!isVendor && (
        <a href="https://streetlocal.live" target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '16px 0 8px', textDecoration: 'none' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Powered by </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)' }}>StreetLocal</span>
        </a>
      )}

      {/* --- Sticky Cart Bar --- */}
      {totalItems > 0 && !isVendor && (
        <div style={S.stickyCart}>
          <span style={S.cartText}>{totalItems} item{totalItems > 1 ? 's' : ''} &middot; {fmt(totalPrice)}</span>
          <button style={S.checkoutBtn} onClick={() => { setCheckoutOpen(true); setOrderDone(false); detectDeliveryZone() }}>
            {t.checkout || 'Checkout'} &rarr;
          </button>
        </div>
      )}

      {/* ═══ ITEM DETAIL MODAL ═══ */}
      {itemModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', display: 'flex', justifyContent: 'center' }} onClick={() => setItemModal(null)}>
          <div style={{ width: '100%', maxWidth: 480, minHeight: '100%', position: 'relative', display: 'flex', flexDirection: 'column', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center' }} onClick={(e) => e.stopPropagation()}>
            {/* Header with back arrow + shop name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)' }}>
              <button onClick={() => setItemModal(null)} style={{ width: 36, height: 36, borderRadius: 18, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
              <div style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 700, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)' }}>{shopName}</span>
                <span style={{ display: 'block', fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{shopFoodType}</span>
              </div>
              <button onClick={() => { setItemModal(null); if (cart.length > 0) { setCheckoutOpen(true); setOrderDone(false) } }} style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: 'none', cursor: 'pointer', padding: 6, minWidth: 38, minHeight: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'visible' }}>
                <span style={{ fontSize: 20 }}>🛒</span>
                {cart.length > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cart.reduce((s, c) => s + c.qty, 0)}
                  </span>
                )}
              </button>
            </div>

            {/* Food image — taller */}
            <div style={{ padding: '0 16px', marginTop: 40 }}>
              <img
                src={itemModal.photo || PLACEHOLDER_LG}
                alt={itemModal.name}
                style={{ width: '100%', maxHeight: 340, objectFit: 'cover', borderRadius: 16, marginBottom: 16 }}
              />
            </div>

            {/* Dish info container */}
            <div style={{ margin: '0 16px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: '#fff' }}>{itemModal.name}</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{itemModal.desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#FACC15' }}>{fmt(itemModal.price)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setModalQty(Math.max(1, modalQty - 1))} style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: '#FACC15', color: '#000', fontSize: 18, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', minWidth: 24, textAlign: 'center' }}>{modalQty}</span>
                  <button onClick={() => setModalQty(modalQty + 1)} style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: '#FACC15', color: '#000', fontSize: 18, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              </div>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Add to Cart button — fixed footer */}
            {shopOpen && itemModal.available && (
              <div style={{ padding: '12px 16px 20px', background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
                <button
                  style={{ ...S.btnGreen, marginTop: 0, width: '100%' }}
                  onClick={() => { addToCart(itemModal, modalQty); setItemModal(null) }}
                >
                  {t.addToCart || 'Add to Cart'} &middot; {fmt(itemModal.price * modalQty)}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ═══ LOCATION PAGE ═══ */}
      {showLocation && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: '#0a0a0a', overflowY: 'auto' }}>
          {/* Background — same as menu theme */}
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setShowLocation(false)} style={{ width: 40, height: 40, borderRadius: '50%', background: '#8DC63F', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)' }}>{shopName}</h2>
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{shopFoodType}</span>
              </div>
            </div>
          </div>

          <div style={{ padding: '0 16px', marginTop: 12, marginBottom: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 16, overflow: 'hidden' }}>
              <img src="https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20Apr%2028,%202026,%2004_15_21%20AM.png?updatedAt=1777324540335" alt="" style={{ width: '50%', display: 'block', margin: '12px auto 0' }} />
              <div style={{ padding: '14px 16px' }}>
              <p style={{ fontSize: 15, color: '#fff', lineHeight: 1.7, marginBottom: 12 }}>
                {shopBio || `Welcome to ${shopName}! Stop by and experience the taste first-hand. Watch your food being freshly prepared right in front of you — nothing beats eating it straight from the kitchen.`}
              </p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t.ourLocation || 'Our Location'}</h3>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{shopName}</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{shopAddress}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <img src="https://ik.imagekit.io/nepgaxllc/Untitledsdasdvvvdsds-removebg-preview.png?updatedAt=1777253439520" alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
                    {delEnabled && userDistance !== null && (
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#FFD600' }}>{userDistance} km</span>
                    )}
                  </div>
                </div>
                {shopMapsLink && (
                  <a href={shopMapsLink} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 10, padding: '10px', borderRadius: 10, background: 'rgba(141,198,63,0.1)', border: '1px solid rgba(141,198,63,0.2)', textAlign: 'center', textDecoration: 'none' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#8DC63F' }}>{t.openInMaps || 'Open in Google Maps →'}</span>
                  </a>
                )}
              </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '0 16px 16px', position: 'relative', zIndex: 1 }}>

            {/* 2. Opening Times */}
            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 16, marginBottom: 10 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>🕐 {t.openingHours || 'Opening Hours'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { key: 'mon', en: 'Monday' }, { key: 'tue', en: 'Tuesday' }, { key: 'wed', en: 'Wednesday' },
                  { key: 'thu', en: 'Thursday' }, { key: 'fri', en: 'Friday' }, { key: 'sat', en: 'Saturday' }, { key: 'sun', en: 'Sunday' }
                ].map(({ key, en }) => {
                  const day = t[en.toLowerCase()] || en
                  const sched = shopSchedule[key]
                  const isClosed = sched?.off
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{day}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: isClosed ? '#EF4444' : '#8DC63F' }}>
                        {isClosed ? (t.closed || 'Closed') : `${sched?.open || '17:00'} – ${sched?.close || '23:00'}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 3. Contact Us */}
            <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{t.contactUs || 'Contact Us'}</h3>
              <a href={`https://wa.me/${shopPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', padding: '10px', borderRadius: 12, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', marginBottom: 8 }}>
                <img src="https://ik.imagekit.io/nepgaxllc/Untitledddddccc-removebg-preview.png?updatedAt=1777894363133" alt="whatsapp" style={{ width: 36, height: 36, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#25D366' }}>WhatsApp</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{shopPhone.replace(/^(\+?62)/, '0')}</div>
                </div>
              </a>
            </div>

            {/* Google Maps — moved inside location card */}
            {false && shopMapsLink && (
              <a href={shopMapsLink} target="_blank" rel="noopener noreferrer" style={{ display: 'block', background: 'rgba(141,198,63,0.08)', border: '1px solid rgba(141,198,63,0.2)', borderRadius: 16, padding: 20, marginBottom: 12, textDecoration: 'none', textAlign: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#8DC63F' }}>📍 Open in Google Maps</span>
              </a>
            )}

            {/* Social Links */}
            {(shopInstagram || shopTiktok || shopFacebook || shopYoutube || shopWebsite) && (
              <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 20, marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{t.followUs || 'Follow Us'}</h3>
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
                  {shopFacebook && (
                    <a href={shopFacebook.startsWith('http') ? shopFacebook : `https://facebook.com/${shopFacebook}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>👤</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#1877F2' }}>Facebook</span>
                    </a>
                  )}
                  {shopYoutube && (
                    <a href={shopYoutube.startsWith('http') ? shopYoutube : `https://youtube.com/@${shopYoutube}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>▶️</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#FF0000' }}>YouTube</span>
                    </a>
                  )}
                  {shopWebsite && (
                    <a href={shopWebsite.startsWith('http') ? shopWebsite : `https://${shopWebsite}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                      <span style={{ fontSize: 20 }}>🌐</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#8DC63F' }}>{shopWebsite}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CHECKOUT PAGE ═══ */}
      {checkoutOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: '#0a0a0a', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)' }}>{shopName}</h2>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{shopFoodType}</span>
            </div>
            <button onClick={() => setCheckoutOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#8B0000', color: '#fff', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
          {!orderDone ? (
            <div style={{ padding: '12px' }}>
              {/* Order items — same style as menu cards */}
              <div style={{ marginBottom: 16 }}>
                {cart.map((c) => (
                  <div key={c.id} style={{ ...S.card, margin: '8px 0', alignItems: 'flex-start', position: 'relative' }}>
                    {/* Delete X — top right corner */}
                    <button onClick={() => setCart(cart.filter(x => x.id !== c.id))} style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, border: 'none', background: '#8B0000', color: '#fff', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>&times;</button>
                    <img src={c.photo || PLACEHOLDER_SM} alt="" style={S.cardImg} />
                    <div style={{ ...S.cardBody, display: 'flex', flexDirection: 'column' }}>
                      <div style={S.cardName}>{c.name}</div>
                      {c.desc && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.desc}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#FACC15' }}>{fmt(c.price * c.qty)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => { if (c.qty > 1) setCart(cart.map(x => x.id === c.id ? { ...x, qty: x.qty - 1 } : x)) }} style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: '#FACC15', color: '#000', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: c.qty <= 1 ? 0.3 : 1 }}>−</button>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', minWidth: 20, textAlign: 'center' }}>{c.qty}</span>
                          <button onClick={() => setCart(cart.map(x => x.id === c.id ? { ...x, qty: x.qty + 1 } : x))} style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: '#FACC15', color: '#000', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {cart.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 30 }}>{t.cartEmpty || 'Your cart is empty'}</p>
                )}
              </div>

              {/* Order note — right after items */}
              {cart.length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Order Note (optional)</label>
                  <textarea
                    placeholder="e.g. Extra spicy, no onions, allergies..."
                    style={{ ...S.input, minHeight: 60, resize: 'vertical', marginBottom: 0 }}
                    id="orderNote"
                  />
                </div>
              )}

              {/* Total */}
              {cart.length > 0 && (
                <>
                  <div style={{ padding: '12px 14px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{t.total || 'Total'}</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#FACC15' }}>{fmt(totalPrice)}</span>
                    </div>
                    {delEnabled && <div style={{ fontSize: 13, fontWeight: 600, color: '#8DC63F' }}>Estimated delivery: {deliveryZone.label}</div>}
                  </div>

                </>
              )}
            </div>
          ) : (
            /* --- Order Confirmation --- */
            <div style={{ textAlign: 'center', padding: '60px 24px' }}>
              <img src="https://ik.imagekit.io/nepgaxllc/Untitleddddsssfsdfxxx-removebg-preview.png" alt="" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 16 }} />
              <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{t.orderSent || 'Order Sent!'}</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 1.6, marginBottom: 24, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                {t.orderSentMsg || 'Your order has been sent via WhatsApp. The vendor will confirm shortly.'}
              </p>
              <button style={{ ...S.btnGreen, width: 'auto', padding: '14px 40px', display: 'inline-block' }} onClick={() => { setCheckoutOpen(false); setCart([]); setOrderDone(false) }}>
                Done
              </button>
            </div>
          )}
          </div>

          {/* Footer — delivery estimate + order button */}
          {!orderDone && cart.length > 0 && (
            <div style={{ padding: '12px 16px 20px', flexShrink: 0 }}>
              <button
                style={{ ...S.btnGreen, marginTop: 0, width: '100%' }}
                onClick={sendWhatsApp}
              >
                Order WhatsApp — {fmt(totalPrice)}
              </button>
            </div>
          )}
        </div>
      )}


      {/* ═══ VENDOR SIDE DRAWER ═══ */}
      {vendorDrawer && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500 }} onClick={() => setVendorDrawer(false)} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 260, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', zIndex: 501, overflowY: 'auto', borderLeft: '1px solid rgba(255,255,255,0.08)', animation: 'slideRight 0.2s ease' }}>
            {/* Header */}
            <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>Dashboard</span>
                <button onClick={() => setVendorDrawer(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              <span style={{ fontSize: 11, color: '#8DC63F' }}>{shopName}</span>
            </div>

            {/* Shop Open/Close toggle */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: shopOpen ? '#8DC63F' : '#EF4444' }}>{shopOpen ? 'Shop Open' : 'Shop Closed'}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{shopOpen ? 'Accepting orders' : 'Orders paused'}</span>
              </div>
              <button style={S.toggle(shopOpen)} onClick={() => setShopOpen(!shopOpen)}>
                <div style={S.toggleDot(shopOpen)} />
              </button>
            </div>

            {/* Menu items */}
            {[
              { icon: '⚙️', label: 'Shop Config', onClick: () => { setShopConfig(true); setVendorDrawer(false) } },
              { icon: '🛵', label: 'Delivery Settings', onClick: () => { setShowDeliverySettings(true); setVendorDrawer(false) } },
            ].map(item => (
              <button key={item.label} onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', border: 'none', background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}

            {/* Theme Backgrounds — full page preview */}
            <div style={{ padding: '16px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#FFD600', marginBottom: 10 }}>🎨 App Theme</h3>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Tap a theme to preview how your menu will look</p>

              {/* Horizontal scroll of full previews */}
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
                {THEME_PRESETS.map(theme => (
                  <button key={theme.id} onClick={() => {
                    setShopTheme(theme.id)
                    localStorage.setItem('vendorbasic_theme', theme.id)
                    localStorage.setItem('vendorbasic_themeBg', theme.img)
                    const bg = document.getElementById('app-bg')
                    if (bg) bg.style.backgroundImage = `url(${theme.img})`
                    setVendorDrawer(false)
                    setShowLanding(true)
                  }} style={{ border: shopTheme === theme.id ? '3px solid #FFD600' : '3px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', padding: 0, background: 'none', flexShrink: 0, width: 180 }}>
                    {/* Full app preview */}
                    <div style={{ width: '100%', height: 280, backgroundImage: `url(${theme.img})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                      {/* Mock header */}
                      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 10, background: 'rgba(255,255,255,0.2)' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 6, width: '60%', background: 'rgba(255,255,255,0.5)', borderRadius: 3, marginBottom: 3 }} />
                          <div style={{ height: 4, width: '40%', background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />
                        </div>
                      </div>
                      {/* Mock category header */}
                      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.15)' }} />
                        <div style={{ height: 6, width: '30%', background: 'rgba(255,255,255,0.4)', borderRadius: 3 }} />
                      </div>
                      {/* Mock menu cards */}
                      {[1, 2, 3].map(i => (
                        <div key={i} style={{ margin: '3px 10px', padding: 8, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ height: 5, width: '70%', background: 'rgba(255,255,255,0.5)', borderRadius: 3, marginBottom: 4 }} />
                            <div style={{ height: 4, width: '50%', background: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 3 }} />
                            <div style={{ height: 5, width: '35%', background: '#FACC15', borderRadius: 3, opacity: 0.7 }} />
                          </div>
                        </div>
                      ))}
                      {/* Mock sticky cart */}
                      <div style={{ marginTop: 'auto', padding: '6px 10px 8px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ height: 5, width: '40%', background: 'rgba(255,255,255,0.3)', borderRadius: 3 }} />
                          <div style={{ height: 16, width: 40, background: 'rgba(255,255,255,0.2)', borderRadius: 6 }} />
                        </div>
                      </div>
                    </div>
                    {/* Label */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: shopTheme === theme.id ? '#FFD600' : '#888', padding: '6px 0', textAlign: 'center', background: shopTheme === theme.id ? 'rgba(255,214,0,0.1)' : '#111' }}>
                      {shopTheme === theme.id ? '✓ ' : ''}{theme.label}
                    </div>
                  </button>
                ))}
              </div>

              {/* Custom upload */}
              <label style={{ display: 'block', marginTop: 10, padding: '12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.15)', textAlign: 'center', cursor: 'pointer', fontSize: 12, color: '#888' }}>
                📸 Upload Custom Background
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                  const file = e.target.files[0]
                  if (!file) return
                  const url = await uploadMenuImage(vendorId, file)
                  if (url) {
                    setShopTheme('custom')
                    localStorage.setItem('vendorbasic_theme', 'custom')
                    localStorage.setItem('vendorbasic_themeBg', url)
                    const bg = document.getElementById('app-bg')
                    if (bg) bg.style.backgroundImage = `url(${url})`
                    setVendorDrawer(false)
                    setShowLanding(true)
                  }
                }} />
              </label>
            </div>

            {/* Logout */}
            <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => { setIsVendor(false); setVendorDrawer(false) }} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#8B0000', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Logout
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ DELIVERY SETTINGS ═══ */}
      {showDeliverySettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexShrink: 0 }}>
            <button onClick={() => setShowDeliverySettings(false)} style={{ width: 36, height: 36, borderRadius: 18, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <div>
              <span style={{ display: 'block', fontSize: 22, fontWeight: 700, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{shopName}</span>
              <span style={{ display: 'block', fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>Delivery Rates</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }}>
            {/* Enable toggle + Reset */}
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 14, padding: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: delEnabled ? '#8DC63F' : '#EF4444' }}>{delEnabled ? 'Delivery On' : 'Delivery Off'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Show estimates to customers</div>
              </div>
              <button style={S.toggle(delEnabled)} onClick={() => setDelEnabled(!delEnabled)}>
                <div style={S.toggleDot(delEnabled)} />
              </button>
            </div>

            {/* Reset to city defaults */}
            <button onClick={() => {
              const cc = localStorage.getItem('vendorbasic_shopCountry') ? Object.keys(DELIVERY_DEFAULTS).find(k => DELIVERY_DEFAULTS[k]?.currency && (VENDOR_COUNTRIES || []).find(c => c.code === k)?.name === localStorage.getItem('vendorbasic_shopCountry')) : null
              const rates = getDeliveryDefaults(cc || 'ID', shopCity)
              setDelMinCharge(rates.minCharge); setDelMinKm(rates.minKm); setDelPerKm(rates.perKm); setDelMaxKm(rates.maxKm); setDelCurrency(rates.currency)
            }} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(250,204,21,0.3)', background: 'rgba(250,204,21,0.1)', color: '#FACC15', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
              Reset to {shopCity || 'Default'} Rates
            </button>

            {/* Rate settings in compact containers */}
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Currency</label>
                  <input type="text" value={delCurrency} onChange={e => setDelCurrency(e.target.value)} style={{ ...S.input, marginBottom: 0 }} placeholder="Rp" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Max Distance</label>
                  <input type="number" value={delMaxKm} onChange={e => setDelMaxKm(parseInt(e.target.value) || 0)} style={{ ...S.input, marginBottom: 0 }} placeholder="20" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Min Fee (flat)</label>
                  <input type="number" value={delMinCharge} onChange={e => setDelMinCharge(parseInt(e.target.value) || 0)} style={{ ...S.input, marginBottom: 0 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Min Distance (km)</label>
                  <input type="number" value={delMinKm} onChange={e => setDelMinKm(parseInt(e.target.value) || 1)} style={{ ...S.input, marginBottom: 0 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Per KM (after {delMinKm}km)</label>
                  <input type="number" value={delPerKm} onChange={e => setDelPerKm(parseInt(e.target.value) || 0)} style={{ ...S.input, marginBottom: 0 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Free Above (0=off)</label>
                  <input type="number" value={delFreeAbove} onChange={e => setDelFreeAbove(parseInt(e.target.value) || 0)} style={{ ...S.input, marginBottom: 0 }} />
                </div>
              </div>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>0–{delMinKm}km = {delCurrency} {delMinCharge.toLocaleString()} flat, then +{delCurrency} {delPerKm.toLocaleString()}/km</p>
            </div>

            {/* Preview */}
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 14, padding: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#FFD600', marginBottom: 10 }}>Customer Preview</h3>
              {(() => {
                const calc = (km) => {
                  if (km <= delMinKm) return delMinCharge
                  return Math.ceil((delMinCharge + (km - delMinKm) * delPerKm) / 1000) * 1000
                }
                return [
                  { label: `0–${delMinKm} km`, fee: delMinCharge },
                  { label: '5 km', fee: calc(5) },
                  { label: '10 km', fee: calc(10) },
                  ...(delMaxKm > 10 ? [{ label: '15 km', fee: calc(15) }] : []),
                  ...(delMaxKm > 15 ? [{ label: '20 km', fee: calc(20) }] : []),
                ].filter(z => true).map(z => (
                  <div key={z.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{z.label}</span>
                    <span style={{ fontWeight: 800, color: '#FACC15' }}>~{delCurrency} {z.fee.toLocaleString()}</span>
                  </div>
                ))
              })()}
              {delFreeAbove > 0 && <p style={{ fontSize: 11, color: '#8DC63F', marginTop: 8 }}>Free delivery for orders above {delCurrency} {delFreeAbove.toLocaleString()}</p>}
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Based on GoJek/Grab bike rates. Customer arranges their own rider.
              </p>
            </div>
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

      {/* ═══ VENDOR ADD ITEM PAGE ═══ */}
      {addingItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexShrink: 0 }}>
            <button onClick={() => setAddingItem(false)} style={{ width: 36, height: 36, borderRadius: 18, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <div>
              <span style={{ display: 'block', fontSize: 22, fontWeight: 700, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)' }}>{shopName}</span>
              <span style={{ display: 'block', fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{shopFoodType}</span>
            </div>
          </div>

          {/* Centered container */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 16, padding: 16, width: '100%', maxWidth: 360 }}>
              {/* Photo + Spice level row */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                <label style={{ display: 'block', width: 80, height: 80, borderRadius: 12, overflow: 'hidden', border: formPhoto ? 'none' : '1px dashed rgba(141,198,63,0.4)', background: formPhoto ? 'none' : 'rgba(141,198,63,0.05)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  {formPhoto ? (
                    <img src={formPhoto} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 12 }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8DC63F', fontSize: 11, fontWeight: 700 }}>
                      <span style={{ fontSize: 22, marginBottom: 2 }}>+</span>
                      Photo
                    </div>
                  )}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (supabase && vendorId && !String(vendorId).startsWith('local')) {
                      const url = await uploadMenuImage(vendorId, file)
                      if (url) { setFormPhoto(url); return }
                    }
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

              {/* Dish name */}
              <input style={{ ...S.input, fontSize: 15, padding: '12px' }} placeholder="Dish name" value={formName} onChange={(e) => setFormName(e.target.value)} />

              {/* Spice + Category dropdowns — side by side */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <select value={formSpice} onChange={(e) => setFormSpice(Number(e.target.value))} style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: '10px 12px', appearance: 'auto', color: formSpice > 0 ? '#EF4444' : '#fff' }}>
                  <option value={0} style={{ background: '#1a1a1a' }}>No Spice</option>
                  <option value={1} style={{ background: '#1a1a1a' }}>🌶️ Medium</option>
                  <option value={2} style={{ background: '#1a1a1a' }}>🌶️🌶️ Hot</option>
                  <option value={3} style={{ background: '#1a1a1a' }}>🌶️🌶️🌶️ Very Hot</option>
                </select>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: '10px 12px', appearance: 'auto' }}>
                  <option value="Meal" style={{ background: '#1a1a1a' }}>Meal</option>
                  <option value="Snack" style={{ background: '#1a1a1a' }}>Snack</option>
                  <option value="Dessert" style={{ background: '#1a1a1a' }}>Dessert</option>
                  <option value="Drink" style={{ background: '#1a1a1a' }}>Drink</option>
                </select>
              </div>

              {/* Halal + Popular toggles */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setFormHalal(!formHalal)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: formHalal ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)', color: formHalal ? '#22C55E' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>☪️ Halal</button>
                <button onClick={() => setFormPopular(!formPopular)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: formPopular ? 'rgba(250,204,21,0.2)' : 'rgba(255,255,255,0.06)', color: formPopular ? '#FACC15' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>⭐ Popular</button>
              </div>

              {/* Price mode toggle */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setFormPriceMode('normal')} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: formPriceMode === 'normal' ? '#FACC15' : 'rgba(255,255,255,0.08)', color: formPriceMode === 'normal' ? '#000' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Normal Price</button>
                <button onClick={() => setFormPriceMode('promo')} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: formPriceMode === 'promo' ? '#EF4444' : 'rgba(255,255,255,0.08)', color: formPriceMode === 'promo' ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Promo Price</button>
              </div>
              {/* Price inputs */}
              <input style={{ ...S.input, fontSize: 15, padding: '12px' }} placeholder="Price" type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} />
              {formPriceMode === 'promo' && (
                <input style={{ ...S.input, fontSize: 15, padding: '12px', borderColor: 'rgba(239,68,68,0.3)' }} placeholder="Promo price" type="number" value={formPromoPrice} onChange={(e) => setFormPromoPrice(e.target.value)} />
              )}

              {/* Description with character limit */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <textarea
                  style={{ ...S.input, minHeight: 70, resize: 'vertical', marginBottom: 0, fontSize: 13, padding: '12px' }}
                  placeholder="Description (max 120 characters)"
                  value={formDesc}
                  maxLength={120}
                  onChange={(e) => setFormDesc(e.target.value.slice(0, 120))}
                />
                <span style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{formDesc.length}/120</span>
              </div>

              {/* Add button */}
              <button style={{ ...S.btnGreen, marginTop: 0, width: '100%' }} onClick={saveAdd}>Add to Menu</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SHOP CONFIG PAGE ═══ */}
      {shopConfig && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', backgroundImage: `url(${localStorage.getItem('vendorbasic_themeBg') || 'https://ik.imagekit.io/nepgaxllc/ChatGPT%20Image%20May%206,%202026,%2001_19_01%20PM.png'})`, backgroundSize: '100% 100%', backgroundPosition: 'center' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', flexShrink: 0 }}>
            <button onClick={() => setShopConfig(false)} style={{ width: 36, height: 36, borderRadius: 18, background: '#8DC63F', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
            <div>
              <span style={{ display: 'block', fontSize: 22, fontWeight: 700, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)' }}>{shopName}</span>
              <span style={{ display: 'block', fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{shopFoodType}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 20px' }}>
            {/* Share link */}
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 6, display: 'block' }}>Your App Link</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input readOnly value={`streetlocal.live/${shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 13 }} />
                <button onClick={(e) => { navigator.clipboard.writeText(`https://streetlocal.live/${shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`); e.target.textContent = 'Copied!'; setTimeout(() => { e.target.textContent = 'Copy' }, 2000) }} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: '#FACC15', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, minWidth: 60 }}>Copy</button>
              </div>
            </div>
            {/* Settings form */}
            <div style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: 14, padding: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#fff' }}>Shop Settings</h2>
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Shop Name</label>
            <input style={S.input} value={shopName} onChange={(e) => setShopName(e.target.value)} />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>WhatsApp Number (with country code)</label>
            <input style={S.input} value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Food Type / Description</label>
            <input style={S.input} value={shopFoodType} onChange={(e) => setShopFoodType(e.target.value)} placeholder="e.g. Indonesian Street Food" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>About Your Business (max 200 characters)</label>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical', marginBottom: 0 }} value={shopBio} maxLength={200} onChange={(e) => setShopBio(e.target.value.slice(0, 200))} placeholder="Tell customers about your food, your story, what makes you special..." />
              <span style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{shopBio.length}/200</span>
            </div>
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
                    // Extract city and country
                    const addr = data.address || {}
                    setShopCity(addr.city || addr.town || addr.village || addr.county || '')
                    setShopCountry(addr.country || '')
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>City</label>
                <input style={{ ...S.input, marginBottom: 0 }} value={shopCity} onChange={(e) => setShopCity(e.target.value)} placeholder="e.g. Yogyakarta" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Country</label>
                <input style={{ ...S.input, marginBottom: 0 }} value={shopCountry} onChange={(e) => setShopCountry(e.target.value)} placeholder="e.g. Indonesia" />
              </div>
            </div>
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8, display: 'block' }}>🕐 Opening Hours</label>
            {[
              { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
              { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
            ].map(day => (
              <div key={day.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: shopSchedule[day.key]?.off ? '#EF4444' : 'rgba(255,255,255,0.6)', width: 30, flexShrink: 0 }}>{day.label}</span>
                {shopSchedule[day.key]?.off ? (
                  <span style={{ flex: 1, fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Closed</span>
                ) : (
                  <>
                    <input type="time" value={shopSchedule[day.key]?.open || '17:00'} onChange={e => setShopSchedule({ ...shopSchedule, [day.key]: { ...shopSchedule[day.key], open: e.target.value } })} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontFamily: 'inherit' }} />
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>–</span>
                    <input type="time" value={shopSchedule[day.key]?.close || '23:00'} onChange={e => setShopSchedule({ ...shopSchedule, [day.key]: { ...shopSchedule[day.key], close: e.target.value } })} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontFamily: 'inherit' }} />
                  </>
                )}
                <button onClick={() => setShopSchedule({ ...shopSchedule, [day.key]: { ...shopSchedule[day.key], off: !shopSchedule[day.key]?.off } })} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: shopSchedule[day.key]?.off ? 'rgba(239,68,68,0.2)' : 'rgba(141,198,63,0.2)', color: shopSchedule[day.key]?.off ? '#EF4444' : '#8DC63F', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  {shopSchedule[day.key]?.off ? 'Off' : 'On'}
                </button>
              </div>
            ))}
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>📍 Google Maps Link</label>
            <input style={S.input} value={shopMapsLink} onChange={(e) => setShopMapsLink(e.target.value)} placeholder="Paste Google Maps link" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>📸 Instagram</label>
            <input style={S.input} value={shopInstagram} onChange={(e) => setShopInstagram(e.target.value)} placeholder="nasigorengpakjoko" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>🎵 TikTok</label>
            <input style={S.input} value={shopTiktok} onChange={(e) => setShopTiktok(e.target.value)} placeholder="nasigorengpakjoko" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>📘 Facebook</label>
            <input style={S.input} value={shopFacebook} onChange={(e) => setShopFacebook(e.target.value)} placeholder="https://facebook.com/yourpage" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>▶️ YouTube</label>
            <input style={S.input} value={shopYoutube} onChange={(e) => setShopYoutube(e.target.value)} placeholder="https://youtube.com/@yourchannel" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>🌐 Website</label>
            <input style={S.input} value={shopWebsite} onChange={(e) => setShopWebsite(e.target.value)} placeholder="www.yoursite.com" />
            <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' }}>Shop Status</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button style={S.toggle(shopOpen)} onClick={() => setShopOpen(!shopOpen)}>
                <div style={S.toggleDot(shopOpen)} />
              </button>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{shopOpen ? 'Open' : 'Closed'}</span>
            </div>
            <button style={{ ...S.btnGreen, width: '100%' }} onClick={() => {
              if (vendorId) updateVendorConfig(vendorId, { shop_name: shopName, shop_phone: shopPhone, shop_address: shopAddress, shop_hours: shopHours, shop_food_type: shopFoodType, shop_maps_link: shopMapsLink, shop_instagram: shopInstagram, shop_tiktok: shopTiktok, shop_facebook: shopFacebook, shop_youtube: shopYoutube, shop_website: shopWebsite, shop_open: shopOpen }).catch(() => {})
              setShopConfig(false)
            }}>{t.done || 'Done'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
