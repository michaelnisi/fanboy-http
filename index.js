
// fanboy-http - HTTP API for fanboy

module.exports.start = start

var assert = require("assert")
  , fanboy = require("fanboy")
  , http = require("http")
  , levelup = require("levelup")
  , routes = require("routes")()
  , util = require("util")
  ;

function defaults (opts) {
  return opts
}

function FanboyService (opts) {
  if (!this.instanceof FanboyService) return new FanboyService(opts)
  util._extend(this, defaults(opts))
}

FanboyService.prototype.search = function () {

}

FanboyService.prototype.suggest = function () {

}

var _opts
function opts () {
  if (!_opts) {
    _opts = {
      media: "podcast"
    , db: db()
    , log: log()
    }
  }
  return _opts
}

function decorate (req, db) {
  req.opts = opts()
  return req
}

function route (req, res) {
  var rt = routes.match(req.url)
    , fn = rt ? rt.fn : null
    ;
  if (fn) {
    fn(req, res)
  } else {
    res.writeHead(404)
    res.end("not found\n")
  }
}

function start (opts) {
  levelup(opts.db, null, function (er, db) {
    assert(!er)
    routes.addRoute("/feeds", feeds)
    routes.addRoute("/entries", entries)
    routes.addRoute("/update", update)
    http.createServer(function (req, res) {
      route(decorate(req, db), res)
    }).listen(opts.port)
  })
}

function feeds (req, res) {
  req
    .pipe(manger.queries())
    .pipe(manger.feeds(req.opts))
    .pipe(res)
}

function entries (req, res) {
  req
    .pipe(manger.queries())
    .pipe(manger.entries(req.opts))
    .pipe(res)
}

function update (req, res) {
  manger.update(req.opts)
    .pipe(res)
}

