// services/weather.ts
// 和风天气：一次定位坐标，聚合实况 / 24 小时 / 10 天 / 空气质量 / 生活指数。
import { authorizationHeader } from '../libs/jwt'
import { QWEATHER } from '../config'
import { glyphOf } from '../libs/qweather-glyphs'

export interface WeatherNow {
  temp: number
  text: string
  iconCode: string
  glyph: string
  color: string
  image: string
  feels: number
  humidity: number
  windDir: string
  windScale: string
  windSpeed: string
}

export interface WeatherHour {
  time: string
  iconCode: string
  glyph: string
  color: string
  image: string
  temp: number
  /** 降水概率 0~100 */
  pop: number
}

export interface WeatherDay {
  day: string
  date: string
  iconCode: string
  glyph: string
  color: string
  image: string
  desc: string
  low: number
  high: number
}

export interface WeatherIndex {
  icon: string
  name: string
  value: string
  tip: string
}

/** 分钟级降水（未来 2 小时，仅中国地区；取不到时为 null） */
export interface MinutelyRain {
  summary: string
  hasRain: boolean
  /** 每 5 分钟一个点，h 为归一化到 0~100 的柱高 */
  bars: Array<{ key: number; h: number }>
}

export interface WeatherPayload {
  now: WeatherNow
  today: { low: number; high: number }
  hourly: WeatherHour[]
  daily: WeatherDay[]
  indices: WeatherIndex[]
  air: { aqi: number; category: string }
  sun: { sunrise: string; sunset: string }
  minutely: MinutelyRain | null
  updateTime: string
}

interface QwResponse {
  code: string
  now?: Record<string, string>
  daily?: Record<string, string>[]
  hourly?: Record<string, string>[]
  updateTime?: string
}

interface MinutelyResponse {
  code: string
  summary?: string
  minutely?: Array<{ fxTime?: string; precip?: string; type?: string }>
}

/** 不同天气给不同颜色，让单色字体图标也有色彩感 */
export function iconColorOf(code: string): string {
  const value = Number(code) || 0
  if (value >= 150 && value <= 153) return '#6C7BE0'
  if (value === 100) return '#FFA726'
  if (value === 104) return '#8A97A5'
  if (value >= 101 && value <= 103) return '#4E9BE8'
  if (value === 302 || value === 303) return '#5C6BC0'
  if (value >= 300 && value <= 399) return '#3E8EDE'
  if (value >= 400 && value <= 499) return '#7FC4F0'
  if (value >= 500 && value <= 515) return '#9AA5AD'
  return '#8A97A5'
}

/** 彩色 SVG 图标：按和风 icon 代码查表，查不到则回退字体图标 */
const ICON_IMAGES: Record<string, string> = {
  // 晴 / 云
  '100': '/images/weather/sunny.svg',
  '101': '/images/weather/cloudy.svg',
  '102': '/images/weather/cloudy.svg',
  '103': '/images/weather/cloudy.svg',
  '104': '/images/weather/overcast.svg',
  // 夜间
  '150': '/images/weather/night-clear.svg',
  '151': '/images/weather/cloudy.svg',
  '152': '/images/weather/cloudy.svg',
  '153': '/images/weather/cloudy.svg',
  // 雨
  '300': '/images/weather/shower.svg',
  '301': '/images/weather/shower.svg',
  '302': '/images/weather/thunder-shower.svg',
  '303': '/images/weather/thunder-shower.svg',
  '304': '/images/weather/thunder-hail.svg',
  '305': '/images/weather/rain-light.svg',
  '306': '/images/weather/rain-moderate.svg',
  '307': '/images/weather/rain-heavy.svg',
  '308': '/images/weather/rain-heavy.svg',
  '309': '/images/weather/rain-light.svg',
  '310': '/images/weather/rain-storm.svg',
  '311': '/images/weather/rain-heavy-storm.svg',
  '312': '/images/weather/rain-extreme.svg',
  '399': '/images/weather/rain-light.svg',
  // 雪
  '400': '/images/weather/snow-light.svg',
  '401': '/images/weather/snow-moderate.svg',
  '402': '/images/weather/snow-heavy.svg',
  '403': '/images/weather/snow-storm.svg',
  '404': '/images/weather/sleet.svg',
  '405': '/images/weather/sleet.svg',
  '406': '/images/weather/sleet.svg',
  '407': '/images/weather/snow-shower.svg',
  // 雾 / 沙尘
  '500': '/images/weather/fog.svg',
  '501': '/images/weather/fog.svg',
  '509': '/images/weather/fog.svg',
  '510': '/images/weather/fog.svg',
  '514': '/images/weather/fog.svg',
  '515': '/images/weather/fog.svg',
  '503': '/images/weather/dust-storm.svg',
  '504': '/images/weather/dust-storm.svg',
  '505': '/images/weather/dust-storm.svg',
  '506': '/images/weather/dust-storm.svg',
  '507': '/images/weather/dust-storm.svg',
  '508': '/images/weather/dust-storm.svg',
}

