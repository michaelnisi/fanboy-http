'use strict'

module.exports = RegExp([
  'fanboy: falling back on cache',
  'fanboy: falling back on cache: ENOTFOUND',
  'fanboy: guid',
  'fanboy: unexpected response 400'
].join('|'), 'i')
