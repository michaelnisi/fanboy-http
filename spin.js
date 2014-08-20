
// spin - take it for a spin

var http = require('http')

var terms = [
  'npr'
, 'nyc'
, 'etc'
, 'äöü'
, 'hollywood'
, 'los+angeles'
, 'surfing'
]
function rnd (arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
var verbs = ['/search?q=', '/suggest?q=']
var paths = terms.map(function (term) {
  return rnd(verbs) + rnd(terms)
})

function path () {
  return paths[Math.floor(Math.random() * paths.length)]
}

function opts () {
  return {
    port: 8383
  , path: path()
  }
}

for (var i = 0; i < 300; i++) {
  var req = http.request(opts(), function (res) {
    res.resume()
  })
  req.end()
}
