// libs/tabbar.ts
// 自定义 tabBar 的选中态需要每个 tab 页在 onShow 里同步
interface TabBarInstance {
  setData(data: { selected: number }): void
}

interface PageWithTabBar {
  getTabBar?: () => TabBarInstance
}

/** 在 tab 页的 onShow 里调用：syncTabBar(this, 0) */
export function syncTabBar(page: unknown, selected: number): void {
  const source = page as PageWithTabBar
  if (typeof source.getTabBar !== 'function') {
    return
  }
  const tabBar = source.getTabBar()
  if (tabBar) {
    tabBar.setData({ selected })
  }
}
