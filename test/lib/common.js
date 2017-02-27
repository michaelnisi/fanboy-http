'use strict'

// common - common test stuff

exports.freshServer = freshServer

const os = require('os')
const path = require('path')
const server = require('../../')

function freshName () {
  const name = 'fanboy-http-' + Math.floor(Math.random() * (1 << 24))
  const tmp = os.tmpdir()
  return path.resolve(tmp, name)
}

function freshServer () {
  const opts = {
    location: freshName(),
    port: 1337
  }
  return server(opts)
}
