// pages/mine/mine.ts
import { syncTabBar } from '../../libs/tabbar'
import { navMetrics } from '../../libs/nav'
import { isPopupEnabled, setPopupEnabled } from '../../libs/settings'

const FALLBACK_VERSION = '1.0.0'

interface SwitchChangeEvent {
  detail: { value: boolean }
}

Page({
  data: {
    cacheSize: '0 KB',
    appVersion: FALLBACK_VERSION,
    statusBarHeight: 20,
    navTotalHeight: 64,
    privacyVisible: false,
    dataSourceVisible: false,
    popupEnabled: true,
  },

  onShow() {
    syncTabBar(this, 1)
    this.setData(navMetrics())

    let appVersion = FALLBACK_VERSION
    try {
      appVersion = wx.getAccountInfoSync().miniProgram.version || FALLBACK_VERSION
    } catch {
      appVersion = FALLBACK_VERSION
    }

    this.setData({
      cacheSize: `${wx.getStorageInfoSync().currentSize} KB`,
      appVersion,
      popupEnabled: isPopupEnabled(),
    })
  },

  onClearCache() {
    // 清缓存不该顺手把偏好设置清掉
    const popupEnabled = isPopupEnabled()
    wx.clearStorageSync()
    setPopupEnabled(popupEnabled)
    this.setData({ cacheSize: `${wx.getStorageInfoSync().currentSize} KB` })
    wx.showToast({ title: '缓存已清除', icon: 'none' })
  },

  onPopupToggle(e: SwitchChangeEvent) {
    const enabled = e.detail.value
    setPopupEnabled(enabled)
    this.setData({ popupEnabled: enabled })
  },

  onPrivacy() {
    this.setData({ privacyVisible: true })
  },

  onPrivacyClose() {
    this.setData({ privacyVisible: false })
  },

  onCopyEmail() {
    wx.setClipboardData({ data: 'duzqiu@outlook.com' })
  },

  noop() {},

  onDataSource() {
    this.setData({ dataSourceVisible: true })
  },

  onDataSourceClose() {
    this.setData({ dataSourceVisible: false })
  },

})
