'use strict'

const { URL } = require('url')

module.exports = element

function Result (
  author,
  feed,
  guid,
  img100,
  img30,
  img60,
  img600,
  title,
  updated) {
  this.author = author
  this.feed = feed
  this.guid = guid
  this.img100 = img100
  this.img30 = img30
  this.img60 = img60
  this.img600 = img600
  this.title = title
  this.updated = updated
}

function element (result) {
  if (result && typeof result.collectionId !== 'number') {
    return
  }

  let feedUrl
  try {
    const uri = new URL(result.feedUrl)
    if (!uri.host) {
      return
    }
    feedUrl = uri.toString()
  } catch (error) {
    return
  }

  return new Result(
    result.artistName,
    feedUrl,
    result.collectionId,
    result.artworkUrl100,
    result.artworkUrl30,
    result.artworkUrl60,
    result.artworkUrl600,
    result.collectionName,
    new Date(result.releaseDate).getTime()
  )
}
