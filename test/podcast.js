'use strict'

const test = require('tap').test
const makeResult = require('../lib/podcast')

test('not truthy', (t) => {
  const things = [
    makeResult(),
    makeResult({ collectionId: 'abc' }),
    makeResult({ collectionId: 123 }),
    makeResult({ collectionId: 123, feedUrl: 'abc' })
  ]

  things.forEach((thing) => {
    t.notOk(thing)
  })

  t.end()
})

test('truthy', (t) => {
  const things = [
    makeResult({ collectionId: 123, feedUrl: 'http://abc.de' })
  ]

  things.forEach((thing) => {
    t.ok(thing)
  })

  t.end()
})

test('trailing slash', (t) => {
  t.is(
    makeResult({ collectionId: 123, feedUrl: 'http://abc.de' }).feed,
    'http://abc.de/',
    'should append trailing slash to pathless URL'
  )

  t.is(
    makeResult({ collectionId: 123, feedUrl: 'http://abc.de/hello' }).feed,
    'http://abc.de/hello'
  )

  t.end()
})
