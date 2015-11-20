// spin - take it for a spin

var fs = require('fs')
var http = require('http')

var guids = [763718821]

var terms = fs.readFileSync(
  '/usr/share/dict/words', { encoding: 'utf8' }).split('\n')

function rnd (arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
var verbs = ['/suggest/', '/search/', '/lookup/']

function path () {
  var verb = rnd(verbs)
  var term = rnd(terms)
  if (verb.match(/\/sug/)) {
    term = term.substr(0, Math.ceil(Math.random() * term.length))
  } else if (verb.match(/\/look/)) {
    term = rnd(guids)
  } else if (verb.match(/\/search/)) {
    if (Math.random() > 0.8) term = 'apple'
  }
  return verb + term
}

var current
function opts (t) {
  if (!!current && Math.random() > 0.8) return current
  current = {
    'https': {
      host: '10.0.1.24',
      path: path(),
      rejectUnauthorized: false,
      strictSSL: false,
      headers: { 'Secret': 'beep' }
    },
    'http': {
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
        var json = JSON.parse(buf)
        if (json.length > 0) {
          json.reduce(function (acc, el) {
            var guid = el.guid
            if (guid) {
              if (acc.indexOf(guid) === -1) {
                acc.push(guid)
              }
            }
            return acc
          }, guids)
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
      process.stdout.write('.')
    })
    function reqError (er) {
      req.abort() // TODO: Is this necessary?
      req.removeListener('error', reqError)
      console.error('%s failed: %s', req.path, er.message)
    }
    req.on('error', reqError)
    req.end()
  }
  for (var i = 0; i < max; i++) go()
}

setInterval(function () {
  request(Math.ceil(Math.random() * 10))
}, 1000)
