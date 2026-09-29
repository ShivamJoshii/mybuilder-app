import 'server-only'

export type Weather = {
  code: number
  condition: string
  high_c: number
  low_c: number
  wind_kmh: number
  humidity_pct: number | null
  precip_mm: number
  fetched_at: string
}

// WMO weather codes → plain words
const CODES: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent rain showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
}

/** City + province → coordinates (Open-Meteo geocoding; Google Maps later). */
export async function geocode(city: string | null, province: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!city) return null
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&country=CA&language=en`
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 }, signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: { latitude: number; longitude: number; admin1?: string }[] }
    const results = data.results ?? []
    const PROV: Record<string, string> = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon' }
    const match = results.find((r) => province && r.admin1 === PROV[province]) ?? results[0]
    return match ? { lat: match.latitude, lng: match.longitude } : null
  } catch {
    return null
  }
}

/** Daily weather for a date (past ~3 months or next 2 weeks). */
export async function dailyWeather(lat: number, lng: number, date: string, tz = 'America/Edmonton'): Promise<Weather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,relative_humidity_2m_mean` +
    `&timezone=${encodeURIComponent(tz)}&start_date=${date}&end_date=${date}`
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 }, signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const d = ((await res.json()) as { daily?: Record<string, (number | null)[]> }).daily
    if (!d || d.weather_code?.[0] == null) return null
    const code = Number(d.weather_code[0])
    return {
      code,
      condition: CODES[code] ?? 'Unknown',
      high_c: Math.round(Number(d.temperature_2m_max[0])),
      low_c: Math.round(Number(d.temperature_2m_min[0])),
      wind_kmh: Math.round(Number(d.wind_speed_10m_max[0])),
      humidity_pct: d.relative_humidity_2m_mean?.[0] == null ? null : Math.round(Number(d.relative_humidity_2m_mean[0])),
      precip_mm: Math.round(Number(d.precipitation_sum[0]) * 10) / 10,
      fetched_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}
