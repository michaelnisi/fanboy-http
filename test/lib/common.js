// common - common test stuff

exports.freshServer = freshServer

var os = require('os')
var path = require('path')
var server = require('../../')

function freshName () {
  var name = 'fanboy-http-' + Math.floor(Math.random() * (1 << 24))
  var tmp = os.tmpdir()
  return path.resolve(tmp, name)
}

function freshServer () {
  var opts = {
    location: freshName(),
    port: 1337
  }
  return server(opts)
}
