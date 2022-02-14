# @keleran/routing

Utilities to simplify request routing in Node.js projects.  
Use ESM, require Node.js 14+.

![GitHub Workflow Status](https://img.shields.io/github/workflow/status/dchekanov/routing/Test)

## Installation

```bash
$ npm i @keleran/routing
```

```javascript
import {discover, mount} from '@keleran/routing';
```

## `discover`

Returns a flat list of route handlers found in the specified directory. 
If you don't need to work with the list before mounting, use `mount` directly - it returns the same data.

```javascript
// [{route: String, method: String, source: Object, pipeline: Array}, ...]
const handlers = await discover({dir: 'routes'});
```

## `mount`

Reads a file tree and mounts request handlers to the specified Express app.

Request handler is a file named as "HTTP_METHOD.js" (get.js, post.js, etc.) that exports an object
with the following properties:

1. "rateLimit" (optional) - a string or an object that defines rate limiting options 
for the [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) library.  
The string is parsed with the [ms](https://github.com/vercel/ms) library, 
"1s" means "allow 1 request per second from this IP".  
The object is passed to rate-limiter-flexible as is. HTTP 429 will be thrown upon exceeding the limit.
2. "authorize" (optional) - an authorization function that MUST return true for request to be processed.
Otherwise it throws HTTP 403 using the [http-errors](https://github.com/jshttp/http-errors) library. 
Supplied with the "req" and "res" arguments. Can be async.
3. "middleware" (optional) - a function or an array of functions that are regular middleware 
with the "req", "res", and "next" arguments supplied.
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
await mount({dir: 'routes', app, route: '/test'});
```
 
Will be mounted like this (notice the order and param/wildcard substitution):
 
```javascript
app.get('/test/route', /* handler defined in routes/route/get.js */);
app.get('/test/route/:paramName', /* handler defined in routes/route/=param-name/get.js */);
app.get('/test/*', /* handler defined in routes/=/get.js */);
```
