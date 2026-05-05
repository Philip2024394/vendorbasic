import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/* ─── Demo Data ─── */
const DEMO_VENDORS = [
  { id: 'v1', shop_name: 'Nasi Goreng Pak Joko', phone: '6281234567001', city: 'Yogyakarta', status: 'active', plan: 'basic', plan_price: 35000, activated_at: '2026-04-01T00:00:00Z', expires_at: '2026-05-31T00:00:00Z', activated_by: 'Andi', created_at: '2026-04-01T00:00:00Z' },
  { id: 'v2', shop_name: 'Bakso Bu Sri', phone: '6281234567002', city: 'Yogyakarta', status: 'active', plan: 'basic', plan_price: 35000, activated_at: '2026-04-15T00:00:00Z', expires_at: '2026-05-15T00:00:00Z', activated_by: 'Budi', created_at: '2026-04-15T00:00:00Z' },
  { id: 'v3', shop_name: 'Sate Madura Haji', phone: '6281234567003', city: 'Solo', status: 'expired', plan: 'basic', plan_price: 35000, activated_at: '2026-03-01T00:00:00Z', expires_at: '2026-03-31T00:00:00Z', activated_by: 'Andi', created_at: '2026-03-01T00:00:00Z' },
  { id: 'v4', shop_name: 'Es Teh Mbak Rina', phone: '6281234567004', city: 'Semarang', status: 'pending', plan: 'basic', plan_price: 35000, activated_at: null, expires_at: null, activated_by: null, created_at: '2026-04-28T00:00:00Z' },
  { id: 'v5', shop_name: 'Ayam Geprek Mas Doni', phone: '6281234567005', city: 'Yogyakarta', status: 'active', plan: 'basic', plan_price: 35000, activated_at: '2026-04-20T00:00:00Z', expires_at: '2026-06-20T00:00:00Z', activated_by: 'Budi', created_at: '2026-04-20T00:00:00Z' },
]

const DEMO_CODES = [
  { id: 'c1', code: 'SL-AB12-CD34', status: 'used', assigned_to: 'Andi', used_by_vendor: 'v1', used_at: '2026-04-01T10:00:00Z', created_at: '2026-03-25T00:00:00Z' },
  { id: 'c2', code: 'SL-EF56-GH78', status: 'used', assigned_to: 'Budi', used_by_vendor: 'v2', used_at: '2026-04-15T10:00:00Z', created_at: '2026-04-10T00:00:00Z' },
  { id: 'c3', code: 'SL-IJ90-KL12', status: 'used', assigned_to: 'Andi', used_by_vendor: 'v3', used_at: '2026-03-01T10:00:00Z', created_at: '2026-02-25T00:00:00Z' },
  { id: 'c4', code: 'SL-MN34-OP56', status: 'unused', assigned_to: 'Andi', used_by_vendor: null, used_at: null, created_at: '2026-04-20T00:00:00Z' },
  { id: 'c5', code: 'SL-QR78-ST90', status: 'unused', assigned_to: 'Budi', used_by_vendor: null, used_at: null, created_at: '2026-04-20T00:00:00Z' },
  { id: 'c6', code: 'SL-UV12-WX34', status: 'unused', assigned_to: null, used_by_vendor: null, used_at: null, created_at: '2026-04-22T00:00:00Z' },
  { id: 'c7', code: 'SL-YZ56-AB78', status: 'unused', assigned_to: null, used_by_vendor: null, used_at: null, created_at: '2026-04-22T00:00:00Z' },
  { id: 'c8', code: 'SL-CD90-EF12', status: 'unused', assigned_to: null, used_by_vendor: null, used_at: null, created_at: '2026-04-22T00:00:00Z' },
  { id: 'c9', code: 'SL-GH34-IJ56', status: 'used', assigned_to: 'Budi', used_by_vendor: 'v5', used_at: '2026-04-20T10:00:00Z', created_at: '2026-04-18T00:00:00Z' },
  { id: 'c10', code: 'SL-KL78-MN90', status: 'unused', assigned_to: null, used_by_vendor: null, used_at: null, created_at: '2026-04-25T00:00:00Z' },
]

