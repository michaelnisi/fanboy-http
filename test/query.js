const test = require('tap').test
const trim = require('../').trim

test('trim', (t) => {
  t.is(trim(''), null)
  t.is(trim(' '), null)
  t.is(trim(' abc '), 'abc')
  t.is(trim(' abc  def'), 'abc def')
  t.end()
})

