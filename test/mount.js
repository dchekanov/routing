const assert = require('assert');
const routing = require('../index');
const path = require('path');

describe('Mount', function() {
  it('should mount routes', function() {
    const routes = [{path: '/', get: 'get.js'}];
    let mounted = false;

    const app = {
      get: function(route) {
        mounted = true;
      }
    };

    routing.mount({routes, app});
  });

  it('should throw on invalid permissions format', function() {
    const routes = [{path: '/', patch: path.resolve('./test/mount/permissions/patch.js')}];
    const req = {user: {can: new Function()}};
    let throwed = false;

    const app = {
      patch: function(route, handler) {
        try {
          handler(req);
        } catch (err) {
          throwed = err.message === 'PERMISSIONS_FORMAT_INVALID';
        }
      }
    };

    routing.mount({routes, app});
    assert(throwed);
  });

  it('should check permissions expressed as an object', function() {
    const routes = [{path: '/', post: path.resolve('./test/mount/permissions/post.js')}];
    let checkedCreateUser = false;
    let checkedUpdateFactory = false;

    const req = {
      user: {
        can: function(action, target) {
          if (!checkedCreateUser) checkedCreateUser = action === 'create' && target === 'User';
          if (!checkedUpdateFactory) checkedUpdateFactory = action === 'update' && target === 'Factory';

          return true;
        }
      }
    };

    const app = {post: (route, handler) => handler(req)};

    routing.mount({routes, app});
    assert(checkedCreateUser && checkedUpdateFactory);
  });

  it('should check permissions expressed as a function', function() {
    const routes = [{path: '/', get: path.resolve('./test/mount/permissions/get.js')}];
    let checked = false;

    const res = {locals: {user: 'abc'}};

    const req = {
      user: {
        can: function(action, target) {
          checked = action === 'read' && target === res.locals.user;

          return true;
        }
      }
    };

    const app = {get: (route, handler) => handler(req, res)};

    routing.mount({routes, app});
    assert(checked);
  });
});