const DEMO_PAYMENTS = [
  { id: 'p1', vendor_id: 'v1', amount: 35000, period_start: '2026-04-01T00:00:00Z', period_end: '2026-05-01T00:00:00Z', status: 'paid', activation_code: 'SL-AB12-CD34', collected_by: 'Andi', created_at: '2026-04-01T00:00:00Z' },
  { id: 'p2', vendor_id: 'v2', amount: 35000, period_start: '2026-04-15T00:00:00Z', period_end: '2026-05-15T00:00:00Z', status: 'paid', activation_code: 'SL-EF56-GH78', collected_by: 'Budi', created_at: '2026-04-15T00:00:00Z' },
  { id: 'p3', vendor_id: 'v3', amount: 35000, period_start: '2026-03-01T00:00:00Z', period_end: '2026-03-31T00:00:00Z', status: 'overdue', activation_code: 'SL-IJ90-KL12', collected_by: 'Andi', created_at: '2026-03-01T00:00:00Z' },
  { id: 'p4', vendor_id: 'v5', amount: 35000, period_start: '2026-04-20T00:00:00Z', period_end: '2026-05-20T00:00:00Z', status: 'paid', activation_code: 'SL-GH34-IJ56', collected_by: 'Budi', created_at: '2026-04-20T00:00:00Z' },
  { id: 'p5', vendor_id: 'v1', amount: 35000, period_start: '2026-05-01T00:00:00Z', period_end: '2026-05-31T00:00:00Z', status: 'paid', activation_code: null, collected_by: 'Andi', notes: 'Renewal', created_at: '2026-05-01T00:00:00Z' },
]

const DEFAULT_CITY_ZONES = {
  'Yogyakarta': [
    { name: 'Pickup', fee: 0 },
    { name: '0-2 km', fee: 0 },
    { name: '2-5 km', fee: 8000 },
    { name: '5-10 km', fee: 15000 },
    { name: '10-15 km', fee: 22000 },
  ],
  'Solo': [
    { name: 'Pickup', fee: 0 },
    { name: '0-2 km', fee: 0 },
    { name: '2-5 km', fee: 7000 },
    { name: '5-10 km', fee: 13000 },
  ],
  'Semarang': [
    { name: 'Pickup', fee: 0 },
    { name: '0-2 km', fee: 0 },
    { name: '2-5 km', fee: 8000 },
    { name: '5-10 km', fee: 14000 },
  ],
}

/* ─── Helpers ─── */
const fmt = (n) => 'Rp ' + Number(n).toLocaleString('id-ID')

function generateCodeString() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `SL-${seg()}-${seg()}`
}

