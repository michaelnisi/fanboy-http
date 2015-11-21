// fanboy-http - Fanboy HTTP API

module.exports = exports = FanboyService

var Negotiator = require('negotiator')
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
    log.warn('high latency: ' + (lat / 1e6).toFixed(2) + ' ms')
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
    log.warn('connection terminated: ' + req.url)
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

function ok (er) {
  var whitelist = RegExp([
    'fanboy: unexpected response 400',
    'fanboy: guid'
  ].join('|'))
  var msg = er.message
  return msg.match(whitelist) !== null
}

function errorHandler (er, log) {
  log = log || this.log
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

function query (s, state, queries, cb) {
  var data = ''
  function read () {
    var chunk
    while ((chunk = s.read()) !== null) {
      data += chunk
    }
  }
  function deinit () {
    s.removeListener('drain', write)
    s.removeListener('end', onend)
    s.removeListener('error', onerror)
    s.removeListener('readable', read)
    s = null
    state = null
    queries = null
    cb = null
  }
  function onend () {
    var payload = data
    cb(null, 200, payload)
    deinit()
  }
  function onerror (er) {
    errorHandler(er, state.log)
  }
  s.on('end', onend)
  s.on('error', onerror)
  s.on('readable', read)

  function write () {
    var q = queries.shift()
    if (q === undefined) {
      s.end()
    } else {
      if (s.write(q)) {
        write()
      } else {
        s.once('drain', write)
      }
    }
  }
  write()
}

function root (state, params, cb) {
  var payload = JSON.stringify({
    name: 'fanboy',
    version: state.version
  })
  cb(null, 200, payload)
}

function notFound (state, params, cb) {
  var er = new Error('not found')
  var payload = JSON.stringify({
    error: 'not found',
    reason: 'not an endpoint'
  })
  cb(er, 404, payload)
}

function lookup (state, params, cb) {
  var s = state.fanboy.lookup()
  var queries = unescape(params.query).split(',')
  query(s, state, queries, cb)
}

function search (state, params, cb) {
  var s = state.fanboy.search()
  var queries = [unescape(params.query)]
  query(s, state, queries, cb)
}

function suggest (state, params, cb) {
  var s = state.fanboy.suggest()
  var queries = [unescape(params.query)]
  query(s, state, queries, cb)
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

// Please note that restarting is undefined.

FanboyService.prototype.start = function (cb) {
  cb = cb || nop

  var log = this.log

  log.info('starting pid %s', process.pid)
  log.info('using database at %s', this.location)
  log.info('with cache size %s MB', this.cacheSize / 1024 / 1024)

  var cache = fanboy(this.location, {
    cacheSize: this.cacheSize,
    media: 'podcast',
    ttl: this.ttl
  })
  this.errorHandler = errorHandler.bind(this)
  cache.on('error', this.errorHandler)
  this.fanboy = cache

  // Setting up context for the request handler

  var payloads = {
    500: JSON.stringify({
      error: 'not ok',
      reason: 'could be all kinds of things actually'
    })
  }

  var router = this.router

  var state = {
    fanboy: cache,
    log: log,
    version: this.version
  }

  function onrequest (req, res) {
    var ts = time()
    log.debug(req.method + ' ' + req.url)
    function terminate (er, statusCode, payload) {
      if (er) {
        log.warn(req.url + ' ' + er.message)
        statusCode = statusCode || 500
        payload = payload || payloads[statusCode] || payloads[500]
      }
      respond(req, res, statusCode, payload, ts)
      req = null
      res = null
    }
    var route = router.get(req.url)
    var handler = route.handler || notFound
    var params = route.params
    handler(state, params, terminate)
  }

  var port = this.port
  var server = http.createServer(onrequest)
  server.listen(port, function (er) {
    log.info('listening on port %s', port)
    log.info('allowing %s sockets', http.globalAgent.maxSockets)
    cb(er)
  })
  this.server = server
}

FanboyService.prototype.stop = function (cb) {
  cb = cb || nop
  var me = this
  this.server.close(function (er) {
    me.fanboy.close(cb)
  })
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.FanboyService = FanboyService
  exports.debug = debug
  exports.defaults = defaults
  exports.lookup = lookup
  exports.nop = nop
  exports.query = query
  exports.root = root
  exports.router = router
  exports.search = search
  exports.suggest = suggest
  exports.version = version
}
