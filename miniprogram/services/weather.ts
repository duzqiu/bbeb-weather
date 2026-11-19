// services/weather.ts
// 和风天气：一次定位坐标，聚合实况 / 24 小时 / 7 天 / 空气质量 / 生活指数。
import { authorizationHeader } from '../libs/jwt'
import { QWEATHER } from '../config'

export interface WeatherNow {
  temp: number
  text: string
  icon: string
  feels: number
  humidity: number
  windDir: string
  windScale: string
  windSpeed: string
}

export interface WeatherHour {
  time: string
  icon: string
  temp: number
}

export interface WeatherDay {
  day: string
  icon: string
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

export interface WeatherPayload {
  now: WeatherNow
  today: { low: number; high: number }
  hourly: WeatherHour[]
  daily: WeatherDay[]
  indices: WeatherIndex[]
  air: { aqi: number; category: string }
  updateTime: string
}

interface QwResponse {
  code: string
  now?: Record<string, string>
  daily?: Record<string, string>[]
  hourly?: Record<string, string>[]
  updateTime?: string
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 和风 icon 代码 → emoji（只做大致归类，够用） */
function iconOf(code: string): string {
  const value = Number(code) || 0
  if (value === 100) return '☀️'
  if (value >= 101 && value <= 103) return '⛅'
  if (value === 104) return '☁️'
  if (value >= 150 && value <= 153) return '🌙'
  if (value >= 300 && value <= 399) {
    return value >= 302 && value <= 304 ? '⛈' : '🌧'
  }
  if (value >= 400 && value <= 499) return '❄️'
  if (value >= 500 && value <= 515) return '🌫'
  return '☁️'
}

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

function dayLabel(fxDate: string, index: number): string {
  if (index === 0) return '今天'
  if (index === 1) return '明天'
  const parsed = new Date(`${fxDate}T00:00:00`)
  return isNaN(parsed.getTime()) ? `第${index + 1}天` : WEEK[parsed.getDay()]
}

/** 按经纬度查询（和风支持 location=经度,纬度） */
export function fetchWeather(longitude: number, latitude: number): Promise<WeatherPayload> {
  const location = `${longitude.toFixed(2)},${latitude.toFixed(2)}`

  return Promise.all([
    request('/v7/weather/now', { location }),
    request('/v7/weather/24h', { location }),
    request('/v7/weather/7d', { location }),
    request('/v7/air/now', { location }),
    request('/v7/indices/1d', { location, type: '0' }),
  ]).then(([nowRes, hourRes, dayRes, airRes, indexRes]) => {
    const nowBlock = nowRes.now || {}
    const hourList = hourRes.hourly || []
    const dayList = dayRes.daily || []
    const airBlock = airRes.now || {}
    const aqiValue = Math.round(Number(airBlock.aqi) || 0)
    const indexList = indexRes.daily || []

    const hourly = hourList.map((item, index) => ({
      time: hourLabel(item.fxTime || '', index),
      icon: iconOf(item.icon || ''),
      temp: Math.round(Number(item.temp) || 0),
    }))

    const daily = dayList.map((item, index) => ({
      day: dayLabel(item.fxDate || '', index),
      icon: iconOf(item.iconDay || ''),
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
        icon: iconOf(nowBlock.icon || ''),
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
      updateTime: nowRes.updateTime || '',
    }
  })
}
