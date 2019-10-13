'use strict'

// fanboy-http - search iTunes

module.exports = exports = FanboyService

const HttpHash = require('http-hash')
const Negotiator = require('negotiator')
const assert = require('assert')
const fs = require('fs')
const http = require('http')
const httpMethods = require('http-methods/method')
const mkdirp = require('mkdirp')
const path = require('path')
const podcast = require('./lib/podcast')
const url = require('url')
const zlib = require('zlib')
const { createLevelDB, Fanboy } = require('fanboy')

function nop () {}

// Measure time for log levels below INFO, which would be 30 in bunyan.
// Recommended level for general development is INFO (30), production
// is suited by WARN (40) or better ERROR (50).
const debugging = parseInt(process.env.FANBOY_LOG_LEVEL, 10) < 30
const time = debugging ? process.hrtime : nop
const ns = (() => {
  return debugging ? (t) => {
    return t[0] * 1e9 + t[1]
  } : nop
})()

let v
function version () {
  if (v) return v
  const p = path.join(__dirname, 'package.json')
  const data = fs.readFileSync(p)
  const pkg = JSON.parse(data)
  v = pkg.version
  return v
}

function headers (len, lat, enc) {
  const headers = {
    'Cache-Control': 'max-age=' + 86400,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': len,
    'Fanboy-Version': version()
  }
  if (lat) {
    headers['Latency'] = lat
  }
  if (enc) {
    headers['Content-Encoding'] = enc
  }
  return headers
}

function getGz (req) {
  const neg = new Negotiator(req)
  return neg.preferredEncoding(['gzip', 'identity']) === 'gzip'
}

function latency (t, log) {
  const lat = ns(time(t))
  const limit = 21e6
  if (lat > limit) {
    log.warn({ ms: (lat / 1e6).toFixed(2) }, 'latency')
  }
  return lat
}

// A general responder for buffered payloads that applies gzip compression
// if requested.
//
// - req IncomingMessage The request.
// - res ServerResponse The response.
// - statusCode Number The HTTP status code.
// - payload Buffer | String The JSON payload.
// - time Array | void The hi-res real time tuple of when the request hit.
// - log The logger to use.
function respond (req, res, statusCode, payload, time, log) {
  assert(!res.finished, 'cannot respond more than once')

  function onfinish () {
    res.removeListener('close', onclose)
    res.removeListener('finish', onfinish)
  }
  function onclose () {
    log.warn('connection terminated: ' + req.url)
    onfinish()
  }
  const gz = getGz(req)
  function lat () {
    if (time instanceof Array) {
      return latency(time, log)
    }
  }
  if (gz) {
    zlib.gzip(payload, (er, zipped) => {
      if (!res) return
      const h = headers(zipped.length, lat(), 'gzip')
      res.writeHead(statusCode, h)
      res.end(zipped)
    })
  } else {
    const len = Buffer.byteLength(payload, 'utf8')
    const h = headers(len, lat())
    res.writeHead(statusCode, h)
    res.end(payload)
  }
  res.on('close', onclose)
  res.on('finish', onfinish)
}

const whitelist = RegExp([
  'fanboy: falling back on cache',
  'fanboy: falling back on cache: ENOTFOUND',
  'fanboy: guid',
  'fanboy: unexpected response 400'
].join('|'), 'i')

// Assess error by its message returning `true`, if it’s OK to continue.
function ok (er) {
  let ok = false
  if (er) {
    const msg = er.message
    if (msg) ok = msg.match(whitelist) !== null
  }
  return ok
}

function crash (er, log) {
  if (log && typeof log.fatal === 'function') log.fatal(er)
  process.nextTick(() => { throw er })
}

function errorHandler (er) {
  if (ok(er)) {
    this.log.warn(er.message)
  } else {
    const failure = 'fatal error'
    const reason = er.message
    const error = new Error(`${failure}: ${reason}`)
    crash(error, this.log)
  }
}

function root (opts, cb) {
  cb(null, 200, JSON.stringify({
    name: 'fanboy',
    version: version()
  }))
}

function pipe (s, q, opts, cb) {
  const t = time()

  let buf = ''

  function ondata (chunk) {
    buf += chunk
  }

  let er = null

  function done () {
    s.removeListener('data', ondata)
    s.removeListener('end', done)
    s.removeListener('error', onerror)
    if (buf === '') buf = null
    if (cb) cb(er, 200, buf, t)
  }
  function onerror (error) {
    er = error
    if (!ok(er)) done()
  }

  s.on('data', ondata)
  s.on('error', onerror)
  s.once('end', done)

  if (q instanceof Array) {
    const queries = q
    let logged = false
    queries.forEach((q) => {
      if (!s.write(q) && !logged) {
        opts.log.warn(q, 'ignoring back pressure')
        logged = true
      }
    })
    s.end()
  } else {
    s.end(q)
  }
  return s
}

function lookup (opts, cb) {
  const s = opts.fanboy.lookup()
  const q = decodeURI(opts.params.query).split(',')
  return pipe(s, q, opts, cb)
}

// Returns validated and trimmed query. If `str` is a valid query a trimmed
// lower case copy without any whitespace is returned, else `null` is returned.
function trim (str) {
  if (typeof str !== 'string') return null
  if (str === '' || str === ' ') return null
  const q = str.replace(/\s\s+/g, ' ')
  if (q === ' ') return null
  return q.trim().toLowerCase()
}