export function iconImageOf(code: string): string {
  const exact = ICON_IMAGES[code]
  if (exact) return exact

  // 兜底按天气族归类，保证卡片与列表始终是同一套彩色图标
  const value = Number(code) || 0
  if (value >= 150 && value <= 153) return '/images/weather/cloudy.svg'
  if (value >= 101 && value <= 104) return '/images/weather/cloudy.svg'
  if (value >= 300 && value <= 399) return '/images/weather/rain-light.svg'
  if (value >= 400 && value <= 499) return '/images/weather/snow-light.svg'
  if (value >= 500 && value <= 515) return '/images/weather/fog.svg'
  return ''
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']


/** 指数名称 → emoji */
function indexIcon(name: string): string {
  if (name.indexOf('穿衣') >= 0) return '👕'
  if (name.indexOf('紫外') >= 0) return '🕶'
  if (name.indexOf('运动') >= 0) return '🏃'
  if (name.indexOf('洗车') >= 0) return '🚗'
  return '📌'
}

const INDEX_NAMES = ['穿衣', '紫外', '运动', '洗车']

/** 接口没给 category 时的兜底（中国 AQI 分级） */
function aqiLevel(aqi: number): string {
  if (aqi <= 50) return '优'
  if (aqi <= 100) return '良'
  if (aqi <= 150) return '轻度污染'
  if (aqi <= 200) return '中度污染'
  if (aqi <= 300) return '重度污染'
  return '严重污染'
}

function request(path: string, data: Record<string, string>): Promise<QwResponse> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: QWEATHER.host + path,
      data,
      header: {
        Authorization: authorizationHeader(),
        'Accept-Encoding': 'gzip',
      },
      timeout: 8000,
      success: (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const body = res.data as QwResponse
        if (body.code !== '200') {
          reject(new Error(`QWeather ${body.code}`))
          return
        }
        resolve(body)
      },
      fail: (err) => reject(new Error(err.errMsg || 'request failed')),
    })
  })
}

function hourLabel(fxTime: string, index: number): string {
  if (index === 0) return '现在'
  const match = /T(\d{2}):(\d{2})/.exec(fxTime || '')
  return match ? `${match[1]}:${match[2]}` : '--:--'
}

/** 固定只显示「月-日」 */
function shortDate(fxDate: string): string {
  return fxDate ? fxDate.slice(5) : ''
}

function dayLabel(fxDate: string, index: number): string {
  if (index === 0) return '今天'
  if (index === 1) return '明天'
  const parsed = new Date(`${fxDate}T00:00:00`)
  return isNaN(parsed.getTime()) ? `第${index + 1}天` : WEEK[parsed.getDay()]
}

/** 10 天预报；订阅里没开 10 天时自动降级到 7 天，避免整页失败 */
function requestDaily(location: string): Promise<QwResponse> {
  return request('/v7/weather/10d', { location }).catch((err: Error) => {
    console.warn('[weather] 10 天预报不可用，降级到 7 天：', err.message)
    return request('/v7/weather/7d', { location })
  })
}

