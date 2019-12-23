# @keleran/routing

Utilities that help with request routing in Node.js projects.  
Works with Node.js 10, 12.

![GitHub Workflow Status](https://img.shields.io/github/workflow/status/dchekanov/routing/Test)
![Sonar Coverage](https://img.shields.io/sonar/coverage/dchekanov_routing?server=https%3A%2F%2Fsonarcloud.io&sonarVersion=8.0)
![Libraries.io dependency status for latest release, scoped npm package](https://img.shields.io/librariesio/release/npm/@keleran/routing)

## Installation

```bash
$ npm i @keleran/routing
```

```javascript
const {mount} = require('@keleran/routing');
```

## mount utility

Reads a file tree and mounts request handlers to the specified Express app.

Request handler is a file named as "HTTP method.js" (get.js, post.js, etc.) that exports:

1. "rateLimit" (optional) - a string or an object that defines rate limiting options 
for the rate-limiter-flexible library. The string is parsed with the ms library, 
"1s" means "allow 1 request per second from this IP". 
The object is passed to rate-limiter-flexible as is. HTTP 429 will be thrown upon exceeding the limit.
2. "authorize" (optional) - an authorization function that MUST return true for request to be processed.
Otherwise it throws HTTP 403 using the http-errors library. Supplied with the "req" and "res" arguments. Can be async.
3. "middleware" (optional) - a function or an array of functions that are regular middleware 
with the "req", "res", and "next" arguments ~~supplied~~.
4. "handle" - the main function that handles the request. Supplied with the "req" and "res" arguments. Can be async.

The order of execution matches the order listed above.

### Example

The following tree:

```
routes
├── =
│   └── get.js
└── route
    ├── get.js
    └── =param-name
        └── get.js
``` 

With the call:

```javascript
mount({dir: 'routes', app, route: '/test'});
```
 
Will be mounted like this (notice the order and param/wildcard substitution):
 
```javascript
app.get('/test/route', /* handler defined in routes/route/get.js */);
app.get('/test/route/:paramName', /* handler defined in routes/route/=param-name/get.js */);
app.get('/test/*', /* handler defined in routes/=/get.js */);
```
