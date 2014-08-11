
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
  var stream = fanboy.suggest(this.opts)
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
  var stream = fanboy.search(this.opts)
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

function defaults (opts) {
  opts = opts || Object.create(null)
  opts.location = opts.location || '/tmp/fanboy-http'
  opts.port = opts.port || 8383
  opts.log = opts.log || { info:noop, warn:noop, debug:noop, error:noop }
  return opts
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
  rt.fn(req, res, rt.params)
}

function init (svc, db) {
  svc.db = db
  svc.opts = {
    db: db
  , media: 'podcast'
  }
  svc.server = http.createServer(function (req, res) {
    svc.handle(req, res)
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

if (process.env.NODE_TEST) {
  exports.createRouter = createRouter
  exports.FanboyService = FanboyService
  exports.defaults = defaults
  exports.noop = noop
  exports.parse = parse
}
