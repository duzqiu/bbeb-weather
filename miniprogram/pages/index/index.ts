// pages/index/index.ts
import { QQ_MAP_KEY } from '../../config'
import { fetchWeather, WeatherPayload } from '../../services/weather'

interface Hourly {
  time: string
  icon: string
  temp: number
}

interface Daily {
  day: string
  icon: string
  desc: string
  low: number
  high: number
}

interface WeatherIndex {
  icon: string
  name: string
  value: string
  tip: string
}

interface GeocoderResponse {
  status: number
  message?: string
  result?: {
    address_component?: {
      province?: string
      city?: string
      district?: string
    }
  }
}

interface CachedLocation {
  city: string
  district: string
  place: string
  lat: number
  lng: number
  ts: number
}

const LOCATION_KEY = 'weather_location'
const CACHE_TTL = 12 * 60 * 60 * 1000 // 12 小时内不重复请求
const WEATHER_KEY = 'weather_snapshot'
const WEATHER_CACHE_VERSION = 4 // 图标/字段结构变化时 +1，旧缓存自动失效
const WEATHER_TTL = 10 * 60 * 1000 // 天气数据 10 分钟内复用

const HOURLY: Hourly[] = [
  { time: '现在', icon: '☀️', temp: 26 },
  { time: '14时', icon: '☀️', temp: 27 },
  { time: '15时', icon: '☀️', temp: 28 },
  { time: '16时', icon: '⛅', temp: 27 },
  { time: '17时', icon: '⛅', temp: 25 },
  { time: '18时', icon: '🌤', temp: 23 },
  { time: '19时', icon: '☁️', temp: 22 },
  { time: '20时', icon: '☁️', temp: 21 },
]

const DAILY_RAW: Daily[] = [
  { day: '今天', icon: '☀️', desc: '晴', low: 18, high: 27 },
  { day: '明天', icon: '⛅', desc: '多云', low: 19, high: 28 },
  { day: '周三', icon: '🌧', desc: '小雨', low: 21, high: 25 },
  { day: '周四', icon: '🌧', desc: '中雨', low: 20, high: 24 },
  { day: '周五', icon: '☁️', desc: '阴', low: 20, high: 23 },
  { day: '周六', icon: '☀️', desc: '晴', low: 19, high: 26 },
  { day: '周日', icon: '🌤', desc: '晴转多云', low: 22, high: 28 },
]

const INDICES: WeatherIndex[] = [
  { icon: '👕', name: '穿衣指数', value: '舒适', tip: '早晚可搭一件薄外套' },
  { icon: '🕶', name: '紫外线指数', value: '中等', tip: '户外活动注意防晒' },
  { icon: '🏃', name: '运动指数', value: '适宜', tip: '适合散步或慢跑' },
  { icon: '🚗', name: '洗车指数', value: '较适宜', tip: '今天无雨，可安排洗车' },
]

const LOW = Math.min(...DAILY_RAW.map((d) => d.low))
const HIGH = Math.max(...DAILY_RAW.map((d) => d.high))
const SPAN = HIGH - LOW || 1

const DAILY = DAILY_RAW.map((d) => ({
  ...d,
  barLeft: Math.round(((d.low - LOW) / SPAN) * 100),
  barWidth: Math.max(6, Math.round(((d.high - d.low) / SPAN) * 100)),
}))

/** 空气质量图标随等级变化，避免"优"配口罩这类违和组合 */
function aqiIconOf(category: string): string {
  if (category.indexOf('严重') >= 0) return '😭'
  if (category.indexOf('重度') >= 0) return '😢'
  if (category.indexOf('中度') >= 0) return '🤢'
  if (category.indexOf('轻度') >= 0) return '😷'
  if (category.indexOf('良') >= 0) return '🙂'
  return '😀'
}

/** 风力等级 → 中文描述（0~12 级） */
function windLevelName(scale: string): string {
  if (!scale) return ''
  const names = [
    '无风', '软风', '轻风', '微风', '和风', '清劲风', '强风',
    '疾风', '大风', '烈风', '狂风', '暴风', '飓风',
  ]
  const value = Math.max(0, Math.min(Number(scale) || 0, names.length - 1))
  return names[value]
}

/** 和风的 updateTime 形如 2026-11-19T16:35+08:00，取 HH:mm 展示 */
function updateTimeOf(iso: string): string {
  const matched = /T(\d{2}):(\d{2})/.exec(iso || '')
  return matched ?  : ''
}

/** 从「浙江省杭州市西湖区文三路 100 号」这类地址里提取区县 */
function extractDistrict(address: string): string {
  const matched = address.match(/[\u4e00-\u9fa5]{2,8}(?:区|县|旗)/g)
  return matched && matched.length ? matched[matched.length - 1] : ''
}

