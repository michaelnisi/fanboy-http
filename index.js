
// fanboy-http - fanboy HTTP API

module.exports = exports = FanboyService

var assert = require('assert')
  , bunyan = require('bunyan')
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

function parse (query) {
  var q = querystring.parse(query)['?q']
  return q ? q.trim() : undefined
}

var _warn = {
  'JSON contained no results':0
, 'no results':1
}

function warn (er) {
  return er.message in _warn
}

function streamError (log, stream, req, res) {
  return function (er) {
    warn(er) ? log.warn(er.message) : log.error({req:req, er:er})
    stream.unpipe(res)
    stream.removeAllListeners()
    res.end('[]\n')
  }
}

function suggest (req, res, params) {
  var log = this.log
    , opts = this.opts
    ;
  log.info('suggest: %s', params.query)
  var stream = fanboy.suggest(opts)
    , ok = false
    ;
  stream.write(parse(params.query))
  stream.pipe(res)
  stream.once('readable', function () {
    ok = true
  })
  stream.once('error', streamError(log, stream, req, res))
  stream.end(function () {
    res.end(ok ? undefined : '[]\n')
  })
}

function search (req, res, params) {
  var log = this.log
    , opts = this.opts
    ;
  log.info('search: %s', params.query)
  var stream = fanboy.search(opts)
  stream.pipe(res)
  stream.once('error', streamError(log, stream, req, res))
  stream.end(parse(params.query), function () {
    res.end()
  })
}

function ping (req, res, params) {
  this.log.info('ping')
  res.end('pong\n')
}

function defaults (opts) {
  opts = opts || Object.create(null)
  opts.location = opts.location || '/tmp/fanboy-http'
  opts.port = opts.port || 8383
  opts.log = opts.log || { info:noop, warn:noop, debug:noop, error:noop }
  return opts
}

function FanboyService (opts) {
  opts = defaults(opts)
  if (!(this instanceof FanboyService)) return new FanboyService(opts)
  util._extend(this, opts)
  var router = this.router = routes()
  router.addRoute('/ping', ping.bind(this))
  var ex = '(\\?q=([^&]*))'
  router.addRoute('/suggest:query' + ex, suggest.bind(this))
  router.addRoute('/search:query' + ex, search.bind(this))
  mkdirp.sync(this.location)
}

function init (svc, db) {
  svc.db = db
  svc.opts = {
    db: db
  , media: 'podcast'
  }
  svc.server = http.createServer(function (req, res) {
    svc.route(req, res)
  }).listen(svc.port)
}

FanboyService.prototype.start = function () {
  if (this.db) {
    this.db.open()
  } else {
    var me = this
    levelup(this.location, null, function (er, db) {
      assert(!er && db)
      init(me, db) // I don't know, bind or whatever ...
    })
  }
}

FanboyService.prototype.stop = function () {
  this.server.close()
  this.db.close()
}

FanboyService.prototype.match = function (url) {
  if (!url) return undefined
  return this.router.match(url)
}

FanboyService.prototype.route = function (req, res) {
  var rt = this.match(req.url)
  if (rt) {
    rt.fn(req, res, rt.params)
  } else {
    this.log.warn('fishy request')
    res.writeHead(404)
    res.end('not found\n')
  }
}

if (process.env.NODE_TEST) {
  exports.FanboyService = FanboyService
  exports.defaults = defaults
  exports.noop = noop
  exports.parse = parse
}
