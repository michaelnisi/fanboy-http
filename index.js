'use strict'

// fanboy-http - search iTunes

module.exports = exports = FanboyService

const Negotiator = require('negotiator')
const Readable = require('stream').Readable
const assert = require('assert')
const fanboy = require('fanboy')
const fs = require('fs')
const http = require('http')
const httphash = require('http-hash')
const mkdirp = require('mkdirp')
const path = require('path')
const podcast = require('./lib/podcast')
const util = require('util')
const zlib = require('zlib')

function nop () {}

// Measure time for log levels below error, which would be 50 in bunyan.
const debugging = parseInt(process.env.FANBOY_LOG_LEVEL, 10) < 50
const time = debugging ? process.hrtime : nop
const ns = (() => {
  return debugging ? (t) => {
    return t[0] * 1e9 + t[1]
  } : nop
})()

function headers (len, lat, enc) {
  const headers = {
    'Cache-Control': 'max-age=' + 86400,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': len
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

function respond (req, res, statusCode, payload, ts) {
  assert(!res.finished, 'attempted to respond more than once')

  const log = req.log || { warn: nop }

  function onfinish () {
    res.removeListener('close', onclose)
    res.removeListener('finish', onfinish)
  }
  function onclose () {
    log.warn('connection terminated: ', { url: req.url })
    onfinish()
  }
  const gz = getGz(req)
  function lat () {
    if (ts instanceof Array) {
      return latency(ts, log)
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

// TODO: Whitelist 'falling back on cache: ENOTFOUND'

const whitelist = RegExp([
  'fanboy: unexpected response 400',
  'fanboy: guid',
  'fanboy: falling back on cache'
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

function errorHandler (er) {
  var log = this.log
  if (ok(er)) {
    log.warn(er.message)
  } else {
    var failure = 'fatal error'
    var reason = er.message
    var error = new Error([failure, reason].join([': ']))
    log.error(error)
    process.nextTick(function () {
      throw error
    })
  }
}

function StaticHandler (payload) {
  Readable.call(this)
  this.push(payload)
  this.push(null)
}

util.inherits(StaticHandler, Readable)

function root (state, ctx, params) {
  if (!root.payload) {
    root.payload = JSON.stringify({
      name: 'fanboy',
      version: state.version
    })
  }
  return new StaticHandler(root.payload)
}

function StreamHandler (context, queries, source) {
  Readable.call(this)
  this.context = context
  this.queries = queries
  this.source = source

  var me = this

  function onerror (er) {
    me.emit('error', er)
  }
  var ok = true
  function read () {
    var chunk
    while (ok && (chunk = source.read()) !== null) {
      ok = me.push(chunk)
    }
    var more = chunk !== null
    if (!ok && more) {
      me.once('drain', function () {
        ok = true
        read()
      })
    }
  }
  function onend () {
    source.removeListener('end', onend)
    source.removeListener('error', onerror)
    source.removeListener('readable', read)

    me.context = null
    me.queries = null
    me.source = null

    me.push(null)
  }
  source.on('end', onend)
  source.on('error', onerror)
  source.on('readable', read)
}

util.inherits(StreamHandler, Readable)

StreamHandler.prototype._read = function (size) {
  var source = this.source
  var queries = this.queries

  if (source._writableState.ended) { return }
  if (this.context.closed) {
    return source.end()
  }
  function write () {
    var ok = !source._readableState.needDrain
    var query
    while (ok && (query = queries.shift()) !== undefined) {
      ok = source.write(query)
    }
    var more = queries.length > 0
    if (!ok && more) {
      source.once('drain', write)
    } else {
      source.end()
    }
  }
  write()
}

function lookup (state, ctx, params) {
  // Burke buffering to allow compartmentalized aborting.
  var opts = { highWaterMark: 0 }
  var s = state.fanboy.lookup(opts)
  var queries = decodeURI(params.query).split(',')
  return new StreamHandler(ctx, queries, s)
}

function search (state, ctx, params) {
  var s = state.fanboy.search()
  var queries = [decodeURI(params.query)]
  return new StreamHandler(ctx, queries, s)
}

function suggest (state, ctx, params) {
  var s = state.fanboy.suggest()
  var queries = [decodeURI(params.query)]
  return new StreamHandler(ctx, queries, s)
}

function router () {
  var router = httphash()
  router.set('/', root)
  router.set('/lookup/:query/', lookup)
  router.set('/search/:query/', search)
  router.set('/suggest/:query/', suggest)
  return router
}

function version () {
  var p = path.join(__dirname, 'package.json')
  var data = fs.readFileSync(p)
  var pkg = JSON.parse(data)
  return pkg.version
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
  util._extend(this, opts)

  this.router = router()
  this.version = version()

  this.fanboy = null
  this.repl = null
  this.server = null

  mkdirp.sync(this.location)
}

function Context (closed) {
  this.closed = closed
}

function freshPayloads () {
  return [
    {
      statusCode: 404,
      error: 'not found',
      reason: 'not an endpoint'
    },
    {
      statusCode: 500,
      error: 'not ok',
      reason: 'who knows'
    }
  ].reduce(function (acc, p) {
    var code = p.statusCode
    var o = {
      error: p.error,
      reason: p.reason
    }
    acc[code] = JSON.stringify(o)
    return acc
  }, Object.create(null))
}

function freshState (t) {
  return Object.defineProperties(Object.create(null), {
    'fanboy': { value: t.fanboy },
    'log': { value: t.log },
    'version': { value: t.version }
  })
}

FanboyService.prototype.start = function (cb = nop) {
  const log = this.log

  const info = {
    version: this.version,
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

  // Setting up context for the request handler

  var me = this
  var router = this.router
  var payloads = freshPayloads()
  var state = freshState(this)

  function onrequest (req, res) {
    var ts = time()
    log.info({ method: req.method, url: req.url }, 'request')

    var ctx = new Context(false)
    function onclose () {
      ctx.closed = true
    }
    req.on('close', onclose)
    res.on('close', onclose)

    function terminate (er, statusCode, payload) {
      if (ctx.closed) {
        er = new Error('underlying connection closed')
      }
      if (er) {
        log.warn({ url: req.url }, er.message)
        statusCode = statusCode || 500
        payload = payload || payloads[statusCode] || payloads[500]
      }

      if (ctx.closed) {
        res.end()
      } else {
        respond(req, res, statusCode, payload, ts)
      }

      req.removeListener('close', onclose)
      req = null

      res.removeListener('close', onclose)
      res = null

      ctx = null
    }

    var route = router.get(req.url)
    var handler = route.handler
    if (!handler) {
      return terminate(new Error('not found'), 404)
    }

    var params = route.params
    var s = handler(state, ctx, params)

    function onerror (er) {
      errorHandler.call(me, er)
    }
    var payload = ''
    function onreadable () {
      var chunk
      while ((chunk = s.read()) !== null) {
        payload += chunk
      }
    }
    function onend () {
      s.removeListener('end', onend)
      s.removeListener('readable', onreadable)
      s.removeListener('error', onerror)

      terminate(null, 200, payload)
    }
    s.on('end', onend)
    s.on('error', onerror)
    s.on('readable', onreadable)
  }

  var port = this.port
  var server = http.createServer(onrequest)

  server.on('clientError', function (exc, sock) {
    log.warn({ exc: exc, sock: sock }, 'client error')
  })

  server.listen(port, function (er) {
    var info = { port: port, maxSockets: http.globalAgent.maxSockets }
    log.info(info, 'listen')
    cb(er)
  })
  this.server = server
}

const TEST = process.mainModule.filename.match(/test/) !== null

if (TEST) {
  FanboyService.prototype.stop = function (cb = nop) {
    this.server.close((er) => {
      this.fanboy.close((er) => {
        this.fanboy.removeAllListeners()
        cb(er)
      })
    })
  }
  exports.FanboyService = FanboyService
  exports.defaults = defaults
  exports.freshPayloads = freshPayloads
  exports.lookup = lookup
  exports.nop = nop
  exports.root = root
  exports.router = router
  exports.search = search
  exports.suggest = suggest
  exports.version = version
}