/** 提取城市名，如「杭州市」 */
function extractCity(address: string): string {
  const matched = address.match(/[\u4e00-\u9fa5]{2,6}市/)
  return matched ? matched[0] : ''
}

Page({
  data: {
    city: '杭州',
    district: '西湖区',
    place: '杭州 · 西湖区',
    locating: false,
    hint: '',
    lat: 0,
    lng: 0,

    temp: 26,
    icon: '☀️',
    desc: '晴',
    high: 27,
    low: 18,
    feel: 27,
    aqi: '32',
    aqiText: '优',
    aqiIcon: '😀',
    windDir: '东南风',
    windLevel: '微风 · 3 级',
    updatedAt: '--',
    notice: '数据加载中…',
    loading: true,

    hourly: HOURLY,
    daily: DAILY,
    indices: INDICES,
  },

  onLoad() {
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })

    if (!QQ_MAP_KEY) {
      this.setData({ hint: '未配置地图 Key，点击地点可手动选择区县', loading: false })
      return
    }

    const cached = this.readCache()
    if (cached) {
      this.setData({
        city: cached.city,
        district: cached.district,
        place: cached.place,
        lat: cached.lat || 0,
        lng: cached.lng || 0,
        hint: '',
      })
      this.loadWeather()
      return
    }

    this.locate()
  },

  /* ---------------- 定位 ---------------- */

  onLocateTap() {
    if (this.data.locating) {
      return
    }
    if (!QQ_MAP_KEY) {
      this.chooseManually()
      return
    }
    this.locate(true)
  },

  locate(showFeedback = false) {
    this.setData({ locating: true, hint: '' })

    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.reverseGeocode(res.latitude, res.longitude, showFeedback)
      },
      fail: (err) => {
        const message = (err && err.errMsg) || ''
        console.warn('[geo] getLocation fail:', message)
        this.handleLocateFail(message, showFeedback)
      },
    })
  },

  handleLocateFail(message: string, showFeedback: boolean) {
    const denied = message.indexOf('auth deny') >= 0 || message.indexOf('auth denied') >= 0
    const notOpen = message.indexOf('not authorized') >= 0 || message.indexOf('-12006') >= 0

    this.setData({
      locating: false,
      loading: false,
      hint: denied
        ? '位置权限已关闭，点击地点可手动选择区县'
        : notOpen
          ? '定位接口未开通：后台「接口设置」里开通后即可自动定位'
          : '定位未成功，点击地点可手动选择区县',
    })

    if (denied) {
      wx.showModal({
        title: '位置权限已关闭',
        content: '可在设置里重新开启「位置信息」，或直接手动选择地点。',
        confirmText: '去设置',
        cancelText: '手动选择',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({})
          } else if (res.cancel) {
            this.chooseManually()
          }
        },
      })
      return
    }

    if (showFeedback) {
      wx.showToast({ title: '定位未成功', icon: 'none' })
    }
  },

  reverseGeocode(latitude: number, longitude: number, showFeedback = false) {
    wx.request({
      url: 'https://apis.map.qq.com/ws/geocoder/v1/',
      data: {
        location: `${latitude},${longitude}`,
        key: QQ_MAP_KEY,
        get_poi: 0,
      },
      success: (res) => {
        const body = res.data as GeocoderResponse
        const component = body.status === 0 && body.result && body.result.address_component
        if (!component) {
          // 静默降级：保留上次地点，只给一行提示
          this.setData({
            locating: false,
            loading: false,
            hint: '定位失败，点击地点可手动选择区县',
          })
          console.warn('[geo] reverse geocode failed:', body.status, body.message)
          if (showFeedback) {
            wx.showToast({ title: '定位失败', icon: 'none' })
          }
          return
        }
        this.setLocation(
          component.city || component.province || this.data.city,
          component.district || '',
          latitude,
          longitude
        )
        if (showFeedback) {
          wx.showToast({ title: '已定位', icon: 'none' })
        }
      },
      fail: (err) => {
        const message = (err && err.errMsg) || ''
        console.error('[geo] request fail:', message)

        // 最常见的就是域名没加白名单，直接给出可执行的修复提示
        const notWhitelisted = message.indexOf('domain list') >= 0
        this.setData({
          locating: false,
          loading: false,
          hint: notWhitelisted
            ? '域名未配置：后台把 https://apis.map.qq.com 加入 request 合法域名'
            : '网络异常，点击地点可手动选择区县',
        })
        if (showFeedback) {
          wx.showToast({
            title: notWhitelisted ? '域名未配置' : '网络异常',
            icon: 'none',
          })
        }
      },
    })
  },

  /** 兜底：地图上手动选点 */
  chooseManually() {
    wx.chooseLocation({
      success: (res) => {
        this.setLocation(
          extractCity(res.address) || this.data.city,
          extractDistrict(res.address) || res.name,
          res.latitude,
          res.longitude
        )
      },
    })
  },

  /* ---------------- 状态与缓存 ---------------- */

  setLocation(city: string, district: string, lat: number, lng: number) {
    const place = district ? `${city} · ${district}` : city
    this.setData({
      city,
      district,
      place,
      lat,
      lng,
      locating: false,
      hint: '',
    })
    this.writeCache({ city, district, place, lat, lng, ts: Date.now() })
    this.loadWeather()
  },

  /* ---------------- 天气数据 ---------------- */

  loadWeather(force = false): Promise<void> {
    const lat = this.data.lat
    const lng = this.data.lng
    if (!lat || !lng) {
      console.warn('[weather] 没有定位坐标，跳过请求（点一下地点可重新定位）')
      this.setData({ loading: false, notice: '点击上方地点可切换城市' })
      return Promise.resolve()
    }
    console.log('[weather] request', lng, lat)

    if (!force) {
      const cached = this.readWeatherCache()
      if (cached) {
        this.applyWeather(cached)
        return Promise.resolve()
      }
    }

    return fetchWeather(lng, lat).then(
      (payload) => {
        console.log('[weather] ok', payload.now.temp, payload.now.text, payload.daily.length, '天')
        this.writeWeatherCache(payload)
        this.applyWeather(payload)
      },
      (err: Error) => {
        console.warn('[weather] fetch failed:', err && err.message)
        this.setData({ loading: false, notice: '数据加载失败，下拉可重试' })
      }
    )
  },

  applyWeather(payload: WeatherPayload) {
    const lows = payload.daily.map((d) => d.low)
    const highs = payload.daily.map((d) => d.high)
    const weekLow = Math.min(...lows)
    const weekHigh = Math.max(...highs)
    const span = weekHigh - weekLow || 1

    const daily = payload.daily.map((d) => ({
      ...d,
      barLeft: Math.round(((d.low - weekLow) / span) * 100),
      barWidth: Math.max(6, Math.round(((d.high - d.low) / span) * 100)),
    }))

    this.setData({
      temp: payload.now.temp,
      desc: payload.now.text,
      icon: payload.now.icon,
      feel: payload.now.feels,
      aqi: String(payload.air.aqi || '--'),
      aqiText: payload.air.category || '--',
      aqiIcon: aqiIconOf(payload.air.category || ''),
      windDir: payload.now.windDir || '--',
      windLevel: payload.now.windScale
        ? `${windLevelName(payload.now.windScale)} · ${payload.now.windScale} 级`
        : '--',
      high: payload.today.high,
      low: payload.today.low,
      hourly: payload.hourly,
      daily,
      indices: payload.indices.length ? payload.indices : INDICES,
      updatedAt: '--',
      loading: false,
      notice: '数据来源：和风天气',
    })
  },

  readWeatherCache(): WeatherPayload | null {
    const raw = wx.getStorageSync(WEATHER_KEY) as unknown as
      | { ts: number; version: number; payload: WeatherPayload }
      | null
    if (!raw || !raw.payload || raw.version !== WEATHER_CACHE_VERSION) {
      return null
    }
    if (Date.now() - (raw.ts || 0) > WEATHER_TTL) {
      return null
    }
    return raw.payload
  },

  writeWeatherCache(payload: WeatherPayload) {
    wx.setStorageSync(WEATHER_KEY, {
      ts: Date.now(),
      version: WEATHER_CACHE_VERSION,
      payload,
    })
  },

  readCache(): CachedLocation | null {
    const raw = wx.getStorageSync(LOCATION_KEY) as unknown as CachedLocation | null
    if (!raw || !raw.city) {
      return null
    }
    // 老版本缓存没有坐标，直接作废，否则天气请求拿不到经纬度
    if (!raw.lat || !raw.lng) {
      return null
    }
    if (Date.now() - (raw.ts || 0) > CACHE_TTL) {
      return null
    }
    return raw
  },

  writeCache(location: CachedLocation) {
    wx.setStorageSync(LOCATION_KEY, location)
  },

  onPullDownRefresh() {
    const done = () => wx.stopPullDownRefresh()
    if (!this.data.lat || !this.data.lng) {
      done()
      this.locate(true)
      return
    }
    this.loadWeather(true).then(done, done)
  },

  onShareAppMessage() {
    return {
      title: '灞波儿奔天气 · 实时天气与 7 天预报',
      path: '/pages/index/index',
      imageUrl: '/images/share-cover.png',
    }
  },

  onShareTimeline() {
    return {
      title: '灞波儿奔天气 · 实时天气与 7 天预报',
      imageUrl: '/images/share-cover.png',
    }
  },
})
