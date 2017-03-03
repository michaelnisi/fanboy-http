var test = require('tap').test
var FanboyHTTP = require('../')

test('constructor', function (t) {
  var f = FanboyHTTP
  t.plan(2)
  t.ok(f() instanceof FanboyHTTP.FanboyService)
  t.is(f().port, 8383)
  t.end()
})

test('defaults', function (t) {
  var f = FanboyHTTP.defaults
  var nop = FanboyHTTP.nop
  var log = function () {}

  var wanted = [
    { location: '/tmp/fanboy-http',
      port: 8383,
      log: { info: nop, warn: nop, debug: nop, error: nop },
      ttl: 86400000,
      cacheSize: 16777216
    },
    { location: '/tmp/fanboy-http',
      port: 80,
      log: { info: nop, warn: nop, debug: nop, error: nop },
      ttl: 86400000,
      cacheSize: 16777216
    },
    { location: '/tmp/fanboy-http',
      port: 80,
      log: log,
      ttl: 86400000,
      cacheSize: 16777216
    }
  ]
  ;[
    f(null),
    f({ port: 80 }),
    f({ port: 80, log: log })
  ].forEach(function (found, i) {
    t.deepEqual(found, wanted[i])
  })
  t.end()
})