function search (opts, cb) {
  const query = opts.url.query
  const q = trim(query.q)
  if (!q) {
    opts.log.warn('invalid query')
    return cb(null, 200, '[]\r\n')
  }
  const s = opts.fanboy.search()
  return pipe(s, q, opts, cb)
}

function suggest (opts, cb) {
  const query = opts.url.query
  const q = trim(query.q)
  if (!q) {
    opts.log.warn('invalid query')
    return cb(null, 200, '[]\r\n')
  }
  const limit = parseInt(query.limit, 10) || -1
  const s = opts.fanboy.suggest(limit)
  return pipe(s, q, opts, cb)
}

function defaults (opts) {
  opts = opts || Object.create(null)
  opts.location = opts.location || '/tmp/fanboy-http'
  opts.port = opts.port || 8383
  opts.log = opts.log || { info: nop, warn: nop, debug: nop, error: nop }
  opts.ttl = opts.ttl || 24 * 3600 * 1000
  opts.cacheSize = opts.cacheSize || 16 * 1024 * 1024
  return opts
}

function FanboyService (opts) {
  if (!(this instanceof FanboyService)) return new FanboyService(opts)

  opts = defaults(opts)
  Object.assign(this, opts)

  this.hash = HttpHash()

  this.fanboy = null
  this.server = null

  mkdirp.sync(this.location)
}

function ReqOpts (fanboy, log, params, splat, Url) {
  this.fanboy = fanboy
  this.log = log
  this.params = params
  this.splat = splat
  this.url = Url
}

FanboyService.prototype.handleRequest = function (req, cb) {
  if (typeof cb !== 'function') {
    throw new Error('callback required to handle request')
  }

  const Url = url.parse(req.url, true)

  const route = this.hash.get(Url.pathname)
  if (route.handler === null) {
    const er = new Error('not found')
    er.statusCode = 404
    return cb ? cb(er) : null
  }

  const opts = new ReqOpts(
    this.fanboy,
    this.log,
    route.params,
    route.splat,
    Url
  )

  return route.handler(opts, cb)
}

FanboyService.prototype.setRoutes = function () {
  const set = (name, handler) => {
    if (handler && typeof handler === 'object') {
      handler = httpMethods(handler)
    }
    this.hash.set(name, handler)
  }
  set('/', root)
  set('/lookup/:query/', lookup)
  set('/search', search)
  set('/suggest', suggest)
}

FanboyService.prototype.start = function (cb) {
  const log = this.log

  const info = {
    version: version(),
    location: this.location,
    cacheSize: this.cacheSize
  }
  log.info(info, 'start')

  const cache = fanboy(this.location, {
    cacheSize: this.cacheSize,
    media: 'podcast',
    result: podcast,
    ttl: this.ttl
  })

  this.errorHandler = errorHandler.bind(this)
  cache.on('error', this.errorHandler)

  this.fanboy = cache

  this.setRoutes()

  const onrequest = (req, res) => {
    log.debug({ method: req.method, url: req.url }, 'request')

    function terminate (er, statusCode, payload, time) {
      if (er) {
        const payloads = {
          404: () => {
            log.warn({ method: req.method, url: req.url }, 'no route')
            const reason = req.url + ' is no route'
            statusCode = 404
            payload = JSON.stringify({
              error: 'not found',
              reason: reason
            })
          },
          405: () => {
            log.warn({ method: req.method, url: req.url }, 'not allowed')
            const reason = req.method + ' ' + req.url + ' is undefined'
            statusCode = 405
            payload = JSON.stringify({
              error: 'method not allowed',
              reason: reason
            })
          }
        }
        if (er.statusCode in payloads) {
          payloads[er.statusCode]()
        } else if (ok(er)) {
          if (!payload) {
            return crash(er, log)
          }
          log.warn(er)
        } else {
          return crash(er, log)
        }
      }
      respond(req, res, statusCode, payload, time, log)
    }

    this.handleRequest(req, terminate)
  }

  const server = http.createServer(onrequest)
  const port = this.port

  server.listen(port, (er) => {
    const info = {
      port: port,
      sockets: http.globalAgent.maxSockets
    }
    log.info(info, 'listen')
    if (cb) cb(er)
  })

  server.on('clientError', (er, socket) => {
    //
    // Logging in the 'close' callback, because I've seen the call stack being
    // exceeded in bunyan.js, in line 958 at this moment, suggesting a race
    // condition in the error handler. To circumvent this, we also check if the
    // socket has been destroyed already, before we try to close it.
    //
    socket.once('close', () => { log.warn(er) })
    if (!socket.destroyed) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    }
  })

  this.server = server
}

const TEST = process.mainModule.filename.match(/test/) !== null

if (TEST) {
  FanboyService.prototype.stop = function (cb) {
    this.server.close((er) => {
      this.fanboy.close((er) => {
        this.fanboy.removeAllListeners()
        if (cb) cb(er)
      })
    })
  }
  exports.FanboyService = FanboyService
  exports.defaults = defaults
  exports.lookup = lookup
  exports.nop = nop
  exports.root = root
  exports.search = search
  exports.suggest = suggest
  exports.trim = trim
  exports.version = version
}
