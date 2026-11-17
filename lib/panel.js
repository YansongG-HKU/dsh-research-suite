/**
 * Loopback panel API. Read-mostly: the panel never edits the ledger directly,
 * it calls the same service the agent tools use.
 */
import { ROUTE_PREFIX, REQUEST_HEADER } from './config.js'
import { ensureDir } from './util.js'
import { messageOf } from './util.js'

function sendJson(res, status, payload) {
  try {
    if (!res || res.headersSent || res.writableEnded) return
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(body, 'utf8')),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  } catch {
    /* response is gone */
  }
}

function sendText(res, status, text, headers = {}) {
  try {
    if (!res || res.headersSent || res.writableEnded) return
    res.writeHead(status, {
      'content-type': 'text/markdown; charset=utf-8',
      'content-length': String(Buffer.byteLength(text, 'utf8')),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    })
    res.end(text)
  } catch {
    /* response is gone */
  }
}

function checkLoopbackHost(req) {
  const host = String(req?.headers?.host || '').toLowerCase()
  if (!host) return true
  const name = host.replace(/:\d+$/u, '')
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1'
}

function checkRequest(req) {
  if (!checkLoopbackHost(req)) return { ok: false, reason: 'loopback host required' }
  const method = String(req?.method || 'GET').toUpperCase()
  if (method === 'POST') {
    const token = String(req?.headers?.[REQUEST_HEADER] || '')
    const origin = String(req?.headers?.origin || '')
    const sameOrigin = origin === '' || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/u.test(origin)
    if (token !== '1' || !sameOrigin) return { ok: false, reason: 'panel request header required' }
  }
  return { ok: true }
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('request body too large'), { code: 'too_large' }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { code: 'invalid_input' }))
      }
    })
    req.on('error', reject)
  })
}

function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export function registerPanel({ ctx, service, log }) {
  if (!ctx || typeof ctx.inject !== 'function') return null
  const warn = (message) => {
    try {
      log?.warn?.(message)
    } catch {
      /* logging never breaks registration */
    }
  }
  try {
    return ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx?.webServer
      if (!webServer || typeof webServer.register !== 'function') return null
      const register = () =>
        webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: (req, res) => {
            void handleRequest(service, req, res)
          },
        })
      let dispose = null
      try {
        dispose = typeof webCtx?.effect === 'function' ? webCtx.effect(register, 'dsh-research-suite: panel routes') : register()
      } catch (error) {
        warn(`could not register the panel routes: ${messageOf(error)}`)
        return null
      }
      return () => {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* disposal never throws */
        }
      }
    })
  } catch (error) {
    warn(`could not attach the panel to the web server: ${messageOf(error)}`)
    return null
  }
}

export async function handleRequest(service, req, res) {
  try {
    const url = new URL(String(req?.url ?? '/'), 'http://localhost')
    if (!url.pathname.startsWith(ROUTE_PREFIX)) {
      sendJson(res, 404, { ok: false, code: 'not_found', error: 'unknown route' })
      return
    }
    const rest = url.pathname.slice(ROUTE_PREFIX.length) || '/'
    const segments = rest.split('/').filter(Boolean)
    if (segments[0] !== 'api') {
      sendJson(res, 404, { ok: false, code: 'not_found', error: 'unknown route' })
      return
    }
    const gate = checkRequest(req)
    if (!gate.ok) {
      sendJson(res, 403, { ok: false, code: 'forbidden', error: gate.reason })
      return
    }
    const method = String(req?.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'POST' && method !== 'HEAD') {
      sendJson(res, 405, { ok: false, code: 'method_not_allowed', error: `${method} is not allowed` })
      return
    }
    const body = method === 'POST' ? await readBody(req) : {}
    const data = await dispatch(service, segments.slice(1), url, body, method)
    if (method === 'HEAD') {
      sendJson(res, 200, { ok: true, data })
      return
    }
    sendJson(res, 200, { ok: true, data })
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'failed'
    const status = code === 'not_found' ? 404 : code === 'forbidden' ? 403 : code === 'too_large' ? 413 : 400
    try {
      sendJson(res, status, { ok: false, code, error: messageOf(error), detail: error?.detail ?? null })
    } catch {
      /* response is gone */
    }
  }
}

