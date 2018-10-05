const assert = require('assert');
const routing = require('../index');

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
    assert(mounted);
  });
});
