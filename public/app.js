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
(function (root, undefined) {
  'use strict';
  
  var q;
  var functions = ['skip', 'take', 'sum', 'select', 'selectMany', 'contains', 'all', 'any', 'where', 'first', 'last', 'distinct', 'groupBy', 'orderBy', 'orderByDescending', 'forEach'];

  function Query() {
    var self = this;

    // whatever array or comma-separated is ok
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] instanceof Array) {
        self.push.apply(self, arguments[i]);
      }
      else {
        self.push(arguments[i]);
      }
    }

    // assign functions;
    self.skip = _skip;
    self.take = _take;
    self.sum = _sum;
    self.select = _select;
    self.selectMany = _selectMany;
    self.contains = _contains;
    self.all = _all;
    self.any = _any;
    self.where = _where;
    self.first = _first;
    self.last = _last;
    self.distinct = _distinct;
    self.groupBy = _groupBy;
    self.orderBy = _orderBy;
    self.orderByDescending = _orderByDescending;
    self.forEach = _forEach;
    self.toArray = _toArray;
    self.toJSON = _toJSON;

    function _query(type, result) {
      return type instanceof Query ? new Query(result) : result;
    }

    function _skip(count) {
      var array = [];
      
      if (count < 0) {
        count = 0;
      }

      for (var i = count; i < self.length; i++) {
        if (i < self.length) {
          array.push(self[i]);
        }
      }

      return _query(this, array);
    }

    function _take(count) {
      var array = [];
      
      for (var i = 0; i < count; i++) {
        if (i < self.length) {
          array.push(self[i]);
        }
      }

      return _query(this, array);
    }

    function _sum(selector) {
      var sum = 0;

      for (var i = 0; i < self.length; i++) {
        if (selector) {
          sum += selector(self[i]);
        }
        else {
          sum += self[i];
        }
      }

      return sum;
    }

    function _select(selector) {
      var array = [];

      for (var i = 0; i < self.length; i++) {
        array.push(selector(self[i]));
      }

      return _query(this, array);
    }

    function _selectMany(selector) {
      var array = [];

      for (var i = 0; i < self.length; i++) {
        var innerArray = selector(self[i]);
        if (innerArray.length) {
          for (var j = 0; j < innerArray.length; j++) {
            array.push(innerArray[j]);
          }
        }
      }

      return _query(this, array);
    }

    function _contains(item) {
      for (var i = 0; i < self.length; i++) {
        if (self[i] === item) {
          return true;
        }
      }

      return false;
    }

     function _all(expression) {
      var success = true;

      for (var i = 0; i < self.length; i++) {
        success = success && expression(self[i]);
      }

      return success;
    }

    function _any(expression) {
      if (expression === undefined) {
        return self.length > 0;
      }

      for (var i = 0; i < self.length; i++) {
        if (expression(self[i])) {
          return true;
        }
      }

      return false;
    }

    function _where(expression) {
      var array = [];

      for (var i = 0; i < self.length; i++) {
        if (expression(self[i])) {
          array.push(self[i]);
        }
      }

      return _query(this, array);
    }

    function _first(expression) {
      if (expression === null || expression === undefined) {
        return self.length > 0 ? self[0] : null;
      }

      var result = self.where(expression);

      return result.length > 0 ? result[0] : null;
    }

    function _last(expression) {
      if (expression === null || expression === undefined) {
        return self.length > 0 ? self[self.length - 1] : null;
      }

      var result = self.where(expression);

      return result.length > 0 ? result[result.length - 1] : null;
    }

    function _distinct() {
      var query = new Query([]);

      if (self.any() && self.all(function (i) { return i === null || i === undefined; })) {
        return [null];
      }

      for (var i = 0; i < self.length; i++) {
        var item = query.first(compareItem(i));

        if (item === null) {
          query.push(self[i]);
        }
      }

      return this instanceof Query ? query : query.toArray();

      function compareItem(i) { 
        return function(n) { return _equal(n, self[i]); };
      }
    }

    function _groupBy(selector) {
      var query = new Query([]);

      for (var i = 0; i < self.length; i++) {
        var item = query.first(compareItem(i));

        if (item === null) {
          item = new Query([]);
          item.key = selector(self[i]);
          query.push(item);
        }

        item.push(self[i]);
      }

      return this instanceof Query ? query : query.toArray();

      function compareItem(i) {
        return function (n) { return _equal(n.key, selector(self[i])); };
      }
    }

    function _getType(selector) {
      if (self.length === 0) return 'undefined';

      for (var i = 0; i < self.length; i++) {
        var type = typeof selector(self[i]);
        if (type == 'number') return 'number';
        if (type == 'string') return 'string';
        if (type == 'boolean') return 'boolean';
        if (selector(self[i]) instanceof Date) return 'Date';
      }

      return 'undefined';
    }

    function _orderBy(selector) {
      if (self.length === 0) return _query(this, []);

      var type = _getType(selector);
      var result;

      if (type == 'number') {
        result = self.sort(function (a, b) { 
          if (selector(a) === selector(b)) {
            return 0;
          }

          if (selector(a) === null) {
            return -1;
          }

          if (selector(b) === null) {
            return 1;
          }

          return selector(a) - selector(b); 
        });
      }
      else if (type == 'string') {
        result = self.sort(function (a, b) {
          var x = selector(a) || '';
          var y = selector(b) || '';

          return x < y ? -1 : (x > y ? 1 : 0);
        });
      }
      else if (type == 'boolean') {
        result = self.sort(function (a, b) { return selector(a) == selector(b) ? 1 : -1; });
      }
      else if (type == 'Date') {
        result = self.sort(function (a, b) { return (selector(a) || new Date(0)).getTime() - (selector(b) || new Date(0)).getTime(); });
      }
      else {
        result = self;
      }

      // well, I want it [undefined, null, -Infinity, -1 ...]
      if (result.any(function (i) { return selector(i) === undefined; })) {
        var defined = result.where(function (i) { return selector(i) !== undefined; });
        var empty = result.where(function (i) { return selector(i) === undefined; });

        for (var i = 0; i < empty.length; i++) {
          defined.unshift(empty[i]);
        }

        result = defined;
      }

      return result;
    }

    function _orderByDescending(selector) {
      if (self.length === 0) return _query(this, []);

      var type = _getType(selector);
      var result;

      if (type == 'number') {
        result = self.sort(function (a, b) { 
          if (selector(a) === selector(b)) {
            return 0;
          }

          if (selector(a) === null) {
            return 1;
          }

          if (selector(b) === null) {
            return -1;
          }

          return selector(b) - selector(a); 
        });
      }
      else if (type == 'string') {
        result = self.sort(function (b, a) {
          var x = selector(a) || '';
          var y = selector(b) || '';

          return x < y ? -1 : (x > y ? 1 : 0);
        });
      }
      else if (type == 'boolean') {
        result = self.sort(function (b, a) { return selector(a) == selector(b) ? -1 : 1; });
      }
      else if (type == 'Date') {
        result = self.sort(function (b, a) { return (selector(a) || new Date(0)).getTime() - (selector(b) || new Date(0)).getTime(); });
      }
      else {
        result = self;
      }

      if (result.any(function (i) { return selector(i) === undefined; })) {
        var defined = result.where(function (i) { return selector(i) !== undefined; });
        var empty = result.where(function (i) { return selector(i) === undefined; });

        for (var i = 0; i < empty.length; i++) {
          defined.push(empty[i]);
        }

        result = defined;
      }

      return result;
    }

    function _forEach(action) {
      for (var i = 0; i < self.length; i++) {
        action.bind(self[i], self[i], i)();
      }

      return self;
    }

    function _toArray() {
      return converyArray(self);

      function converyArray(array) {
        var result = [];

        for (var i = 0; i < array.length; i++) {
          if (array[i] instanceof Query) {
            result.push(converyArray(array[i]));
          }
          else {
            result.push(array[i]);
          }
        }

        return result;
      }
    }

    function _toJSON() {
      return convertJSON(self);

      function convertJSON(array) {
        var result = {};
        result.length = array.length;
        
        if (array.key !== undefined) {
          result.key = array.key;
        }

        for (var i = 0; i < array.length; i++) {
          if (array[i] instanceof Query) {
            result[i] = convertJSON(array[i]);
          }
          else {
            result[i] = array[i];
          }
        }

        return result;
      }
    }

    function _equal (c, x) {
      // date compare
      if (c instanceof Date && x instanceof Date) {
        return c.getTime() == x.getTime();
      }

      if (c instanceof Date != x instanceof Date) {
        return false;
      }

      // type compare
      if (typeof c !== typeof x) {
        return false;
      }

      // number or string compare
      if (typeof c === 'number' || typeof c === 'string') {
        return c === x;
      }

      // both undefined
      if (typeof c === 'undefined') {
        return true;
      }

      // object properties compare
      for (var key1 in c) {
        if (c[key1] !== x[key1]) {
          return false;
        }
      }

      // check the other object too
      for (var key2 in x) {
        if (c[key2] !== x[key2]) {
          return false;
        }
      }

      // all seems to be right
      return true;
    }
  }

  // array inheritance
  Query.prototype = clone(Array.prototype);
  q = function () { return construct(Query, arguments); };

  // prototype extension so you can va.extends(Array) or whatever
  q.extends = extend;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = q;
  }
  else {
    root.va = q;
  }

  function extend(obj) {
    q(functions).forEach(function (name) {
      obj.prototype[name] = obj.prototype[name] || function () { 
        var args = Array.prototype.slice
          .call(arguments);

        return q(this)[name].apply(this, args); 
      };
    });
  }

  function clone(obj) {
    function F() { }
    F.prototype = obj;
    
    return new F();
  }

  function construct(constructor, args) {
    function F() {
      return constructor.apply(this, args);
    }

    F.prototype = constructor.prototype;

    return new F();
  }
})(this);
},{}],13:[function(require,module,exports){
module.exports = ['$scope', '$rootScope', '$location', '$window', 'db', home];

function home($scope, $rootScope, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, matches) {
    if (err) {
      console.error(err);
      return;
    }

    $scope.matches = matches;
    $scope.$apply();
  });
}

},{}],14:[function(require,module,exports){
module.exports = {
  home: require('./home.js'),
  player: require('./player.js'),
  scorers: require('./scorers.js')
};

},{"./home.js":13,"./player.js":15,"./scorers.js":16}],15:[function(require,module,exports){
var va = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', player];

function player($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  $scope.name = $routeParams.name;

  db.fetchAll(function (err, matches) {
    var info;

    if (err) {
      console.error(err);
      return;
    }

    var info = va(matches).selectMany(function (match) {
      return match.players;
    }).filter(function (player) {
      return player.name === $routeParams.name;
    });

    $scope.matches = info;
    $scope.assists = va(info).sum(function (item) { return item.assists; });
    $scope.goals = va(info).sum(function (item) { return item.total; });
    $scope.average = ($scope.goals / $scope.matches.length).toFixed(2);
    $scope.$apply();
  });
}

},{"very-array":12}],16:[function(require,module,exports){
var va = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', scorers];

function scorers($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, matches) {
    var info;

    if (err) {
      console.error(err);
      return;
    }

    $scope.players = va(matches).selectMany(function (match) {
      return match.players;
    }).groupBy(function (player) {
      return player.name;
    }).select(function (player) {
      return {
        name: player.key,
        goals: va(player).sum(function (item) { return item.total; }),
        matches: player.length,
        assists: va(player).sum(function (item) { return item.assists; }),
        average: (va(player).sum(function (item) { return item.total; }) / player.length).toFixed(2),
        detail: player
      };
    }).where(function (player) {
      return player.goals;
    }).orderByDescending(function (player) {
      return player.goals;
    });
    $scope.$apply();
  });
}

},{"very-array":12}],17:[function(require,module,exports){
var contra = require('contra');
var open = require('./open.js');
var content;

module.exports = function (docs) {
  var isFetching;
  var callbacks = [];

  return {
    fetch: fetch,
    fetchAll: fetchAll
  };

  function fetch(cb) {
    if (content) {
      cb(null, content);
      return;
    }

    callbacks.push(cb);

    if (isFetching) {
      return;
    }

    open(docs, function (err, data) {
      if (err) {
        callbacks.forEach(function (callback) {
          callback(err);
        });
        return;
      }

      content = data;
      callbacks.forEach(function (callback) {
        callback(null, data);
      });
    });
  }

  function fetchAll(cb) {
    fetch(function (err, data) {
      var fns = data.map(function (item) { return function(callback) { item.fetch(callback); }; });

      contra.concurrent(fns, function (err, results) {
        if (err) {
          cb(err);
          return;
        }

        cb(null, results);
      });
    });
  }
};

},{"./open.js":18,"contra":3}],18:[function(require,module,exports){
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

  contra.concurrent(tasks, 4, function (err, results) {
    if (err) {
      done(err);
      return;
    }

    done(null, transform(results));
  });
}

},{"./transform.js":19,"contra":3,"gsx":5}],19:[function(require,module,exports){
var _ = require('very-array');

module.exports = transform;

function transform(results) {
  return results
    .reduce(function (x, y) { return x.concat(y); }, [])
    .map(function (match) {
      var isFetching;
      var callbacks = [];

      return {
        id: match.id,
        name: match.name,
        fetch: function (cb) {
          var self = this;

          if (self.players) {
            cb(null, self);
            return;
          }

          callbacks.push(cb);

          if (isFetching) {
            return;
          }

          isFetching = true;
          match.fetch(function (err, data) {
            var teams;

            if (err) {
              callbacks.forEach(function (callback) {
                callback(err);
              });
              return;
            }

            self.players = data.map(function (player, ix) {
              return {
                name: player.jugador,
                assists: +player.asistencias,
                goal: +player.jugada,
                headed: +player.cabeza,
                freeKick: +player.tirolibre,
                penalty: +player.penal,
                total: +player.jugada + +player.cabeza + +player.tirolibre + +player.penal,
                own: +player.encontra,
                team: player.equipo,
                substitute: ix >= 22
              };
            });

            self.starters = self.players.filter(function (player) { return !player.substitute; });
            self.substitutes = self.players.filter(function (player) { return player.substitute; });
            self.teams = _(self.starters).groupBy(function (player) { return player.team; }).map(function (team) {
              return {
                name: team.key,
                players: team,
                goals: {
                  count: team.map(function (player) {
                      return player.total;
                    }).reduce(function (a, b) { return a + b; }, 0) +
                    self.starters.filter(function (player) {
                      return player.team != team.key && player.own;
                    }).map(function (player) {
                      return player.own;
                    }).reduce(function (a, b) { return a + b; }, 0),
                  detail: team.filter(function (player) {
                      return player.total;
                    }).concat(self.starters.filter(function (player) { return player.team != team.key && player.own; }))
                },
                assists: team.filter(function (player) { return player.assists; })
              };
            });

            if (self.teams.length === 1) {
              self.teams = [];
            }

            callbacks.forEach(function (callback) {
              callback(null, self);
            });
            return;
          });
        }
      };
    });
}

},{"very-array":12}],20:[function(require,module,exports){
var docs = require('../docs.json');
var db = require('./db')(docs);
var bchz = require('./modules').bchz;
var controllers = require('./controllers');

bchz.value('db', db);
bchz.controller('HomeCtrl', controllers.home);
bchz.controller('PlayerCtrl', controllers.player);
bchz.controller('ScorersCtrl', controllers.scorers);

function initialize(err, book) {
  if (err) {
    console.error(err);
    return;
  }
}

},{"../docs.json":1,"./controllers":14,"./db":17,"./modules":22}],21:[function(require,module,exports){
module.exports = angular.module('bchz', ['ngRoute'])
  .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {

    $routeProvider
      .when('/', { controller: 'HomeCtrl', templateUrl: '/views/home.html' })
      .when('/players/:name', { controller: 'PlayerCtrl', templateUrl: '/views/player.html' })
      .when('/scorers', { controller: 'ScorersCtrl', templateUrl: '/views/scorers.html' })
      .when('/404', { templateUrl: '/site/404.html' })
      .otherwise({ templateUrl: '/site/404.html' });
  }]);

},{}],22:[function(require,module,exports){
module.exports = {
  bchz: require('./bchz.js')
};

},{"./bchz.js":21}]},{},[20]);
