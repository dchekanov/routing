const fs = require('fs');
const path = require('path');
const {RateLimiterMemory} = require('rate-limiter-flexible');
const allowedMethods = ['use', 'get', 'post', 'put', 'patch', 'delete'];
const rateLimiters = {};

/**
 * Convert directory name to a parameter.
 * @example
 * // returns ':paramNameId'
 * dirNameToParam('param-name-id')
 * // returns ':paramName'
 * dirNameToParam('param-name-param')
 * @param {string} dirName
 * @returns {string}
 */
function dirNameToParam(dirName) {
  if (!dirName.endsWith('-id') && !dirName.endsWith('-param')) return dirName;

  return `:${dirName.replace('-param', '').replace(/-(\w)/g, (match, p1) => p1.toUpperCase())}`;
}

/**
 * Generate routing tree based on directory contents.
 * @param {string} rootDir - Target directory path.
 */
module.exports.discover = rootDir => {
  if (typeof rootDir === 'undefined') throw new Error('PATH_MISSING');

  const routes = [];

  function discoverInDirectory(sourceDir, routePath = '/') {
    const entries = fs.readdirSync(sourceDir, {withFileTypes: true});
    const dirs = entries.filter(entry => entry.isDirectory());
    const files = entries.filter(entry => entry.isFile());
    const route = {path: routePath};

    files.forEach(file => {
      const method = file.name.split('.').shift();

      if (!allowedMethods.includes(method)) return;

      route[method] = path.resolve(path.join(sourceDir, file.name));
    });

    if (Object.keys(route).length !== 1) routes.push(route);

    dirs.sort((a, b) => {
      const aHasParam = a.name.endsWith('-id') || a.name.endsWith('-param');
      const bHasParam = b.name.endsWith('-id') || b.name.endsWith('-param');

      if (aHasParam && bHasParam) return 0;

      return aHasParam ? 1 : bHasParam ? -1 : 0;
    });

    dirs.forEach(dir => {
      const dirPath = path.join(sourceDir, dir.name);
      const dirRouteBranch = dirNameToParam(dir.name);
      const dirRoutePath = path.posix.join(routePath, dirRouteBranch);

      discoverInDirectory(dirPath, dirRoutePath);
    });
  }

  discoverInDirectory(rootDir);

  return routes;
};

/**
 * Attach routes to app.
 * @param {array} routes
 * @param {object} app
 * @param {string} [root=/]
 */
module.exports.mount = ({routes, app, root = '/'}) => {
  routes.forEach(route => {
    allowedMethods.forEach(method => {
      const routeMethodModulePath = route[method];

      if (!routeMethodModulePath) return;

      app[method](path.posix.join(root, route.path), (req, res, next) => {
        const routeMethodModule = require(routeMethodModulePath);
        const {user} = req;
        let {permissions, rateLimit} = routeMethodModule;

        if (user && typeof user.can === 'function' && permissions) {
          if (typeof permissions === 'function') permissions = permissions(res.locals, req.params, req.body);

          if (!(typeof permissions === 'object' && permissions.constructor === Object)) {
            throw new Error('PERMISSIONS_FORMAT_INVALID');
          }

          const checked = Object.keys(permissions).map(action => user.can(action, permissions[action]));

          if (!checked.every(permitted => permitted)) throw new Error('FORBIDDEN');
        }

        let rateLimitApplied = Promise.resolve();

        if (rateLimit) {
          if (!rateLimit.keyPrefix) rateLimit.keyPrefix = 'default';

          let rateLimiter = rateLimiters[rateLimit.keyPrefix];

          if (!rateLimiter) rateLimiter = rateLimiters[rateLimit.keyPrefix] = new RateLimiterMemory(rateLimit);

          rateLimitApplied = rateLimiter.consume(req.ip).catch(err => {
            if ('remainingPoints' in err) {
              let message = 'Too many requests. Please try again in a few seconds.';

              if (typeof req.__ === 'function') message = req.__(message);
              if (typeof res.createError === 'function') throw res.createError(429, message);

              throw new Error(message);
            }

            throw err;
          });
        }

        const handler = routeMethodModule.handler || routeMethodModule;

        rateLimitApplied.then(() => handler(req, res, next)).catch(next);
      });
    });
  });
};
