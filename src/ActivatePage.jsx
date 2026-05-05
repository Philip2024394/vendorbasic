import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'

const CITIES = ['Yogyakarta', 'Solo', 'Semarang', 'Jakarta', 'Bali', 'Surabaya', 'Bandung', 'Malang', 'Medan', 'Makassar']

/* ─── Styles ─── */
const S = {
  page: { background: '#0a0a0a', minHeight: '100vh', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  container: { maxWidth: 440, width: '100%', padding: '24px 20px' },
  card: { background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', borderRadius: 20, padding: 24, marginBottom: 16 },
  input: { width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 16, outline: 'none', marginBottom: 12, boxSizing: 'border-box' },
  select: { width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 16, outline: 'none', marginBottom: 12, boxSizing: 'border-box', appearance: 'auto' },
  btnGreen: { width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: '#8DC63F', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  label: { fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 6, display: 'block' },
  stepNum: { width: 28, height: 28, borderRadius: 14, background: '#8DC63F', color: '#fff', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 10, flexShrink: 0 },
  error: { color: '#ff6b6b', fontSize: 14, marginBottom: 10, padding: '10px 14px', background: 'rgba(255,60,60,0.1)', borderRadius: 10 },
  success: { textAlign: 'center', padding: '20px 0' },
}

export default function ActivatePage() {
  const [step, setStep] = useState('form') // 'form' | 'success'
  const [vendorName, setVendorName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [password, setPassword] = useState('')
  const [city, setCity] = useState('Yogyakarta')
  const [activationCode, setActivationCode] = useState('')
  const [salesPerson, setSalesPerson] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleActivate = async () => {
    setError('')

    // Validate
    if (!vendorName.trim()) { setError('Enter vendor name'); return }
    if (!whatsapp.trim()) { setError('Enter WhatsApp number'); return }
    if (!password.trim() || password.length < 4) { setError('Password must be at least 4 characters'); return }
    if (!activationCode.trim()) { setError('Enter activation code'); return }
    if (!salesPerson.trim()) { setError('Enter sales person name'); return }

    setLoading(true)

    try {
      const phone = whatsapp.replace(/[^0-9]/g, '')
      const slug = vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 30)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      if (supabase) {
        // 1. Validate activation code
        const { data: codeData, error: codeErr } = await supabase.from('activation_codes')
          .select('*')
          .eq('code', activationCode.trim().toUpperCase())
          .eq('status', 'unused')
          .single()

        if (codeErr || !codeData) {
          setError('Invalid or already used activation code')
          setLoading(false)
          return
        }

        // 2. Create vendor account
        const { data: vendor, error: vendorErr } = await supabase.from('vendor_accounts').insert({
          phone,
          password_hash: password,
          shop_name: vendorName.trim(),
          shop_phone: phone,
          slug,
          city,
          status: 'active',
          plan: codeData.plan || 'basic',
          plan_price: codeData.price || 35000,
          activated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          activated_by: salesPerson.trim(),
        }).select().single()

        if (vendorErr) {
          if (vendorErr.message.includes('duplicate') || vendorErr.message.includes('unique')) {
            setError('A vendor with this phone number already exists')
          } else {
            setError(vendorErr.message)
          }
          setLoading(false)
          return
        }

        // 3. Mark code as used
        await supabase.from('activation_codes').update({
          status: 'used',
          used_by_vendor: vendor.id,
          used_at: now.toISOString(),
        }).eq('id', codeData.id)

        // 4. Record payment
        await supabase.from('payment_records').insert({
          vendor_id: vendor.id,
          amount: codeData.price || 35000,
          period_start: now.toISOString(),
          period_end: expiresAt.toISOString(),
          status: 'paid',
          activation_code: activationCode.trim().toUpperCase(),
          collected_by: salesPerson.trim(),
        })

        setResult({
          vendorName: vendorName.trim(),
          slug,
          link: `${slug}.streetlocal.live`,
          expiresAt: expiresAt.toLocaleDateString(),
        })
      } else {
        // Demo mode — no supabase
        setResult({
          vendorName: vendorName.trim(),
          slug,
          link: `${slug}.streetlocal.live`,
          expiresAt: expiresAt.toLocaleDateString(),
        })
      }

      setStep('success')
    } catch (e) {
      setError(e.message || 'Activation failed')
    }

    setLoading(false)
  }

  const resetForm = () => {
    setStep('form')
    setVendorName('')
    setWhatsapp('')
    setPassword('')
    setCity('Yogyakarta')
    setActivationCode('')
    setSalesPerson('')
    setError('')
    setResult(null)
  }

  return (
    <div style={S.page}>
      <div style={S.container}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Activate Vendor</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Sales activation portal</p>
        </div>

        {step === 'form' && (
          <div style={S.card}>
            {/* Step 1: Vendor Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>
                <span style={S.stepNum}>1</span>Vendor Name
              </label>
              <input style={S.input} placeholder="e.g. Nasi Goreng Pak Joko" value={vendorName} onChange={e => setVendorName(e.target.value)} />
            </div>

            {/* Step 2: WhatsApp */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>
                <span style={S.stepNum}>2</span>WhatsApp Number
              </label>
              <input style={S.input} placeholder="e.g. 6281234567890" type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
            </div>

            {/* Step 3: Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>
                <span style={S.stepNum}>3</span>Create Password
              </label>
              <input style={S.input} placeholder="Min 4 characters" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {/* Step 4: City */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>
                <span style={S.stepNum}>4</span>City
              </label>
              <select style={S.select} value={city} onChange={e => setCity(e.target.value)}>
                {CITIES.map(c => <option key={c} value={c} style={{ background: '#1a1a1a' }}>{c}</option>)}
              </select>
            </div>

            {/* Step 5: Activation Code */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>
                <span style={S.stepNum}>5</span>Activation Code
              </label>
              <input
                style={{ ...S.input, fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}
                placeholder="SL-XXXX-XXXX"
                value={activationCode}
                onChange={e => setActivationCode(e.target.value.toUpperCase())}
              />
            </div>

            {/* Step 6: Sales Person */}
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>
                <span style={S.stepNum}>6</span>Sales Person Name
              </label>
              <input style={S.input} placeholder="Your name" value={salesPerson} onChange={e => setSalesPerson(e.target.value)} />
            </div>

            {error && <div style={S.error}>{error}</div>}

            <button
              style={{ ...S.btnGreen, opacity: loading ? 0.5 : 1 }}
              disabled={loading}
              onClick={handleActivate}
            >
              {loading ? 'Activating...' : 'Activate Account'}
            </button>

            <button
              onClick={() => window.location.href = '/'}
              style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, color: 'rgba(255,255,255,0.5)', fontSize: 15, cursor: 'pointer', marginTop: 10, padding: 14 }}
            >Back to App</button>
          </div>
        )}

        {step === 'success' && result && (
          <div style={S.card}>
            <div style={S.success}>
              <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(141,198,63,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32, color: '#8DC63F' }}>
                &#10003;
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: '#8DC63F' }}>Account Activated!</h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.5 }}>
                {result.vendorName} is now active until {result.expiresAt}
              </p>

              {/* Vendor Link */}
              <div style={{ background: 'rgba(141,198,63,0.08)', border: '1px solid rgba(141,198,63,0.25)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Vendor's Menu Link</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#8DC63F', wordBreak: 'break-all' }}>{result.link}</div>
              </div>

              {/* QR code link */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>QR Code</div>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://${result.link}&bgcolor=000000&color=8DC63F`}
                  alt="QR Code"
                  style={{ width: 160, height: 160, borderRadius: 12 }}
                />
              </div>

              <button
                style={S.btnGreen}
                onClick={() => window.location.href = `/?vendor=${result.slug}`}
              >
                Setup Menu Now
              </button>

              <button
                style={{ ...S.btnGreen, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', marginTop: 8 }}
                onClick={resetForm}
              >
                Activate Another Vendor
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
