// libs/jwt.ts
// 和风天气 JWT（EdDSA / Ed25519）本地签名。
// 注意：seed 会随小程序包分发，本项目仅供自用；对外发布请改为服务端签发。
import nacl from '../libs/nacl.min'
import { QWEATHER } from '../config'

const TTL_SECONDS = 900 // 和风允许最长 24h，这里取 15 分钟

let cachedToken = ''
let cachedExp = 0

/** ASCII 字符串 → 字节（header / payload 都是 ASCII） */
function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) {
    out[i] = text.charCodeAt(i) & 0xff
  }
  return out
}

/** 字节 → base64url（无 padding，+ / 替换为 - _） */
function base64url(bytes: Uint8Array): string {
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return wx
    .arrayBufferToBase64(buffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sign(): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + TTL_SECONDS

  const header = base64url(asciiBytes(JSON.stringify({ alg: 'EdDSA', kid: QWEATHER.kid })))
  const payload = base64url(
    asciiBytes(JSON.stringify({ sub: QWEATHER.projectId, iat: now, exp }))
  )
  const signingInput = `${header}.${payload}`

  const seed = new Uint8Array(wx.base64ToArrayBuffer(QWEATHER.seedBase64))
  const keyPair = nacl.sign.keyPair.fromSeed(seed)
  const signature = nacl.sign.detached(asciiBytes(signingInput), keyPair.secretKey)

  cachedToken = `${signingInput}.${base64url(signature)}`
  cachedExp = exp
  return cachedToken
}

/** 带上 Bearer 前缀的 Authorization 头，过期前 60 秒自动重签 */
export function authorizationHeader(): string {
  const now = Math.floor(Date.now() / 1000)
  if (!cachedToken || now >= cachedExp - 60) {
    sign()
  }
  return `Bearer ${cachedToken}`
}
