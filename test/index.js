const assert = require('assert');
const sinon = require('sinon');
const {discover, mount} = require('../index');
const {HttpError} = require('http-errors');

/**
 * Simulate middleware pipeline processing.
 */
function pipe({pipeline, req, res, next} = {}) {
  async function runStage(idx) {
    let stop;

    if (!pipeline[idx]) {
      return;
    }

    await pipeline[idx](req, res, err => {
      next(err);

      if (err) {
        stop = true;
      }
    });

    if (!stop) {
      return runStage(idx + 1);
    }
  }

  return runStage(0);
}

describe('discover', function() {
  it('throws if the "dir" parameter is not a non-empty string', function() {
    assert.throws(() => discover({}), {name: 'Error', code: 'DIR_INVALID'});
    assert.throws(() => discover({dir: true}), {name: 'Error', code: 'DIR_INVALID'});
    assert.throws(() => discover({dir: 10}), {name: 'Error', code: 'DIR_INVALID'});
    assert.throws(() => discover({dir: ''}), {name: 'Error', code: 'DIR_INVALID'});
  });

  it('throws if the "dir" parameter points to a non-existing directory', function() {
    assert.throws(() => discover({dir: 'missing'}), {name: 'Error', code: 'ENOENT'});
  });

  it('throws if the "route" parameter is not a non-empty string', function() {
    assert.throws(() => discover({dir: 'test/routes/plain', route: true}), {name: 'Error', code: 'ROOT_INVALID'});
    assert.throws(() => discover({dir: 'test/routes/plain', route: 10}), {name: 'Error', code: 'ROOT_INVALID'});
    assert.throws(() => discover({dir: 'test/routes/plain', route: ' '}), {name: 'Error', code: 'ROOT_INVALID'});
  });

  it('throws if route file does not export the "handle" function', function() {
    assert.throws(
      () => discover({dir: 'test/routes/no-handle'}),
      {name: 'Error', code: 'HANDLE_INVALID'}
    );
  });

  it('throws if route file exports an invalid "rateLimit" member', function() {
    assert.throws(
      () => discover({dir: 'test/routes/rate-limit-invalid'}),
      {name: 'Error', code: 'RATE_LIMIT_INVALID'}
    );
  });

  it('throws if route file exports an invalid "authorize" member', function() {
    assert.throws(
      () => discover({dir: 'test/routes/authorize-invalid'}),
      {name: 'Error', code: 'AUTHORIZE_INVALID'}
    );
  });
});

describe('mount', function() {
  const app = {};

  ['get', 'post', 'put', 'patch', 'delete'].forEach(method => app[method] = sinon.fake());

  const req = sinon.fake();

  const res = {
    end: sinon.fake()
  };

  const next = sinon.fake();

  beforeEach(() => sinon.reset());

  it('throws when neither "dir" nor "handlers" is supplied', function() {
    assert.throws(() => mount({}), {name: 'Error', code: 'SOURCE_INVALID'});
  });

  it('mounts a plain list of routes', function() {
    mount({app, dir: 'test/routes/plain'});

    ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
      assert(app[method].calledOnce);
      assert(app[method].firstCall.args[0] === '/');
      assert(Array.isArray(app[method].firstCall.args[1]));
      assert(app[method].firstCall.args[1].every(element => typeof element === 'function'));
    });
  });

  it('mounts routes when supplied with already discovered handlers', function() {
    const handlers = discover({dir: 'test/routes/plain'});

    mount({app, handlers});

    ['get', 'post', 'put', 'patch', 'delete'].forEach(method => {
      assert(app[method].calledOnce);
      assert(app[method].firstCall.args[0] === '/');
      assert(Array.isArray(app[method].firstCall.args[1]));
      assert(app[method].firstCall.args[1].every(element => typeof element === 'function'));
    });
  });

  it('mounts a tree of routes and returns a report', function() {
    const mounted = mount({app, dir: 'test/routes/tree'});

    assert(mounted.length === 2);
    assert(mounted[0].route === '/');
    assert(mounted[0].method === 'get');
    assert(mounted[0].source === require('./routes/tree/get'));
    assert(Array.isArray(mounted[0].pipeline));

    assert(mounted[1].route === '/branch');
    assert(mounted[1].method === 'get');
    assert(mounted[1].source === require('./routes/tree/branch/get'));
    assert(Array.isArray(mounted[1].pipeline));

    assert(app.get.calledTwice);
    assert(app.get.firstCall.args[0] === '/');
    assert(app.get.secondCall.args[0] === '/branch');
  });

  it('mounts dirs with names starting with "=" the last and replaces "=" with ":" in route path', function() {
    mount({app, dir: 'test/routes/params'});

    assert(app.get.calledTwice);
    assert(app.get.firstCall.args[0] === '/regular');
    assert(app.get.secondCall.args[0] === '/:paramNameValue');
  });

  it('mounts dirs with names equal to "=" the last and replaces "=" with "*" in route path', function() {
    mount({app, dir: 'test/routes/wildcard'});

    assert(app.get.calledTwice);
    assert(app.get.firstCall.args[0] === '/regular');
    assert(app.get.secondCall.args[0] === '/*');
  });

  it('mounts a pipeline that executes "handle"', function() {
    mount({app, dir: 'test/routes/pipeline/handle'});
    pipe({pipeline: app.get.firstCall.args[1], req, res, next});

    assert(res.end.calledOnce);
    assert(res.end.firstCall.args[0] === 'ok');
  });

  it('mounts a pipeline that rate limits (string)', async function() {
    mount({app, dir: 'test/routes/pipeline/rate-limit/string'});

    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});
    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});

    assert(res.end.calledOnce);
    assert(res.end.firstCall.args[0] === 'ok');

    assert(next.calledTwice);
    assert(next.secondCall.args[0] instanceof HttpError);
    assert(next.secondCall.args[0].status === 429);
  });

  it('mounts a pipeline that rate limits (object)', async function() {
    mount({app, dir: 'test/routes/pipeline/rate-limit/object'});

    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});
    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});

    assert(res.end.calledOnce);
    assert(res.end.firstCall.args[0] === 'ok');

    assert(next.calledTwice);
    assert(next.secondCall.args[0] instanceof HttpError);
    assert(next.secondCall.args[0].status === 429);
  });

  it('mounts a pipeline that authorizes (success)', async function() {
    mount({app, dir: 'test/routes/pipeline/authorize/success'});

    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});

    assert(next.calledOnce);
    assert(typeof next.firstCall.args[0] === 'undefined');

    assert(res.end.calledOnce);
    assert(res.end.firstCall.args[0] === 'ok');
  });

  it('mounts a pipeline that authorizes (failure)', async function() {
    mount({app, dir: 'test/routes/pipeline/authorize/failure'});

    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});

    assert(next.calledOnce);
    assert(next.firstCall.args[0] instanceof HttpError);
    assert(next.firstCall.args[0].status === 403);
  });

  it('mounts a pipeline that includes middleware', async function() {
    mount({app, dir: 'test/routes/pipeline/middleware'});

    await pipe({pipeline: app.get.firstCall.args[1], req, res, next});

    assert(next.calledOnce);
    assert(next.firstCall.args[0] instanceof Error);
    assert(next.firstCall.args[0].message === 'MIDDLEWARE');
  });
});
