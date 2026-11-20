// libs/settings.ts
// 本地偏好设置（目前只有首页弹窗开关）
const POPUP_ENABLED_KEY = 'index_popup_enabled'

/** 首页弹窗开关，默认开启 */
export function isPopupEnabled(): boolean {
  const value = wx.getStorageSync(POPUP_ENABLED_KEY)
  if (value === '' || value === null || value === undefined) {
    return true
  }
  return Boolean(value)
}

export function setPopupEnabled(enabled: boolean): void {
  wx.setStorageSync(POPUP_ENABLED_KEY, enabled)
}
