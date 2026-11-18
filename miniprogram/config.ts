// 腾讯位置服务 Key（控制台：https://lbs.qq.com/dev/console/key/manage）
// 注意：小程序包会被反编译，此 Key 属于「前端可见」的凭证，请在控制台限制授权域名/IP，
// 并不要把它复用到服务端接口（服务端另建带签名的 Key）。
export const QQ_MAP_KEY = 'SYLBZ-LYHCZ-PFCXM-TXM2G-HQP43-7NFXV'

// 和风天气：JWT（EdDSA）本地签名
// host 以控制台「API Host」为准，免费订阅是 devapi.qweather.com
// seedBase64 是 keys/private.pem 对应的 32 字节私钥种子，会随小程序包分发——本项目仅供自用
export const QWEATHER = {
  host: 'https://devapi.qweather.com',
  kid: 'K5B8UVVR2M',
  projectId: '39KVCR6BWP',
  seedBase64: 'bpvDCyzirczVPYTcQZg96x6YRELfYERu4JHbnQ7yCVQ=',
}