function daysRemaining(expiresAt) {
  if (!expiresAt) return null
  const diff = new Date(expiresAt) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/* ─── Supabase Functions ─── */
async function generateCodes(quantity) {
  const codes = Array.from({ length: quantity }, () => ({
    code: generateCodeString(),
    status: 'unused',
    plan: 'basic',
    days: 30,
    price: 35000,
  }))
  if (!supabase) return codes.map((c, i) => ({ ...c, id: 'gen-' + Date.now() + '-' + i, created_at: new Date().toISOString() }))
  const { data, error } = await supabase.from('activation_codes').insert(codes).select()
  if (error) throw new Error(error.message)
  return data
}

async function getAllVendors() {
  if (!supabase) return DEMO_VENDORS
  const { data } = await supabase.from('vendor_accounts').select('*').order('created_at', { ascending: false })
  return data || DEMO_VENDORS
}

async function getAllCodes() {
  if (!supabase) return DEMO_CODES
  const { data } = await supabase.from('activation_codes').select('*').order('created_at', { ascending: false })
  return data || DEMO_CODES
}

async function getAllPayments() {
  if (!supabase) return DEMO_PAYMENTS
  const { data } = await supabase.from('payment_records').select('*').order('created_at', { ascending: false })
  return data || DEMO_PAYMENTS
}

async function activateVendor(vendorId, code, salesPerson) {
  const now = new Date()
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  if (!supabase) return { activated_at: now.toISOString(), expires_at: expires.toISOString() }
  await supabase.from('vendor_accounts').update({
    status: 'active',
    activated_at: now.toISOString(),
    expires_at: expires.toISOString(),
    activated_by: salesPerson,
  }).eq('id', vendorId)
  if (code) {
    await supabase.from('activation_codes').update({
      status: 'used',
      used_by_vendor: vendorId,
      used_at: now.toISOString(),
    }).eq('code', code)
  }
  return { activated_at: now.toISOString(), expires_at: expires.toISOString() }
}

async function deactivateVendor(vendorId) {
  if (!supabase) return
  await supabase.from('vendor_accounts').update({ status: 'expired' }).eq('id', vendorId)
}

async function extendVendor(vendorId, days, currentExpires) {
  const base = currentExpires && new Date(currentExpires) > new Date() ? new Date(currentExpires) : new Date()
  const newExpires = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  if (!supabase) return newExpires.toISOString()
  await supabase.from('vendor_accounts').update({
    status: 'active',
    expires_at: newExpires.toISOString(),
  }).eq('id', vendorId)
  return newExpires.toISOString()
}

async function deleteVendorAccount(vendorId) {
  if (!supabase) return
  await supabase.from('vendor_menu_items').delete().eq('vendor_id', vendorId)
  await supabase.from('payment_records').delete().eq('vendor_id', vendorId)
  await supabase.from('activation_codes').update({ used_by_vendor: null, status: 'unused', used_at: null }).eq('used_by_vendor', vendorId)
  await supabase.from('vendor_accounts').delete().eq('id', vendorId)
}

async function recordPayment(vendorId, amount, code, collectedBy) {
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const record = {
    vendor_id: vendorId,
    amount,
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
    status: 'paid',
    activation_code: code || null,
    collected_by: collectedBy || null,
  }
  if (!supabase) return { ...record, id: 'pay-' + Date.now(), created_at: now.toISOString() }
  const { data, error } = await supabase.from('payment_records').insert(record).select().single()
  if (error) throw new Error(error.message)
  return data
}

async function assignCodesToSales(codeIds, salesName) {
  if (!supabase) return
  for (const id of codeIds) {
    await supabase.from('activation_codes').update({ assigned_to: salesName }).eq('id', id)
  }
}

/* ─── Styles ─── */
const S = {
  page: { background: '#0a0a0a', minHeight: '100vh', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', fontSize: 14 },
  container: { maxWidth: 960, margin: '0 auto', padding: '0 16px 40px' },
  card: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', borderRadius: 16, padding: 20, marginBottom: 12 },
  input: { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, outline: 'none', marginBottom: 10, boxSizing: 'border-box' },
  btnGreen: { padding: '12px 24px', borderRadius: 12, border: 'none', background: '#8DC63F', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  btnSmall: (bg) => ({ padding: '6px 12px', borderRadius: 8, border: 'none', background: bg || 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, cursor: 'pointer', minHeight: 36 }),
  badge: (color) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: color === 'green' ? 'rgba(141,198,63,0.2)' : color === 'red' ? 'rgba(255,60,60,0.2)' : 'rgba(255,204,21,0.2)', color: color === 'green' ? '#8DC63F' : color === 'red' ? '#ff6b6b' : '#FACC15' }),
  tab: (active) => ({ padding: '10px 18px', borderRadius: 10, border: 'none', background: active ? '#8DC63F' : 'rgba(255,255,255,0.06)', color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: active ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#111', borderRadius: 20, maxWidth: 340, width: '90%', padding: 24, position: 'relative' },
  closeBtnX: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statCard: { background: 'rgba(0,0,0,0.7)', borderRadius: 14, padding: 16, textAlign: 'center', flex: 1, minWidth: 130 },
  statNum: { fontSize: 28, fontWeight: 800, color: '#8DC63F' },
  statLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
}

/* ─── Admin Dashboard ─── */
export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(() => localStorage.getItem('admin_logged_in') === 'true')
  const [adminPass, setAdminPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState('overview')
  const [vendors, setVendors] = useState([])
  const [codes, setCodes] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [codeFilter, setCodeFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [genQty, setGenQty] = useState(10)
  const [assignName, setAssignName] = useState('')
  const [selectedCodes, setSelectedCodes] = useState([])
  const [cityZones, setCityZones] = useState(() => {
    try { const v = localStorage.getItem('admin_city_zones'); return v ? JSON.parse(v) : DEFAULT_CITY_ZONES } catch { return DEFAULT_CITY_ZONES }
  })
  const [newCityName, setNewCityName] = useState('')
  const [newZoneName, setNewZoneName] = useState('')
  const [newZoneFee, setNewZoneFee] = useState('')
  const [editCityKey, setEditCityKey] = useState('Yogyakarta')
  const [copied, setCopied] = useState(null)

  const adminPassword = localStorage.getItem('admin_password') || 'admin2026'

  const handleLogin = () => {
    if (adminPass === adminPassword) {
      localStorage.setItem('admin_logged_in', 'true')
      setLoggedIn(true)
      setLoginError('')
    } else {
      setLoginError('Wrong password')
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [v, c, p] = await Promise.all([getAllVendors(), getAllCodes(), getAllPayments()])
      setVendors(v)
      setCodes(c)
      setPayments(p)
    } catch (e) {
      console.error('Load error:', e)
      setVendors(DEMO_VENDORS)
      setCodes(DEMO_CODES)
      setPayments(DEMO_PAYMENTS)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (loggedIn) loadData()
  }, [loggedIn, loadData])

  useEffect(() => {
    localStorage.setItem('admin_city_zones', JSON.stringify(cityZones))
  }, [cityZones])

  const handleGenerateCodes = async () => {
    try {
      const newCodes = await generateCodes(genQty)
      setCodes(prev => [...newCodes, ...prev])
    } catch (e) { alert('Error generating codes: ' + e.message) }
  }

  const handleAssignCodes = async () => {
    if (!assignName.trim() || selectedCodes.length === 0) return
    try {
      await assignCodesToSales(selectedCodes, assignName)
      setCodes(prev => prev.map(c => selectedCodes.includes(c.id) ? { ...c, assigned_to: assignName } : c))
      setSelectedCodes([])
      setAssignName('')
    } catch (e) { alert('Error assigning: ' + e.message) }
  }

  const handleActivateVendor = async (vendor) => {
    try {
      const result = await activateVendor(vendor.id, null, 'Admin')
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, status: 'active', activated_at: result.activated_at, expires_at: result.expires_at, activated_by: 'Admin' } : v))
      await recordPayment(vendor.id, 35000, null, 'Admin')
      loadData()
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleDeactivateVendor = async (vendor) => {
    try {
      await deactivateVendor(vendor.id)
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, status: 'expired' } : v))
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleExtendVendor = async (vendor) => {
    try {
      const newExpires = await extendVendor(vendor.id, 30, vendor.expires_at)
      setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, status: 'active', expires_at: newExpires } : v))
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleDeleteVendor = async (vendor) => {
    if (!confirm(`Delete ${vendor.shop_name}? This cannot be undone.`)) return
    try {
      await deleteVendorAccount(vendor.id)
      setVendors(prev => prev.filter(v => v.id !== vendor.id))
    } catch (e) { alert('Error: ' + e.message) }
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied(null), 2000)
    }).catch(() => {})
  }

  const getVendorName = (vendorId) => {
    const v = vendors.find(ven => ven.id === vendorId)
    return v ? v.shop_name : vendorId || '-'
  }

  const statusColor = (s) => s === 'active' || s === 'paid' ? 'green' : s === 'expired' || s === 'overdue' ? 'red' : 'yellow'

  // Stats
  const activeVendors = vendors.filter(v => v.status === 'active').length
  const expiredVendors = vendors.filter(v => v.status === 'expired').length
  const pendingVendors = vendors.filter(v => v.status === 'pending').length
  const unusedCodes = codes.filter(c => c.status === 'unused').length
  const now = new Date()
  const thisMonth = payments.filter(p => {
    const d = new Date(p.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const revenueThisMonth = thisMonth.reduce((s, p) => s + Number(p.amount), 0)
  const revenueTotal = payments.reduce((s, p) => s + Number(p.amount), 0)

  // Filtered
  const filteredVendors = vendors.filter(v => {
    if (vendorFilter !== 'all' && v.status !== vendorFilter) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return (v.shop_name || '').toLowerCase().includes(term) || (v.phone || '').includes(term)
    }
    return true
  })

  const filteredCodes = codes.filter(c => {
    if (codeFilter === 'unused') return c.status === 'unused'
    if (codeFilter === 'used') return c.status === 'used'
    return true
  })

  const filteredPayments = payments.filter(p => {
    if (paymentFilter === 'paid') return p.status === 'paid'
    if (paymentFilter === 'due') return p.status === 'due'
    if (paymentFilter === 'overdue') return p.status === 'overdue'
    return true
  })

  /* ─── Login Screen ─── */
  if (!loggedIn) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...S.modal, maxWidth: 300 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>Admin Login</h3>
          <input
            style={S.input}
            type="password"
            placeholder="Password"
            value={adminPass}
            onChange={(e) => setAdminPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {loginError && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 8 }}>{loginError}</div>}
          <button style={{ ...S.btnGreen, width: '100%' }} onClick={handleLogin}>Login</button>
          <button
            onClick={() => window.location.href = '/'}
            style={{ width: '100%', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer', marginTop: 12, padding: 8 }}
          >Back to App</button>
        </div>
      </div>
    )
  }

  /* ─── Dashboard ─── */
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a1a,#0a0a0a)', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ ...S.container, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Admin Dashboard</h1>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>VendorBasic Management</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btnSmall('rgba(255,255,255,0.06)')} onClick={loadData}>Refresh</button>
            <button style={S.btnSmall('rgba(255,60,60,0.15)')} onClick={() => { localStorage.removeItem('admin_logged_in'); setLoggedIn(false) }}>Logout</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ ...S.container, padding: '12px 16px', display: 'flex', gap: 8, overflowX: 'auto', maxWidth: 960, margin: '0 auto' }}>
        {['overview', 'vendors', 'codes', 'payments', 'zones'].map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'vendors' ? 'Vendors' : t === 'codes' ? 'Codes' : t === 'payments' ? 'Payments' : 'City Zones'}
          </button>
        ))}
      </div>

      <div style={S.container}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Loading...</div>}

        {/* ═══ OVERVIEW ═══ */}
        {!loading && tab === 'overview' && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={S.statCard}>
                <div style={S.statNum}>{vendors.length}</div>
                <div style={S.statLabel}>Total Vendors</div>
              </div>
              <div style={S.statCard}>
                <div style={{ ...S.statNum, color: '#8DC63F' }}>{activeVendors}</div>
                <div style={S.statLabel}>Active</div>
              </div>
              <div style={S.statCard}>
                <div style={{ ...S.statNum, color: '#ff6b6b' }}>{expiredVendors}</div>
                <div style={S.statLabel}>Expired</div>
              </div>
              <div style={S.statCard}>
                <div style={{ ...S.statNum, color: '#FACC15' }}>{pendingVendors}</div>
                <div style={S.statLabel}>Pending</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={S.statCard}>
                <div style={S.statNum}>{fmt(revenueThisMonth)}</div>
                <div style={S.statLabel}>Revenue This Month</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statNum}>{fmt(revenueTotal)}</div>
                <div style={S.statLabel}>Revenue Total</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statNum}>{unusedCodes}</div>
                <div style={S.statLabel}>Unused Codes</div>
              </div>
            </div>
          </>
        )}

        {/* ═══ VENDORS ═══ */}
        {!loading && tab === 'vendors' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0, minWidth: 200 }}
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {['all', 'active', 'expired', 'pending'].map(f => (
                <button key={f} style={S.tab(vendorFilter === f)} onClick={() => setVendorFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {filteredVendors.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No vendors found</div>
            )}

            {filteredVendors.map(v => {
              const days = daysRemaining(v.expires_at)
              return (
                <div key={v.id} style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{v.shop_name || 'Unnamed'}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{v.phone} | {v.city || 'N/A'}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={S.badge(statusColor(v.status))}>{v.status}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{v.plan || 'basic'}</span>
                        {days !== null && (
                          <span style={{ fontSize: 13, color: days > 0 ? '#8DC63F' : '#ff6b6b', fontWeight: 600 }}>
                            {days > 0 ? `${days} days left` : 'Expired'}
                          </span>
                        )}
                        {v.expires_at && (
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                            Exp: {new Date(v.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {v.status !== 'active' && (
                        <button style={S.btnSmall('rgba(141,198,63,0.2)')} onClick={() => handleActivateVendor(v)}>Activate</button>
                      )}
                      {v.status === 'active' && (
                        <button style={S.btnSmall('rgba(255,204,21,0.2)')} onClick={() => handleDeactivateVendor(v)}>Deactivate</button>
                      )}
                      <button style={S.btnSmall('rgba(141,198,63,0.1)')} onClick={() => handleExtendVendor(v)}>+30 Days</button>
                      <button style={S.btnSmall('rgba(255,60,60,0.15)')} onClick={() => handleDeleteVendor(v)}>Delete</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ═══ CODES ═══ */}
        {!loading && tab === 'codes' && (
          <>
            {/* Generate section */}
            <div style={S.card}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Generate Codes</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {[10, 25, 50].map(n => (
                  <button key={n} style={S.tab(genQty === n)} onClick={() => setGenQty(n)}>{n}</button>
                ))}
                <button style={S.btnGreen} onClick={handleGenerateCodes}>Generate {genQty} Codes</button>
              </div>
            </div>

            {/* Assign section */}
            <div style={S.card}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Assign to Sales Person</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  style={{ ...S.input, flex: 1, marginBottom: 0, minWidth: 150 }}
                  placeholder="Sales person name"
                  value={assignName}
                  onChange={e => setAssignName(e.target.value)}
                />
                <button
                  style={{ ...S.btnGreen, opacity: selectedCodes.length > 0 && assignName.trim() ? 1 : 0.4 }}
                  disabled={selectedCodes.length === 0 || !assignName.trim()}
                  onClick={handleAssignCodes}
                >
                  Assign ({selectedCodes.length})
                </button>
              </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['all', 'unused', 'used'].map(f => (
                <button key={f} style={S.tab(codeFilter === f)} onClick={() => setCodeFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Code list */}
            {filteredCodes.map(c => (
              <div key={c.id} style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {c.status === 'unused' && (
                    <input
                      type="checkbox"
                      checked={selectedCodes.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedCodes(prev => [...prev, c.id])
                        else setSelectedCodes(prev => prev.filter(id => id !== c.id))
                      }}
                      style={{ width: 18, height: 18, accentColor: '#8DC63F' }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1 }}>{c.code}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {c.assigned_to ? `Assigned: ${c.assigned_to}` : 'Unassigned'}
                      {c.used_by_vendor ? ` | Used by: ${getVendorName(c.used_by_vendor)}` : ''}
                      {c.used_at ? ` | ${new Date(c.used_at).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={S.badge(c.status === 'unused' ? 'yellow' : 'green')}>{c.status}</span>
                  <button
                    style={S.btnSmall('rgba(255,255,255,0.06)')}
                    onClick={() => copyCode(c.code)}
                  >
                    {copied === c.code ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}

            {filteredCodes.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No codes found</div>
            )}
          </>
        )}

        {/* ═══ PAYMENTS ═══ */}
        {!loading && tab === 'payments' && (
          <>
            {/* Monthly summary */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={S.statCard}>
                <div style={S.statNum}>{fmt(revenueThisMonth)}</div>
                <div style={S.statLabel}>This Month</div>
              </div>
              <div style={S.statCard}>
                <div style={S.statNum}>{fmt(revenueTotal)}</div>
                <div style={S.statLabel}>All Time</div>
              </div>
              <div style={S.statCard}>
                <div style={{ ...S.statNum, color: '#ff6b6b' }}>{payments.filter(p => p.status === 'overdue').length}</div>
                <div style={S.statLabel}>Overdue</div>
              </div>
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['all', 'paid', 'due', 'overdue'].map(f => (
                <button key={f} style={S.tab(paymentFilter === f)} onClick={() => setPaymentFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {filteredPayments.map(p => (
              <div key={p.id} style={{ ...S.card, ...(p.status === 'overdue' ? { border: '1px solid rgba(255,60,60,0.3)' } : {}) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{getVendorName(p.vendor_id)}</div>
                    <div style={{ fontSize: 14, color: '#FACC15', fontWeight: 700 }}>{fmt(p.amount)}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                      {p.period_start ? new Date(p.period_start).toLocaleDateString() : ''} - {p.period_end ? new Date(p.period_end).toLocaleDateString() : ''}
                    </div>
                    {p.collected_by && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Collected by: {p.collected_by}</div>}
                    {p.notes && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{p.notes}</div>}
                  </div>
                  <span style={S.badge(statusColor(p.status))}>{p.status}</span>
                </div>
              </div>
            ))}

            {filteredPayments.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No payments found</div>
            )}
          </>
        )}

        {/* ═══ CITY ZONES ═══ */}
        {!loading && tab === 'zones' && (
          <>
            {/* Add City */}
            <div style={S.card}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Add New City</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  style={{ ...S.input, flex: 1, marginBottom: 0 }}
                  placeholder="City name"
                  value={newCityName}
                  onChange={e => setNewCityName(e.target.value)}
                />
                <button
                  style={{ ...S.btnGreen, opacity: newCityName.trim() ? 1 : 0.4 }}
                  disabled={!newCityName.trim()}
                  onClick={() => {
                    if (!newCityName.trim()) return
                    setCityZones(prev => ({ ...prev, [newCityName.trim()]: [{ name: 'Pickup', fee: 0 }] }))
                    setEditCityKey(newCityName.trim())
                    setNewCityName('')
                  }}
                >Add City</button>
              </div>
            </div>

            {/* City selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {Object.keys(cityZones).map(city => (
                <button key={city} style={S.tab(editCityKey === city)} onClick={() => setEditCityKey(city)}>{city}</button>
              ))}
            </div>

            {/* Zone list for selected city */}
            {editCityKey && cityZones[editCityKey] && (
              <div style={S.card}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{editCityKey} Zones</h3>
                {cityZones[editCityKey].map((z, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 14 }}>{z.name}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: z.fee === 0 ? '#8DC63F' : '#FACC15' }}>
                        {z.fee === 0 ? 'FREE' : fmt(z.fee)}
                      </span>
                      <button
                        style={S.btnSmall('rgba(255,60,60,0.15)')}
                        onClick={() => {
                          setCityZones(prev => ({
                            ...prev,
                            [editCityKey]: prev[editCityKey].filter((_, idx) => idx !== i)
                          }))
                        }}
                      >X</button>
                    </div>
                  </div>
                ))}

                {/* Add zone */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                  <input style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Zone name (e.g. 2-5 km)" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} />
                  <input style={{ ...S.input, width: 100, marginBottom: 0 }} placeholder="Fee" type="number" value={newZoneFee} onChange={e => setNewZoneFee(e.target.value)} />
                  <button style={S.btnSmall('#8DC63F')} onClick={() => {
                    if (!newZoneName.trim()) return
                    setCityZones(prev => ({
                      ...prev,
                      [editCityKey]: [...prev[editCityKey], { name: newZoneName.trim(), fee: Number(newZoneFee) || 0 }]
                    }))
                    setNewZoneName('')
                    setNewZoneFee('')
                  }}>Add</button>
                </div>

                {/* Delete city */}
                {editCityKey !== 'Yogyakarta' && (
                  <button
                    style={{ ...S.btnSmall('rgba(255,60,60,0.15)'), marginTop: 12, width: '100%', textAlign: 'center' }}
                    onClick={() => {
                      const next = { ...cityZones }
                      delete next[editCityKey]
                      setCityZones(next)
                      setEditCityKey(Object.keys(next)[0] || '')
                    }}
                  >Delete {editCityKey}</button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
