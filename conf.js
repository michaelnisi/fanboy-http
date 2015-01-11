
// config - configure fanboy-http

var bunyan = require('bunyan')

function log() {
  return bunyan.createLogger({
    name: 'fanboy'
  , level: process.env.NODE_DEBUG > 0 ? 'debug' : 'error'
  , serializers: bunyan.stdSerializers
  })
}

exports.log = log()
exports.location = process.env.LEVEL_DB_LOCATION
exports.cacheSize = process.env.LEVEL_DB_CACHE_SIZE
exports.port = process.env.PORT

if (module === require.main) {
  console.log(exports)
  process.exit(0)
}
