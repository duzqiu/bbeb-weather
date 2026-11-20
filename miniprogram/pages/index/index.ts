// pages/index/index.ts
import { QQ_MAP_KEY } from '../../config'
import { fetchWeather, WeatherPayload } from '../../services/weather'
import { glyphOf } from '../../libs/qweather-glyphs'
import { iconColorOf, iconImageOf } from '../../services/weather'
import { syncTabBar } from '../../libs/tabbar'
import { navMetrics } from '../../libs/nav'
import { isPopupEnabled } from '../../libs/settings'

interface HourlyRaw {
  time: string
  iconCode: string
  temp: number
  pop: number
}

/** 24 小时降水概率图的一根柱子 */
interface RainPoint {
  key: number
  /** 相对 Y 轴上限的高度百分比 */
  h: number
}

/** X 轴时间标签（由 flex 均分，天然等距） */
interface RainAxisLabel {
  key: number
  label: string
}

interface Hourly extends HourlyRaw {
  glyph: string
  color: string
  image?: string
}

interface DailyRaw {
  day: string
  date: string
  iconCode: string
  desc: string
  low: number
  high: number
}

interface Daily extends DailyRaw {
  glyph: string
  color: string
  image?: string
  barLeft: number
  barWidth: number
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
  province: string
  city: string
  district: string
  place: string
  lat: number
  lng: number
  ts: number
}

const LOCATION_KEY = 'weather_location_v2'
const CACHE_TTL = 12 * 60 * 60 * 1000 // 12 小时内不重复请求
const WEATHER_KEY = 'weather_snapshot'
const WEATHER_CACHE_VERSION = 16 // 图标/字段结构变化时 +1，旧缓存自动失效
const WEATHER_TTL = 10 * 60 * 1000 // 天气数据 10 分钟内复用

/** 本轮进入页面是否还欠一次弹窗（有地点且天气就绪时消费掉） */
let glassPending = false

const HOURLY_RAW: HourlyRaw[] = [
  { time: '现在', iconCode: '100', temp: 26, pop: 0 },
  { time: '14时', iconCode: '100', temp: 27, pop: 0 },
  { time: '15时', iconCode: '100', temp: 28, pop: 5 },
  { time: '16时', iconCode: '101', temp: 27, pop: 10 },
  { time: '17时', iconCode: '101', temp: 25, pop: 20 },
  { time: '18时', iconCode: '103', temp: 23, pop: 35 },
  { time: '19时', iconCode: '150', temp: 22, pop: 20 },
  { time: '20时', iconCode: '150', temp: 21, pop: 10 },
]

/** 静态兜底数据用当天起算的日期 */
/** 固定只显示「月-日」 */
function demoDate(offset: number): string {
  const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return month + '-' + day
}

