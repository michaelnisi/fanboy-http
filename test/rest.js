const common = require('./lib/common')
const fs = require('fs')
const http = require('http')
const nock = require('nock')
const path = require('path')
const rimraf = require('rimraf')
const test = require('tap').test

function parse (file) {
  const p = path.resolve(__dirname, 'data', file)
  const input = fs.readFileSync(p)
  const json = JSON.parse(input)
  return json instanceof Array ? json : [json]
}

test('basic REST API', { bail: true }, (t) => {
  const p = path.resolve(__dirname, 'data')
  const files = fs.readdirSync(p)
  const scopes = []
  const tests = files.reduce((acc, file) => {
    if (path.extname(file) !== '.json') {
      return acc
    }
    const children = parse(file)

    function go (children, cb) {
      const child = children.shift()
      if (!child) {
        cb()
        return
      }
      const remote = child.remote
      if (remote) {
        const remotes = remote instanceof Array ? remote : [remote]
        remotes.forEach((r) => {
          const scope = nock(r.host)
          const m = r.method || 'GET'
          const sc = r.statusCode || 200
          scope.intercept(r.path, m).reply(sc, () => {
            t.pass('should be hit')
            if (!r.file) return null
            const p = path.resolve(__dirname, 'data', r.file)
            return fs.createReadStream(p)
          }, r.headers)
          scopes.push(scope)
        })
      }
      const opts = child.request
      const response = child.response
      const sc = response.statusCode
      const req = http.request(opts, (res) => {
        t.is(res.statusCode, sc || 200, file)
        let buf = ''
        res.on('data', (chunk) => {
          buf += chunk
        })
        res.on('end', () => {
          const found = JSON.parse(buf)
          const wanted = response.payload || response
          if (found instanceof Array && wanted instanceof Array) {
            t.is(found.length, wanted.length, found)
            wanted.forEach(function (it, i) {
              t.same(found[i], it)
            })
          } else {
            t.match(found, wanted)
          }
          if (sc === 202) {
            setTimeout(() => {
              go(children, cb)
            }, 100)
          } else {
            go(children, cb)
          }
        })
      })
      const payload = opts.payload
      if (payload) {
        req.end(JSON.stringify(payload))
      } else {
        req.end()
      }
    }
    const closure = function (cb) {
      t.comment(file)
      const server = common.freshServer()
      server.start(function (er) {
        if (er) throw er
        go(children, () => {
          server.stop(function (er) {
            if (er) throw er
            rimraf(server.location, function (er) {
              if (er) throw er
              cb()
            })
          })
        })
      })
    }
    acc.push(closure)
    return acc
  }, [])
  function run (tests) {
    const f = tests.shift()
    if (f) {
      f(() => {
        run(tests)
      })
    } else {
      scopes.forEach(function (scope) {
        t.ok(scope.isDone())
      })
      t.end()
    }
  }
  run(tests)
})
