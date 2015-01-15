(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports=["https://docs.google.com/spreadsheets/d/1LkVkb3VFjxBf6JpvTOgklzcwr9OgU_8n8fBpyqhVS4U/pubhtml"]
},{}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
module.exports = require('./src/contra.js');

},{"./src/contra.js":4}],4:[function(require,module,exports){
(function (process){
(function (Object, root, undefined) {
  'use strict';

  var undef = '' + undefined;
  var SERIAL = 1;
  var CONCURRENT = Infinity;

  function noop () {}
  function a (o) { return Object.prototype.toString.call(o) === '[object Array]'; }
  function atoa (a, n) { return Array.prototype.slice.call(a, n); }
  function debounce (fn, args, ctx) { if (!fn) { return; } tick(function run () { fn.apply(ctx || null, args || []); }); }
  function once (fn) {
    var disposed;
    function disposable () {
      if (disposed) { return; }
      disposed = true;
      (fn || noop).apply(null, arguments);
    }
    disposable.discard = function () { disposed = true; };
    return disposable;
  }
  function handle (args, done, disposable) {
    var err = args.shift();
    if (err) { if (disposable) { disposable.discard(); } debounce(done, [err]); return true; }
  }

  // cross-platform ticker
  var si = typeof setImmediate === 'function', tick;
  if (si) {
    tick = function (fn) { setImmediate(fn); };
  } else if (typeof process !== undef && process.nextTick) {
    tick = process.nextTick;
  } else {
    tick = function (fn) { setTimeout(fn, 0); };
  }

  function _curry () {
    var args = atoa(arguments);
    var method = args.shift();
    return function curried () {
      var more = atoa(arguments);
      method.apply(method, args.concat(more));
    };
  }

  function _waterfall (steps, done) {
    var d = once(done);
    function next () {
      var args = atoa(arguments);
      var step = steps.shift();
      if (step) {
        if (handle(args, d)) { return; }
        args.push(once(next));
        debounce(step, args);
      } else {
        debounce(d, arguments);
      }
    }
    next();
  }

  function _concurrent (tasks, concurrency, done) {
    if (typeof concurrency === 'function') { done = concurrency; concurrency = CONCURRENT; }
    var d = once(done);
    var q = _queue(worker, concurrency);
    var keys = Object.keys(tasks);
    var results = a(tasks) ? [] : {};
    q.unshift(keys);
    q.on('drain', function completed () { d(null, results); });
    function worker (key, next) {
      debounce(tasks[key], [proceed]);
      function proceed () {
        var args = atoa(arguments);
        if (handle(args, d)) { return; }
        results[key] = args.shift();
        next();
      }
    }
  }

  function _series (tasks, done) {
    _concurrent(tasks, SERIAL, done);
  }

  function _map (cap, then, attached) {
    var map = function (collection, concurrency, iterator, done) {
      var args = arguments;
      if (args.length === 2) { iterator = concurrency; concurrency = CONCURRENT; }
      if (args.length === 3 && typeof concurrency !== 'number') { done = iterator; iterator = concurrency; concurrency = CONCURRENT; }
      var keys = Object.keys(collection);
      var tasks = a(collection) ? [] : {};
      keys.forEach(function insert (key) {
        tasks[key] = function iterate (cb) {
          if (iterator.length === 3) {
            iterator(collection[key], key, cb);
          } else {
            iterator(collection[key], cb);
          }
        };
      });
      _concurrent(tasks, cap || concurrency, then ? then(collection, once(done)) : done);
    };
    if (!attached) { map.series = _map(SERIAL, then, true); }
    return map;
  }

  function _each (concurrency) {
    return _map(concurrency, then);
    function then (collection, done) {
      return function mask (err) {
        done(err); // only return the error, no more arguments
      };
    }
  }

  function _filter (concurrency) {
    return _map(concurrency, then);
    function then (collection, done) {
      return function filter (err, results) {
        function exists (item, key) {
          return !!results[key];
        }
        function ofilter () {
          var filtered = {};
          Object.keys(collection).forEach(function omapper (key) {
            if (exists(null, key)) { filtered[key] = collection[key]; }
          });
          return filtered;
        }
        if (err) { done(err); return; }
        done(null, a(results) ? collection.filter(exists) : ofilter());
      };
    }
  }

  function _emitter (thing, options) {
    var opts = options || {};
    var evt = {};
    if (thing === undefined) { thing = {}; }
    thing.on = function (type, fn) {
      if (!evt[type]) {
        evt[type] = [fn];
      } else {
        evt[type].push(fn);
      }
      return thing;
    };
    thing.once = function (type, fn) {
      fn._once = true; // thing.off(fn) still works!
      thing.on(type, fn);
      return thing;
    };
    thing.off = function (type, fn) {
      var c = arguments.length;
      if (c === 1) {
        delete evt[type];
      } else if (c === 0) {
        evt = {};
      } else {
        var et = evt[type];
        if (!et) { return thing; }
        et.splice(et.indexOf(fn), 1);
      }
      return thing;
    };
    thing.emit = function () {
      var args = atoa(arguments);
      return thing.emitterSnapshot(args.shift()).apply(this, args);
    };
    thing.emitterSnapshot = function (type) {
      var et = (evt[type] || []).slice(0);
      return function () {
        var args = atoa(arguments);
        var ctx = this || thing;
        if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
        evt[type] = et.filter(function emitter (listen) {
          if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
          return !listen._once;
        });
        return thing;
      };
    }
    return thing;
  }

  function _queue (worker, concurrency) {
    var q = [], load = 0, max = concurrency || 1, paused;
    var qq = _emitter({
      push: manipulate.bind(null, 'push'),
      unshift: manipulate.bind(null, 'unshift'),
      pause: function () { paused = true; },
      resume: function () { paused = false; debounce(labor); },
      pending: q
    });
    if (Object.defineProperty && !Object.definePropertyPartial) {
      Object.defineProperty(qq, 'length', { get: function () { return q.length; } });
    }
    function manipulate (how, task, done) {
      var tasks = a(task) ? task : [task];
      tasks.forEach(function insert (t) { q[how]({ t: t, done: done }); });
      debounce(labor);
    }
    function labor () {
      if (paused || load >= max) { return; }
      if (!q.length) { if (load === 0) { qq.emit('drain'); } return; }
      load++;
      var job = q.pop();
      worker(job.t, once(complete.bind(null, job)));
      debounce(labor);
    }
    function complete (job) {
      load--;
      debounce(job.done, atoa(arguments, 1));
      debounce(labor);
    }
    return qq;
  }

  var contra = {
    curry: _curry,
    concurrent: _concurrent,
    series: _series,
    waterfall: _waterfall,
    each: _each(),
    map: _map(),
    filter: _filter(),
    queue: _queue,
    emitter: _emitter
  };

  // cross-platform export
  if (typeof module !== undef && module.exports) {
    module.exports = contra;
  } else {
    root.contra = contra;
  }
})(Object, this);

}).call(this,require('_process'))

},{"_process":2}],5:[function(require,module,exports){
module.exports = require('./src/main.js');

},{"./src/main.js":10}],6:[function(require,module,exports){
'use strict';

var Sheet = require('./sheet.js');

module.exports = Book;

function Book(source, key) {
  this.sheets = source.feed.entry.map(function (sheet) {
    return new Sheet(sheet, key);
  });
}

},{"./sheet.js":11}],7:[function(require,module,exports){
'use strict';

module.exports = 'https://spreadsheets.google.com';

},{}],8:[function(require,module,exports){
'use strict';

module.exports = getJSON;

function getJSON(path, cb) {
  var xhr = new XMLHttpRequest();
  var json;

  xhr.open('GET', path);
  xhr.onload = function() {
    if (xhr.readyState !== 4 || xhr.status !== 200) {
      cb(xhr);
      return;
    }

    try {
      json = JSON.parse(xhr.responseText);
    } catch (e) {
      cb(xhr);
      return;
    }

    cb(null, json);
  };
  xhr.send();
}

},{}],9:[function(require,module,exports){
'use strict';

module.exports = list;

function list(source) {
  return source.feed.entry.map(function (entry) {
    var obj = {};

    Object.keys(entry).filter(function (key) {
      return /gsx\$/.test(key);
    }).forEach(function (key) {
      obj[key.substring(4)] = entry[key].$t;
    });

    return obj;
  });
}

},{}],10:[function(require,module,exports){
'use strict';

var fetch = require('./getJSON.js');
var Book = require('./book.js');
var endpoint = require('./endpoint.js');

module.exports = init;

function init(key, cb) {
  if(/key=/.test(key)) {
    key = key.match('key=(.*?)(&|#|$)')[1];
  }

  if(/pubhtml/.test(key)) {
    key = key.match('d\\/(.*?)\\/pubhtml')[1];
  }

  fetch(endpoint + '/feeds/worksheets/' + key + '/public/basic?alt=json', function (err, data) {
    if (err) {
      cb(err);
      return;
    }

    cb(null, new Book(data, key));
  });
}

},{"./book.js":6,"./endpoint.js":7,"./getJSON.js":8}],11:[function(require,module,exports){
'use strict';

var list = require('./list.js');
var endpoint = require('./endpoint.js');
var fetch = require('./getJSON.js');

module.exports = Sheet;

function Sheet(source, key) {
  var content, path;
  var $this = this;

  this.name = source.content.$t;
  this.id = source.link[source.link.length - 1].href.split('/').pop();
  this.fetch = function (cb) {
    if (content) {
      cb(null, content);
      return;
    }

    fetch(endpoint + '/feeds/list/' + key + '/' + $this.id + '/public/values?alt=json', function (err, data) {
      if (err) {
        cb(err);
        return;
      }

      content = list(data);
      cb(null, content);
    });
  };
}

},{"./endpoint.js":7,"./getJSON.js":8,"./list.js":9}],12:[function(require,module,exports){
module.exports = ['$scope', '$rootScope', '$location', '$window', 'db', home];

function home($scope, $rootScope, $location, $window, db) {
  'use strict';

  db.fetch(function (err, matches) {
    if (err) {
      console.error(err);
      return;
    }

    $scope.matches = matches;
    $scope.$apply();
  });
}

},{}],13:[function(require,module,exports){
module.exports = {
  home: require('./home.js')  
};
},{"./home.js":12}],14:[function(require,module,exports){
var open = require('./open.js');
var content;

module.exports = function (docs) {
  return {
    fetch: fetch
  };

  function fetch(cb) {
    if (content) {
      cb(null, content);
      return;
    }

    open(docs, function (err, data) {
      if (err) {
        cb(err);
        return;
      }

      content = data;
      cb(null, data);
    });
  }
};

},{"./open.js":15}],15:[function(require,module,exports){
var table = require('gsx');
var contra = require('contra');

module.exports = open;

function open(docs, done) {
  var tasks = docs.map(function (doc) {
    return function(cb) {
      table(doc, function (err, data) {
        if (err) {
          cb(err);
          return;
        }

        cb(null, data.sheets);
      });
    };
  });

  contra.concurrent(tasks, function (err, results) {
    if (err) {
      done(err);
      return;
    }

    done(null, results.reduce(function (x, y) { return x.concat(y); }, []));
  });
}

},{"contra":3,"gsx":5}],16:[function(require,module,exports){
var docs = require('../docs.json');
var db = require('./db')(docs);
var bchz = require('./modules').bchz;
var controllers = require('./controllers');

bchz.value('db', db);
bchz.controller('HomeCtrl', controllers.home);

function initialize(err, book) {
  if (err) {
    console.error(err);
    return;
  }
}

},{"../docs.json":1,"./controllers":13,"./db":14,"./modules":18}],17:[function(require,module,exports){
module.exports = angular.module('bchz', ['ngRoute'])
  .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {

    $routeProvider
      .when('/', { controller: 'HomeCtrl', templateUrl: '/views/home.html' })
      .when('/busqueda', { controller: 'PlaceSearchCtrl', templateUrl: '/place/search.html' })
      .when('/listado', { controller: 'PlaceListCtrl', templateUrl: '/place/list.html' })
      .when('/mapa', { controller: 'MapCtrl', templateUrl: '/site/map.html' })
      .when('/canchas/agregar', { controller: 'PlaceAddCtrl', templateUrl: '/place/add.html' })
      .when('/canchas/listado/:sport', { controller: 'PlaceListCtrl', templateUrl: '/place/list.html' })
      .when('/canchas/listado', { controller: 'PlaceListCtrl', templateUrl: '/place/list.html' })
      .when('/canchas/:id', { controller: 'PlaceDetailCtrl', resolve: {
        place: ['$route', 'Place', function ($route, Place) {
          return Place.get($route.current.params).$promise;
        }]
      }, templateUrl: '/place/detail.html' })
      .when('/404', { templateUrl: '/site/404.html' })
      .otherwise({ templateUrl: '/site/404.html' });
  }]);

},{}],18:[function(require,module,exports){
module.exports = {
  bchz: require('./bchz.js')
};

},{"./bchz.js":17}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiZG9jcy5qc29uIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHByb2Nlc3NcXGJyb3dzZXIuanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcc3JjXFxjb250cmEuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxib29rLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcZW5kcG9pbnQuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxnZXRKU09OLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcbGlzdC5qcyIsIm5vZGVfbW9kdWxlc1xcZ3N4XFxzcmNcXG1haW4uanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxzaGVldC5qcyIsInNyY1xcY29udHJvbGxlcnNcXGhvbWUuanMiLCJzcmNcXGNvbnRyb2xsZXJzXFxpbmRleC5qcyIsInNyY1xcZGJcXGluZGV4LmpzIiwic3JjXFxkYlxcb3Blbi5qcyIsInNyY1xcaW5kZXguanMiLCJzcmNcXG1vZHVsZXNcXGJjaHouanMiLCJzcmNcXG1vZHVsZXNcXGluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDN09BO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHM9W1wiaHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMUxrVmtiM1ZGanhCZjZKcHZUT2drbHpjd3I5T2dVXzhuOGZCcHlxaFZTNFUvcHViaHRtbFwiXSIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gdHJ1ZTtcbiAgICB2YXIgY3VycmVudFF1ZXVlO1xuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG59XG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHF1ZXVlLnB1c2goZnVuKTtcbiAgICBpZiAoIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vc3JjL2NvbnRyYS5qcycpO1xuIiwiKGZ1bmN0aW9uIChPYmplY3QsIHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIHZhciBTRVJJQUwgPSAxO1xuICB2YXIgQ09OQ1VSUkVOVCA9IEluZmluaXR5O1xuXG4gIGZ1bmN0aW9uIG5vb3AgKCkge31cbiAgZnVuY3Rpb24gYSAobykgeyByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pID09PSAnW29iamVjdCBBcnJheV0nOyB9XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuICBmdW5jdGlvbiBvbmNlIChmbikge1xuICAgIHZhciBkaXNwb3NlZDtcbiAgICBmdW5jdGlvbiBkaXNwb3NhYmxlICgpIHtcbiAgICAgIGlmIChkaXNwb3NlZCkgeyByZXR1cm47IH1cbiAgICAgIGRpc3Bvc2VkID0gdHJ1ZTtcbiAgICAgIChmbiB8fCBub29wKS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgICBkaXNwb3NhYmxlLmRpc2NhcmQgPSBmdW5jdGlvbiAoKSB7IGRpc3Bvc2VkID0gdHJ1ZTsgfTtcbiAgICByZXR1cm4gZGlzcG9zYWJsZTtcbiAgfVxuICBmdW5jdGlvbiBoYW5kbGUgKGFyZ3MsIGRvbmUsIGRpc3Bvc2FibGUpIHtcbiAgICB2YXIgZXJyID0gYXJncy5zaGlmdCgpO1xuICAgIGlmIChlcnIpIHsgaWYgKGRpc3Bvc2FibGUpIHsgZGlzcG9zYWJsZS5kaXNjYXJkKCk7IH0gZGVib3VuY2UoZG9uZSwgW2Vycl0pOyByZXR1cm4gdHJ1ZTsgfVxuICB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfY3VycnkgKCkge1xuICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgIHZhciBtZXRob2QgPSBhcmdzLnNoaWZ0KCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGN1cnJpZWQgKCkge1xuICAgICAgdmFyIG1vcmUgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICBtZXRob2QuYXBwbHkobWV0aG9kLCBhcmdzLmNvbmNhdChtb3JlKSk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF93YXRlcmZhbGwgKHN0ZXBzLCBkb25lKSB7XG4gICAgdmFyIGQgPSBvbmNlKGRvbmUpO1xuICAgIGZ1bmN0aW9uIG5leHQgKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICB2YXIgc3RlcCA9IHN0ZXBzLnNoaWZ0KCk7XG4gICAgICBpZiAoc3RlcCkge1xuICAgICAgICBpZiAoaGFuZGxlKGFyZ3MsIGQpKSB7IHJldHVybjsgfVxuICAgICAgICBhcmdzLnB1c2gob25jZShuZXh0KSk7XG4gICAgICAgIGRlYm91bmNlKHN0ZXAsIGFyZ3MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVib3VuY2UoZCwgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICB9XG4gICAgbmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gX2NvbmN1cnJlbnQgKHRhc2tzLCBjb25jdXJyZW5jeSwgZG9uZSkge1xuICAgIGlmICh0eXBlb2YgY29uY3VycmVuY3kgPT09ICdmdW5jdGlvbicpIHsgZG9uZSA9IGNvbmN1cnJlbmN5OyBjb25jdXJyZW5jeSA9IENPTkNVUlJFTlQ7IH1cbiAgICB2YXIgZCA9IG9uY2UoZG9uZSk7XG4gICAgdmFyIHEgPSBfcXVldWUod29ya2VyLCBjb25jdXJyZW5jeSk7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh0YXNrcyk7XG4gICAgdmFyIHJlc3VsdHMgPSBhKHRhc2tzKSA/IFtdIDoge307XG4gICAgcS51bnNoaWZ0KGtleXMpO1xuICAgIHEub24oJ2RyYWluJywgZnVuY3Rpb24gY29tcGxldGVkICgpIHsgZChudWxsLCByZXN1bHRzKTsgfSk7XG4gICAgZnVuY3Rpb24gd29ya2VyIChrZXksIG5leHQpIHtcbiAgICAgIGRlYm91bmNlKHRhc2tzW2tleV0sIFtwcm9jZWVkXSk7XG4gICAgICBmdW5jdGlvbiBwcm9jZWVkICgpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICAgIGlmIChoYW5kbGUoYXJncywgZCkpIHsgcmV0dXJuOyB9XG4gICAgICAgIHJlc3VsdHNba2V5XSA9IGFyZ3Muc2hpZnQoKTtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIF9zZXJpZXMgKHRhc2tzLCBkb25lKSB7XG4gICAgX2NvbmN1cnJlbnQodGFza3MsIFNFUklBTCwgZG9uZSk7XG4gIH1cblxuICBmdW5jdGlvbiBfbWFwIChjYXAsIHRoZW4sIGF0dGFjaGVkKSB7XG4gICAgdmFyIG1hcCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBjb25jdXJyZW5jeSwgaXRlcmF0b3IsIGRvbmUpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAyKSB7IGl0ZXJhdG9yID0gY29uY3VycmVuY3k7IGNvbmN1cnJlbmN5ID0gQ09OQ1VSUkVOVDsgfVxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAzICYmIHR5cGVvZiBjb25jdXJyZW5jeSAhPT0gJ251bWJlcicpIHsgZG9uZSA9IGl0ZXJhdG9yOyBpdGVyYXRvciA9IGNvbmN1cnJlbmN5OyBjb25jdXJyZW5jeSA9IENPTkNVUlJFTlQ7IH1cbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoY29sbGVjdGlvbik7XG4gICAgICB2YXIgdGFza3MgPSBhKGNvbGxlY3Rpb24pID8gW10gOiB7fTtcbiAgICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiBpbnNlcnQgKGtleSkge1xuICAgICAgICB0YXNrc1trZXldID0gZnVuY3Rpb24gaXRlcmF0ZSAoY2IpIHtcbiAgICAgICAgICBpZiAoaXRlcmF0b3IubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihjb2xsZWN0aW9uW2tleV0sIGtleSwgY2IpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpdGVyYXRvcihjb2xsZWN0aW9uW2tleV0sIGNiKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIF9jb25jdXJyZW50KHRhc2tzLCBjYXAgfHwgY29uY3VycmVuY3ksIHRoZW4gPyB0aGVuKGNvbGxlY3Rpb24sIG9uY2UoZG9uZSkpIDogZG9uZSk7XG4gICAgfTtcbiAgICBpZiAoIWF0dGFjaGVkKSB7IG1hcC5zZXJpZXMgPSBfbWFwKFNFUklBTCwgdGhlbiwgdHJ1ZSk7IH1cbiAgICByZXR1cm4gbWFwO1xuICB9XG5cbiAgZnVuY3Rpb24gX2VhY2ggKGNvbmN1cnJlbmN5KSB7XG4gICAgcmV0dXJuIF9tYXAoY29uY3VycmVuY3ksIHRoZW4pO1xuICAgIGZ1bmN0aW9uIHRoZW4gKGNvbGxlY3Rpb24sIGRvbmUpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiBtYXNrIChlcnIpIHtcbiAgICAgICAgZG9uZShlcnIpOyAvLyBvbmx5IHJldHVybiB0aGUgZXJyb3IsIG5vIG1vcmUgYXJndW1lbnRzXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIF9maWx0ZXIgKGNvbmN1cnJlbmN5KSB7XG4gICAgcmV0dXJuIF9tYXAoY29uY3VycmVuY3ksIHRoZW4pO1xuICAgIGZ1bmN0aW9uIHRoZW4gKGNvbGxlY3Rpb24sIGRvbmUpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiBmaWx0ZXIgKGVyciwgcmVzdWx0cykge1xuICAgICAgICBmdW5jdGlvbiBleGlzdHMgKGl0ZW0sIGtleSkge1xuICAgICAgICAgIHJldHVybiAhIXJlc3VsdHNba2V5XTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBvZmlsdGVyICgpIHtcbiAgICAgICAgICB2YXIgZmlsdGVyZWQgPSB7fTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhjb2xsZWN0aW9uKS5mb3JFYWNoKGZ1bmN0aW9uIG9tYXBwZXIgKGtleSkge1xuICAgICAgICAgICAgaWYgKGV4aXN0cyhudWxsLCBrZXkpKSB7IGZpbHRlcmVkW2tleV0gPSBjb2xsZWN0aW9uW2tleV07IH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gZmlsdGVyZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGVycikgeyBkb25lKGVycik7IHJldHVybjsgfVxuICAgICAgICBkb25lKG51bGwsIGEocmVzdWx0cykgPyBjb2xsZWN0aW9uLmZpbHRlcihleGlzdHMpIDogb2ZpbHRlcigpKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0dGVyU25hcHNob3QgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQubGVuZ3RoKSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgICAgZXZ0W3R5cGVdID0gZXQuZmlsdGVyKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgICByZXR1cm4gIWxpc3Rlbi5fb25jZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGluZztcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIF9xdWV1ZSAod29ya2VyLCBjb25jdXJyZW5jeSkge1xuICAgIHZhciBxID0gW10sIGxvYWQgPSAwLCBtYXggPSBjb25jdXJyZW5jeSB8fCAxLCBwYXVzZWQ7XG4gICAgdmFyIHFxID0gX2VtaXR0ZXIoe1xuICAgICAgcHVzaDogbWFuaXB1bGF0ZS5iaW5kKG51bGwsICdwdXNoJyksXG4gICAgICB1bnNoaWZ0OiBtYW5pcHVsYXRlLmJpbmQobnVsbCwgJ3Vuc2hpZnQnKSxcbiAgICAgIHBhdXNlOiBmdW5jdGlvbiAoKSB7IHBhdXNlZCA9IHRydWU7IH0sXG4gICAgICByZXN1bWU6IGZ1bmN0aW9uICgpIHsgcGF1c2VkID0gZmFsc2U7IGRlYm91bmNlKGxhYm9yKTsgfSxcbiAgICAgIHBlbmRpbmc6IHFcbiAgICB9KTtcbiAgICBpZiAoT2JqZWN0LmRlZmluZVByb3BlcnR5ICYmICFPYmplY3QuZGVmaW5lUHJvcGVydHlQYXJ0aWFsKSB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkocXEsICdsZW5ndGgnLCB7IGdldDogZnVuY3Rpb24gKCkgeyByZXR1cm4gcS5sZW5ndGg7IH0gfSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG1hbmlwdWxhdGUgKGhvdywgdGFzaywgZG9uZSkge1xuICAgICAgdmFyIHRhc2tzID0gYSh0YXNrKSA/IHRhc2sgOiBbdGFza107XG4gICAgICB0YXNrcy5mb3JFYWNoKGZ1bmN0aW9uIGluc2VydCAodCkgeyBxW2hvd10oeyB0OiB0LCBkb25lOiBkb25lIH0pOyB9KTtcbiAgICAgIGRlYm91bmNlKGxhYm9yKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gbGFib3IgKCkge1xuICAgICAgaWYgKHBhdXNlZCB8fCBsb2FkID49IG1heCkgeyByZXR1cm47IH1cbiAgICAgIGlmICghcS5sZW5ndGgpIHsgaWYgKGxvYWQgPT09IDApIHsgcXEuZW1pdCgnZHJhaW4nKTsgfSByZXR1cm47IH1cbiAgICAgIGxvYWQrKztcbiAgICAgIHZhciBqb2IgPSBxLnBvcCgpO1xuICAgICAgd29ya2VyKGpvYi50LCBvbmNlKGNvbXBsZXRlLmJpbmQobnVsbCwgam9iKSkpO1xuICAgICAgZGVib3VuY2UobGFib3IpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjb21wbGV0ZSAoam9iKSB7XG4gICAgICBsb2FkLS07XG4gICAgICBkZWJvdW5jZShqb2IuZG9uZSwgYXRvYShhcmd1bWVudHMsIDEpKTtcbiAgICAgIGRlYm91bmNlKGxhYm9yKTtcbiAgICB9XG4gICAgcmV0dXJuIHFxO1xuICB9XG5cbiAgdmFyIGNvbnRyYSA9IHtcbiAgICBjdXJyeTogX2N1cnJ5LFxuICAgIGNvbmN1cnJlbnQ6IF9jb25jdXJyZW50LFxuICAgIHNlcmllczogX3NlcmllcyxcbiAgICB3YXRlcmZhbGw6IF93YXRlcmZhbGwsXG4gICAgZWFjaDogX2VhY2goKSxcbiAgICBtYXA6IF9tYXAoKSxcbiAgICBmaWx0ZXI6IF9maWx0ZXIoKSxcbiAgICBxdWV1ZTogX3F1ZXVlLFxuICAgIGVtaXR0ZXI6IF9lbWl0dGVyXG4gIH07XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gZXhwb3J0XG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSB1bmRlZiAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gY29udHJhO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gY29udHJhO1xuICB9XG59KShPYmplY3QsIHRoaXMpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9tYWluLmpzJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBTaGVldCA9IHJlcXVpcmUoJy4vc2hlZXQuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCb29rO1xuXG5mdW5jdGlvbiBCb29rKHNvdXJjZSwga2V5KSB7XG4gIHRoaXMuc2hlZXRzID0gc291cmNlLmZlZWQuZW50cnkubWFwKGZ1bmN0aW9uIChzaGVldCkge1xuICAgIHJldHVybiBuZXcgU2hlZXQoc2hlZXQsIGtleSk7XG4gIH0pO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9ICdodHRwczovL3NwcmVhZHNoZWV0cy5nb29nbGUuY29tJztcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBnZXRKU09OO1xuXG5mdW5jdGlvbiBnZXRKU09OKHBhdGgsIGNiKSB7XG4gIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgdmFyIGpzb247XG5cbiAgeGhyLm9wZW4oJ0dFVCcsIHBhdGgpO1xuICB4aHIub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHhoci5yZWFkeVN0YXRlICE9PSA0IHx8IHhoci5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgY2IoeGhyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAganNvbiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY2IoeGhyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjYihudWxsLCBqc29uKTtcbiAgfTtcbiAgeGhyLnNlbmQoKTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBsaXN0O1xuXG5mdW5jdGlvbiBsaXN0KHNvdXJjZSkge1xuICByZXR1cm4gc291cmNlLmZlZWQuZW50cnkubWFwKGZ1bmN0aW9uIChlbnRyeSkge1xuICAgIHZhciBvYmogPSB7fTtcblxuICAgIE9iamVjdC5rZXlzKGVudHJ5KS5maWx0ZXIoZnVuY3Rpb24gKGtleSkge1xuICAgICAgcmV0dXJuIC9nc3hcXCQvLnRlc3Qoa2V5KTtcbiAgICB9KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIG9ialtrZXkuc3Vic3RyaW5nKDQpXSA9IGVudHJ5W2tleV0uJHQ7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gb2JqO1xuICB9KTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGZldGNoID0gcmVxdWlyZSgnLi9nZXRKU09OLmpzJyk7XG52YXIgQm9vayA9IHJlcXVpcmUoJy4vYm9vay5qcycpO1xudmFyIGVuZHBvaW50ID0gcmVxdWlyZSgnLi9lbmRwb2ludC5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluaXQ7XG5cbmZ1bmN0aW9uIGluaXQoa2V5LCBjYikge1xuICBpZigva2V5PS8udGVzdChrZXkpKSB7XG4gICAga2V5ID0ga2V5Lm1hdGNoKCdrZXk9KC4qPykoJnwjfCQpJylbMV07XG4gIH1cblxuICBpZigvcHViaHRtbC8udGVzdChrZXkpKSB7XG4gICAga2V5ID0ga2V5Lm1hdGNoKCdkXFxcXC8oLio/KVxcXFwvcHViaHRtbCcpWzFdO1xuICB9XG5cbiAgZmV0Y2goZW5kcG9pbnQgKyAnL2ZlZWRzL3dvcmtzaGVldHMvJyArIGtleSArICcvcHVibGljL2Jhc2ljP2FsdD1qc29uJywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIGNiKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2IobnVsbCwgbmV3IEJvb2soZGF0YSwga2V5KSk7XG4gIH0pO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbGlzdCA9IHJlcXVpcmUoJy4vbGlzdC5qcycpO1xudmFyIGVuZHBvaW50ID0gcmVxdWlyZSgnLi9lbmRwb2ludC5qcycpO1xudmFyIGZldGNoID0gcmVxdWlyZSgnLi9nZXRKU09OLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hlZXQ7XG5cbmZ1bmN0aW9uIFNoZWV0KHNvdXJjZSwga2V5KSB7XG4gIHZhciBjb250ZW50LCBwYXRoO1xuICB2YXIgJHRoaXMgPSB0aGlzO1xuXG4gIHRoaXMubmFtZSA9IHNvdXJjZS5jb250ZW50LiR0O1xuICB0aGlzLmlkID0gc291cmNlLmxpbmtbc291cmNlLmxpbmsubGVuZ3RoIC0gMV0uaHJlZi5zcGxpdCgnLycpLnBvcCgpO1xuICB0aGlzLmZldGNoID0gZnVuY3Rpb24gKGNiKSB7XG4gICAgaWYgKGNvbnRlbnQpIHtcbiAgICAgIGNiKG51bGwsIGNvbnRlbnQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZldGNoKGVuZHBvaW50ICsgJy9mZWVkcy9saXN0LycgKyBrZXkgKyAnLycgKyAkdGhpcy5pZCArICcvcHVibGljL3ZhbHVlcz9hbHQ9anNvbicsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb250ZW50ID0gbGlzdChkYXRhKTtcbiAgICAgIGNiKG51bGwsIGNvbnRlbnQpO1xuICAgIH0pO1xuICB9O1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBbJyRzY29wZScsICckcm9vdFNjb3BlJywgJyRsb2NhdGlvbicsICckd2luZG93JywgJ2RiJywgaG9tZV07XG5cbmZ1bmN0aW9uIGhvbWUoJHNjb3BlLCAkcm9vdFNjb3BlLCAkbG9jYXRpb24sICR3aW5kb3csIGRiKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkYi5mZXRjaChmdW5jdGlvbiAoZXJyLCBtYXRjaGVzKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgICRzY29wZS5tYXRjaGVzID0gbWF0Y2hlcztcbiAgICAkc2NvcGUuJGFwcGx5KCk7XG4gIH0pO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIGhvbWU6IHJlcXVpcmUoJy4vaG9tZS5qcycpICBcbn07IiwidmFyIG9wZW4gPSByZXF1aXJlKCcuL29wZW4uanMnKTtcbnZhciBjb250ZW50O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChkb2NzKSB7XG4gIHJldHVybiB7XG4gICAgZmV0Y2g6IGZldGNoXG4gIH07XG5cbiAgZnVuY3Rpb24gZmV0Y2goY2IpIHtcbiAgICBpZiAoY29udGVudCkge1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgb3Blbihkb2NzLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGNiKGVycik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29udGVudCA9IGRhdGE7XG4gICAgICBjYihudWxsLCBkYXRhKTtcbiAgICB9KTtcbiAgfVxufTtcbiIsInZhciB0YWJsZSA9IHJlcXVpcmUoJ2dzeCcpO1xudmFyIGNvbnRyYSA9IHJlcXVpcmUoJ2NvbnRyYScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG9wZW47XG5cbmZ1bmN0aW9uIG9wZW4oZG9jcywgZG9uZSkge1xuICB2YXIgdGFza3MgPSBkb2NzLm1hcChmdW5jdGlvbiAoZG9jKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNiKSB7XG4gICAgICB0YWJsZShkb2MsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGNiKGVycik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY2IobnVsbCwgZGF0YS5zaGVldHMpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgY29udHJhLmNvbmN1cnJlbnQodGFza3MsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBkb25lKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZG9uZShudWxsLCByZXN1bHRzLnJlZHVjZShmdW5jdGlvbiAoeCwgeSkgeyByZXR1cm4geC5jb25jYXQoeSk7IH0sIFtdKSk7XG4gIH0pO1xufVxuIiwidmFyIGRvY3MgPSByZXF1aXJlKCcuLi9kb2NzLmpzb24nKTtcbnZhciBkYiA9IHJlcXVpcmUoJy4vZGInKShkb2NzKTtcbnZhciBiY2h6ID0gcmVxdWlyZSgnLi9tb2R1bGVzJykuYmNoejtcbnZhciBjb250cm9sbGVycyA9IHJlcXVpcmUoJy4vY29udHJvbGxlcnMnKTtcblxuYmNoei52YWx1ZSgnZGInLCBkYik7XG5iY2h6LmNvbnRyb2xsZXIoJ0hvbWVDdHJsJywgY29udHJvbGxlcnMuaG9tZSk7XG5cbmZ1bmN0aW9uIGluaXRpYWxpemUoZXJyLCBib29rKSB7XG4gIGlmIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgcmV0dXJuO1xuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdiY2h6JywgWyduZ1JvdXRlJ10pXG4gIC5jb25maWcoWyckcm91dGVQcm92aWRlcicsICckbG9jYXRpb25Qcm92aWRlcicsIGZ1bmN0aW9uICgkcm91dGVQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcblxuICAgICRyb3V0ZVByb3ZpZGVyXG4gICAgICAud2hlbignLycsIHsgY29udHJvbGxlcjogJ0hvbWVDdHJsJywgdGVtcGxhdGVVcmw6ICcvdmlld3MvaG9tZS5odG1sJyB9KVxuICAgICAgLndoZW4oJy9idXNxdWVkYScsIHsgY29udHJvbGxlcjogJ1BsYWNlU2VhcmNoQ3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL3NlYXJjaC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9saXN0YWRvJywgeyBjb250cm9sbGVyOiAnUGxhY2VMaXN0Q3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2xpc3QuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvbWFwYScsIHsgY29udHJvbGxlcjogJ01hcEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9zaXRlL21hcC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9jYW5jaGFzL2FncmVnYXInLCB7IGNvbnRyb2xsZXI6ICdQbGFjZUFkZEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9hZGQuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvY2FuY2hhcy9saXN0YWRvLzpzcG9ydCcsIHsgY29udHJvbGxlcjogJ1BsYWNlTGlzdEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9saXN0Lmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvbGlzdGFkbycsIHsgY29udHJvbGxlcjogJ1BsYWNlTGlzdEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9saXN0Lmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvOmlkJywgeyBjb250cm9sbGVyOiAnUGxhY2VEZXRhaWxDdHJsJywgcmVzb2x2ZToge1xuICAgICAgICBwbGFjZTogWyckcm91dGUnLCAnUGxhY2UnLCBmdW5jdGlvbiAoJHJvdXRlLCBQbGFjZSkge1xuICAgICAgICAgIHJldHVybiBQbGFjZS5nZXQoJHJvdXRlLmN1cnJlbnQucGFyYW1zKS4kcHJvbWlzZTtcbiAgICAgICAgfV1cbiAgICAgIH0sIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2RldGFpbC5odG1sJyB9KVxuICAgICAgLndoZW4oJy80MDQnLCB7IHRlbXBsYXRlVXJsOiAnL3NpdGUvNDA0Lmh0bWwnIH0pXG4gICAgICAub3RoZXJ3aXNlKHsgdGVtcGxhdGVVcmw6ICcvc2l0ZS80MDQuaHRtbCcgfSk7XG4gIH1dKTtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBiY2h6OiByZXF1aXJlKCcuL2JjaHouanMnKVxufTtcbiJdfQ==