async function dispatch(service, parts, url, body, method) {
  const head = parts[0] || ''
  if (head === 'state' && parts.length === 1) return service.state()
  if (head === 'templates' && parts.length === 1) return { templates: service.templates() }
  if (head === 'domains' && parts.length === 1) return service.domains()
  if (head === 'domain' && parts.length === 2 && method === 'GET') return service.domain(parts[1], { action: 'get' })

  if (head === 'campaign') {
    if (parts.length === 1) {
      if (method === 'GET') return service.state()
      const action = String(body.action || 'create')
      if (action === 'create') return service.create(body)
      if (action === 'select') return service.select(body.campaign || body.id)
      if (action === 'update') return service.update(body.campaign || body.id, body)
      if (action === 'archive') return service.archive(body.campaign || body.id)
      if (action === 'world') return service.world(body.campaign || body.id, body)
      if (action === 'prereg') return service.prereg(body.campaign || body.id, body)
      if (action === 'search') return service.search(body.campaign || body.id, body)
      throw codedError('invalid_input', `unknown campaign action: ${action}`)
    }
    const id = parts[1]
    if (parts.length === 2 && method === 'GET') return service.get(id)
    if (parts.length === 3 && parts[2] === 'check') return service.gate(id, { action: 'check' })
    if (parts.length === 3 && parts[2] === 'domain') {
      if (method === 'GET') return service.domain(id, { action: 'get' })
      return service.domain(id, body)
    }
    if (parts.length === 3 && parts[2] === 'monitor' && method === 'POST') return service.monitor(id, body)
    if (parts.length === 3 && parts[2] === 'evaluate' && method === 'POST') return service.evaluate(id, body)
    throw codedError('not_found', 'unknown campaign route')
  }

  if (head === 'template' && parts.length === 1 && method === 'POST') {
    return service.templateApply(body)
  }

  if (head === 'gate' && parts.length === 2 && method === 'POST') {
    return service.gate(parts[1], body)
  }

  if (head === 'integrity' && parts.length === 2 && method === 'GET') {
    return service.integrity(parts[1])
  }

  if (head === 'audit' && parts.length === 2) {
    if (method === 'POST') return service.audit(parts[1], { record: body.record !== false })
    return service.auditView(parts[1])
  }

  if (head === 'matrix' && parts.length === 2 && method === 'GET') {
    return service.matrix(parts[1])
  }

  if (head === 'bibtex' && parts.length === 2 && method === 'GET') {
    return service.sourceBibtex(parts[1])
  }

  if (head === 'artifacts' && parts.length === 2 && method === 'GET') {
    return service.artifactList(parts[1])
  }

  if (head === 'figures' && parts.length === 2 && method === 'GET') {
    return service.figureList(parts[1])
  }

  if (head === 'report' && parts.length === 2 && method === 'GET') {
    return service.report(parts[1])
  }

  if (head === 'export' && parts.length === 2 && method === 'POST') {
    return service.write(parts[1], { action: 'export' })
  }

  if (head === 'declaration' && parts.length === 2 && method === 'POST') {
    return service.write(parts[1], {
      action: 'declaration',
      model: body.model,
      humanReviewer: body.humanReviewer,
      watermark: body.watermark,
    })
  }

  if (head === 'settings') {
    if (method === 'POST') return { settings: service.saveSettings(body.patch || body) }
    return { settings: service.store.settings() }
  }

  if (head === 'report-file' && parts.length === 2) {
    const { markdown } = service.report(parts[1])
    return { markdown, filename: `${parts[1]}-REPORT.md` }
  }

  throw codedError('not_found', `unknown route: /${parts.join('/')}`)
}
