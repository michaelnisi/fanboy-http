'use strict'

// conf - configure fanboy-http

const bunyan = require('bunyan')
const http = require('http')

function level (l) {
  return [10, 20, 30, 40, 50, 60].includes(l) ? l : null
}

function log () {
  const l = level(parseInt(process.env.FANBOY_LOG_LEVEL, 10))
  if (!l) return null
  return bunyan.createLogger({
    name: 'fanboy',
    level: l,
    serializers: bunyan.stdSerializers
  })
}

exports.cacheSize = process.env.LEVEL_DB_CACHE_SIZE
exports.location = process.env.LEVEL_DB_LOCATION
exports.log = log()
exports.maxSockets = http.globalAgent.maxSockets = 4096
exports.port = process.env.PORT

if (module === require.main) {
  console.log(exports)
}
