// fanboy-http - Fanboy HTTP API

module.exports = exports = FanboyService

var Negotiator = require('negotiator')
var Readable = require('stream').Readable
var assert = require('assert')
var fanboy = require('fanboy')
var fs = require('fs')
var http = require('http')
var httphash = require('http-hash')
var mkdirp = require('mkdirp')
var path = require('path')
var util = require('util')
var zlib = require('zlib')

function nop () {}

var debugging = parseInt(process.env.NODE_DEBUG, 10) === 1
var debug = (function () {
  return debugging ? function (o) {
    console.error('** fanboy-http: %s', util.inspect(o))
  } : nop
})()
var time = debugging ? process.hrtime : nop
var ns = (function () {
  return debugging ? function (t) {
    return t[0] * 1e9 + t[1]
  } : nop
})()

function headers (len, lat, enc) {
  var headers = {
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
  var gz = false
  var neg = new Negotiator(req)
  gz = neg.preferredEncoding(['gzip', 'identity']) === 'gzip'
  return gz
}

function latency (t, log) {
  var lat = ns(time(t))
  var limit = 21e6
  if (lat > limit) {
    log.warn({ ms: (lat / 1e6).toFixed(2) }, 'high latency')
  }
  return lat
}

function respond (req, res, statusCode, payload, ts) {
  assert(!res.finished, 'attempted to respond more than once')

  var log = req.log || { warn: nop }

  function onfinish () {
    req = null

    res.removeListener('close', onclose)
    res.removeListener('finish', onfinish)
    res = null
  }
  function onclose () {
    log.warn({ url: req.url }, 'connection terminated')
    onfinish()
  }
  var gz = getGz(req)
  function lat () {
    if (ts instanceof Array) {
      return latency(ts, log)
    }
  }
  function write (headers, data) {
    if (req.method === 'HEAD') data = null
    res.writeHead(statusCode, headers)
    res.end(data)
  }
  if (gz) {
    zlib.gzip(payload, function (er, zipped) {
      if (!res) return
      var h = headers(zipped.length, lat(), 'gzip')
      write(h, zipped)
    })
  } else {
    var len = Buffer.byteLength(payload, 'utf8')
    var h = headers(len, lat())
    write(h, payload)
  }
  res.on('close', onclose)
  res.on('finish', onfinish)
}

// TODO: Review errors
// Should we crash on 'falling back on cache: ENOTFOUND'?

function ok (er) {
  var whitelist = RegExp([
    'fanboy: unexpected response 400',
    'fanboy: guid',
    'fanboy: falling back on cache'
  ].join('|'))
  var msg = er.message
  return msg.match(whitelist) !== null
}

function errorHandler (er) {
  var log = this.log
  var stopping = this.stopping
  if (stopping) {
    return log.warn('error handler called while stopping', er)
  }
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
  var queries = unescape(params.query).split(',')
  return new StreamHandler(ctx, queries, s)
}

function search (state, ctx, params) {
  var s = state.fanboy.search()
  var queries = [unescape(params.query)]
  return new StreamHandler(ctx, queries, s)
}

function suggest (state, ctx, params) {
  var s = state.fanboy.suggest()
  var queries = [unescape(params.query)]
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
  this.stopping = false

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
    'version': { value: t.version },
    'stopping': {
      get: function () {
        return t.stopping
      }
    }
  })
}

// WARNING: restarting is undefined.

FanboyService.prototype.start = function (cb) {
  cb = cb || nop

  var log = this.log
  var mb = this.cacheSize / 1024 / 1024 + ' MB'
  var info = { version: this.version, pid: process.pid, location: this.location, cacheSize: mb }
  log.info(info, 'starting')

  var cache = fanboy(this.location, {
    cacheSize: this.cacheSize,
    media: 'podcast',
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
    log.info(info, 'listening')
    cb(er)
  })
  this.server = server
}

FanboyService.prototype.stop = function (cb) {
  cb = cb || nop
  this.stopping = true
  var me = this
  this.server.close(function (er) {
    me.fanboy.close(cb)
  })
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.FanboyService = FanboyService
  exports.debug = debug
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
