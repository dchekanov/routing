const fs = require('fs');
const path = require('path');
const errCode = require('err-code');
const httpErrors = require('http-errors');
const ms = require('ms');
const {RateLimiterMemory, RateLimiterRes} = require('rate-limiter-flexible');

/**
 * Place "=..." dirents last in the array.
 * @param {Dirent} a
 * @param {Dirent} b
 * @return {number}
 */
function paramLast(a, b) {
  if (a.name.startsWith('=') && b.name.startsWith('=')) {
    return 0;
  }

  if (a.name.startsWith('=')) {
    return 1;
  }

  if (b.name.startsWith('=')) {
    return -1;
  }

  return 0;
}

/**
 * Create middleware for the rate-limiting feature.
 * @param {string|Object} rateLimit
 * @throws {Error} RATE_LIMIT_INVALID
 * @returns {Function}
 */
function createRateLimitMiddleware(rateLimit) {
  if (typeof rateLimit !== 'string' && typeof rateLimit !== 'object') {
    throw errCode(new Error('The "rateLimit" parameter is not a string or an object'), 'RATE_LIMIT_INVALID');
  }

  if (typeof rateLimit === 'string') {
    rateLimit = {points: 1, duration: ms(rateLimit) / 1000};
  }

  const rateLimiter = new RateLimiterMemory(rateLimit);

  return (req, res, next) => {
    return rateLimiter.consume(req.ip)
      .then(() => next())
      .catch(err => {
        if (err instanceof RateLimiterRes) {
          next(httpErrors(429, err));
        } else {
          next(err);
        }
      });
  };
}

/**
 * Create middleware for the authorization feature.
 * @param {Function} authorize
 * @throws {Error} AUTHORIZE_INVALID
 * @returns {Function}
 */
function createAuthorizeMiddleware(authorize) {
  if (typeof authorize !== 'function') {
    throw errCode(new Error('The "authorize" parameter is not a function'), 'AUTHORIZE_INVALID');
  }

  return (req, res, next) => {
    return Promise.resolve(authorize(req, res))
      .then(isAuthorized => {
        if (isAuthorized !== true) {
          next(httpErrors(403));
        } else {
          next();
        }
      })
      .catch(next);
  };
}

/**
 * Create middleware for the request handler.
 * @param {Function} handle
 * @throws {Error} HANDLE_INVALID
 * @returns {Function}
 */
function createHandleMiddleware(handle) {
  if (typeof handle !== 'function') {
    throw errCode(new Error('The "handle" parameter is not a function'), 'HANDLE_INVALID');
  }

  return (req, res, next) => Promise.resolve(handle(req, res)).catch(next);
}

/**
 * Create a sequence of middleware function to process a request.
 * @param {string|Object} [rateLimit]
 * @param {Function} [authorize]
 * @param {Function|Function[]} [middleware]
 * @param {Function} handle
 * @returns {Function[]}
 */
function assemblePipeline({rateLimit, authorize, middleware, handle} = {}) {
  const pipeline = [];

  if (typeof rateLimit !== 'undefined') {
    pipeline.push(createRateLimitMiddleware(rateLimit));
  }

  if (typeof authorize !== 'undefined') {
    pipeline.push(createAuthorizeMiddleware(authorize));
  }

  pipeline.push(middleware);
  pipeline.push(createHandleMiddleware(handle));

  return pipeline.flat().filter(element => typeof element === 'function');
}

/**
 * Find route handlers in the directory.
 * @param {string} dir
 * @param {string} [route]
 * @returns {[]}
 */
function discover({dir, route = '/'} = {}) {
  if (typeof dir !== 'string') {
    throw errCode(new Error('The "dir" parameter is not a string'), 'DIR_INVALID');
  }

  if (dir.trim() === '') {
    throw errCode(new Error('The "dir" parameter can not be an empty string'), 'DIR_INVALID');
  }

  if (typeof route !== 'string') {
    throw errCode(new Error('The "route" parameter is not a string'), 'ROOT_INVALID');
  }

  if (route.trim() === '') {
    throw errCode(new Error('The "route" parameter can not be an empty string'), 'ROOT_INVALID');
  }

  const handlers = [];
  const dirents = fs.readdirSync(dir, {withFileTypes: true});

  dirents
    .filter(dirent => dirent.isFile())
    .forEach(dirent => {
      const direntPath = path.resolve(path.join(dir, dirent.name));
      const source = require(direntPath);
      const pipeline = assemblePipeline(source);
      const method = path.basename(dirent.name, '.js');

      handlers.push({route, method, source, pipeline});
    });

  dirents
    .filter(dirent => dirent.isDirectory())
    // routes with parameters must be mounted the last for other routes to be reachable
    .sort(paramLast)
    .forEach(dirent => {
      let direntBranch;

      if (dirent.name === '=') {
        // names equal to "=" are used to represent "*" wildcard
        direntBranch = '*';
      } else if (dirent.name.startsWith('=')) {
        // names starting with the "=" character are used to represent parameters
        direntBranch = dirent.name.replace('=', ':').replace(/-(\w)/g, (match, p1) => p1.toUpperCase());
      } else {
        direntBranch = dirent.name;
      }

      const direntDir = path.resolve(path.join(dir, dirent.name));
      const direntRoute = path.posix.join(route, direntBranch);

      discover({dir: direntDir, route: direntRoute}).forEach(handler => handlers.push(handler));
    });

  return handlers;
}

/**
 * Mount route handlers to the app.
 * @param {string} [dir]
 * @param {Array} [handlers]
 * @param {Object} app
 * @param {string} [route]
 * @throws {Error} DIR_INVALID
 * @throws {Error} ROOT_INVALID
 */
function mount({dir, handlers, app, route = '/'} = {}) {
  if (typeof dir !== 'string' && !Array.isArray(handlers)) {
    throw errCode(new Error('Missing "dir" (string) or "handlers" (array) parameter'), 'SOURCE_INVALID');
  }

  if (!Array.isArray(handlers)) {
    handlers = discover({dir, route});
  }

  handlers.forEach(({route, method, pipeline}) => {
    app[method](route, pipeline);
  });

  return handlers;
}

module.exports = {discover, mount};
