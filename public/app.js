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
    $scope.matches.forEach(function (match) {
      match.fetch(function (err, data) {
        $scope.$apply();
      });
    });
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
var transform = require('./transform.js');

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

    done(null, transform(results));
  });
}

},{"./transform.js":16,"contra":3,"gsx":5}],16:[function(require,module,exports){
module.exports = transform;

function transform(results) {
  return results
    .reduce(function (x, y) { return x.concat(y); }, [])
    .map(function (match) {
      return {
        id: match.id,
        name: match.name,
        fetch: function (cb) {
          var self = this;

          if (self.list) {
            cb(null, self.list);
            return;
          }

          match.fetch(function (err, data) {
            if (err) {
              cb(err);
              return;
            }

            self.players = data.map(function (player) {
              return {
                name: player.jugador,
                assists: +player.asistencias,
                goal: +player.jugada,
                headed: +player.cabeza,
                own: +player.encontra,
                freeKick: +player.tirolibre,
                penalty: +player.penal,
                team: player.equipo
              };
            });

            cb(null, self.list);
          });
        }
      };
    });
}

},{}],17:[function(require,module,exports){
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

},{"../docs.json":1,"./controllers":13,"./db":14,"./modules":19}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
module.exports = {
  bchz: require('./bchz.js')
};

},{"./bchz.js":18}]},{},[17])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiZG9jcy5qc29uIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHByb2Nlc3NcXGJyb3dzZXIuanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcc3JjXFxjb250cmEuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxib29rLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcZW5kcG9pbnQuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxnZXRKU09OLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcbGlzdC5qcyIsIm5vZGVfbW9kdWxlc1xcZ3N4XFxzcmNcXG1haW4uanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxzaGVldC5qcyIsInNyY1xcY29udHJvbGxlcnNcXGhvbWUuanMiLCJzcmNcXGNvbnRyb2xsZXJzXFxpbmRleC5qcyIsInNyY1xcZGJcXGluZGV4LmpzIiwic3JjXFxkYlxcb3Blbi5qcyIsInNyY1xcZGJcXHRyYW5zZm9ybS5qcyIsInNyY1xcaW5kZXguanMiLCJzcmNcXG1vZHVsZXNcXGJjaHouanMiLCJzcmNcXG1vZHVsZXNcXGluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekRBO0FBQ0E7OztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDN09BO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBOztBQ0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cz1bXCJodHRwczovL2RvY3MuZ29vZ2xlLmNvbS9zcHJlYWRzaGVldHMvZC8xTGtWa2IzVkZqeEJmNkpwdlRPZ2tsemN3cjlPZ1VfOG44ZkJweXFoVlM0VS9wdWJodG1sXCJdIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuICAgIHZhciBjdXJyZW50UXVldWU7XG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHZhciBpID0gLTE7XG4gICAgICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtpXSgpO1xuICAgICAgICB9XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbn1cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgcXVldWUucHVzaChmdW4pO1xuICAgIGlmICghZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvY29udHJhLmpzJyk7XG4iLCIoZnVuY3Rpb24gKE9iamVjdCwgcm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgdmFyIFNFUklBTCA9IDE7XG4gIHZhciBDT05DVVJSRU5UID0gSW5maW5pdHk7XG5cbiAgZnVuY3Rpb24gbm9vcCAoKSB7fVxuICBmdW5jdGlvbiBhIChvKSB7IHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykgPT09ICdbb2JqZWN0IEFycmF5XSc7IH1cbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG4gIGZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gICAgdmFyIGRpc3Bvc2VkO1xuICAgIGZ1bmN0aW9uIGRpc3Bvc2FibGUgKCkge1xuICAgICAgaWYgKGRpc3Bvc2VkKSB7IHJldHVybjsgfVxuICAgICAgZGlzcG9zZWQgPSB0cnVlO1xuICAgICAgKGZuIHx8IG5vb3ApLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIGRpc3Bvc2FibGUuZGlzY2FyZCA9IGZ1bmN0aW9uICgpIHsgZGlzcG9zZWQgPSB0cnVlOyB9O1xuICAgIHJldHVybiBkaXNwb3NhYmxlO1xuICB9XG4gIGZ1bmN0aW9uIGhhbmRsZSAoYXJncywgZG9uZSwgZGlzcG9zYWJsZSkge1xuICAgIHZhciBlcnIgPSBhcmdzLnNoaWZ0KCk7XG4gICAgaWYgKGVycikgeyBpZiAoZGlzcG9zYWJsZSkgeyBkaXNwb3NhYmxlLmRpc2NhcmQoKTsgfSBkZWJvdW5jZShkb25lLCBbZXJyXSk7IHJldHVybiB0cnVlOyB9XG4gIH1cblxuICAvLyBjcm9zcy1wbGF0Zm9ybSB0aWNrZXJcbiAgdmFyIHNpID0gdHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJywgdGljaztcbiAgaWYgKHNpKSB7XG4gICAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRJbW1lZGlhdGUoZm4pOyB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9jZXNzICE9PSB1bmRlZiAmJiBwcm9jZXNzLm5leHRUaWNrKSB7XG4gICAgdGljayA9IHByb2Nlc3MubmV4dFRpY2s7XG4gIH0gZWxzZSB7XG4gICAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRUaW1lb3V0KGZuLCAwKTsgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9jdXJyeSAoKSB7XG4gICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgdmFyIG1ldGhvZCA9IGFyZ3Muc2hpZnQoKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gY3VycmllZCAoKSB7XG4gICAgICB2YXIgbW9yZSA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIG1ldGhvZC5hcHBseShtZXRob2QsIGFyZ3MuY29uY2F0KG1vcmUpKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX3dhdGVyZmFsbCAoc3RlcHMsIGRvbmUpIHtcbiAgICB2YXIgZCA9IG9uY2UoZG9uZSk7XG4gICAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciBzdGVwID0gc3RlcHMuc2hpZnQoKTtcbiAgICAgIGlmIChzdGVwKSB7XG4gICAgICAgIGlmIChoYW5kbGUoYXJncywgZCkpIHsgcmV0dXJuOyB9XG4gICAgICAgIGFyZ3MucHVzaChvbmNlKG5leHQpKTtcbiAgICAgICAgZGVib3VuY2Uoc3RlcCwgYXJncyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJvdW5jZShkLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH1cbiAgICBuZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBfY29uY3VycmVudCAodGFza3MsIGNvbmN1cnJlbmN5LCBkb25lKSB7XG4gICAgaWYgKHR5cGVvZiBjb25jdXJyZW5jeSA9PT0gJ2Z1bmN0aW9uJykgeyBkb25lID0gY29uY3VycmVuY3k7IGNvbmN1cnJlbmN5ID0gQ09OQ1VSUkVOVDsgfVxuICAgIHZhciBkID0gb25jZShkb25lKTtcbiAgICB2YXIgcSA9IF9xdWV1ZSh3b3JrZXIsIGNvbmN1cnJlbmN5KTtcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHRhc2tzKTtcbiAgICB2YXIgcmVzdWx0cyA9IGEodGFza3MpID8gW10gOiB7fTtcbiAgICBxLnVuc2hpZnQoa2V5cyk7XG4gICAgcS5vbignZHJhaW4nLCBmdW5jdGlvbiBjb21wbGV0ZWQgKCkgeyBkKG51bGwsIHJlc3VsdHMpOyB9KTtcbiAgICBmdW5jdGlvbiB3b3JrZXIgKGtleSwgbmV4dCkge1xuICAgICAgZGVib3VuY2UodGFza3Nba2V5XSwgW3Byb2NlZWRdKTtcbiAgICAgIGZ1bmN0aW9uIHByb2NlZWQgKCkge1xuICAgICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgICAgaWYgKGhhbmRsZShhcmdzLCBkKSkgeyByZXR1cm47IH1cbiAgICAgICAgcmVzdWx0c1trZXldID0gYXJncy5zaGlmdCgpO1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gX3NlcmllcyAodGFza3MsIGRvbmUpIHtcbiAgICBfY29uY3VycmVudCh0YXNrcywgU0VSSUFMLCBkb25lKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9tYXAgKGNhcCwgdGhlbiwgYXR0YWNoZWQpIHtcbiAgICB2YXIgbWFwID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIGNvbmN1cnJlbmN5LCBpdGVyYXRvciwgZG9uZSkge1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBpZiAoYXJncy5sZW5ndGggPT09IDIpIHsgaXRlcmF0b3IgPSBjb25jdXJyZW5jeTsgY29uY3VycmVuY3kgPSBDT05DVVJSRU5UOyB9XG4gICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMgJiYgdHlwZW9mIGNvbmN1cnJlbmN5ICE9PSAnbnVtYmVyJykgeyBkb25lID0gaXRlcmF0b3I7IGl0ZXJhdG9yID0gY29uY3VycmVuY3k7IGNvbmN1cnJlbmN5ID0gQ09OQ1VSUkVOVDsgfVxuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjb2xsZWN0aW9uKTtcbiAgICAgIHZhciB0YXNrcyA9IGEoY29sbGVjdGlvbikgPyBbXSA6IHt9O1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIGluc2VydCAoa2V5KSB7XG4gICAgICAgIHRhc2tzW2tleV0gPSBmdW5jdGlvbiBpdGVyYXRlIChjYikge1xuICAgICAgICAgIGlmIChpdGVyYXRvci5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGNvbGxlY3Rpb25ba2V5XSwga2V5LCBjYik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGNvbGxlY3Rpb25ba2V5XSwgY2IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgX2NvbmN1cnJlbnQodGFza3MsIGNhcCB8fCBjb25jdXJyZW5jeSwgdGhlbiA/IHRoZW4oY29sbGVjdGlvbiwgb25jZShkb25lKSkgOiBkb25lKTtcbiAgICB9O1xuICAgIGlmICghYXR0YWNoZWQpIHsgbWFwLnNlcmllcyA9IF9tYXAoU0VSSUFMLCB0aGVuLCB0cnVlKTsgfVxuICAgIHJldHVybiBtYXA7XG4gIH1cblxuICBmdW5jdGlvbiBfZWFjaCAoY29uY3VycmVuY3kpIHtcbiAgICByZXR1cm4gX21hcChjb25jdXJyZW5jeSwgdGhlbik7XG4gICAgZnVuY3Rpb24gdGhlbiAoY29sbGVjdGlvbiwgZG9uZSkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIG1hc2sgKGVycikge1xuICAgICAgICBkb25lKGVycik7IC8vIG9ubHkgcmV0dXJuIHRoZSBlcnJvciwgbm8gbW9yZSBhcmd1bWVudHNcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gX2ZpbHRlciAoY29uY3VycmVuY3kpIHtcbiAgICByZXR1cm4gX21hcChjb25jdXJyZW5jeSwgdGhlbik7XG4gICAgZnVuY3Rpb24gdGhlbiAoY29sbGVjdGlvbiwgZG9uZSkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIGZpbHRlciAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIGZ1bmN0aW9uIGV4aXN0cyAoaXRlbSwga2V5KSB7XG4gICAgICAgICAgcmV0dXJuICEhcmVzdWx0c1trZXldO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIG9maWx0ZXIgKCkge1xuICAgICAgICAgIHZhciBmaWx0ZXJlZCA9IHt9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKGNvbGxlY3Rpb24pLmZvckVhY2goZnVuY3Rpb24gb21hcHBlciAoa2V5KSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RzKG51bGwsIGtleSkpIHsgZmlsdGVyZWRba2V5XSA9IGNvbGxlY3Rpb25ba2V5XTsgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBmaWx0ZXJlZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXJyKSB7IGRvbmUoZXJyKTsgcmV0dXJuOyB9XG4gICAgICAgIGRvbmUobnVsbCwgYShyZXN1bHRzKSA/IGNvbGxlY3Rpb24uZmlsdGVyKGV4aXN0cykgOiBvZmlsdGVyKCkpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiB0aGluZy5lbWl0dGVyU25hcHNob3QoYXJncy5zaGlmdCgpKS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9O1xuICAgIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdCA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICB2YXIgZXQgPSAoZXZ0W3R5cGVdIHx8IFtdKS5zbGljZSgwKTtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgICB2YXIgY3R4ID0gdGhpcyB8fCB0aGluZztcbiAgICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldC5sZW5ndGgpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCBjdHgpOyB9IGVsc2UgeyBsaXN0ZW4uYXBwbHkoY3R4LCBhcmdzKTsgfVxuICAgICAgICAgIHJldHVybiAhbGlzdGVuLl9vbmNlO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaW5nO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gX3F1ZXVlICh3b3JrZXIsIGNvbmN1cnJlbmN5KSB7XG4gICAgdmFyIHEgPSBbXSwgbG9hZCA9IDAsIG1heCA9IGNvbmN1cnJlbmN5IHx8IDEsIHBhdXNlZDtcbiAgICB2YXIgcXEgPSBfZW1pdHRlcih7XG4gICAgICBwdXNoOiBtYW5pcHVsYXRlLmJpbmQobnVsbCwgJ3B1c2gnKSxcbiAgICAgIHVuc2hpZnQ6IG1hbmlwdWxhdGUuYmluZChudWxsLCAndW5zaGlmdCcpLFxuICAgICAgcGF1c2U6IGZ1bmN0aW9uICgpIHsgcGF1c2VkID0gdHJ1ZTsgfSxcbiAgICAgIHJlc3VtZTogZnVuY3Rpb24gKCkgeyBwYXVzZWQgPSBmYWxzZTsgZGVib3VuY2UobGFib3IpOyB9LFxuICAgICAgcGVuZGluZzogcVxuICAgIH0pO1xuICAgIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkgJiYgIU9iamVjdC5kZWZpbmVQcm9wZXJ0eVBhcnRpYWwpIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShxcSwgJ2xlbmd0aCcsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiBxLmxlbmd0aDsgfSB9KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gbWFuaXB1bGF0ZSAoaG93LCB0YXNrLCBkb25lKSB7XG4gICAgICB2YXIgdGFza3MgPSBhKHRhc2spID8gdGFzayA6IFt0YXNrXTtcbiAgICAgIHRhc2tzLmZvckVhY2goZnVuY3Rpb24gaW5zZXJ0ICh0KSB7IHFbaG93XSh7IHQ6IHQsIGRvbmU6IGRvbmUgfSk7IH0pO1xuICAgICAgZGVib3VuY2UobGFib3IpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBsYWJvciAoKSB7XG4gICAgICBpZiAocGF1c2VkIHx8IGxvYWQgPj0gbWF4KSB7IHJldHVybjsgfVxuICAgICAgaWYgKCFxLmxlbmd0aCkgeyBpZiAobG9hZCA9PT0gMCkgeyBxcS5lbWl0KCdkcmFpbicpOyB9IHJldHVybjsgfVxuICAgICAgbG9hZCsrO1xuICAgICAgdmFyIGpvYiA9IHEucG9wKCk7XG4gICAgICB3b3JrZXIoam9iLnQsIG9uY2UoY29tcGxldGUuYmluZChudWxsLCBqb2IpKSk7XG4gICAgICBkZWJvdW5jZShsYWJvcik7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNvbXBsZXRlIChqb2IpIHtcbiAgICAgIGxvYWQtLTtcbiAgICAgIGRlYm91bmNlKGpvYi5kb25lLCBhdG9hKGFyZ3VtZW50cywgMSkpO1xuICAgICAgZGVib3VuY2UobGFib3IpO1xuICAgIH1cbiAgICByZXR1cm4gcXE7XG4gIH1cblxuICB2YXIgY29udHJhID0ge1xuICAgIGN1cnJ5OiBfY3VycnksXG4gICAgY29uY3VycmVudDogX2NvbmN1cnJlbnQsXG4gICAgc2VyaWVzOiBfc2VyaWVzLFxuICAgIHdhdGVyZmFsbDogX3dhdGVyZmFsbCxcbiAgICBlYWNoOiBfZWFjaCgpLFxuICAgIG1hcDogX21hcCgpLFxuICAgIGZpbHRlcjogX2ZpbHRlcigpLFxuICAgIHF1ZXVlOiBfcXVldWUsXG4gICAgZW1pdHRlcjogX2VtaXR0ZXJcbiAgfTtcblxuICAvLyBjcm9zcy1wbGF0Zm9ybSBleHBvcnRcbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09IHVuZGVmICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBjb250cmE7XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5jb250cmEgPSBjb250cmE7XG4gIH1cbn0pKE9iamVjdCwgdGhpcyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vc3JjL21haW4uanMnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFNoZWV0ID0gcmVxdWlyZSgnLi9zaGVldC5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJvb2s7XG5cbmZ1bmN0aW9uIEJvb2soc291cmNlLCBrZXkpIHtcbiAgdGhpcy5zaGVldHMgPSBzb3VyY2UuZmVlZC5lbnRyeS5tYXAoZnVuY3Rpb24gKHNoZWV0KSB7XG4gICAgcmV0dXJuIG5ldyBTaGVldChzaGVldCwga2V5KTtcbiAgfSk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gJ2h0dHBzOi8vc3ByZWFkc2hlZXRzLmdvb2dsZS5jb20nO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdldEpTT047XG5cbmZ1bmN0aW9uIGdldEpTT04ocGF0aCwgY2IpIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICB2YXIganNvbjtcblxuICB4aHIub3BlbignR0VUJywgcGF0aCk7XG4gIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoeGhyLnJlYWR5U3RhdGUgIT09IDQgfHwgeGhyLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICBjYih4aHIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBqc29uID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjYih4aHIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNiKG51bGwsIGpzb24pO1xuICB9O1xuICB4aHIuc2VuZCgpO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxpc3Q7XG5cbmZ1bmN0aW9uIGxpc3Qoc291cmNlKSB7XG4gIHJldHVybiBzb3VyY2UuZmVlZC5lbnRyeS5tYXAoZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgdmFyIG9iaiA9IHt9O1xuXG4gICAgT2JqZWN0LmtleXMoZW50cnkpLmZpbHRlcihmdW5jdGlvbiAoa2V5KSB7XG4gICAgICByZXR1cm4gL2dzeFxcJC8udGVzdChrZXkpO1xuICAgIH0pLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgb2JqW2tleS5zdWJzdHJpbmcoNCldID0gZW50cnlba2V5XS4kdDtcbiAgICB9KTtcblxuICAgIHJldHVybiBvYmo7XG4gIH0pO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZmV0Y2ggPSByZXF1aXJlKCcuL2dldEpTT04uanMnKTtcbnZhciBCb29rID0gcmVxdWlyZSgnLi9ib29rLmpzJyk7XG52YXIgZW5kcG9pbnQgPSByZXF1aXJlKCcuL2VuZHBvaW50LmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gaW5pdDtcblxuZnVuY3Rpb24gaW5pdChrZXksIGNiKSB7XG4gIGlmKC9rZXk9Ly50ZXN0KGtleSkpIHtcbiAgICBrZXkgPSBrZXkubWF0Y2goJ2tleT0oLio/KSgmfCN8JCknKVsxXTtcbiAgfVxuXG4gIGlmKC9wdWJodG1sLy50ZXN0KGtleSkpIHtcbiAgICBrZXkgPSBrZXkubWF0Y2goJ2RcXFxcLyguKj8pXFxcXC9wdWJodG1sJylbMV07XG4gIH1cblxuICBmZXRjaChlbmRwb2ludCArICcvZmVlZHMvd29ya3NoZWV0cy8nICsga2V5ICsgJy9wdWJsaWMvYmFzaWM/YWx0PWpzb24nLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgY2IoZXJyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjYihudWxsLCBuZXcgQm9vayhkYXRhLCBrZXkpKTtcbiAgfSk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBsaXN0ID0gcmVxdWlyZSgnLi9saXN0LmpzJyk7XG52YXIgZW5kcG9pbnQgPSByZXF1aXJlKCcuL2VuZHBvaW50LmpzJyk7XG52YXIgZmV0Y2ggPSByZXF1aXJlKCcuL2dldEpTT04uanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTaGVldDtcblxuZnVuY3Rpb24gU2hlZXQoc291cmNlLCBrZXkpIHtcbiAgdmFyIGNvbnRlbnQsIHBhdGg7XG4gIHZhciAkdGhpcyA9IHRoaXM7XG5cbiAgdGhpcy5uYW1lID0gc291cmNlLmNvbnRlbnQuJHQ7XG4gIHRoaXMuaWQgPSBzb3VyY2UubGlua1tzb3VyY2UubGluay5sZW5ndGggLSAxXS5ocmVmLnNwbGl0KCcvJykucG9wKCk7XG4gIHRoaXMuZmV0Y2ggPSBmdW5jdGlvbiAoY2IpIHtcbiAgICBpZiAoY29udGVudCkge1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZmV0Y2goZW5kcG9pbnQgKyAnL2ZlZWRzL2xpc3QvJyArIGtleSArICcvJyArICR0aGlzLmlkICsgJy9wdWJsaWMvdmFsdWVzP2FsdD1qc29uJywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjYihlcnIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnRlbnQgPSBsaXN0KGRhdGEpO1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgfSk7XG4gIH07XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFsnJHNjb3BlJywgJyRyb290U2NvcGUnLCAnJGxvY2F0aW9uJywgJyR3aW5kb3cnLCAnZGInLCBob21lXTtcblxuZnVuY3Rpb24gaG9tZSgkc2NvcGUsICRyb290U2NvcGUsICRsb2NhdGlvbiwgJHdpbmRvdywgZGIpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGRiLmZldGNoKGZ1bmN0aW9uIChlcnIsIG1hdGNoZXMpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgJHNjb3BlLm1hdGNoZXMgPSBtYXRjaGVzO1xuICAgICRzY29wZS4kYXBwbHkoKTtcbiAgICAkc2NvcGUubWF0Y2hlcy5mb3JFYWNoKGZ1bmN0aW9uIChtYXRjaCkge1xuICAgICAgbWF0Y2guZmV0Y2goZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgICAkc2NvcGUuJGFwcGx5KCk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgaG9tZTogcmVxdWlyZSgnLi9ob21lLmpzJykgIFxufTsiLCJ2YXIgb3BlbiA9IHJlcXVpcmUoJy4vb3Blbi5qcycpO1xudmFyIGNvbnRlbnQ7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGRvY3MpIHtcbiAgcmV0dXJuIHtcbiAgICBmZXRjaDogZmV0Y2hcbiAgfTtcblxuICBmdW5jdGlvbiBmZXRjaChjYikge1xuICAgIGlmIChjb250ZW50KSB7XG4gICAgICBjYihudWxsLCBjb250ZW50KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBvcGVuKGRvY3MsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb250ZW50ID0gZGF0YTtcbiAgICAgIGNiKG51bGwsIGRhdGEpO1xuICAgIH0pO1xuICB9XG59O1xuIiwidmFyIHRhYmxlID0gcmVxdWlyZSgnZ3N4Jyk7XG52YXIgY29udHJhID0gcmVxdWlyZSgnY29udHJhJyk7XG52YXIgdHJhbnNmb3JtID0gcmVxdWlyZSgnLi90cmFuc2Zvcm0uanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBvcGVuO1xuXG5mdW5jdGlvbiBvcGVuKGRvY3MsIGRvbmUpIHtcbiAgdmFyIHRhc2tzID0gZG9jcy5tYXAoZnVuY3Rpb24gKGRvYykge1xuICAgIHJldHVybiBmdW5jdGlvbihjYikge1xuICAgICAgdGFibGUoZG9jLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBjYihlcnIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNiKG51bGwsIGRhdGEuc2hlZXRzKTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIGNvbnRyYS5jb25jdXJyZW50KHRhc2tzLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgZG9uZShlcnIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGRvbmUobnVsbCwgdHJhbnNmb3JtKHJlc3VsdHMpKTtcbiAgfSk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHRyYW5zZm9ybTtcblxuZnVuY3Rpb24gdHJhbnNmb3JtKHJlc3VsdHMpIHtcbiAgcmV0dXJuIHJlc3VsdHNcbiAgICAucmVkdWNlKGZ1bmN0aW9uICh4LCB5KSB7IHJldHVybiB4LmNvbmNhdCh5KTsgfSwgW10pXG4gICAgLm1hcChmdW5jdGlvbiAobWF0Y2gpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiBtYXRjaC5pZCxcbiAgICAgICAgbmFtZTogbWF0Y2gubmFtZSxcbiAgICAgICAgZmV0Y2g6IGZ1bmN0aW9uIChjYikge1xuICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAgIGlmIChzZWxmLmxpc3QpIHtcbiAgICAgICAgICAgIGNiKG51bGwsIHNlbGYubGlzdCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbWF0Y2guZmV0Y2goZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBjYihlcnIpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNlbGYucGxheWVycyA9IGRhdGEubWFwKGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiBwbGF5ZXIuanVnYWRvcixcbiAgICAgICAgICAgICAgICBhc3Npc3RzOiArcGxheWVyLmFzaXN0ZW5jaWFzLFxuICAgICAgICAgICAgICAgIGdvYWw6ICtwbGF5ZXIuanVnYWRhLFxuICAgICAgICAgICAgICAgIGhlYWRlZDogK3BsYXllci5jYWJlemEsXG4gICAgICAgICAgICAgICAgb3duOiArcGxheWVyLmVuY29udHJhLFxuICAgICAgICAgICAgICAgIGZyZWVLaWNrOiArcGxheWVyLnRpcm9saWJyZSxcbiAgICAgICAgICAgICAgICBwZW5hbHR5OiArcGxheWVyLnBlbmFsLFxuICAgICAgICAgICAgICAgIHRlYW06IHBsYXllci5lcXVpcG9cbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjYihudWxsLCBzZWxmLmxpc3QpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0pO1xufVxuIiwidmFyIGRvY3MgPSByZXF1aXJlKCcuLi9kb2NzLmpzb24nKTtcbnZhciBkYiA9IHJlcXVpcmUoJy4vZGInKShkb2NzKTtcbnZhciBiY2h6ID0gcmVxdWlyZSgnLi9tb2R1bGVzJykuYmNoejtcbnZhciBjb250cm9sbGVycyA9IHJlcXVpcmUoJy4vY29udHJvbGxlcnMnKTtcblxuYmNoei52YWx1ZSgnZGInLCBkYik7XG5iY2h6LmNvbnRyb2xsZXIoJ0hvbWVDdHJsJywgY29udHJvbGxlcnMuaG9tZSk7XG5cbmZ1bmN0aW9uIGluaXRpYWxpemUoZXJyLCBib29rKSB7XG4gIGlmIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgcmV0dXJuO1xuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdiY2h6JywgWyduZ1JvdXRlJ10pXG4gIC5jb25maWcoWyckcm91dGVQcm92aWRlcicsICckbG9jYXRpb25Qcm92aWRlcicsIGZ1bmN0aW9uICgkcm91dGVQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcblxuICAgICRyb3V0ZVByb3ZpZGVyXG4gICAgICAud2hlbignLycsIHsgY29udHJvbGxlcjogJ0hvbWVDdHJsJywgdGVtcGxhdGVVcmw6ICcvdmlld3MvaG9tZS5odG1sJyB9KVxuICAgICAgLndoZW4oJy9idXNxdWVkYScsIHsgY29udHJvbGxlcjogJ1BsYWNlU2VhcmNoQ3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL3NlYXJjaC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9saXN0YWRvJywgeyBjb250cm9sbGVyOiAnUGxhY2VMaXN0Q3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2xpc3QuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvbWFwYScsIHsgY29udHJvbGxlcjogJ01hcEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9zaXRlL21hcC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9jYW5jaGFzL2FncmVnYXInLCB7IGNvbnRyb2xsZXI6ICdQbGFjZUFkZEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9hZGQuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvY2FuY2hhcy9saXN0YWRvLzpzcG9ydCcsIHsgY29udHJvbGxlcjogJ1BsYWNlTGlzdEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9saXN0Lmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvbGlzdGFkbycsIHsgY29udHJvbGxlcjogJ1BsYWNlTGlzdEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9saXN0Lmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvOmlkJywgeyBjb250cm9sbGVyOiAnUGxhY2VEZXRhaWxDdHJsJywgcmVzb2x2ZToge1xuICAgICAgICBwbGFjZTogWyckcm91dGUnLCAnUGxhY2UnLCBmdW5jdGlvbiAoJHJvdXRlLCBQbGFjZSkge1xuICAgICAgICAgIHJldHVybiBQbGFjZS5nZXQoJHJvdXRlLmN1cnJlbnQucGFyYW1zKS4kcHJvbWlzZTtcbiAgICAgICAgfV1cbiAgICAgIH0sIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2RldGFpbC5odG1sJyB9KVxuICAgICAgLndoZW4oJy80MDQnLCB7IHRlbXBsYXRlVXJsOiAnL3NpdGUvNDA0Lmh0bWwnIH0pXG4gICAgICAub3RoZXJ3aXNlKHsgdGVtcGxhdGVVcmw6ICcvc2l0ZS80MDQuaHRtbCcgfSk7XG4gIH1dKTtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBiY2h6OiByZXF1aXJlKCcuL2JjaHouanMnKVxufTtcbiJdfQ==
