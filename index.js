
// fanboy-http - Fanboy HTTP API

module.exports = exports = FanboyService

var assert = require('assert')
var fanboy = require('fanboy')
var http = require('http')
var levelup = require('levelup')
var mkdirp = require('mkdirp')
var querystring = require('querystring')
var routes = require('routes')
var util = require('util')

function nop () {}

var debug = function () {
  return process.env.NODE_DEBUG ?
    function (o) {
      console.error('**fanboy-http: %s', util.inspect(o))
    } : nop
}()

var NIL = '[]\n'

var WARN = [
  'JSON contained no results'
, 'no results'
, 'cached null'
]
function warn (er) {
  return er.notFound || WARN.indexOf(er.message) > -1
}
function logRequest (req, er) {
  warn(er) ? req.log.warn(er.message) : req.log.error({req:req, err:er})
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
  if (!query) return notfound(req, res)
  req.log.info('suggest: %s', query)

  var stream = req.fanboy.suggest()
  function streamError (er) {
    res.end(NIL)
    logRequest(req, er)
    stream.unpipe(res)
  }
  function streamFinish () {
    res.end()
    stream.removeListener('error', streamError)
  }
  stream.once('error', streamError)
  stream.pipe(res)

  stream.end(query, streamFinish)
}

function search (req, res, params) {
  var query = parse(params.query)
  if (!query) return notfound(req, res)
  req.log.info('search: %s', query)

  var stream = req.fanboy.search()
  function streamError (er) {
    res.end(NIL)
    logRequest(req, er)
    stream.unpipe(res)
  }
  function streamFinish () {
    res.end()
    stream.removeListener('error', streamError)
  }
  stream.once('error', streamError)
  stream.pipe(res)

  stream.end(query, streamFinish)
}

function ping (req, res) {
  req.log.info('ping')
  res.end('pong\n')
}

function notfound (req, res) {
  req.log.warn('fishy request')
  res.writeHead(404)
  res.end('not found\n')
}

function defaults (opts) {
  opts = opts || Object.create(null)
  opts.location = opts.location || '/tmp/fanboy-http'
  opts.port = opts.port || 8383
  opts.log = opts.log || { info:nop, warn:nop, debug:nop, error:nop }
  opts.ttl = opts.ttl || 24 * 3600
  opts.cacheSize = opts.cacheSize || 8 * 1024 * 1024
  return opts
}

function FanboyService (opts) {
  opts = defaults(opts)
  if (!(this instanceof FanboyService)) return new FanboyService(opts)
  util._extend(this, opts)

  var router = this.router = routes()
  router.addRoute('/ping', ping)
  router.addRoute('/suggest:query', suggest)
  router.addRoute('/search:query', search)
  router.addRoute('/*', notfound)
  router.addRoute('/', notfound)

  mkdirp.sync(this.location)
}

FanboyService.prototype.route = function (req, res) {
  return this.router.match(req.url)
}

FanboyService.prototype.handle = function (req, res) {
  res.setHeader('cache-control', 'public, max-age=' + this.ttl)
  res.setHeader('content-type', 'application/json')
  if (req.method === 'HEAD') {
    return res.end()
  }
  var me = this
  res.on('close', function () {
    me.log.warn({err: new Error('connection terminated'), req: req})
  })
  res.on('finish', res.removeAllListeners)

  req.resume()
  req.log = this.log
  req.fanboy = this.fanboy
  req.handle = this.handle

  var rt = this.route(req, res)
  rt.fn(req, res, rt.params)
}

FanboyService.prototype.start = function (cb) {
  this.log.info('starting on port %s', this.port)
  this.log.info('using database at %s', this.location)

  this.db = this.db || levelup(
    this.location, { cacheSize: this.cacheSize })
  if (!this.db.isClosed) this.db.open()
  this.fanboy = this.fanboy || fanboy({ db:this.db, media:'podcast' })
  var me = this
  this.server = this.server || http.createServer(function (req, res) {
    me.handle(req, res)
  })
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
  exports.FanboyService = FanboyService
  exports.defaults = defaults
  exports.nop = nop
  exports.parse = parse
}
