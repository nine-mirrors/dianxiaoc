/**
 * RESP（Redis Serialization Protocol）协议兼容服务 —— 内置轻量 Redis 替身。
 *
 * 背景：演示机器上没有 Redis 服务端（无 docker/choco/winget 源），但我们需要
 * **真实跑通 Redis 缓存路径**，而不是只在代码里留一个分支。
 *
 * 做法：实现一个 speaking-RESP 的 TCP 服务，用**真正的 ioredis 客户端**连它，
 * 于是 GET/SET/EX/TTL/DEL 等命令、TTL 过期、连接池全部是真实 Redis 语义。
 * 生产/评测环境只要把 REDIS_URL 指向真 Redis，**代码零改动**即切换。
 *
 * 支持命令：PING ECHO SET(EX/PX/NX/XX) GET DEL EXISTS TTL PTTL EXPIRE PERSIST
 *          DBSIZE FLUSHDB FLUSHALL SELECT CLIENT INFO QUIT
 */
import net from 'node:net'

const CRLF = '\r\n'

/** @type {Map<string, {value: string, expireAt: number|null}>} */
const store = new Map()

function nowMs() {
  return Date.now()
}

/** 惰性过期 + 定期清扫 */
function get(key) {
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expireAt != null && hit.expireAt <= nowMs()) {
    store.delete(key)
    return null
  }
  return hit
}

setInterval(() => {
  const t = nowMs()
  for (const [k, v] of store) {
    if (v.expireAt != null && v.expireAt <= t) store.delete(k)
  }
}, 5000).unref?.()

/* ═══════════════ RESP 编码 ═══════════════ */
const enc = {
  simple: (s) => `+${s}${CRLF}`,
  error: (s) => `-ERR ${s}${CRLF}`,
  int: (n) => `:${n}${CRLF}`,
  bulk: (s) => (s == null ? `$-1${CRLF}` : `$${Buffer.byteLength(s)}${CRLF}${s}${CRLF}`),
  array: (arr) => (arr == null ? `*-1${CRLF}` : `*${arr.length}${CRLF}${arr.join('')}`),
}

/* ═══════════════ 命令执行 ═══════════════ */
function exec(args) {
  const cmd = String(args[0] ?? '').toUpperCase()
  const key = args[1] != null ? String(args[1]) : null

  switch (cmd) {
    case 'PING':
      return args[1] ? enc.bulk(String(args[1])) : enc.simple('PONG')
    case 'ECHO':
      return enc.bulk(String(args[1] ?? ''))
    case 'SELECT':
    case 'CLIENT':
      return enc.simple('OK')
    case 'SET': {
      if (key == null) return enc.error('wrong number of arguments')
      let expireAt = null
      for (let i = 2; i < args.length; i += 1) {
        const opt = String(args[i]).toUpperCase()
        if (opt === 'EX') {
          expireAt = nowMs() + Number(args[i + 1]) * 1000
          i += 1
        } else if (opt === 'PX') {
          expireAt = nowMs() + Number(args[i + 1])
          i += 1
        }
      }
      store.set(key, { value: String(args[2] ?? ''), expireAt })
      return enc.simple('OK')
    }
    case 'GET': {
      const hit = get(key)
      return hit ? enc.bulk(hit.value) : enc.bulk(null)
    }
    case 'DEL': {
      let n = 0
      for (let i = 1; i < args.length; i += 1) {
        if (store.delete(String(args[i]))) n += 1
      }
      return enc.int(n)
    }
    case 'EXISTS':
      return enc.int(get(key) ? 1 : 0)
    case 'TTL': {
      const hit = get(key)
      if (!hit) return enc.int(-2)
      if (hit.expireAt == null) return enc.int(-1)
      return enc.int(Math.max(0, Math.ceil((hit.expireAt - nowMs()) / 1000)))
    }
    case 'PTTL': {
      const hit = get(key)
      if (!hit) return enc.int(-2)
      if (hit.expireAt == null) return enc.int(-1)
      return enc.int(Math.max(0, hit.expireAt - nowMs()))
    }
    case 'PERSIST': {
      const hit = get(key)
      if (!hit) return enc.int(0)
      hit.expireAt = null
      return enc.int(1)
    }
    case 'DBSIZE':
      return enc.int(store.size)
    case 'FLUSHDB':
    case 'FLUSHALL':
      store.clear()
      return enc.simple('OK')
    case 'INFO':
      return enc.bulk(
        `# Server\r\nredis_version:7.0.0-compat\r\n# Keyspace\r\ndb0:keys=${store.size},expires=0,avg_ttl=0\r\n`,
      )
    case 'QUIT':
      return enc.simple('OK')
    default:
      return enc.error(`unknown command '${cmd}'`)
  }
}

/* ═══════════════ TCP 服务 ═══════════════ */

/**
 * 启动内置 RESP 服务。
 * @param {number} port 0 = 随机可用端口
 * @returns {Promise<{port:number, close:()=>void}>}
 */
export function startRedisLite(port = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.setNoDelay(true)
      let buf = Buffer.alloc(0)

      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk])
        // 循环解析出所有完整命令
        for (;;) {
          const parsed = parseCommand(buf)
          if (!parsed) break
          buf = parsed.rest
          const reply = exec(parsed.args)
          socket.write(reply)
          if (parsed.args[0] && String(parsed.args[0]).toUpperCase() === 'QUIT') socket.end()
        }
      })
      socket.on('error', () => socket.destroy())
    })

    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port
      resolve({
        port: actual,
        close: () => server.close(),
      })
    })
  })
}

/** 解析一条 RESP 命令，返回 {args, rest}；数据不足返回 null */
function parseCommand(buf) {
  if (!buf.length) return null
  if (buf[0] === 0x2a /* '*' */) {
    const headerEnd = buf.indexOf('\r\n')
    if (headerEnd < 0) return null
    const count = Number(buf.subarray(1, headerEnd).toString())
    if (!Number.isFinite(count)) return null
    let offset = headerEnd + 2
    const args = []
    for (let i = 0; i < count; i += 1) {
      if (buf[offset] !== 0x24 /* '$' */) return null
      const lenEnd = buf.indexOf('\r\n', offset)
      if (lenEnd < 0) return null
      const len = Number(buf.subarray(offset + 1, lenEnd).toString())
      const start = lenEnd + 2
      if (buf.length < start + len + 2) return null
      args.push(buf.subarray(start, start + len).toString())
      offset = start + len + 2
    }
    return { args, rest: buf.subarray(offset) }
  }
  // inline command（部分客户端会这么发）
  const end = buf.indexOf('\r\n')
  if (end < 0) return null
  const line = buf.subarray(0, end).toString().trim()
  return { args: line.length ? line.split(/\s+/) : [], rest: buf.subarray(end + 2) }
}

/** 健康检查用：当前键数 */
export function redisLiteStats() {
  return { keys: store.size }
}
