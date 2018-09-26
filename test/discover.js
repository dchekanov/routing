const assert = require('assert');
const routing = require('../index');

describe('Discover', function() {
  it('should throw on missing path parameter', function() {
    assert.throws(routing.discover, {message: 'PATH_MISSING'});
  });

  it('should throw on invalid path', function() {
    assert.throws(() => routing.discover('abc'), {code: 'ENOENT'});
  });

  it('should ignore empty directories', function() {
    const routes = routing.discover('test/discover/empty');

    assert(routes.length === 0);
  });

  it('should discover valid methods', function() {
    const route = routing.discover('test/discover/valid-methods')[0];

    ['use', 'get', 'post', 'put', 'patch', 'delete'].forEach(method => {
      assert(typeof route[method] !== 'undefined');
    });
  });

  it('should ignore invalid methods', function() {
    const routes = routing.discover('test/discover/invalid-method');

    assert(routes.length === 0);
  });

  it('should output files first', function() {
    const routes = routing.discover('test/discover/file-order');

    assert(routes[0].path === '/' && routes[1].path === '/dir');
  });

  it('should recognize id param routes', function() {
    const route = routing.discover('test/discover/id-param')[0];

    assert(route.path === '/:paramNameId');
  });

  it('should recognize named param routes', function() {
    const route = routing.discover('test/discover/named-param')[0];

    assert(route.path === '/:paramName');
  });

  it('should place param routes at the end', function() {
    const routes = routing.discover('test/discover/param-order');

    assert(routes[0].path === '/z-order' && routes[1].path === '/:paramNameId' && routes[2].path === '/:paramName');
  });
});
