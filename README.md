# fanboy-http - search iTunes for podcast feeds

**fanboy-http** is an HTTP/1.1 API for cached searching and looking up podcast feeds in the iTunes store. It proxies podcast searching for [Podest](https://itunes.apple.com/us/app/podest/id794983364?mt=8).

## Types

### feed()

The search and lookup results returned by the iTunes store search API get reduced to this custom tailored feed object.

- `author` `String()` The author of the feed.
- `feed` `String()` The URL of the feed.
- `guid` `Number()` The iTunes store guid of the item.
- `img100` `String()` The URL of a scaled image representing the feed.
- `img30` `String()` The URL of a scaled image representing the feed.
- `img60` `String()` The URL of a scaled image representing the feed.
- `img600` `String()` The URL of a scaled image representing the feed.
- `title` `String()` The title of feed.
- `updated` `Number()` The date when the feed was last updated by iTunes.
- `ts` `Number()` Timestamp of when this item was cached.

## API

### Responses

Here, a representative response header of this API:

```
HTTP/1.1 200 OK
Cache-Control: max-age=86400
Content-Type: application/json; charset=utf-8
Fanboy-Version: 4.0.0
Content-Encoding: gzip
Content-Length: 5332
Accept-Ranges: bytes
Date: Thu, 21 Feb 2019 10:35:08 GMT
Connection: keep-alive
```

Where 'Latency' is only provided, if the log level is below `WARN` (40)—debugging mode.

### Cached queries against the store API

#### Searching for feed feeds

```
GET /search
```

### Parameters

- `q` `String()` The search query.

The response is an `Array()` matching `feed()` objects or an empty `Array()` if no matches were found.

#### Looking up guids

```
GET /lookup/:query
```

- `:query` An url-encoded list of GUIDs separated by commas.

Lookup has the same response as `GET /search`.

### Additional endpoints

#### Getting search term suggestions

```
GET /suggest
```

### Parameters

- `q` `String()` Here the query is an alphanumeric search term fragment.
- `max` `Number()` The maximum number of suggestions to get.

This query responds with an `Array()` of search terms—of type `String()`—already in the cache and matching the query.

#### The version of the API

`GET /`

Response

- `name` The name of the server
- `version` The version of the API (the package version)

## Installation

After installing our dependencies with:

```
$ npm i
```

We can run the server locally on port 8383 with:

```
$ npm start
```


## License

[MIT License](https://github.com/michaelnisi/fanboy-http/blob/master/LICENSE)