const DAILY_RAW: DailyRaw[] = [
  { day: '今天', date: demoDate(0), iconCode: '100', desc: '晴', low: 18, high: 27 },
  { day: '明天', date: demoDate(1), iconCode: '101', desc: '多云', low: 19, high: 28 },
  { day: '周三', date: demoDate(2), iconCode: '305', desc: '小雨', low: 21, high: 25 },
  { day: '周四', date: demoDate(3), iconCode: '306', desc: '中雨', low: 20, high: 24 },
  { day: '周五', date: demoDate(4), iconCode: '104', desc: '阴', low: 20, high: 23 },
  { day: '周六', date: demoDate(5), iconCode: '100', desc: '晴', low: 19, high: 26 },
  { day: '周日', date: demoDate(6), iconCode: '103', desc: '晴转多云', low: 22, high: 28 },
  { day: '周一', date: demoDate(7), iconCode: '101', desc: '多云', low: 21, high: 27 },
  { day: '周二', date: demoDate(8), iconCode: '305', desc: '小雨', low: 18, high: 23 },
  { day: '周三', date: demoDate(9), iconCode: '100', desc: '晴', low: 17, high: 25 },
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

const HOURLY_VIEW: Hourly[] = HOURLY_RAW.map((h) => ({
  ...h,
  glyph: glyphOf(h.iconCode),
  color: iconColorOf(h.iconCode),
  image: iconImageOf(h.iconCode),
}))

const DAILY: Daily[] = DAILY_RAW.map((d) => ({
  glyph: glyphOf(d.iconCode),
  color: iconColorOf(d.iconCode),
  image: iconImageOf(d.iconCode),
  ...d,
  barLeft: Math.round(((d.low - LOW) / SPAN) * 100),
  barWidth: Math.max(6, Math.round(((d.high - d.low) / SPAN) * 100)),
}))

/** 生活指数图标：命中就用彩色 SVG，否则回退 emoji */
const INDEX_IMAGES: Array<[string, string]> = [
  ['穿衣', '/images/indices/clothing.svg'],
  ['洗车', '/images/indices/car-wash.svg'],
  ['运动', '/images/indices/sport.svg'],
  ['紫外', '/images/indices/uv.svg'],
  ['防晒', '/images/indices/uv.svg'],
]

function indexImageOf(name: string): string {
  const text = name || ''
  for (let i = 0; i < INDEX_IMAGES.length; i += 1) {
    if (text.indexOf(INDEX_IMAGES[i][0]) >= 0) {
      return INDEX_IMAGES[i][1]
    }
  }
  return ''
}

const INDICES_VIEW = INDICES.map((item) => ({
  ...item,
  image: indexImageOf(item.name),
}))

/** 空气质量图标随等级变化，避免"优"配口罩这类违和组合 */
/** 空气质量图标：有彩色 SVG 用图，没有则回退 emoji */
const AQI_IMAGES: Array<[string, string]> = [
  ['严重', '/images/air/aqi-sad.svg'],
  ['重度', '/images/air/aqi-sad.svg'],
  ['中度', '/images/air/aqi-angry.svg'],
  ['轻度', '/images/air/aqi-speechless.svg'],
  ['良', '/images/air/aqi-smile.svg'],
  ['优', '/images/air/aqi-happy.svg'],
]

function aqiImageOf(category: string): string {
  for (let i = 0; i < AQI_IMAGES.length; i += 1) {
    if (category.indexOf(AQI_IMAGES[i][0]) >= 0) {
      return AQI_IMAGES[i][1]
    }
  }
  return ''
}

/** 湿度等级文案 */
function humidityLevelOf(value: number): string {
  if (value < 20) return '干燥'
  if (value < 40) return '偏干燥'
  if (value < 70) return '舒适'
  if (value < 85) return '偏潮湿'
  return '潮湿'
}

/** 环形进度用的短文案 */
function humidityShortOf(value: number): string {
  if (value < 20) return '干燥'
  if (value < 40) return '偏干'
  if (value < 70) return '舒适'
  if (value < 85) return '偏潮'
  return '潮湿'
}

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
  const matched = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '')
  if (!matched) {
    return ''
  }
  const date = `${matched[1]}-${matched[2]}-${matched[3]}`
  return `${date} ${matched[4]}:${matched[5]}`
}

/** 从「浙江省杭州市西湖区文三路 100 号」这类地址里提取区县 */
/** 去掉「省 / 市 / 自治区 / 特别行政区」后缀 */
function shortArea(name: string): string {
  if (!name) return ''
  return name
    .replace(/(壮族|回族|维吾尔)?自治区$/, '')
    .replace(/特别行政区$/, '')
    .replace(/[省市]$/, '')
}

/** 拼出「省市区」显示名，去掉行政级别后缀，直辖市自动去重 */
function buildPlaceName(province: string, city: string, district: string): string {
  const p = shortArea(province)
  const c = shortArea(city)
  const parts: string[] = []
  if (p && p !== c && c.indexOf(p) !== 0 && p.indexOf(c) !== 0) {
    parts.push(p)
  }
  if (c) parts.push(c)
  if (district) parts.push(district)
  return parts.join(' ')
}

function extractDistrict(address: string): string {
  const matched = address.match(/[\u4e00-\u9fa5]{2,8}(?:区|县|旗)/g)
  return matched && matched.length ? matched[matched.length - 1] : ''
}

/** 提取城市名，如「杭州市」 */
/** 提取省份，如「浙江省」「内蒙古自治区」 */
function extractProvince(address: string): string {
  const matched = address.match(/[一-龥]{2,8}?(?:省|自治区|特别行政区)/)
  return matched ? matched[0] : ''
}

function extractCity(address: string): string {
  const matched = address.match(/[\u4e00-\u9fa5]{2,6}市/)
  return matched ? matched[0] : ''
}

