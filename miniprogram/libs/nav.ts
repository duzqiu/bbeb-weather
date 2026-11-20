// libs/nav.ts
// 自定义导航栏尺寸：状态栏高度 + 胶囊按钮那一行的高度
export interface NavMetrics {
  statusBarHeight: number
  navTotalHeight: number
}

export function navMetrics(): NavMetrics {
  let statusBarHeight = 20
  try {
    statusBarHeight = wx.getWindowInfo().statusBarHeight || statusBarHeight
  } catch {
    statusBarHeight = wx.getSystemInfoSync().statusBarHeight || statusBarHeight
  }

  let navHeight = 44
  try {
    const capsule = wx.getMenuButtonBoundingClientRect()
    if (capsule && capsule.height) {
      navHeight = capsule.height + (capsule.top - statusBarHeight) * 2
    }
  } catch {
    navHeight = 44
  }

  return {
    statusBarHeight,
    navTotalHeight: statusBarHeight + navHeight,
  }
}
