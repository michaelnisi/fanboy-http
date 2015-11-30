var common = require('./lib/common')
var fs = require('fs')
var http = require('http')
var lino = require('lino')
var path = require('path')
var rimraf = require('rimraf')
var test = require('tap').test

// TODO: Use nock in these tests

test('abort request', { skip: false }, function (t) {
  var server = common.freshServer()
  function done () {
    server.stop(function (er) {
      if (er) throw er
      rimraf(server.location, function (er) {
        if (er) throw er
        t.end()
      })
    })
  }
  server.start(function (er) {
    if (er) throw er
    var opts = {
      host: 'localhost',
      port: 1337,
      path: '/search/apple'
    }
    var req = http.request(opts, function (res) {
      res.on('end', function () {
        done()
      })
      res.resume()
    })
    setTimeout(function () {
      req.abort()
    }, Math.random() * 100)
    req.on('error', function (er) {
      if (er.code === 'ECONNRESET') {
        done()
      } else {
        throw er
      }
    })
    if (Math.random() > 0.5) req.end()
  })
})

test('destroy socket', { skip: false }, function (t) {
  var server = common.freshServer()
  function done () {
    server.stop(function (er) {
      if (er) throw er
      rimraf(server.location, function (er) {
        if (er) throw er
        t.end()
      })
    })
  }
  server.start(function (er) {
    if (er) throw er
    var opts = {
      host: 'localhost',
      port: 1337,
      path: '/search/apple'
    }
    var req = http.request(opts, function (res) {
      res.on('end', function () {
        done()
      })
      res.resume()
    })
    req.on('socket', function (socket) {
      socket.destroy()
    })
    req.on('error', function (er) {
      if (er.code === 'ECONNRESET') {
        done()
      } else {
        throw er
      }
    })
    if (Math.random() > 0.5) req.end()
  })
})

test('aborted lookup of multiple guids', function (t) {
  var p = path.resolve(__dirname, 'data', 'GUIDS')
  var file = fs.createReadStream(p)
  var lines = lino({ encoding: 'utf8' })
  file.pipe(lines)

  var guids = []
  lines.on('data', function (str) {
    guids.push(str.trim())
  })
  lines.on('end', function () {
    t.ok(guids.length)
    go()
  })

  function go () {
    var server = common.freshServer()
    function done () {
      server.stop(function (er) {
        if (er) throw er
        rimraf(server.location, function (er) {
          if (er) throw er
          t.end()
        })
      })
    }
    server.start(function (er) {
      if (er) throw er
      var opts = {
        host: 'localhost',
        port: 1337,
        path: '/lookup/' + guids.join(',')
      }
      var req = http.request(opts, function (res) {
        res.resume()
      })
      setTimeout(function () {
        req.abort()
      }, 100)
      req.on('error', function (er) {
        if (er.code !== 'ECONNRESET') throw er
        setTimeout(function () {
          done()
        }, 1000)
      })
      req.end()
    })
  }
})