Page({
  data: {
    province: '浙江省',
    city: '杭州',
    district: '西湖区',
    place: '浙江 杭州 西湖区',
    locating: false,
    hint: '',
    lat: 0,
    lng: 0,

    temp: 26,
    iconCode: '100',
    glyph: glyphOf('100'),
    color: iconColorOf('100'),
    image: '',
    desc: '晴',
    high: 27,
    low: 18,
    feel: 27,
    aqi: '32',
    aqiText: '优',
    aqiIcon: '😀',
    aqiImage: '',
    humidity: 58,
    gaugeDeg: 155,
    humidityText: '舒适',
    humidityShort: '舒适',
    sunrise: '06:20',
    sunset: '17:40',
    windDir: '东南风',
    windLevel: '微风 · 3 级',
    updatedAt: '--',
    notice: '数据加载中…',
    loading: true,
    glassVisible: false,
    hasWeather: false,

    rainVisible: false,
    rainSummary: '',
    rainHasRain: false,
    rainBars: [] as Array<{ key: number; h: number }>,
    rainPoints: [] as RainPoint[],
    rainTicks: [] as Array<{ key: number; label: number; top: number }>,
    rainAxis: [] as RainAxisLabel[],
    rainPeak: 0,

    statusBarHeight: 20,
    navTotalHeight: 64,

    hourly: HOURLY_VIEW,
    daily: DAILY,
    indices: INDICES_VIEW,
  },

  onLoad() {
    glassPending = isPopupEnabled()
    this.initNavMetrics()
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })

    if (!QQ_MAP_KEY) {
      this.setData({ hint: '未配置地图 Key，点击「重新定位」可手动选择区县', loading: false })
      return
    }

    const cached = this.readCache()
    if (cached) {
      this.setData({
        province: cached.province || '',
        city: cached.city,
        district: cached.district,
        place: buildPlaceName(cached.province || '', cached.city, cached.district),
        lat: cached.lat || 0,
        lng: cached.lng || 0,
        hint: '',
      })
      this.loadWeather()
      return
    }

    this.locate()
  },

  /** 自定义导航栏：状态栏 + 胶囊按钮那一行的高度 */
  initNavMetrics() {
    this.setData(navMetrics())
  },

  onShow() {
    syncTabBar(this, 0)
    // 只在 onLoad（冷启动）时给过弹窗机会，切 tab 回来不会再弹
    this.maybeShowGlass()
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
        ? '位置权限已关闭，点击「重新定位」可手动选择区县'
        : notOpen
          ? '定位接口未开通：后台「接口设置」里开通后即可自动定位'
          : '定位未成功，点击「重新定位」可手动选择区县',
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
            hint: '定位失败，点击「重新定位」可手动选择区县',
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
          longitude,
          component.province || ''
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
            : '网络异常，点击「重新定位」可手动选择区县',
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
          res.longitude,
          extractProvince(res.address)
        )
      },
    })
  },

  /* ---------------- 状态与缓存 ---------------- */

  setLocation(
    city: string,
    district: string,
    lat: number,
    lng: number,
    province = ''
  ) {
    const place = buildPlaceName(province, city, district)
    this.setData({
      province,
      city,
      district,
      place,
      lat,
      lng,
      locating: false,
      hint: '',
    })
    this.writeCache({ province, city, district, place, lat, lng, ts: Date.now() })
    this.loadWeather()
  },

  /* ---------------- 天气数据 ---------------- */

  loadWeather(force = false): Promise<void> {
    const lat = this.data.lat
    const lng = this.data.lng
    if (!lat || !lng) {
      console.warn('[weather] 没有定位坐标，跳过请求（点一下地点可重新定位）')
      this.setData({ loading: false, notice: '点击「重新定位」可切换城市' })
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
    const humidityValue = Math.min(100, Math.max(0, Number(payload.now.humidity) || 0))
    const lows = payload.daily.map((d) => d.low)
    const highs = payload.daily.map((d) => d.high)
    const weekLow = Math.min(...lows)
    const weekHigh = Math.max(...highs)
    const span = weekHigh - weekLow || 1

    // 24 小时列表首格“现在”与卡片实况保持同一图标
    const hourly = payload.hourly.map((h, index) => {
      if (index !== 0) return h
      return {
        ...h,
        iconCode: payload.now.iconCode,
        glyph: payload.now.glyph,
        color: payload.now.color,
        image: payload.now.image,
      }
    })

    const daily = payload.daily.map((d) => ({
      ...d,
      barLeft: Math.round(((d.low - weekLow) / span) * 100),
      barWidth: Math.max(6, Math.round(((d.high - d.low) / span) * 100)),
    }))

    // 24 小时降水概率：Y 轴上限按实际峰值动态取整，让起伏更明显
    const pops = hourly.map((h) => Math.min(100, Math.max(0, Number(h.pop) || 0)))
    const rainPeak = pops.reduce((max, value) => Math.max(max, value), 0)
    const yMax = Math.max(20, Math.ceil(rainPeak / 20) * 20)
    const rainPoints: RainPoint[] = hourly.map((h, index) => ({
      key: index,
      h: Math.round((pops[index] / yMax) * 100),
    }))

    // X 轴：每 3 小时一个时间点，由 flex 均分保证等距
    const axisIndexes = [0, 3, 6, 9, 12, 15, 18, 21, 23].filter((index) => !!hourly[index])
    const rainAxis: RainAxisLabel[] = axisIndexes.map((index) => ({
      key: index,
      label: index === 0 ? '现在' : `${hourly[index].time.slice(0, 2)}时`,
    }))
    // 刻度带 top 值，渲染时用 translateY(-50%) 让文字中心正对网格线；只保留上中下三档
    const rainTicks = [1, 0.5, 0].map((ratio, index) => ({
      key: index,
      label: Math.round(yMax * ratio),
      top: Math.round((1 - ratio) * 100),
    }))

    this.setData({
      temp: payload.now.temp,
      desc: payload.now.text,
      iconCode: payload.now.iconCode,
      glyph: payload.now.glyph,
      color: payload.now.color,
      image: payload.now.image,
      feel: payload.now.feels,
      aqi: String(payload.air.aqi || '--'),
      aqiText: payload.air.category || '--',
      aqiIcon: aqiIconOf(payload.air.category || ''),
      aqiImage: aqiImageOf(payload.air.category || ''),
      humidity: humidityValue,
      gaugeDeg: Math.round(humidityValue * 2.68),
      humidityText: humidityLevelOf(humidityValue),
      humidityShort: humidityShortOf(humidityValue),
      sunrise: payload.sun.sunrise || '--',
      sunset: payload.sun.sunset || '--',
      windDir: payload.now.windDir || '--',
      windLevel: payload.now.windScale
        ? `${windLevelName(payload.now.windScale)} · ${payload.now.windScale} 级`
        : '--',
      high: payload.today.high,
      low: payload.today.low,
      hourly,
      daily,
      indices: (payload.indices.length ? payload.indices : INDICES).map((item) => ({
        ...item,
        image: indexImageOf(item.name),
      })),
      updatedAt: updateTimeOf(payload.updateTime) || '--',
      loading: false,
      hasWeather: true,
      rainVisible: !!payload.minutely && !!payload.minutely.summary,
      rainSummary: payload.minutely ? payload.minutely.summary : '',
      rainHasRain: !!payload.minutely && payload.minutely.hasRain,
      rainBars: payload.minutely ? payload.minutely.bars : [],
      rainPoints,
      rainTicks,
      rainAxis,
      rainPeak,
      notice: '数据来源：和风天气',
    })

    // 天气就绪后，补弹本轮欠下的弹窗
    this.maybeShowGlass()
  },

  /* ---------------- 液态玻璃弹窗 ---------------- */

  /** 有地点且天气就绪才弹；无地点 / 无数据直接跳过 */
  maybeShowGlass() {
    if (!glassPending) return
    const { lat, lng, place, hasWeather } = this.data
    if (!lat || !lng || !place || !hasWeather) return
    glassPending = false
    this.setData({ glassVisible: true })
  },

  onGlassClose() {
    glassPending = false
    this.setData({ glassVisible: false })
  },

  /** 拦住卡片内部与遮罩上的冒泡/滚动 */
  noop() {},

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
      title: '灞波儿奔天气 · 实时天气与 10 天预报',
      path: '/pages/index/index',
      imageUrl: '/images/share-cover.png',
    }
  },

  onShareTimeline() {
    return {
      title: '灞波儿奔天气 · 实时天气与 10 天预报',
      imageUrl: '/images/share-cover.png',
    }
  },
})
