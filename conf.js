// config - configure fanboy-http

var bunyan = require('bunyan')
var http = require('http')

function log () {
  var level = 20
  if (parseInt(process.env.NODE_DEBUG, 10) !== 1) {
    level = parseInt(process.env.NODE_LOG_LEVEL, 10)
  }
  var levels = [10, 20, 30, 40, 50, 60]
  if (!levels.some(function (l) { return l === level })) level = 40
  return bunyan.createLogger({
    name: 'fanboy',
    level: level,
    serializers: bunyan.stdSerializers
  })
}

exports.log = log()
exports.location = process.env.LEVEL_DB_LOCATION
exports.cacheSize = process.env.LEVEL_DB_CACHE_SIZE

// TODO: Proof that using HTTPS is faster
// CDNs tend to redirect HTTP to HTTPS inserting a slight delay, which is why we
// should prefer HTTPS.
exports.port = 443

exports.maxSockets = http.globalAgent.maxSockets = 4096

if (module === require.main) {
  console.log(exports)
  process.exit(0)
}
