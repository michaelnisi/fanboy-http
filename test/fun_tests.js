
var test = require('tap').test
  , fanboy_http = require('../')
  ;

test('constructor', function (t) {
  var f = fanboy_http
  t.plan(2)
  t.ok(f() instanceof fanboy_http.FanboyService)
  t.is(f().port, 8383)
  t.end()
})

test('match', function (t) {
  var f = fanboy_http.FanboyService.prototype.match.bind(fanboy_http())
  t.is(typeof f, 'function')
  function reduce (route) { // don't have actual route
    return {
      query: route.params.query
    }
  }
  ['/search', '/suggest'].forEach(function (verb) {
    var wanted = [
      undefined
    , undefined
    , undefined
    , undefined
    , undefined
    , { query: '?q=abc' }
    , { query: '?q=abc+def' }
    , { query: '?q=abc+def&max=10' }
    ]
    ;[
      f(undefined)
    , f(null)
    , f('')
    , f(verb)
    , f(verb + '?q=')
    , reduce(f(verb + '?q=abc'))
    , reduce(f(verb + '?q=abc+def'))
    , reduce(f(verb + '?q=abc+def&max=10'))
    ].forEach(function (found, i) {
      t.deepEqual(found, wanted[i])
    })
  })
  t.end()
})

test('defaults', function (t) {
  var f = fanboy_http.defaults
    , noop = fanboy_http.noop
    , log = function () {}
    ;
  var wanted = [
    { location: '/tmp/fanboy-http'
    , port: 8383
    , log: { info:noop, warn:noop, debug:noop, error:noop }
    }
  , { location: '/tmp/fanboy-http'
    , port: 80
    , log: { info:noop, warn:noop, debug:noop, error:noop }
    }
  , { location: '/tmp/fanboy-http'
    , port: 80
    , log: log
    }
  ]
  ;[
    f(null)
  , f({ port:80 })
  , f({ port:80, log:log })
  ].forEach(function (found, i) {
    t.deepEqual(found, wanted[i])
  })
  t.end()
})

test('parse', function (t) {
  var f = fanboy_http.parse
  t.is(typeof(f), 'function')
  var wanted = [
    undefined
  , undefined
  , undefined
  , undefined
  , 'abc'
  , 'abc def'
  , 'überlänge'
  , 'abc'
  , 'abc'
  , 'abc'
  ]
  ;[
    f(null)
  , f(undefined)
  , f('')
  , f('abc')
  , f('?q=abc')
  , f('?q=abc+def')
  , f('?q=überlänge')
  , f('?q= abc')
  , f('?q=abc ')
  , f('?q= abc ')
  ].forEach(function (found, i) {
    t.deepEqual(found, wanted[i])
  })
  t.end()
})
