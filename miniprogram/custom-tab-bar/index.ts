// custom-tab-bar/index.ts
// 透明玻璃底部菜单：原生 tabBar 无法做模糊，这里用自定义组件实现
Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '天气',
        iconPath: '/images/tabbar/weather.png',
        selectedIconPath: '/images/tabbar/weather-active.png',
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        iconPath: '/images/tabbar/mine.png',
        selectedIconPath: '/images/tabbar/mine-active.png',
      },
    ],
  },

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      const path = String(e.currentTarget.dataset.path)
      if (index === this.data.selected) {
        return
      }
      wx.switchTab({ url: path })
    },
  },
})
