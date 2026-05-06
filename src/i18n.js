/**
 * i18n for Food Basic App
 * 10 languages with English fallback.
 */
import { useState, useEffect } from 'react'

const COUNTRY_TO_LANG = {
  ID: 'id', MY: 'ms', SG: 'en', TH: 'th', VN: 'vi', PH: 'fil',
  FR: 'fr', BE: 'fr', CH: 'fr', CA: 'fr',
  DE: 'de', AT: 'de',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es',
  CN: 'zh', TW: 'zh', HK: 'zh',
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', EG: 'ar',
  US: 'en', GB: 'en', AU: 'en', NZ: 'en', IN: 'en',
}

export const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'id', flag: '🇮🇩', label: 'ID' },
  { code: 'ms', flag: '🇲🇾', label: 'MY' },
  { code: 'vi', flag: '🇻🇳', label: 'VN' },
  { code: 'th', flag: '🇹🇭', label: 'TH' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'zh', flag: '🇨🇳', label: 'CN' },
  { code: 'ar', flag: '🇸🇦', label: 'AR' },
  { code: 'fil', flag: '🇵🇭', label: 'PH' },
]

// Translations loaded from public folder at runtime
const cache = {}

async function loadLang(code) {
  if (cache[code]) return cache[code]
  try {
    const res = await fetch(`/i18n/app-${code}.json`)
    if (!res.ok) throw new Error('not found')
    cache[code] = await res.json()
    return cache[code]
  } catch {
    return null
  }
}

export function useAppLocale() {
  const [locale, setLocale] = useState(() => localStorage.getItem('sl_app_locale') || 'en')
  const [nativeLang, setNativeLang] = useState(() => localStorage.getItem('sl_app_native') || 'en')
  const [t, setT] = useState({})

  useEffect(() => {
    Promise.all([loadLang('en'), loadLang(locale)]).then(([en, loc]) => {
      setT({ ...(en || {}), ...(loc || {}) })
    })
  }, [locale])

  // Auto-detect on first visit
  useEffect(() => {
    if (localStorage.getItem('sl_app_native')) return
    fetch('https://ip2c.org/s')
      .then(r => r.text())
      .then(text => {
        const country = text.split(';')[1]
        const lang = COUNTRY_TO_LANG[country] || 'en'
        localStorage.setItem('sl_app_native', lang)
        localStorage.setItem('sl_app_locale', lang)
        setNativeLang(lang)
        setLocale(lang)
      })
      .catch(() => {})
  }, [])

  const setLocaleAndSave = (lang) => {
    localStorage.setItem('sl_app_locale', lang)
    setLocale(lang)
  }

  return { locale, setLocale: setLocaleAndSave, t, nativeLang }
}
