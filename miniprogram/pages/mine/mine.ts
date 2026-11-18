// pages/mine/mine.ts
const FALLBACK_VERSION = '0.0.1'

Page({
  data: {
    wxVersion: '-',
    cacheSize: '0 KB',
    appVersion: FALLBACK_VERSION,
  },

  onShow() {
    const info = wx.getSystemInfoSync()

    let appVersion = FALLBACK_VERSION
    try {
      appVersion = wx.getAccountInfoSync().miniProgram.version || FALLBACK_VERSION
    } catch {
      appVersion = FALLBACK_VERSION
    }

    this.setData({
      wxVersion: info.version || '-',
      cacheSize: `${wx.getStorageInfoSync().currentSize} KB`,
      appVersion,
    })
  },

  onClearCache() {
    wx.clearStorageSync()
    this.setData({ cacheSize: `${wx.getStorageInfoSync().currentSize} KB` })
    wx.showToast({ title: '缓存已清除', icon: 'none' })
  },

  onPrivacy() {
    wx.showModal({
      title: '隐私说明',
      content:
        '本小程序仅在你使用定位功能时获取位置信息，用于确定所在区县并展示当地天气。\n\n位置信息不会上传至我们的服务器，仅在本地缓存（最长 12 小时）以减少重复请求；你可以通过「清除缓存」随时删除。\n\n天气数据由和风天气提供，地址解析由腾讯位置服务完成。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onDataSource() {
    wx.showModal({
      title: '数据来源',
      content:
        '天气数据：和风天气\n地址解析：腾讯位置服务\n\n数据仅供参考，请以当地气象部门发布的官方信息为准。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  onFeedback() {
    wx.showModal({
      title: '意见反馈',
      content:
        '可在小程序资料页点击「反馈与投诉」提交问题，或在小程序内长按截图后通过微信发送给我们。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
