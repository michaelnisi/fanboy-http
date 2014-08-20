
// fanboy-http - Fanboy HTTP API

module.exports = exports = FanboyService

var assert = require('assert')
  , fanboy = require('fanboy')
  , http = require('http')
  , levelup = require('levelup')
  , mkdirp = require('mkdirp')
  , routes = require('routes')
  , util = require('util')
  , querystring = require('querystring')
  ;

function noop () {}

var debug = function () {
  return process.env.NODE_DEBUG ?
    function (o) {
      console.error('**fanboy-http: %s', util.inspect(o))
    } : noop
}()

var _warn = [
  'JSON contained no results'
, 'no results'
, 'cached null'
]

function warn (er) {
  return er.notFound || _warn.indexOf(er.message) > -1
}

function streamError (log, stream, req, res) {
  return function (er) {
    warn(er) ? log.warn(er.message) : log.error({req:req, er:er})
    stream.unpipe(res)
    stream.removeAllListeners()
    res.end('[]\n')
  }
}

function parse (query) {
  var q = querystring.parse(query)['?q']
  if (q) {
    return q.split(' ').filter(function (token, i, tokens) {
      return i === tokens.indexOf(token)
    }).join(' ').trim()
  } else {
    return undefined
  }
}

function suggest (req, res, params) {
  var query = parse(params.query)
  if (!query) {
    req.url = '/'
    return this.handle(req, res)
  }
  this.log.info('suggest: %s', query)
  var stream = this.fanboy.suggest()
    , ok = false
    ;
  stream.write(query)
  stream.pipe(res)
  stream.once('readable', function () {
    ok = true
  })
  stream.once('error', streamError(this.log, stream, req, res))
  stream.end(function () {
    res.end(ok ? undefined : '[]\n')
  })
}

function search (req, res, params) {
  var query = parse(params.query)
  if (!query) {
    req.url = '/'
    return this.handle(req, res)
  }
  this.log.info('search: %s', query)
  var stream = this.fanboy.search()
  stream.pipe(res)
  stream.once('error', streamError(this.log, stream, req, res))
  stream.end(query, function () {
    res.end()
  })
}

function ping (req, res, params) {
  this.log.info('ping')
  res.end('pong\n')
}

function notfound (req, res) {
  this.log.warn('fishy request')
  res.writeHead(404)
  res.end('not found\n')
}

function createRouter (scope) {
  var router = this.router = routes()
  router.addRoute('/ping', ping.bind(scope))
  router.addRoute('/suggest:query', suggest.bind(scope))
  router.addRoute('/search:query', search.bind(scope))
  router.addRoute('/*', notfound.bind(scope))
  router.addRoute('/', notfound.bind(scope))
  return router
}

function defaults (opts) {
  opts = opts || Object.create(null)
  opts.location = opts.location || '/tmp/fanboy-http'
  opts.port = opts.port || 8383
  opts.log = opts.log || { info:noop, warn:noop, debug:noop, error:noop }
  opts.ttl = opts.ttl || 24 * 3600 // seconds
  return opts
}

function FanboyService (opts) {
  opts = defaults(opts)
  if (!(this instanceof FanboyService)) return new FanboyService(opts)
  util._extend(this, opts)
  this.router = createRouter(this)
  mkdirp.sync(this.location)
}

FanboyService.prototype.route = function (req, res) {
  return this.router.match(req.url)
}

FanboyService.prototype.handle = function (req, res) {
  var rt = this.route(req, res)
  res.setHeader('Cache-Control', 'max-age=' + this.ttl)
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'HEAD') {
    return res.end()
  }
  rt.fn(req, res, rt.params)
}

FanboyService.prototype.start = function (cb) {
  this.log.info('starting on port %s', this.port)
  this.db = this.db || levelup(this.location)
  if (!this.db.isClosed) this.db.open()
  this.fanboy = this.fanboy || fanboy({ db:this.db, media:'podcast' })
  this.server = this.server || http.createServer(this.handle.bind(this))
  if (cb) this.server.once('listening', cb)
  this.server.listen(this.port)
}

FanboyService.prototype.stop = function (cb) {
  var me = this
  this.server.close(function (er) {
    me.db.close(function (er) {
      if (cb) cb(er)
    })
  })
}

if (process.env.NODE_TEST) {
  exports.createRouter = createRouter
  exports.FanboyService = FanboyService
  exports.defaults = defaults
  exports.noop = noop
  exports.parse = parse
}
