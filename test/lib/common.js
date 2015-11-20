// common - common test stuff

exports.freshServer = freshServer

var server = require('../../')

function freshName () {
  var name = '/tmp/fanboy-http-'
  return name + Math.floor(Math.random() * (1 << 24))
}

function freshServer () {
  var opts = {
    location: freshName(),
    port: 1337
  }
  return server(opts)
}
