'use-strict'

const common = require('./lib/common')
const fs = require('fs')
const http = require('http')
const lino = require('lino')
const path = require('path')
const rimraf = require('rimraf')
const test = require('tap').test

// TODO: Use nock in these tests

test('abort request', { skip: true }, (t) => {
  const server = common.freshServer()
  function done () {
    server.stop((er) => {
      if (er) throw er
      rimraf(server.location, (er) => {
        if (er) throw er
        t.end()
      })
    })
  }
  server.start((er) => {
    if (er) throw er
    const opts = {
      host: 'localhost',
      port: 1337,
      path: '/search/apple'
    }
    const req = http.request(opts, (res) => {
      res.on('end', () => {
        done()
      })
      res.resume()
    })
    setTimeout(() => {
      req.abort()
    }, Math.random() * 100)
    req.on('error', (er) => {
      if (er.code === 'ECONNRESET') {
        done()
      } else {
        throw er
      }
    })
    if (Math.random() > 0.5) req.end()
  })
})

test('destroy socket', { skip: false }, (t) => {
  const server = common.freshServer()
  function done () {
    server.stop((er) => {
      if (er) throw er
      rimraf(server.location, (er) => {
        if (er) throw er
        t.end()
      })
    })
  }
  server.start((er) => {
    if (er) throw er
    const opts = {
      host: 'localhost',
      port: 1337,
      path: '/search/apple'
    }
    const req = http.request(opts, (res) => {
      res.on('end', () => {
        done()
      })
      res.resume()
    })
    req.on('socket', (socket) => {
      socket.destroy()
    })
    req.on('error', (er) => {
      if (er.code === 'ECONNRESET') {
        done()
      } else {
        throw er
      }
    })
    if (Math.random() > 0.5) req.end()
  })
})

test('aborted lookup of multiple guids', { skip: true }, (t) => {
  const p = path.resolve(__dirname, 'data', 'GUIDS')
  const file = fs.createReadStream(p)
  const lines = lino({ encoding: 'utf8' })
  file.pipe(lines)

  const guids = []
  lines.on('data', (str) => {
    guids.push(str.trim())
  })
  lines.on('end', () => {
    t.ok(guids.length)
    go()
  })

  function go () {
    const server = common.freshServer()
    function done () {
      server.stop((er) => {
        if (er) throw er
        rimraf(server.location, (er) => {
          if (er) throw er
          t.end()
        })
      })
    }
    server.start((er) => {
      if (er) throw er
      const opts = {
        host: 'localhost',
        port: 1337,
        path: '/lookup/' + guids.join(',')
      }
      const req = http.request(opts, (res) => {
        res.resume()
      })
      setTimeout(() => {
        req.abort()
      }, 100)
      req.on('error', (er) => {
        if (er.code !== 'ECONNRESET') throw er
        setTimeout(() => {
          done()
        }, 1000)
      })
      req.end()
    })
  }
})
