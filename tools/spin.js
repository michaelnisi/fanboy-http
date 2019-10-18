// spin - kicks the tires of this server

const fs = require('fs')
const http = require('http')

var guids = [763718821]

/**
 * Random search terms for searching.
 */
const terms = fs.readFileSync(
  '/usr/share/dict/words', { encoding: 'utf8' }
).split('\n')

/**
 * Returns a random item in `items`.
 */
function rnd (items) {
  return items[Math.floor(Math.random() * items.length)]
}

const verbs = ['/suggest?q=', '/search?q=', '/lookup/', '/hello']

function path () {
  var verb = rnd(verbs)
  var term = rnd(terms)

  if (verb.match(/\/sug/)) {
    term = term.substr(0, Math.ceil(Math.random() * term.length))
  } else if (verb.match(/\/look/)) {
    term = rnd(guids)
  } else if (verb.match(/\/search/)) {
    if (Math.random() > 0.8) term = 'apple'
  } else if (verb.match(/\/hello/)) {
    return verb
  }

  return verb + term
}

var current
function opts (t) {
  if (!!current && Math.random() > 0.99) return current
  current = {
    https: {
      host: '10.0.1.24',
      path: path(),
      rejectUnauthorized: false,
      strictSSL: false,
      headers: { Secret: 'beep' }
    },
    http: {
      host: 'localhost',
      port: 8383,
      path: path()
    }
  }[t]

  return current
}

function request (max) {
  function go () {
    var req = http.request(opts('http'), function (res) {
      function resError (er) {
        console.error(er)
      }

      function resEnd () {
        try {
          var json = JSON.parse(buf)

          if (typeof json.reduce !== 'function') {
            return console.log('not an Array: %o', json)
          } else {
            json.forEach(item => {
              const guid = item.guid

              if (guid && !guids.indexOf(guid)) {
                guids.push(guid)
              }
            })
          }

          console.log('< %i', json.length)
        } catch (error) {
          console.error('not JSON: %o', json)
          throw error
        }

        res.removeListener('error', resError)
        res.removeListener('end', resEnd)
      }
      res.on('error', resError)
      res.on('end', resEnd)

      var buf = ''

      res.on('data', function (chunk) {
        buf += chunk
      })
    })

    function reqError (er) {
      req.abort()
      req.removeListener('error', reqError)
      console.error('%s failed: %s', req.path, er.message)
    }

    req.on('error', reqError)
    req.end()
    if (Math.random() > 0.75) req.abort()
  }

  for (var i = 0; i < max; i++) go()
}

setInterval(function () {
  request(Math.ceil(Math.random() * 10))
}, 3000)
