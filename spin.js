
// spin - take it for a spin

var fs = require('fs')
var https = require('https')
var http = require('http')

var terms = fs.readFileSync(
  '/usr/share/dict/words', { encoding: 'utf8' }).split('\n')

function rnd (arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
var verbs = ['/suggest?q=', '/search?q=']
var paths = terms.map(function (term) {
  return rnd(verbs) + rnd(terms)
})

function path () {
  return paths[Math.floor(Math.random() * paths.length)]
}

function opts (t) {
  return {
    'https': {
      host: '10.0.1.24'
    , path: path()
    , rejectUnauthorized: false
    , strictSSL: false
    , headers: { 'Secret': 'beep' }
    }
  , 'http': {
      host: 'localhost'
    , port: 8383
    , path: path()
    }
  }[t]
}

function request (max) {
  function go () {
    var req = http.request(opts('http'), function (res) {
      function resError (er) {
        console.error(er)
      }
      function resEnd () {
        res.removeListener('error', resError)
        res.removeListener('end', resEnd)
      }
      res.on('error', resError)
      res.on('end', resEnd)
      res.resume()
      process.stdout.write('.')
    })
    function reqError (er) {
      req.abort() // TODO: Is this necessary?
      req.removeListener('error', reqError)
      console.error('%s failed', req.path)
    }
    req.on('error', reqError)
    req.end()
  }
  for (var i = 0; i < max; i++) go()
}

setInterval(function () {
  request(10)
}, 1000)