/** 分钟级降水（未来 2 小时，仅中国地区）；任何失败都返回 null，不影响整页 */
function requestMinutely(location: string): Promise<MinutelyRain | null> {
  return new Promise((resolve) => {
    wx.request({
      url: QWEATHER.host + '/v7/minutely/5m',
      data: { location },
      header: {
        Authorization: authorizationHeader(),
        'Accept-Encoding': 'gzip',
      },
      timeout: 8000,
      success: (res) => {
        const body = res.data as MinutelyResponse
        if (res.statusCode !== 200 || !body || body.code !== '200') {
          console.warn('[weather] 分钟级降水不可用：', res.statusCode, body && body.code)
          resolve(null)
          return
        }
        const list = body.minutely || []
        const values = list.map((item) => Number(item.precip) || 0)
        const peak = values.length ? Math.max(...values) : 0
        resolve({
          summary: body.summary || (peak > 0 ? '未来两小时有降水' : '未来两小时无降水'),
          hasRain: peak > 0,
          bars: values.map((value, index) => ({
            key: index,
            h: peak > 0 ? Math.max(4, Math.round((value / peak) * 100)) : 0,
          })),
        })
      },
      fail: (err) => {
        console.warn('[weather] 分钟级降水请求失败：', err.errMsg)
        resolve(null)
      },
    })
  })
}

/** 按经纬度查询（和风支持 location=经度,纬度） */
export function fetchWeather(longitude: number, latitude: number): Promise<WeatherPayload> {
  const location = `${longitude.toFixed(2)},${latitude.toFixed(2)}`

  return Promise.all([
    request('/v7/weather/now', { location }),
    request('/v7/weather/24h', { location }),
    requestDaily(location),
    request('/v7/air/now', { location }),
    request('/v7/indices/1d', { location, type: '0' }),
    requestMinutely(location),
  ]).then(([nowRes, hourRes, dayRes, airRes, indexRes, minutely]) => {
    const nowBlock = nowRes.now || {}
    const hourList = hourRes.hourly || []
    const dayList = dayRes.daily || []
    const airBlock = airRes.now || {}
    const aqiValue = Math.round(Number(airBlock.aqi) || 0)
    const indexList = indexRes.daily || []

    const hourly = hourList.map((item, index) => ({
      time: hourLabel(item.fxTime || '', index),
      iconCode: item.icon || '100',
      glyph: glyphOf(item.icon || '100'),
      color: iconColorOf(item.icon || '100'),
      image: iconImageOf(item.icon || '100'),
      temp: Math.round(Number(item.temp) || 0),
      pop: Math.min(100, Math.max(0, Math.round(Number(item.pop) || 0))),
    }))

    const daily = dayList.map((item, index) => ({
      day: dayLabel(item.fxDate || '', index),
      date: shortDate(item.fxDate || ''),
      iconCode: item.iconDay || '100',
      glyph: glyphOf(item.iconDay || '100'),
      color: iconColorOf(item.iconDay || '100'),
      image: iconImageOf(item.iconDay || '100'),
      desc: item.textDay || '',
      low: Math.round(Number(item.tempMin) || 0),
      high: Math.round(Number(item.tempMax) || 0),
    }))

    const indices: WeatherIndex[] = []
    INDEX_NAMES.forEach((keyword) => {
      const hit = indexList.find((item) => (item.name || '').indexOf(keyword) >= 0)
      if (hit) {
        indices.push({
          icon: indexIcon(hit.name || ''),
          name: hit.name || '',
          value: hit.category || '',
          tip: hit.text || '',
        })
      }
    })

    return {
      now: {
        temp: Math.round(Number(nowBlock.temp) || 0),
        text: nowBlock.text || '',
        iconCode: nowBlock.icon || '100',
        glyph: glyphOf(nowBlock.icon || '100'),
        color: iconColorOf(nowBlock.icon || '100'),
        image: iconImageOf(nowBlock.icon || '100'),
        feels: Math.round(Number(nowBlock.feelsLike) || 0),
        humidity: Math.round(Number(nowBlock.humidity) || 0),
        windDir: nowBlock.windDir || '',
        windScale: nowBlock.windScale || '',
        windSpeed: nowBlock.windSpeed || '',
      },
      today: {
        low: daily.length ? daily[0].low : 0,
        high: daily.length ? daily[0].high : 0,
      },
      hourly,
      daily,
      indices,
      air: {
        aqi: aqiValue,
        category: airBlock.category || aqiLevel(aqiValue),
      },
      sun: {
        sunrise: (dayList[0] && dayList[0].sunrise) || '',
        sunset: (dayList[0] && dayList[0].sunset) || '',
      },
      minutely,
      updateTime: nowRes.updateTime || '',
    }
  })
}
