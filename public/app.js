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
      return cb(null, content);
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
var open = require('./open.js');

module.exports = {
  open: open
};

},{"./open.js":13}],13:[function(require,module,exports){
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

},{"contra":3,"gsx":5}],14:[function(require,module,exports){
var db = require('./db');
var docs = require('../docs.json');

db.open(docs, function (err, data) {
  console.log(data);
});

angular.module('ocampo', ['ngRoute'])
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

angular.module('ocampo').controller(
  'HomeCtrl',
  ['$scope', '$rootScope', '$location', '$window',
  function ($scope, $rootScope, $location, $window) {
    'use strict';
  }]);


},{"../docs.json":1,"./db":12}]},{},[14])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiZG9jcy5qc29uIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHByb2Nlc3NcXGJyb3dzZXIuanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcc3JjXFxjb250cmEuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxib29rLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcZW5kcG9pbnQuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxnZXRKU09OLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcbGlzdC5qcyIsIm5vZGVfbW9kdWxlc1xcZ3N4XFxzcmNcXG1haW4uanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxzaGVldC5qcyIsInNyY1xcZGJcXGluZGV4LmpzIiwic3JjXFxkYlxcb3Blbi5qcyIsInNyY1xcaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3T0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIm1vZHVsZS5leHBvcnRzPVtcImh0dHBzOi8vZG9jcy5nb29nbGUuY29tL3NwcmVhZHNoZWV0cy9kLzFMa1ZrYjNWRmp4QmY2SnB2VE9na2x6Y3dyOU9nVV84bjhmQnB5cWhWUzRVL3B1Ymh0bWxcIl0iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IHRydWU7XG4gICAgdmFyIGN1cnJlbnRRdWV1ZTtcbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgdmFyIGkgPSAtMTtcbiAgICAgICAgd2hpbGUgKCsraSA8IGxlbikge1xuICAgICAgICAgICAgY3VycmVudFF1ZXVlW2ldKCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xufVxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICBxdWV1ZS5wdXNoKGZ1bik7XG4gICAgaWYgKCFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9jb250cmEuanMnKTtcbiIsIihmdW5jdGlvbiAoT2JqZWN0LCByb290LCB1bmRlZmluZWQpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIHZhciB1bmRlZiA9ICcnICsgdW5kZWZpbmVkO1xuICB2YXIgU0VSSUFMID0gMTtcbiAgdmFyIENPTkNVUlJFTlQgPSBJbmZpbml0eTtcblxuICBmdW5jdGlvbiBub29wICgpIHt9XG4gIGZ1bmN0aW9uIGEgKG8pIHsgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKSA9PT0gJ1tvYmplY3QgQXJyYXldJzsgfVxuICBmdW5jdGlvbiBhdG9hIChhLCBuKSB7IHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhLCBuKTsgfVxuICBmdW5jdGlvbiBkZWJvdW5jZSAoZm4sIGFyZ3MsIGN0eCkgeyBpZiAoIWZuKSB7IHJldHVybjsgfSB0aWNrKGZ1bmN0aW9uIHJ1biAoKSB7IGZuLmFwcGx5KGN0eCB8fCBudWxsLCBhcmdzIHx8IFtdKTsgfSk7IH1cbiAgZnVuY3Rpb24gb25jZSAoZm4pIHtcbiAgICB2YXIgZGlzcG9zZWQ7XG4gICAgZnVuY3Rpb24gZGlzcG9zYWJsZSAoKSB7XG4gICAgICBpZiAoZGlzcG9zZWQpIHsgcmV0dXJuOyB9XG4gICAgICBkaXNwb3NlZCA9IHRydWU7XG4gICAgICAoZm4gfHwgbm9vcCkuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICB9XG4gICAgZGlzcG9zYWJsZS5kaXNjYXJkID0gZnVuY3Rpb24gKCkgeyBkaXNwb3NlZCA9IHRydWU7IH07XG4gICAgcmV0dXJuIGRpc3Bvc2FibGU7XG4gIH1cbiAgZnVuY3Rpb24gaGFuZGxlIChhcmdzLCBkb25lLCBkaXNwb3NhYmxlKSB7XG4gICAgdmFyIGVyciA9IGFyZ3Muc2hpZnQoKTtcbiAgICBpZiAoZXJyKSB7IGlmIChkaXNwb3NhYmxlKSB7IGRpc3Bvc2FibGUuZGlzY2FyZCgpOyB9IGRlYm91bmNlKGRvbmUsIFtlcnJdKTsgcmV0dXJuIHRydWU7IH1cbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIHRpY2tlclxuICB2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuICBpZiAoc2kpIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIHByb2Nlc3MgIT09IHVuZGVmICYmIHByb2Nlc3MubmV4dFRpY2spIHtcbiAgICB0aWNrID0gcHJvY2Vzcy5uZXh0VGljaztcbiAgfSBlbHNlIHtcbiAgICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX2N1cnJ5ICgpIHtcbiAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICB2YXIgbWV0aG9kID0gYXJncy5zaGlmdCgpO1xuICAgIHJldHVybiBmdW5jdGlvbiBjdXJyaWVkICgpIHtcbiAgICAgIHZhciBtb3JlID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgbWV0aG9kLmFwcGx5KG1ldGhvZCwgYXJncy5jb25jYXQobW9yZSkpO1xuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBfd2F0ZXJmYWxsIChzdGVwcywgZG9uZSkge1xuICAgIHZhciBkID0gb25jZShkb25lKTtcbiAgICBmdW5jdGlvbiBuZXh0ICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIHN0ZXAgPSBzdGVwcy5zaGlmdCgpO1xuICAgICAgaWYgKHN0ZXApIHtcbiAgICAgICAgaWYgKGhhbmRsZShhcmdzLCBkKSkgeyByZXR1cm47IH1cbiAgICAgICAgYXJncy5wdXNoKG9uY2UobmV4dCkpO1xuICAgICAgICBkZWJvdW5jZShzdGVwLCBhcmdzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYm91bmNlKGQsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgfVxuICAgIG5leHQoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9jb25jdXJyZW50ICh0YXNrcywgY29uY3VycmVuY3ksIGRvbmUpIHtcbiAgICBpZiAodHlwZW9mIGNvbmN1cnJlbmN5ID09PSAnZnVuY3Rpb24nKSB7IGRvbmUgPSBjb25jdXJyZW5jeTsgY29uY3VycmVuY3kgPSBDT05DVVJSRU5UOyB9XG4gICAgdmFyIGQgPSBvbmNlKGRvbmUpO1xuICAgIHZhciBxID0gX3F1ZXVlKHdvcmtlciwgY29uY3VycmVuY3kpO1xuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXModGFza3MpO1xuICAgIHZhciByZXN1bHRzID0gYSh0YXNrcykgPyBbXSA6IHt9O1xuICAgIHEudW5zaGlmdChrZXlzKTtcbiAgICBxLm9uKCdkcmFpbicsIGZ1bmN0aW9uIGNvbXBsZXRlZCAoKSB7IGQobnVsbCwgcmVzdWx0cyk7IH0pO1xuICAgIGZ1bmN0aW9uIHdvcmtlciAoa2V5LCBuZXh0KSB7XG4gICAgICBkZWJvdW5jZSh0YXNrc1trZXldLCBbcHJvY2VlZF0pO1xuICAgICAgZnVuY3Rpb24gcHJvY2VlZCAoKSB7XG4gICAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgICBpZiAoaGFuZGxlKGFyZ3MsIGQpKSB7IHJldHVybjsgfVxuICAgICAgICByZXN1bHRzW2tleV0gPSBhcmdzLnNoaWZ0KCk7XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBfc2VyaWVzICh0YXNrcywgZG9uZSkge1xuICAgIF9jb25jdXJyZW50KHRhc2tzLCBTRVJJQUwsIGRvbmUpO1xuICB9XG5cbiAgZnVuY3Rpb24gX21hcCAoY2FwLCB0aGVuLCBhdHRhY2hlZCkge1xuICAgIHZhciBtYXAgPSBmdW5jdGlvbiAoY29sbGVjdGlvbiwgY29uY3VycmVuY3ksIGl0ZXJhdG9yLCBkb25lKSB7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMikgeyBpdGVyYXRvciA9IGNvbmN1cnJlbmN5OyBjb25jdXJyZW5jeSA9IENPTkNVUlJFTlQ7IH1cbiAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMyAmJiB0eXBlb2YgY29uY3VycmVuY3kgIT09ICdudW1iZXInKSB7IGRvbmUgPSBpdGVyYXRvcjsgaXRlcmF0b3IgPSBjb25jdXJyZW5jeTsgY29uY3VycmVuY3kgPSBDT05DVVJSRU5UOyB9XG4gICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGNvbGxlY3Rpb24pO1xuICAgICAgdmFyIHRhc2tzID0gYShjb2xsZWN0aW9uKSA/IFtdIDoge307XG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gaW5zZXJ0IChrZXkpIHtcbiAgICAgICAgdGFza3Nba2V5XSA9IGZ1bmN0aW9uIGl0ZXJhdGUgKGNiKSB7XG4gICAgICAgICAgaWYgKGl0ZXJhdG9yLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgaXRlcmF0b3IoY29sbGVjdGlvbltrZXldLCBrZXksIGNiKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaXRlcmF0b3IoY29sbGVjdGlvbltrZXldLCBjYik7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBfY29uY3VycmVudCh0YXNrcywgY2FwIHx8IGNvbmN1cnJlbmN5LCB0aGVuID8gdGhlbihjb2xsZWN0aW9uLCBvbmNlKGRvbmUpKSA6IGRvbmUpO1xuICAgIH07XG4gICAgaWYgKCFhdHRhY2hlZCkgeyBtYXAuc2VyaWVzID0gX21hcChTRVJJQUwsIHRoZW4sIHRydWUpOyB9XG4gICAgcmV0dXJuIG1hcDtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9lYWNoIChjb25jdXJyZW5jeSkge1xuICAgIHJldHVybiBfbWFwKGNvbmN1cnJlbmN5LCB0aGVuKTtcbiAgICBmdW5jdGlvbiB0aGVuIChjb2xsZWN0aW9uLCBkb25lKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gbWFzayAoZXJyKSB7XG4gICAgICAgIGRvbmUoZXJyKTsgLy8gb25seSByZXR1cm4gdGhlIGVycm9yLCBubyBtb3JlIGFyZ3VtZW50c1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBfZmlsdGVyIChjb25jdXJyZW5jeSkge1xuICAgIHJldHVybiBfbWFwKGNvbmN1cnJlbmN5LCB0aGVuKTtcbiAgICBmdW5jdGlvbiB0aGVuIChjb2xsZWN0aW9uLCBkb25lKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gZmlsdGVyIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgZnVuY3Rpb24gZXhpc3RzIChpdGVtLCBrZXkpIHtcbiAgICAgICAgICByZXR1cm4gISFyZXN1bHRzW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gb2ZpbHRlciAoKSB7XG4gICAgICAgICAgdmFyIGZpbHRlcmVkID0ge307XG4gICAgICAgICAgT2JqZWN0LmtleXMoY29sbGVjdGlvbikuZm9yRWFjaChmdW5jdGlvbiBvbWFwcGVyIChrZXkpIHtcbiAgICAgICAgICAgIGlmIChleGlzdHMobnVsbCwga2V5KSkgeyBmaWx0ZXJlZFtrZXldID0gY29sbGVjdGlvbltrZXldOyB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuIGZpbHRlcmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlcnIpIHsgZG9uZShlcnIpOyByZXR1cm47IH1cbiAgICAgICAgZG9uZShudWxsLCBhKHJlc3VsdHMpID8gY29sbGVjdGlvbi5maWx0ZXIoZXhpc3RzKSA6IG9maWx0ZXIoKSk7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIF9lbWl0dGVyICh0aGluZywgb3B0aW9ucykge1xuICAgIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgZXZ0ID0ge307XG4gICAgaWYgKHRoaW5nID09PSB1bmRlZmluZWQpIHsgdGhpbmcgPSB7fTsgfVxuICAgIHRoaW5nLm9uID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBpZiAoIWV2dFt0eXBlXSkge1xuICAgICAgICBldnRbdHlwZV0gPSBbZm5dO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXZ0W3R5cGVdLnB1c2goZm4pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgdGhpbmcub25jZSA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgZm4uX29uY2UgPSB0cnVlOyAvLyB0aGluZy5vZmYoZm4pIHN0aWxsIHdvcmtzIVxuICAgICAgdGhpbmcub24odHlwZSwgZm4pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgdGhpbmcub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAoYyA9PT0gMSkge1xuICAgICAgICBkZWxldGUgZXZ0W3R5cGVdO1xuICAgICAgfSBlbHNlIGlmIChjID09PSAwKSB7XG4gICAgICAgIGV2dCA9IHt9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgICBldC5zcGxpY2UoZXQuaW5kZXhPZihmbiksIDEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gICAgdGhpbmcuZW1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdChhcmdzLnNoaWZ0KCkpLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH07XG4gICAgdGhpbmcuZW1pdHRlclNuYXBzaG90ID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIHZhciBldCA9IChldnRbdHlwZV0gfHwgW10pLnNsaWNlKDApO1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICAgIHZhciBjdHggPSB0aGlzIHx8IHRoaW5nO1xuICAgICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0Lmxlbmd0aCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICAgIGV2dFt0eXBlXSA9IGV0LmZpbHRlcihmdW5jdGlvbiBlbWl0dGVyIChsaXN0ZW4pIHtcbiAgICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpbmc7XG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH1cblxuICBmdW5jdGlvbiBfcXVldWUgKHdvcmtlciwgY29uY3VycmVuY3kpIHtcbiAgICB2YXIgcSA9IFtdLCBsb2FkID0gMCwgbWF4ID0gY29uY3VycmVuY3kgfHwgMSwgcGF1c2VkO1xuICAgIHZhciBxcSA9IF9lbWl0dGVyKHtcbiAgICAgIHB1c2g6IG1hbmlwdWxhdGUuYmluZChudWxsLCAncHVzaCcpLFxuICAgICAgdW5zaGlmdDogbWFuaXB1bGF0ZS5iaW5kKG51bGwsICd1bnNoaWZ0JyksXG4gICAgICBwYXVzZTogZnVuY3Rpb24gKCkgeyBwYXVzZWQgPSB0cnVlOyB9LFxuICAgICAgcmVzdW1lOiBmdW5jdGlvbiAoKSB7IHBhdXNlZCA9IGZhbHNlOyBkZWJvdW5jZShsYWJvcik7IH0sXG4gICAgICBwZW5kaW5nOiBxXG4gICAgfSk7XG4gICAgaWYgKE9iamVjdC5kZWZpbmVQcm9wZXJ0eSAmJiAhT2JqZWN0LmRlZmluZVByb3BlcnR5UGFydGlhbCkge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHFxLCAnbGVuZ3RoJywgeyBnZXQ6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHEubGVuZ3RoOyB9IH0pO1xuICAgIH1cbiAgICBmdW5jdGlvbiBtYW5pcHVsYXRlIChob3csIHRhc2ssIGRvbmUpIHtcbiAgICAgIHZhciB0YXNrcyA9IGEodGFzaykgPyB0YXNrIDogW3Rhc2tdO1xuICAgICAgdGFza3MuZm9yRWFjaChmdW5jdGlvbiBpbnNlcnQgKHQpIHsgcVtob3ddKHsgdDogdCwgZG9uZTogZG9uZSB9KTsgfSk7XG4gICAgICBkZWJvdW5jZShsYWJvcik7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGxhYm9yICgpIHtcbiAgICAgIGlmIChwYXVzZWQgfHwgbG9hZCA+PSBtYXgpIHsgcmV0dXJuOyB9XG4gICAgICBpZiAoIXEubGVuZ3RoKSB7IGlmIChsb2FkID09PSAwKSB7IHFxLmVtaXQoJ2RyYWluJyk7IH0gcmV0dXJuOyB9XG4gICAgICBsb2FkKys7XG4gICAgICB2YXIgam9iID0gcS5wb3AoKTtcbiAgICAgIHdvcmtlcihqb2IudCwgb25jZShjb21wbGV0ZS5iaW5kKG51bGwsIGpvYikpKTtcbiAgICAgIGRlYm91bmNlKGxhYm9yKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gY29tcGxldGUgKGpvYikge1xuICAgICAgbG9hZC0tO1xuICAgICAgZGVib3VuY2Uoam9iLmRvbmUsIGF0b2EoYXJndW1lbnRzLCAxKSk7XG4gICAgICBkZWJvdW5jZShsYWJvcik7XG4gICAgfVxuICAgIHJldHVybiBxcTtcbiAgfVxuXG4gIHZhciBjb250cmEgPSB7XG4gICAgY3Vycnk6IF9jdXJyeSxcbiAgICBjb25jdXJyZW50OiBfY29uY3VycmVudCxcbiAgICBzZXJpZXM6IF9zZXJpZXMsXG4gICAgd2F0ZXJmYWxsOiBfd2F0ZXJmYWxsLFxuICAgIGVhY2g6IF9lYWNoKCksXG4gICAgbWFwOiBfbWFwKCksXG4gICAgZmlsdGVyOiBfZmlsdGVyKCksXG4gICAgcXVldWU6IF9xdWV1ZSxcbiAgICBlbWl0dGVyOiBfZW1pdHRlclxuICB9O1xuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGNvbnRyYTtcbiAgfSBlbHNlIHtcbiAgICByb290LmNvbnRyYSA9IGNvbnRyYTtcbiAgfVxufSkoT2JqZWN0LCB0aGlzKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvbWFpbi5qcycpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgU2hlZXQgPSByZXF1aXJlKCcuL3NoZWV0LmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gQm9vaztcblxuZnVuY3Rpb24gQm9vayhzb3VyY2UsIGtleSkge1xuICB0aGlzLnNoZWV0cyA9IHNvdXJjZS5mZWVkLmVudHJ5Lm1hcChmdW5jdGlvbiAoc2hlZXQpIHtcbiAgICByZXR1cm4gbmV3IFNoZWV0KHNoZWV0LCBrZXkpO1xuICB9KTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSAnaHR0cHM6Ly9zcHJlYWRzaGVldHMuZ29vZ2xlLmNvbSc7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZ2V0SlNPTjtcblxuZnVuY3Rpb24gZ2V0SlNPTihwYXRoLCBjYikge1xuICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gIHZhciBqc29uO1xuXG4gIHhoci5vcGVuKCdHRVQnLCBwYXRoKTtcbiAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh4aHIucmVhZHlTdGF0ZSAhPT0gNCB8fCB4aHIuc3RhdHVzICE9PSAyMDApIHtcbiAgICAgIGNiKHhocik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGpzb24gPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNiKHhocik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2IobnVsbCwganNvbik7XG4gIH07XG4gIHhoci5zZW5kKCk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gbGlzdDtcblxuZnVuY3Rpb24gbGlzdChzb3VyY2UpIHtcbiAgcmV0dXJuIHNvdXJjZS5mZWVkLmVudHJ5Lm1hcChmdW5jdGlvbiAoZW50cnkpIHtcbiAgICB2YXIgb2JqID0ge307XG5cbiAgICBPYmplY3Qua2V5cyhlbnRyeSkuZmlsdGVyKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIHJldHVybiAvZ3N4XFwkLy50ZXN0KGtleSk7XG4gICAgfSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBvYmpba2V5LnN1YnN0cmluZyg0KV0gPSBlbnRyeVtrZXldLiR0O1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIG9iajtcbiAgfSk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBmZXRjaCA9IHJlcXVpcmUoJy4vZ2V0SlNPTi5qcycpO1xudmFyIEJvb2sgPSByZXF1aXJlKCcuL2Jvb2suanMnKTtcbnZhciBlbmRwb2ludCA9IHJlcXVpcmUoJy4vZW5kcG9pbnQuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBpbml0O1xuXG5mdW5jdGlvbiBpbml0KGtleSwgY2IpIHtcbiAgaWYoL2tleT0vLnRlc3Qoa2V5KSkge1xuICAgIGtleSA9IGtleS5tYXRjaCgna2V5PSguKj8pKCZ8I3wkKScpWzFdO1xuICB9XG5cbiAgaWYoL3B1Ymh0bWwvLnRlc3Qoa2V5KSkge1xuICAgIGtleSA9IGtleS5tYXRjaCgnZFxcXFwvKC4qPylcXFxcL3B1Ymh0bWwnKVsxXTtcbiAgfVxuXG4gIGZldGNoKGVuZHBvaW50ICsgJy9mZWVkcy93b3Jrc2hlZXRzLycgKyBrZXkgKyAnL3B1YmxpYy9iYXNpYz9hbHQ9anNvbicsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBjYihlcnIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNiKG51bGwsIG5ldyBCb29rKGRhdGEsIGtleSkpO1xuICB9KTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGxpc3QgPSByZXF1aXJlKCcuL2xpc3QuanMnKTtcbnZhciBlbmRwb2ludCA9IHJlcXVpcmUoJy4vZW5kcG9pbnQuanMnKTtcbnZhciBmZXRjaCA9IHJlcXVpcmUoJy4vZ2V0SlNPTi5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNoZWV0O1xuXG5mdW5jdGlvbiBTaGVldChzb3VyY2UsIGtleSkge1xuICB2YXIgY29udGVudCwgcGF0aDtcbiAgdmFyICR0aGlzID0gdGhpcztcblxuICB0aGlzLm5hbWUgPSBzb3VyY2UuY29udGVudC4kdDtcbiAgdGhpcy5pZCA9IHNvdXJjZS5saW5rW3NvdXJjZS5saW5rLmxlbmd0aCAtIDFdLmhyZWYuc3BsaXQoJy8nKS5wb3AoKTtcbiAgdGhpcy5mZXRjaCA9IGZ1bmN0aW9uIChjYikge1xuICAgIGlmIChjb250ZW50KSB7XG4gICAgICByZXR1cm4gY2IobnVsbCwgY29udGVudCk7XG4gICAgfVxuXG4gICAgZmV0Y2goZW5kcG9pbnQgKyAnL2ZlZWRzL2xpc3QvJyArIGtleSArICcvJyArICR0aGlzLmlkICsgJy9wdWJsaWMvdmFsdWVzP2FsdD1qc29uJywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjYihlcnIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnRlbnQgPSBsaXN0KGRhdGEpO1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgfSk7XG4gIH07XG59XG4iLCJ2YXIgb3BlbiA9IHJlcXVpcmUoJy4vb3Blbi5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgb3Blbjogb3BlblxufTtcbiIsInZhciB0YWJsZSA9IHJlcXVpcmUoJ2dzeCcpO1xudmFyIGNvbnRyYSA9IHJlcXVpcmUoJ2NvbnRyYScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG9wZW47XG5cbmZ1bmN0aW9uIG9wZW4oZG9jcywgZG9uZSkge1xuICB2YXIgdGFza3MgPSBkb2NzLm1hcChmdW5jdGlvbiAoZG9jKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGNiKSB7XG4gICAgICB0YWJsZShkb2MsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIGNiKGVycik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY2IobnVsbCwgZGF0YS5zaGVldHMpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgY29udHJhLmNvbmN1cnJlbnQodGFza3MsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBkb25lKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZG9uZShudWxsLCByZXN1bHRzLnJlZHVjZShmdW5jdGlvbiAoeCwgeSkgeyByZXR1cm4geC5jb25jYXQoeSk7IH0sIFtdKSk7XG4gIH0pO1xufVxuIiwidmFyIGRiID0gcmVxdWlyZSgnLi9kYicpO1xudmFyIGRvY3MgPSByZXF1aXJlKCcuLi9kb2NzLmpzb24nKTtcblxuZGIub3Blbihkb2NzLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gIGNvbnNvbGUubG9nKGRhdGEpO1xufSk7XG5cbmFuZ3VsYXIubW9kdWxlKCdvY2FtcG8nLCBbJ25nUm91dGUnXSlcbiAgLmNvbmZpZyhbJyRyb3V0ZVByb3ZpZGVyJywgJyRsb2NhdGlvblByb3ZpZGVyJywgZnVuY3Rpb24gKCRyb3V0ZVByb3ZpZGVyLCAkbG9jYXRpb25Qcm92aWRlcikge1xuXG4gICAgJHJvdXRlUHJvdmlkZXJcbiAgICAgIC53aGVuKCcvJywgeyBjb250cm9sbGVyOiAnSG9tZUN0cmwnLCB0ZW1wbGF0ZVVybDogJy92aWV3cy9ob21lLmh0bWwnIH0pXG4gICAgICAud2hlbignL2J1c3F1ZWRhJywgeyBjb250cm9sbGVyOiAnUGxhY2VTZWFyY2hDdHJsJywgdGVtcGxhdGVVcmw6ICcvcGxhY2Uvc2VhcmNoLmh0bWwnIH0pXG4gICAgICAud2hlbignL2xpc3RhZG8nLCB7IGNvbnRyb2xsZXI6ICdQbGFjZUxpc3RDdHJsJywgdGVtcGxhdGVVcmw6ICcvcGxhY2UvbGlzdC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9tYXBhJywgeyBjb250cm9sbGVyOiAnTWFwQ3RybCcsIHRlbXBsYXRlVXJsOiAnL3NpdGUvbWFwLmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvYWdyZWdhcicsIHsgY29udHJvbGxlcjogJ1BsYWNlQWRkQ3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2FkZC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9jYW5jaGFzL2xpc3RhZG8vOnNwb3J0JywgeyBjb250cm9sbGVyOiAnUGxhY2VMaXN0Q3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2xpc3QuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvY2FuY2hhcy9saXN0YWRvJywgeyBjb250cm9sbGVyOiAnUGxhY2VMaXN0Q3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2xpc3QuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvY2FuY2hhcy86aWQnLCB7IGNvbnRyb2xsZXI6ICdQbGFjZURldGFpbEN0cmwnLCByZXNvbHZlOiB7XG4gICAgICAgIHBsYWNlOiBbJyRyb3V0ZScsICdQbGFjZScsIGZ1bmN0aW9uICgkcm91dGUsIFBsYWNlKSB7XG4gICAgICAgICAgcmV0dXJuIFBsYWNlLmdldCgkcm91dGUuY3VycmVudC5wYXJhbXMpLiRwcm9taXNlO1xuICAgICAgICB9XVxuICAgICAgfSwgdGVtcGxhdGVVcmw6ICcvcGxhY2UvZGV0YWlsLmh0bWwnIH0pXG4gICAgICAud2hlbignLzQwNCcsIHsgdGVtcGxhdGVVcmw6ICcvc2l0ZS80MDQuaHRtbCcgfSlcbiAgICAgIC5vdGhlcndpc2UoeyB0ZW1wbGF0ZVVybDogJy9zaXRlLzQwNC5odG1sJyB9KTtcbiAgfV0pO1xuXG5hbmd1bGFyLm1vZHVsZSgnb2NhbXBvJykuY29udHJvbGxlcihcbiAgJ0hvbWVDdHJsJyxcbiAgWyckc2NvcGUnLCAnJHJvb3RTY29wZScsICckbG9jYXRpb24nLCAnJHdpbmRvdycsXG4gIGZ1bmN0aW9uICgkc2NvcGUsICRyb290U2NvcGUsICRsb2NhdGlvbiwgJHdpbmRvdykge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgfV0pO1xuXG4iXX0=
