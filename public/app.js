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
  player: require('./player.js')
};

},{"./home.js":13,"./player.js":15}],15:[function(require,module,exports){
var va = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', player];

function player($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

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

    $scope.name = $routeParams.name;
    $scope.matches = info;
    $scope.assists = va(info).sum(function (item) { return item.assists; });
    $scope.goals = va(info).sum(function (item) { return item.total; });
    $scope.$apply();
  });
}

},{"very-array":12}],16:[function(require,module,exports){
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
        console.log("vamo")
        if (err) {
          cb(err);
          return;
        }

        cb(null, results);
      });
    });
  }
};

},{"./open.js":17,"contra":3}],17:[function(require,module,exports){
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

},{"./transform.js":18,"contra":3,"gsx":5}],18:[function(require,module,exports){
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

},{"very-array":12}],19:[function(require,module,exports){
var docs = require('../docs.json');
var db = require('./db')(docs);
var bchz = require('./modules').bchz;
var controllers = require('./controllers');

bchz.value('db', db);
bchz.controller('HomeCtrl', controllers.home);
bchz.controller('PlayerCtrl', controllers.player);

function initialize(err, book) {
  if (err) {
    console.error(err);
    return;
  }
}

},{"../docs.json":1,"./controllers":14,"./db":16,"./modules":21}],20:[function(require,module,exports){
module.exports = angular.module('bchz', ['ngRoute'])
  .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {

    $routeProvider
      .when('/', { controller: 'HomeCtrl', templateUrl: '/views/home.html' })
      .when('/players/:name', { controller: 'PlayerCtrl', templateUrl: '/views/player.html' })
      .when('/404', { templateUrl: '/site/404.html' })
      .otherwise({ templateUrl: '/site/404.html' });
  }]);

},{}],21:[function(require,module,exports){
module.exports = {
  bchz: require('./bchz.js')
};

},{"./bchz.js":20}]},{},[19])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiZG9jcy5qc29uIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHByb2Nlc3NcXGJyb3dzZXIuanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcc3JjXFxjb250cmEuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxib29rLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcZW5kcG9pbnQuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxnZXRKU09OLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcbGlzdC5qcyIsIm5vZGVfbW9kdWxlc1xcZ3N4XFxzcmNcXG1haW4uanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxzaGVldC5qcyIsIm5vZGVfbW9kdWxlc1xcdmVyeS1hcnJheVxcc3JjXFx2ZXJ5LWFycmF5LmpzIiwic3JjXFxjb250cm9sbGVyc1xcaG9tZS5qcyIsInNyY1xcY29udHJvbGxlcnNcXGluZGV4LmpzIiwic3JjXFxjb250cm9sbGVyc1xccGxheWVyLmpzIiwic3JjXFxkYlxcaW5kZXguanMiLCJzcmNcXGRiXFxvcGVuLmpzIiwic3JjXFxkYlxcdHJhbnNmb3JtLmpzIiwic3JjXFxpbmRleC5qcyIsInNyY1xcbW9kdWxlc1xcYmNoei5qcyIsInNyY1xcbW9kdWxlc1xcaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3T0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHM9W1wiaHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMUxrVmtiM1ZGanhCZjZKcHZUT2drbHpjd3I5T2dVXzhuOGZCcHlxaFZTNFUvcHViaHRtbFwiXSIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gdHJ1ZTtcbiAgICB2YXIgY3VycmVudFF1ZXVlO1xuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG59XG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHF1ZXVlLnB1c2goZnVuKTtcbiAgICBpZiAoIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vc3JjL2NvbnRyYS5qcycpO1xuIiwiKGZ1bmN0aW9uIChPYmplY3QsIHJvb3QsIHVuZGVmaW5lZCkge1xuICAndXNlIHN0cmljdCc7XG5cbiAgdmFyIHVuZGVmID0gJycgKyB1bmRlZmluZWQ7XG4gIHZhciBTRVJJQUwgPSAxO1xuICB2YXIgQ09OQ1VSUkVOVCA9IEluZmluaXR5O1xuXG4gIGZ1bmN0aW9uIG5vb3AgKCkge31cbiAgZnVuY3Rpb24gYSAobykgeyByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pID09PSAnW29iamVjdCBBcnJheV0nOyB9XG4gIGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4gIGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7IGlmICghZm4pIHsgcmV0dXJuOyB9IHRpY2soZnVuY3Rpb24gcnVuICgpIHsgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pOyB9KTsgfVxuICBmdW5jdGlvbiBvbmNlIChmbikge1xuICAgIHZhciBkaXNwb3NlZDtcbiAgICBmdW5jdGlvbiBkaXNwb3NhYmxlICgpIHtcbiAgICAgIGlmIChkaXNwb3NlZCkgeyByZXR1cm47IH1cbiAgICAgIGRpc3Bvc2VkID0gdHJ1ZTtcbiAgICAgIChmbiB8fCBub29wKS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgICBkaXNwb3NhYmxlLmRpc2NhcmQgPSBmdW5jdGlvbiAoKSB7IGRpc3Bvc2VkID0gdHJ1ZTsgfTtcbiAgICByZXR1cm4gZGlzcG9zYWJsZTtcbiAgfVxuICBmdW5jdGlvbiBoYW5kbGUgKGFyZ3MsIGRvbmUsIGRpc3Bvc2FibGUpIHtcbiAgICB2YXIgZXJyID0gYXJncy5zaGlmdCgpO1xuICAgIGlmIChlcnIpIHsgaWYgKGRpc3Bvc2FibGUpIHsgZGlzcG9zYWJsZS5kaXNjYXJkKCk7IH0gZGVib3VuY2UoZG9uZSwgW2Vycl0pOyByZXR1cm4gdHJ1ZTsgfVxuICB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfY3VycnkgKCkge1xuICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgIHZhciBtZXRob2QgPSBhcmdzLnNoaWZ0KCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGN1cnJpZWQgKCkge1xuICAgICAgdmFyIG1vcmUgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICBtZXRob2QuYXBwbHkobWV0aG9kLCBhcmdzLmNvbmNhdChtb3JlKSk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF93YXRlcmZhbGwgKHN0ZXBzLCBkb25lKSB7XG4gICAgdmFyIGQgPSBvbmNlKGRvbmUpO1xuICAgIGZ1bmN0aW9uIG5leHQgKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICB2YXIgc3RlcCA9IHN0ZXBzLnNoaWZ0KCk7XG4gICAgICBpZiAoc3RlcCkge1xuICAgICAgICBpZiAoaGFuZGxlKGFyZ3MsIGQpKSB7IHJldHVybjsgfVxuICAgICAgICBhcmdzLnB1c2gob25jZShuZXh0KSk7XG4gICAgICAgIGRlYm91bmNlKHN0ZXAsIGFyZ3MpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVib3VuY2UoZCwgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICB9XG4gICAgbmV4dCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gX2NvbmN1cnJlbnQgKHRhc2tzLCBjb25jdXJyZW5jeSwgZG9uZSkge1xuICAgIGlmICh0eXBlb2YgY29uY3VycmVuY3kgPT09ICdmdW5jdGlvbicpIHsgZG9uZSA9IGNvbmN1cnJlbmN5OyBjb25jdXJyZW5jeSA9IENPTkNVUlJFTlQ7IH1cbiAgICB2YXIgZCA9IG9uY2UoZG9uZSk7XG4gICAgdmFyIHEgPSBfcXVldWUod29ya2VyLCBjb25jdXJyZW5jeSk7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh0YXNrcyk7XG4gICAgdmFyIHJlc3VsdHMgPSBhKHRhc2tzKSA/IFtdIDoge307XG4gICAgcS51bnNoaWZ0KGtleXMpO1xuICAgIHEub24oJ2RyYWluJywgZnVuY3Rpb24gY29tcGxldGVkICgpIHsgZChudWxsLCByZXN1bHRzKTsgfSk7XG4gICAgZnVuY3Rpb24gd29ya2VyIChrZXksIG5leHQpIHtcbiAgICAgIGRlYm91bmNlKHRhc2tzW2tleV0sIFtwcm9jZWVkXSk7XG4gICAgICBmdW5jdGlvbiBwcm9jZWVkICgpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICAgIGlmIChoYW5kbGUoYXJncywgZCkpIHsgcmV0dXJuOyB9XG4gICAgICAgIHJlc3VsdHNba2V5XSA9IGFyZ3Muc2hpZnQoKTtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIF9zZXJpZXMgKHRhc2tzLCBkb25lKSB7XG4gICAgX2NvbmN1cnJlbnQodGFza3MsIFNFUklBTCwgZG9uZSk7XG4gIH1cblxuICBmdW5jdGlvbiBfbWFwIChjYXAsIHRoZW4sIGF0dGFjaGVkKSB7XG4gICAgdmFyIG1hcCA9IGZ1bmN0aW9uIChjb2xsZWN0aW9uLCBjb25jdXJyZW5jeSwgaXRlcmF0b3IsIGRvbmUpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAyKSB7IGl0ZXJhdG9yID0gY29uY3VycmVuY3k7IGNvbmN1cnJlbmN5ID0gQ09OQ1VSUkVOVDsgfVxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAzICYmIHR5cGVvZiBjb25jdXJyZW5jeSAhPT0gJ251bWJlcicpIHsgZG9uZSA9IGl0ZXJhdG9yOyBpdGVyYXRvciA9IGNvbmN1cnJlbmN5OyBjb25jdXJyZW5jeSA9IENPTkNVUlJFTlQ7IH1cbiAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoY29sbGVjdGlvbik7XG4gICAgICB2YXIgdGFza3MgPSBhKGNvbGxlY3Rpb24pID8gW10gOiB7fTtcbiAgICAgIGtleXMuZm9yRWFjaChmdW5jdGlvbiBpbnNlcnQgKGtleSkge1xuICAgICAgICB0YXNrc1trZXldID0gZnVuY3Rpb24gaXRlcmF0ZSAoY2IpIHtcbiAgICAgICAgICBpZiAoaXRlcmF0b3IubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICBpdGVyYXRvcihjb2xsZWN0aW9uW2tleV0sIGtleSwgY2IpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpdGVyYXRvcihjb2xsZWN0aW9uW2tleV0sIGNiKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIF9jb25jdXJyZW50KHRhc2tzLCBjYXAgfHwgY29uY3VycmVuY3ksIHRoZW4gPyB0aGVuKGNvbGxlY3Rpb24sIG9uY2UoZG9uZSkpIDogZG9uZSk7XG4gICAgfTtcbiAgICBpZiAoIWF0dGFjaGVkKSB7IG1hcC5zZXJpZXMgPSBfbWFwKFNFUklBTCwgdGhlbiwgdHJ1ZSk7IH1cbiAgICByZXR1cm4gbWFwO1xuICB9XG5cbiAgZnVuY3Rpb24gX2VhY2ggKGNvbmN1cnJlbmN5KSB7XG4gICAgcmV0dXJuIF9tYXAoY29uY3VycmVuY3ksIHRoZW4pO1xuICAgIGZ1bmN0aW9uIHRoZW4gKGNvbGxlY3Rpb24sIGRvbmUpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiBtYXNrIChlcnIpIHtcbiAgICAgICAgZG9uZShlcnIpOyAvLyBvbmx5IHJldHVybiB0aGUgZXJyb3IsIG5vIG1vcmUgYXJndW1lbnRzXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIF9maWx0ZXIgKGNvbmN1cnJlbmN5KSB7XG4gICAgcmV0dXJuIF9tYXAoY29uY3VycmVuY3ksIHRoZW4pO1xuICAgIGZ1bmN0aW9uIHRoZW4gKGNvbGxlY3Rpb24sIGRvbmUpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiBmaWx0ZXIgKGVyciwgcmVzdWx0cykge1xuICAgICAgICBmdW5jdGlvbiBleGlzdHMgKGl0ZW0sIGtleSkge1xuICAgICAgICAgIHJldHVybiAhIXJlc3VsdHNba2V5XTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBvZmlsdGVyICgpIHtcbiAgICAgICAgICB2YXIgZmlsdGVyZWQgPSB7fTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhjb2xsZWN0aW9uKS5mb3JFYWNoKGZ1bmN0aW9uIG9tYXBwZXIgKGtleSkge1xuICAgICAgICAgICAgaWYgKGV4aXN0cyhudWxsLCBrZXkpKSB7IGZpbHRlcmVkW2tleV0gPSBjb2xsZWN0aW9uW2tleV07IH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gZmlsdGVyZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGVycikgeyBkb25lKGVycik7IHJldHVybjsgfVxuICAgICAgICBkb25lKG51bGwsIGEocmVzdWx0cykgPyBjb2xsZWN0aW9uLmZpbHRlcihleGlzdHMpIDogb2ZpbHRlcigpKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gX2VtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gICAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBldnQgPSB7fTtcbiAgICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gICAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChjID09PSAxKSB7XG4gICAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgICAgZXZ0ID0ge307XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfTtcbiAgICB0aGluZy5lbWl0dGVyU25hcHNob3QgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQubGVuZ3RoKSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgICAgZXZ0W3R5cGVdID0gZXQuZmlsdGVyKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgICByZXR1cm4gIWxpc3Rlbi5fb25jZTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGluZztcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIF9xdWV1ZSAod29ya2VyLCBjb25jdXJyZW5jeSkge1xuICAgIHZhciBxID0gW10sIGxvYWQgPSAwLCBtYXggPSBjb25jdXJyZW5jeSB8fCAxLCBwYXVzZWQ7XG4gICAgdmFyIHFxID0gX2VtaXR0ZXIoe1xuICAgICAgcHVzaDogbWFuaXB1bGF0ZS5iaW5kKG51bGwsICdwdXNoJyksXG4gICAgICB1bnNoaWZ0OiBtYW5pcHVsYXRlLmJpbmQobnVsbCwgJ3Vuc2hpZnQnKSxcbiAgICAgIHBhdXNlOiBmdW5jdGlvbiAoKSB7IHBhdXNlZCA9IHRydWU7IH0sXG4gICAgICByZXN1bWU6IGZ1bmN0aW9uICgpIHsgcGF1c2VkID0gZmFsc2U7IGRlYm91bmNlKGxhYm9yKTsgfSxcbiAgICAgIHBlbmRpbmc6IHFcbiAgICB9KTtcbiAgICBpZiAoT2JqZWN0LmRlZmluZVByb3BlcnR5ICYmICFPYmplY3QuZGVmaW5lUHJvcGVydHlQYXJ0aWFsKSB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkocXEsICdsZW5ndGgnLCB7IGdldDogZnVuY3Rpb24gKCkgeyByZXR1cm4gcS5sZW5ndGg7IH0gfSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIG1hbmlwdWxhdGUgKGhvdywgdGFzaywgZG9uZSkge1xuICAgICAgdmFyIHRhc2tzID0gYSh0YXNrKSA/IHRhc2sgOiBbdGFza107XG4gICAgICB0YXNrcy5mb3JFYWNoKGZ1bmN0aW9uIGluc2VydCAodCkgeyBxW2hvd10oeyB0OiB0LCBkb25lOiBkb25lIH0pOyB9KTtcbiAgICAgIGRlYm91bmNlKGxhYm9yKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gbGFib3IgKCkge1xuICAgICAgaWYgKHBhdXNlZCB8fCBsb2FkID49IG1heCkgeyByZXR1cm47IH1cbiAgICAgIGlmICghcS5sZW5ndGgpIHsgaWYgKGxvYWQgPT09IDApIHsgcXEuZW1pdCgnZHJhaW4nKTsgfSByZXR1cm47IH1cbiAgICAgIGxvYWQrKztcbiAgICAgIHZhciBqb2IgPSBxLnBvcCgpO1xuICAgICAgd29ya2VyKGpvYi50LCBvbmNlKGNvbXBsZXRlLmJpbmQobnVsbCwgam9iKSkpO1xuICAgICAgZGVib3VuY2UobGFib3IpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBjb21wbGV0ZSAoam9iKSB7XG4gICAgICBsb2FkLS07XG4gICAgICBkZWJvdW5jZShqb2IuZG9uZSwgYXRvYShhcmd1bWVudHMsIDEpKTtcbiAgICAgIGRlYm91bmNlKGxhYm9yKTtcbiAgICB9XG4gICAgcmV0dXJuIHFxO1xuICB9XG5cbiAgdmFyIGNvbnRyYSA9IHtcbiAgICBjdXJyeTogX2N1cnJ5LFxuICAgIGNvbmN1cnJlbnQ6IF9jb25jdXJyZW50LFxuICAgIHNlcmllczogX3NlcmllcyxcbiAgICB3YXRlcmZhbGw6IF93YXRlcmZhbGwsXG4gICAgZWFjaDogX2VhY2goKSxcbiAgICBtYXA6IF9tYXAoKSxcbiAgICBmaWx0ZXI6IF9maWx0ZXIoKSxcbiAgICBxdWV1ZTogX3F1ZXVlLFxuICAgIGVtaXR0ZXI6IF9lbWl0dGVyXG4gIH07XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gZXhwb3J0XG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSB1bmRlZiAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gY29udHJhO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gY29udHJhO1xuICB9XG59KShPYmplY3QsIHRoaXMpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9tYWluLmpzJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBTaGVldCA9IHJlcXVpcmUoJy4vc2hlZXQuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCb29rO1xuXG5mdW5jdGlvbiBCb29rKHNvdXJjZSwga2V5KSB7XG4gIHRoaXMuc2hlZXRzID0gc291cmNlLmZlZWQuZW50cnkubWFwKGZ1bmN0aW9uIChzaGVldCkge1xuICAgIHJldHVybiBuZXcgU2hlZXQoc2hlZXQsIGtleSk7XG4gIH0pO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9ICdodHRwczovL3NwcmVhZHNoZWV0cy5nb29nbGUuY29tJztcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBnZXRKU09OO1xuXG5mdW5jdGlvbiBnZXRKU09OKHBhdGgsIGNiKSB7XG4gIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgdmFyIGpzb247XG5cbiAgeGhyLm9wZW4oJ0dFVCcsIHBhdGgpO1xuICB4aHIub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHhoci5yZWFkeVN0YXRlICE9PSA0IHx8IHhoci5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgY2IoeGhyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAganNvbiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY2IoeGhyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjYihudWxsLCBqc29uKTtcbiAgfTtcbiAgeGhyLnNlbmQoKTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBsaXN0O1xuXG5mdW5jdGlvbiBsaXN0KHNvdXJjZSkge1xuICByZXR1cm4gc291cmNlLmZlZWQuZW50cnkubWFwKGZ1bmN0aW9uIChlbnRyeSkge1xuICAgIHZhciBvYmogPSB7fTtcblxuICAgIE9iamVjdC5rZXlzKGVudHJ5KS5maWx0ZXIoZnVuY3Rpb24gKGtleSkge1xuICAgICAgcmV0dXJuIC9nc3hcXCQvLnRlc3Qoa2V5KTtcbiAgICB9KS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIG9ialtrZXkuc3Vic3RyaW5nKDQpXSA9IGVudHJ5W2tleV0uJHQ7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gb2JqO1xuICB9KTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGZldGNoID0gcmVxdWlyZSgnLi9nZXRKU09OLmpzJyk7XG52YXIgQm9vayA9IHJlcXVpcmUoJy4vYm9vay5qcycpO1xudmFyIGVuZHBvaW50ID0gcmVxdWlyZSgnLi9lbmRwb2ludC5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGluaXQ7XG5cbmZ1bmN0aW9uIGluaXQoa2V5LCBjYikge1xuICBpZigva2V5PS8udGVzdChrZXkpKSB7XG4gICAga2V5ID0ga2V5Lm1hdGNoKCdrZXk9KC4qPykoJnwjfCQpJylbMV07XG4gIH1cblxuICBpZigvcHViaHRtbC8udGVzdChrZXkpKSB7XG4gICAga2V5ID0ga2V5Lm1hdGNoKCdkXFxcXC8oLio/KVxcXFwvcHViaHRtbCcpWzFdO1xuICB9XG5cbiAgZmV0Y2goZW5kcG9pbnQgKyAnL2ZlZWRzL3dvcmtzaGVldHMvJyArIGtleSArICcvcHVibGljL2Jhc2ljP2FsdD1qc29uJywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIGNiKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY2IobnVsbCwgbmV3IEJvb2soZGF0YSwga2V5KSk7XG4gIH0pO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbGlzdCA9IHJlcXVpcmUoJy4vbGlzdC5qcycpO1xudmFyIGVuZHBvaW50ID0gcmVxdWlyZSgnLi9lbmRwb2ludC5qcycpO1xudmFyIGZldGNoID0gcmVxdWlyZSgnLi9nZXRKU09OLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gU2hlZXQ7XG5cbmZ1bmN0aW9uIFNoZWV0KHNvdXJjZSwga2V5KSB7XG4gIHZhciBjb250ZW50LCBwYXRoO1xuICB2YXIgJHRoaXMgPSB0aGlzO1xuXG4gIHRoaXMubmFtZSA9IHNvdXJjZS5jb250ZW50LiR0O1xuICB0aGlzLmlkID0gc291cmNlLmxpbmtbc291cmNlLmxpbmsubGVuZ3RoIC0gMV0uaHJlZi5zcGxpdCgnLycpLnBvcCgpO1xuICB0aGlzLmZldGNoID0gZnVuY3Rpb24gKGNiKSB7XG4gICAgaWYgKGNvbnRlbnQpIHtcbiAgICAgIGNiKG51bGwsIGNvbnRlbnQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZldGNoKGVuZHBvaW50ICsgJy9mZWVkcy9saXN0LycgKyBrZXkgKyAnLycgKyAkdGhpcy5pZCArICcvcHVibGljL3ZhbHVlcz9hbHQ9anNvbicsIGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb250ZW50ID0gbGlzdChkYXRhKTtcbiAgICAgIGNiKG51bGwsIGNvbnRlbnQpO1xuICAgIH0pO1xuICB9O1xufVxuIiwiKGZ1bmN0aW9uIChyb290LCB1bmRlZmluZWQpIHtcclxuICAndXNlIHN0cmljdCc7XHJcbiAgXHJcbiAgdmFyIHE7XHJcbiAgdmFyIGZ1bmN0aW9ucyA9IFsnc2tpcCcsICd0YWtlJywgJ3N1bScsICdzZWxlY3QnLCAnc2VsZWN0TWFueScsICdjb250YWlucycsICdhbGwnLCAnYW55JywgJ3doZXJlJywgJ2ZpcnN0JywgJ2xhc3QnLCAnZGlzdGluY3QnLCAnZ3JvdXBCeScsICdvcmRlckJ5JywgJ29yZGVyQnlEZXNjZW5kaW5nJywgJ2ZvckVhY2gnXTtcclxuXHJcbiAgZnVuY3Rpb24gUXVlcnkoKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgLy8gd2hhdGV2ZXIgYXJyYXkgb3IgY29tbWEtc2VwYXJhdGVkIGlzIG9rXHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICBpZiAoYXJndW1lbnRzW2ldIGluc3RhbmNlb2YgQXJyYXkpIHtcclxuICAgICAgICBzZWxmLnB1c2guYXBwbHkoc2VsZiwgYXJndW1lbnRzW2ldKTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBzZWxmLnB1c2goYXJndW1lbnRzW2ldKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIGFzc2lnbiBmdW5jdGlvbnM7XHJcbiAgICBzZWxmLnNraXAgPSBfc2tpcDtcclxuICAgIHNlbGYudGFrZSA9IF90YWtlO1xyXG4gICAgc2VsZi5zdW0gPSBfc3VtO1xyXG4gICAgc2VsZi5zZWxlY3QgPSBfc2VsZWN0O1xyXG4gICAgc2VsZi5zZWxlY3RNYW55ID0gX3NlbGVjdE1hbnk7XHJcbiAgICBzZWxmLmNvbnRhaW5zID0gX2NvbnRhaW5zO1xyXG4gICAgc2VsZi5hbGwgPSBfYWxsO1xyXG4gICAgc2VsZi5hbnkgPSBfYW55O1xyXG4gICAgc2VsZi53aGVyZSA9IF93aGVyZTtcclxuICAgIHNlbGYuZmlyc3QgPSBfZmlyc3Q7XHJcbiAgICBzZWxmLmxhc3QgPSBfbGFzdDtcclxuICAgIHNlbGYuZGlzdGluY3QgPSBfZGlzdGluY3Q7XHJcbiAgICBzZWxmLmdyb3VwQnkgPSBfZ3JvdXBCeTtcclxuICAgIHNlbGYub3JkZXJCeSA9IF9vcmRlckJ5O1xyXG4gICAgc2VsZi5vcmRlckJ5RGVzY2VuZGluZyA9IF9vcmRlckJ5RGVzY2VuZGluZztcclxuICAgIHNlbGYuZm9yRWFjaCA9IF9mb3JFYWNoO1xyXG4gICAgc2VsZi50b0FycmF5ID0gX3RvQXJyYXk7XHJcbiAgICBzZWxmLnRvSlNPTiA9IF90b0pTT047XHJcblxyXG4gICAgZnVuY3Rpb24gX3F1ZXJ5KHR5cGUsIHJlc3VsdCkge1xyXG4gICAgICByZXR1cm4gdHlwZSBpbnN0YW5jZW9mIFF1ZXJ5ID8gbmV3IFF1ZXJ5KHJlc3VsdCkgOiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3NraXAoY291bnQpIHtcclxuICAgICAgdmFyIGFycmF5ID0gW107XHJcbiAgICAgIFxyXG4gICAgICBpZiAoY291bnQgPCAwKSB7XHJcbiAgICAgICAgY291bnQgPSAwO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gY291bnQ7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGkgPCBzZWxmLmxlbmd0aCkge1xyXG4gICAgICAgICAgYXJyYXkucHVzaChzZWxmW2ldKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBfcXVlcnkodGhpcywgYXJyYXkpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF90YWtlKGNvdW50KSB7XHJcbiAgICAgIHZhciBhcnJheSA9IFtdO1xyXG4gICAgICBcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGkgPCBzZWxmLmxlbmd0aCkge1xyXG4gICAgICAgICAgYXJyYXkucHVzaChzZWxmW2ldKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBfcXVlcnkodGhpcywgYXJyYXkpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9zdW0oc2VsZWN0b3IpIHtcclxuICAgICAgdmFyIHN1bSA9IDA7XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoc2VsZWN0b3IpIHtcclxuICAgICAgICAgIHN1bSArPSBzZWxlY3RvcihzZWxmW2ldKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBzdW0gKz0gc2VsZltpXTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBzdW07XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3NlbGVjdChzZWxlY3Rvcikge1xyXG4gICAgICB2YXIgYXJyYXkgPSBbXTtcclxuXHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGFycmF5LnB1c2goc2VsZWN0b3Ioc2VsZltpXSkpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gX3F1ZXJ5KHRoaXMsIGFycmF5KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfc2VsZWN0TWFueShzZWxlY3Rvcikge1xyXG4gICAgICB2YXIgYXJyYXkgPSBbXTtcclxuXHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBpbm5lckFycmF5ID0gc2VsZWN0b3Ioc2VsZltpXSk7XHJcbiAgICAgICAgaWYgKGlubmVyQXJyYXkubGVuZ3RoKSB7XHJcbiAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGlubmVyQXJyYXkubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgYXJyYXkucHVzaChpbm5lckFycmF5W2pdKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBfcXVlcnkodGhpcywgYXJyYXkpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9jb250YWlucyhpdGVtKSB7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChzZWxmW2ldID09PSBpdGVtKSB7XHJcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAgZnVuY3Rpb24gX2FsbChleHByZXNzaW9uKSB7XHJcbiAgICAgIHZhciBzdWNjZXNzID0gdHJ1ZTtcclxuXHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHN1Y2Nlc3MgPSBzdWNjZXNzICYmIGV4cHJlc3Npb24oc2VsZltpXSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBzdWNjZXNzO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9hbnkoZXhwcmVzc2lvbikge1xyXG4gICAgICBpZiAoZXhwcmVzc2lvbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIHNlbGYubGVuZ3RoID4gMDtcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGV4cHJlc3Npb24oc2VsZltpXSkpIHtcclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF93aGVyZShleHByZXNzaW9uKSB7XHJcbiAgICAgIHZhciBhcnJheSA9IFtdO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGV4cHJlc3Npb24oc2VsZltpXSkpIHtcclxuICAgICAgICAgIGFycmF5LnB1c2goc2VsZltpXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gX3F1ZXJ5KHRoaXMsIGFycmF5KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfZmlyc3QoZXhwcmVzc2lvbikge1xyXG4gICAgICBpZiAoZXhwcmVzc2lvbiA9PT0gbnVsbCB8fCBleHByZXNzaW9uID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICByZXR1cm4gc2VsZi5sZW5ndGggPiAwID8gc2VsZlswXSA6IG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciByZXN1bHQgPSBzZWxmLndoZXJlKGV4cHJlc3Npb24pO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdC5sZW5ndGggPiAwID8gcmVzdWx0WzBdIDogbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfbGFzdChleHByZXNzaW9uKSB7XHJcbiAgICAgIGlmIChleHByZXNzaW9uID09PSBudWxsIHx8IGV4cHJlc3Npb24gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybiBzZWxmLmxlbmd0aCA+IDAgPyBzZWxmW3NlbGYubGVuZ3RoIC0gMV0gOiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgcmVzdWx0ID0gc2VsZi53aGVyZShleHByZXNzaW9uKTtcclxuXHJcbiAgICAgIHJldHVybiByZXN1bHQubGVuZ3RoID4gMCA/IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0gOiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9kaXN0aW5jdCgpIHtcclxuICAgICAgdmFyIHF1ZXJ5ID0gbmV3IFF1ZXJ5KFtdKTtcclxuXHJcbiAgICAgIGlmIChzZWxmLmFueSgpICYmIHNlbGYuYWxsKGZ1bmN0aW9uIChpKSB7IHJldHVybiBpID09PSBudWxsIHx8IGkgPT09IHVuZGVmaW5lZDsgfSkpIHtcclxuICAgICAgICByZXR1cm4gW251bGxdO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgaXRlbSA9IHF1ZXJ5LmZpcnN0KGNvbXBhcmVJdGVtKGkpKTtcclxuXHJcbiAgICAgICAgaWYgKGl0ZW0gPT09IG51bGwpIHtcclxuICAgICAgICAgIHF1ZXJ5LnB1c2goc2VsZltpXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gdGhpcyBpbnN0YW5jZW9mIFF1ZXJ5ID8gcXVlcnkgOiBxdWVyeS50b0FycmF5KCk7XHJcblxyXG4gICAgICBmdW5jdGlvbiBjb21wYXJlSXRlbShpKSB7IFxyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihuKSB7IHJldHVybiBfZXF1YWwobiwgc2VsZltpXSk7IH07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfZ3JvdXBCeShzZWxlY3Rvcikge1xyXG4gICAgICB2YXIgcXVlcnkgPSBuZXcgUXVlcnkoW10pO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGl0ZW0gPSBxdWVyeS5maXJzdChjb21wYXJlSXRlbShpKSk7XHJcblxyXG4gICAgICAgIGlmIChpdGVtID09PSBudWxsKSB7XHJcbiAgICAgICAgICBpdGVtID0gbmV3IFF1ZXJ5KFtdKTtcclxuICAgICAgICAgIGl0ZW0ua2V5ID0gc2VsZWN0b3Ioc2VsZltpXSk7XHJcbiAgICAgICAgICBxdWVyeS5wdXNoKGl0ZW0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaXRlbS5wdXNoKHNlbGZbaV0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gdGhpcyBpbnN0YW5jZW9mIFF1ZXJ5ID8gcXVlcnkgOiBxdWVyeS50b0FycmF5KCk7XHJcblxyXG4gICAgICBmdW5jdGlvbiBjb21wYXJlSXRlbShpKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChuKSB7IHJldHVybiBfZXF1YWwobi5rZXksIHNlbGVjdG9yKHNlbGZbaV0pKTsgfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9nZXRUeXBlKHNlbGVjdG9yKSB7XHJcbiAgICAgIGlmIChzZWxmLmxlbmd0aCA9PT0gMCkgcmV0dXJuICd1bmRlZmluZWQnO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIHR5cGUgPSB0eXBlb2Ygc2VsZWN0b3Ioc2VsZltpXSk7XHJcbiAgICAgICAgaWYgKHR5cGUgPT0gJ251bWJlcicpIHJldHVybiAnbnVtYmVyJztcclxuICAgICAgICBpZiAodHlwZSA9PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xyXG4gICAgICAgIGlmICh0eXBlID09ICdib29sZWFuJykgcmV0dXJuICdib29sZWFuJztcclxuICAgICAgICBpZiAoc2VsZWN0b3Ioc2VsZltpXSkgaW5zdGFuY2VvZiBEYXRlKSByZXR1cm4gJ0RhdGUnO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gJ3VuZGVmaW5lZCc7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX29yZGVyQnkoc2VsZWN0b3IpIHtcclxuICAgICAgaWYgKHNlbGYubGVuZ3RoID09PSAwKSByZXR1cm4gX3F1ZXJ5KHRoaXMsIFtdKTtcclxuXHJcbiAgICAgIHZhciB0eXBlID0gX2dldFR5cGUoc2VsZWN0b3IpO1xyXG4gICAgICB2YXIgcmVzdWx0O1xyXG5cclxuICAgICAgaWYgKHR5cGUgPT0gJ251bWJlcicpIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHsgXHJcbiAgICAgICAgICBpZiAoc2VsZWN0b3IoYSkgPT09IHNlbGVjdG9yKGIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChzZWxlY3RvcihhKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gLTE7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHNlbGVjdG9yKGIpID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHJldHVybiBzZWxlY3RvcihhKSAtIHNlbGVjdG9yKGIpOyBcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIGlmICh0eXBlID09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gc2VsZi5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7XHJcbiAgICAgICAgICB2YXIgeCA9IHNlbGVjdG9yKGEpIHx8ICcnO1xyXG4gICAgICAgICAgdmFyIHkgPSBzZWxlY3RvcihiKSB8fCAnJztcclxuXHJcbiAgICAgICAgICByZXR1cm4geCA8IHkgPyAtMSA6ICh4ID4geSA/IDEgOiAwKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIGlmICh0eXBlID09ICdib29sZWFuJykge1xyXG4gICAgICAgIHJlc3VsdCA9IHNlbGYuc29ydChmdW5jdGlvbiAoYSwgYikgeyByZXR1cm4gc2VsZWN0b3IoYSkgPT0gc2VsZWN0b3IoYikgPyAxIDogLTE7IH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gJ0RhdGUnKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gc2VsZi5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7IHJldHVybiAoc2VsZWN0b3IoYSkgfHwgbmV3IERhdGUoMCkpLmdldFRpbWUoKSAtIChzZWxlY3RvcihiKSB8fCBuZXcgRGF0ZSgwKSkuZ2V0VGltZSgpOyB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyB3ZWxsLCBJIHdhbnQgaXQgW3VuZGVmaW5lZCwgbnVsbCwgLUluZmluaXR5LCAtMSAuLi5dXHJcbiAgICAgIGlmIChyZXN1bHQuYW55KGZ1bmN0aW9uIChpKSB7IHJldHVybiBzZWxlY3RvcihpKSA9PT0gdW5kZWZpbmVkOyB9KSkge1xyXG4gICAgICAgIHZhciBkZWZpbmVkID0gcmVzdWx0LndoZXJlKGZ1bmN0aW9uIChpKSB7IHJldHVybiBzZWxlY3RvcihpKSAhPT0gdW5kZWZpbmVkOyB9KTtcclxuICAgICAgICB2YXIgZW1wdHkgPSByZXN1bHQud2hlcmUoZnVuY3Rpb24gKGkpIHsgcmV0dXJuIHNlbGVjdG9yKGkpID09PSB1bmRlZmluZWQ7IH0pO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVtcHR5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBkZWZpbmVkLnVuc2hpZnQoZW1wdHlbaV0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVzdWx0ID0gZGVmaW5lZDtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfb3JkZXJCeURlc2NlbmRpbmcoc2VsZWN0b3IpIHtcclxuICAgICAgaWYgKHNlbGYubGVuZ3RoID09PSAwKSByZXR1cm4gX3F1ZXJ5KHRoaXMsIFtdKTtcclxuXHJcbiAgICAgIHZhciB0eXBlID0gX2dldFR5cGUoc2VsZWN0b3IpO1xyXG4gICAgICB2YXIgcmVzdWx0O1xyXG5cclxuICAgICAgaWYgKHR5cGUgPT0gJ251bWJlcicpIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHsgXHJcbiAgICAgICAgICBpZiAoc2VsZWN0b3IoYSkgPT09IHNlbGVjdG9yKGIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChzZWxlY3RvcihhKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gMTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoc2VsZWN0b3IoYikgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIC0xO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHJldHVybiBzZWxlY3RvcihiKSAtIHNlbGVjdG9yKGEpOyBcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIGlmICh0eXBlID09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gc2VsZi5zb3J0KGZ1bmN0aW9uIChiLCBhKSB7XHJcbiAgICAgICAgICB2YXIgeCA9IHNlbGVjdG9yKGEpIHx8ICcnO1xyXG4gICAgICAgICAgdmFyIHkgPSBzZWxlY3RvcihiKSB8fCAnJztcclxuXHJcbiAgICAgICAgICByZXR1cm4geCA8IHkgPyAtMSA6ICh4ID4geSA/IDEgOiAwKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIGlmICh0eXBlID09ICdib29sZWFuJykge1xyXG4gICAgICAgIHJlc3VsdCA9IHNlbGYuc29ydChmdW5jdGlvbiAoYiwgYSkgeyByZXR1cm4gc2VsZWN0b3IoYSkgPT0gc2VsZWN0b3IoYikgPyAtMSA6IDE7IH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gJ0RhdGUnKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gc2VsZi5zb3J0KGZ1bmN0aW9uIChiLCBhKSB7IHJldHVybiAoc2VsZWN0b3IoYSkgfHwgbmV3IERhdGUoMCkpLmdldFRpbWUoKSAtIChzZWxlY3RvcihiKSB8fCBuZXcgRGF0ZSgwKSkuZ2V0VGltZSgpOyB9KTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAocmVzdWx0LmFueShmdW5jdGlvbiAoaSkgeyByZXR1cm4gc2VsZWN0b3IoaSkgPT09IHVuZGVmaW5lZDsgfSkpIHtcclxuICAgICAgICB2YXIgZGVmaW5lZCA9IHJlc3VsdC53aGVyZShmdW5jdGlvbiAoaSkgeyByZXR1cm4gc2VsZWN0b3IoaSkgIT09IHVuZGVmaW5lZDsgfSk7XHJcbiAgICAgICAgdmFyIGVtcHR5ID0gcmVzdWx0LndoZXJlKGZ1bmN0aW9uIChpKSB7IHJldHVybiBzZWxlY3RvcihpKSA9PT0gdW5kZWZpbmVkOyB9KTtcclxuXHJcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbXB0eS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgZGVmaW5lZC5wdXNoKGVtcHR5W2ldKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJlc3VsdCA9IGRlZmluZWQ7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX2ZvckVhY2goYWN0aW9uKSB7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGFjdGlvbi5iaW5kKHNlbGZbaV0sIHNlbGZbaV0sIGkpKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBzZWxmO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF90b0FycmF5KCkge1xyXG4gICAgICByZXR1cm4gY29udmVyeUFycmF5KHNlbGYpO1xyXG5cclxuICAgICAgZnVuY3Rpb24gY29udmVyeUFycmF5KGFycmF5KSB7XHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAoYXJyYXlbaV0gaW5zdGFuY2VvZiBRdWVyeSkge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChjb252ZXJ5QXJyYXkoYXJyYXlbaV0pKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHQucHVzaChhcnJheVtpXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3RvSlNPTigpIHtcclxuICAgICAgcmV0dXJuIGNvbnZlcnRKU09OKHNlbGYpO1xyXG5cclxuICAgICAgZnVuY3Rpb24gY29udmVydEpTT04oYXJyYXkpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICAgICAgcmVzdWx0Lmxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoYXJyYXkua2V5ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgIHJlc3VsdC5rZXkgPSBhcnJheS5rZXk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAoYXJyYXlbaV0gaW5zdGFuY2VvZiBRdWVyeSkge1xyXG4gICAgICAgICAgICByZXN1bHRbaV0gPSBjb252ZXJ0SlNPTihhcnJheVtpXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgcmVzdWx0W2ldID0gYXJyYXlbaV07XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX2VxdWFsIChjLCB4KSB7XHJcbiAgICAgIC8vIGRhdGUgY29tcGFyZVxyXG4gICAgICBpZiAoYyBpbnN0YW5jZW9mIERhdGUgJiYgeCBpbnN0YW5jZW9mIERhdGUpIHtcclxuICAgICAgICByZXR1cm4gYy5nZXRUaW1lKCkgPT0geC5nZXRUaW1lKCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChjIGluc3RhbmNlb2YgRGF0ZSAhPSB4IGluc3RhbmNlb2YgRGF0ZSkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gdHlwZSBjb21wYXJlXHJcbiAgICAgIGlmICh0eXBlb2YgYyAhPT0gdHlwZW9mIHgpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIG51bWJlciBvciBzdHJpbmcgY29tcGFyZVxyXG4gICAgICBpZiAodHlwZW9mIGMgPT09ICdudW1iZXInIHx8IHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgIHJldHVybiBjID09PSB4O1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBib3RoIHVuZGVmaW5lZFxyXG4gICAgICBpZiAodHlwZW9mIGMgPT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIG9iamVjdCBwcm9wZXJ0aWVzIGNvbXBhcmVcclxuICAgICAgZm9yICh2YXIga2V5MSBpbiBjKSB7XHJcbiAgICAgICAgaWYgKGNba2V5MV0gIT09IHhba2V5MV0pIHtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGNoZWNrIHRoZSBvdGhlciBvYmplY3QgdG9vXHJcbiAgICAgIGZvciAodmFyIGtleTIgaW4geCkge1xyXG4gICAgICAgIGlmIChjW2tleTJdICE9PSB4W2tleTJdKSB7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBhbGwgc2VlbXMgdG8gYmUgcmlnaHRcclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBhcnJheSBpbmhlcml0YW5jZVxyXG4gIFF1ZXJ5LnByb3RvdHlwZSA9IGNsb25lKEFycmF5LnByb3RvdHlwZSk7XHJcbiAgcSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIGNvbnN0cnVjdChRdWVyeSwgYXJndW1lbnRzKTsgfTtcclxuXHJcbiAgLy8gcHJvdG90eXBlIGV4dGVuc2lvbiBzbyB5b3UgY2FuIHZhLmV4dGVuZHMoQXJyYXkpIG9yIHdoYXRldmVyXHJcbiAgcS5leHRlbmRzID0gZXh0ZW5kO1xyXG5cclxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcclxuICAgIG1vZHVsZS5leHBvcnRzID0gcTtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICByb290LnZhID0gcTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGV4dGVuZChvYmopIHtcclxuICAgIHEoZnVuY3Rpb25zKS5mb3JFYWNoKGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICAgIG9iai5wcm90b3R5cGVbbmFtZV0gPSBvYmoucHJvdG90eXBlW25hbWVdIHx8IGZ1bmN0aW9uICgpIHsgXHJcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2VcclxuICAgICAgICAgIC5jYWxsKGFyZ3VtZW50cyk7XHJcblxyXG4gICAgICAgIHJldHVybiBxKHRoaXMpW25hbWVdLmFwcGx5KHRoaXMsIGFyZ3MpOyBcclxuICAgICAgfTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gY2xvbmUob2JqKSB7XHJcbiAgICBmdW5jdGlvbiBGKCkgeyB9XHJcbiAgICBGLnByb3RvdHlwZSA9IG9iajtcclxuICAgIFxyXG4gICAgcmV0dXJuIG5ldyBGKCk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjb25zdHJ1Y3QoY29uc3RydWN0b3IsIGFyZ3MpIHtcclxuICAgIGZ1bmN0aW9uIEYoKSB7XHJcbiAgICAgIHJldHVybiBjb25zdHJ1Y3Rvci5hcHBseSh0aGlzLCBhcmdzKTtcclxuICAgIH1cclxuXHJcbiAgICBGLnByb3RvdHlwZSA9IGNvbnN0cnVjdG9yLnByb3RvdHlwZTtcclxuXHJcbiAgICByZXR1cm4gbmV3IEYoKTtcclxuICB9XHJcbn0pKHRoaXMpOyIsIm1vZHVsZS5leHBvcnRzID0gWyckc2NvcGUnLCAnJHJvb3RTY29wZScsICckbG9jYXRpb24nLCAnJHdpbmRvdycsICdkYicsIGhvbWVdO1xuXG5mdW5jdGlvbiBob21lKCRzY29wZSwgJHJvb3RTY29wZSwgJGxvY2F0aW9uLCAkd2luZG93LCBkYikge1xuICAndXNlIHN0cmljdCc7XG5cbiAgZGIuZmV0Y2hBbGwoZnVuY3Rpb24gKGVyciwgbWF0Y2hlcykge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAkc2NvcGUubWF0Y2hlcyA9IG1hdGNoZXM7XG4gICAgJHNjb3BlLiRhcHBseSgpO1xuICB9KTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBob21lOiByZXF1aXJlKCcuL2hvbWUuanMnKSxcbiAgcGxheWVyOiByZXF1aXJlKCcuL3BsYXllci5qcycpXG59O1xuIiwidmFyIHZhID0gcmVxdWlyZSgndmVyeS1hcnJheScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFsnJHNjb3BlJywgJyRyb290U2NvcGUnLCAnJHJvdXRlUGFyYW1zJywgJyRsb2NhdGlvbicsICckd2luZG93JywgJ2RiJywgcGxheWVyXTtcblxuZnVuY3Rpb24gcGxheWVyKCRzY29wZSwgJHJvb3RTY29wZSwgJHJvdXRlUGFyYW1zLCAkbG9jYXRpb24sICR3aW5kb3csIGRiKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkYi5mZXRjaEFsbChmdW5jdGlvbiAoZXJyLCBtYXRjaGVzKSB7XG4gICAgdmFyIGluZm87XG5cbiAgICBpZiAoZXJyKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGluZm8gPSB2YShtYXRjaGVzKS5zZWxlY3RNYW55KGZ1bmN0aW9uIChtYXRjaCkge1xuICAgICAgcmV0dXJuIG1hdGNoLnBsYXllcnM7XG4gICAgfSkuZmlsdGVyKGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgICAgIHJldHVybiBwbGF5ZXIubmFtZSA9PT0gJHJvdXRlUGFyYW1zLm5hbWU7XG4gICAgfSk7XG5cbiAgICAkc2NvcGUubmFtZSA9ICRyb3V0ZVBhcmFtcy5uYW1lO1xuICAgICRzY29wZS5tYXRjaGVzID0gaW5mbztcbiAgICAkc2NvcGUuYXNzaXN0cyA9IHZhKGluZm8pLnN1bShmdW5jdGlvbiAoaXRlbSkgeyByZXR1cm4gaXRlbS5hc3Npc3RzOyB9KTtcbiAgICAkc2NvcGUuZ29hbHMgPSB2YShpbmZvKS5zdW0oZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuIGl0ZW0udG90YWw7IH0pO1xuICAgICRzY29wZS4kYXBwbHkoKTtcbiAgfSk7XG59XG4iLCJ2YXIgY29udHJhID0gcmVxdWlyZSgnY29udHJhJyk7XG52YXIgb3BlbiA9IHJlcXVpcmUoJy4vb3Blbi5qcycpO1xudmFyIGNvbnRlbnQ7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGRvY3MpIHtcbiAgdmFyIGlzRmV0Y2hpbmc7XG4gIHZhciBjYWxsYmFja3MgPSBbXTtcblxuICByZXR1cm4ge1xuICAgIGZldGNoOiBmZXRjaCxcbiAgICBmZXRjaEFsbDogZmV0Y2hBbGxcbiAgfTtcblxuICBmdW5jdGlvbiBmZXRjaChjYikge1xuICAgIGlmIChjb250ZW50KSB7XG4gICAgICBjYihudWxsLCBjb250ZW50KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjYWxsYmFja3MucHVzaChjYik7XG5cbiAgICBpZiAoaXNGZXRjaGluZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG9wZW4oZG9jcywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb250ZW50ID0gZGF0YTtcbiAgICAgIGNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZmV0Y2hBbGwoY2IpIHtcbiAgICBmZXRjaChmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICB2YXIgZm5zID0gZGF0YS5tYXAoZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuIGZ1bmN0aW9uKGNhbGxiYWNrKSB7IGl0ZW0uZmV0Y2goY2FsbGJhY2spOyB9OyB9KTtcblxuICAgICAgY29udHJhLmNvbmN1cnJlbnQoZm5zLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwidmFtb1wiKVxuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjYihudWxsLCByZXN1bHRzKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59O1xuIiwidmFyIHRhYmxlID0gcmVxdWlyZSgnZ3N4Jyk7XG52YXIgY29udHJhID0gcmVxdWlyZSgnY29udHJhJyk7XG52YXIgdHJhbnNmb3JtID0gcmVxdWlyZSgnLi90cmFuc2Zvcm0uanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBvcGVuO1xuXG5mdW5jdGlvbiBvcGVuKGRvY3MsIGRvbmUpIHtcbiAgdmFyIHRhc2tzID0gZG9jcy5tYXAoZnVuY3Rpb24gKGRvYykge1xuICAgIHJldHVybiBmdW5jdGlvbihjYikge1xuICAgICAgdGFibGUoZG9jLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBjYihlcnIpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNiKG51bGwsIGRhdGEuc2hlZXRzKTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIGNvbnRyYS5jb25jdXJyZW50KHRhc2tzLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgZG9uZShlcnIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGRvbmUobnVsbCwgdHJhbnNmb3JtKHJlc3VsdHMpKTtcbiAgfSk7XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoJ3ZlcnktYXJyYXknKTtcblxubW9kdWxlLmV4cG9ydHMgPSB0cmFuc2Zvcm07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybShyZXN1bHRzKSB7XG4gIHJldHVybiByZXN1bHRzXG4gICAgLnJlZHVjZShmdW5jdGlvbiAoeCwgeSkgeyByZXR1cm4geC5jb25jYXQoeSk7IH0sIFtdKVxuICAgIC5tYXAoZnVuY3Rpb24gKG1hdGNoKSB7XG4gICAgICB2YXIgaXNGZXRjaGluZztcbiAgICAgIHZhciBjYWxsYmFja3MgPSBbXTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IG1hdGNoLmlkLFxuICAgICAgICBuYW1lOiBtYXRjaC5uYW1lLFxuICAgICAgICBmZXRjaDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICAgaWYgKHNlbGYucGxheWVycykge1xuICAgICAgICAgICAgY2IobnVsbCwgc2VsZik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY2FsbGJhY2tzLnB1c2goY2IpO1xuXG4gICAgICAgICAgaWYgKGlzRmV0Y2hpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpc0ZldGNoaW5nID0gdHJ1ZTtcbiAgICAgICAgICBtYXRjaC5mZXRjaChmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICAgICAgICB2YXIgdGVhbXM7XG5cbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2tzLmZvckVhY2goZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2VsZi5wbGF5ZXJzID0gZGF0YS5tYXAoZnVuY3Rpb24gKHBsYXllciwgaXgpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiBwbGF5ZXIuanVnYWRvcixcbiAgICAgICAgICAgICAgICBhc3Npc3RzOiArcGxheWVyLmFzaXN0ZW5jaWFzLFxuICAgICAgICAgICAgICAgIGdvYWw6ICtwbGF5ZXIuanVnYWRhLFxuICAgICAgICAgICAgICAgIGhlYWRlZDogK3BsYXllci5jYWJlemEsXG4gICAgICAgICAgICAgICAgZnJlZUtpY2s6ICtwbGF5ZXIudGlyb2xpYnJlLFxuICAgICAgICAgICAgICAgIHBlbmFsdHk6ICtwbGF5ZXIucGVuYWwsXG4gICAgICAgICAgICAgICAgdG90YWw6ICtwbGF5ZXIuanVnYWRhICsgK3BsYXllci5jYWJlemEgKyArcGxheWVyLnRpcm9saWJyZSArICtwbGF5ZXIucGVuYWwsXG4gICAgICAgICAgICAgICAgb3duOiArcGxheWVyLmVuY29udHJhLFxuICAgICAgICAgICAgICAgIHRlYW06IHBsYXllci5lcXVpcG8sXG4gICAgICAgICAgICAgICAgc3Vic3RpdHV0ZTogaXggPj0gMjJcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzZWxmLnN0YXJ0ZXJzID0gc2VsZi5wbGF5ZXJzLmZpbHRlcihmdW5jdGlvbiAocGxheWVyKSB7IHJldHVybiAhcGxheWVyLnN1YnN0aXR1dGU7IH0pO1xuICAgICAgICAgICAgc2VsZi5zdWJzdGl0dXRlcyA9IHNlbGYucGxheWVycy5maWx0ZXIoZnVuY3Rpb24gKHBsYXllcikgeyByZXR1cm4gcGxheWVyLnN1YnN0aXR1dGU7IH0pO1xuICAgICAgICAgICAgc2VsZi50ZWFtcyA9IF8oc2VsZi5zdGFydGVycykuZ3JvdXBCeShmdW5jdGlvbiAocGxheWVyKSB7IHJldHVybiBwbGF5ZXIudGVhbTsgfSkubWFwKGZ1bmN0aW9uICh0ZWFtKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogdGVhbS5rZXksXG4gICAgICAgICAgICAgICAgcGxheWVyczogdGVhbSxcbiAgICAgICAgICAgICAgICBnb2Fsczoge1xuICAgICAgICAgICAgICAgICAgY291bnQ6IHRlYW0ubWFwKGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGxheWVyLnRvdGFsO1xuICAgICAgICAgICAgICAgICAgICB9KS5yZWR1Y2UoZnVuY3Rpb24gKGEsIGIpIHsgcmV0dXJuIGEgKyBiOyB9LCAwKSArXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuc3RhcnRlcnMuZmlsdGVyKGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGxheWVyLnRlYW0gIT0gdGVhbS5rZXkgJiYgcGxheWVyLm93bjtcbiAgICAgICAgICAgICAgICAgICAgfSkubWFwKGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGxheWVyLm93bjtcbiAgICAgICAgICAgICAgICAgICAgfSkucmVkdWNlKGZ1bmN0aW9uIChhLCBiKSB7IHJldHVybiBhICsgYjsgfSwgMCksXG4gICAgICAgICAgICAgICAgICBkZXRhaWw6IHRlYW0uZmlsdGVyKGZ1bmN0aW9uIChwbGF5ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGxheWVyLnRvdGFsO1xuICAgICAgICAgICAgICAgICAgICB9KS5jb25jYXQoc2VsZi5zdGFydGVycy5maWx0ZXIoZnVuY3Rpb24gKHBsYXllcikgeyByZXR1cm4gcGxheWVyLnRlYW0gIT0gdGVhbS5rZXkgJiYgcGxheWVyLm93bjsgfSkpXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBhc3Npc3RzOiB0ZWFtLmZpbHRlcihmdW5jdGlvbiAocGxheWVyKSB7IHJldHVybiBwbGF5ZXIuYXNzaXN0czsgfSlcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoc2VsZi50ZWFtcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgc2VsZi50ZWFtcyA9IFtdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgc2VsZik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9KTtcbn1cbiIsInZhciBkb2NzID0gcmVxdWlyZSgnLi4vZG9jcy5qc29uJyk7XG52YXIgZGIgPSByZXF1aXJlKCcuL2RiJykoZG9jcyk7XG52YXIgYmNoeiA9IHJlcXVpcmUoJy4vbW9kdWxlcycpLmJjaHo7XG52YXIgY29udHJvbGxlcnMgPSByZXF1aXJlKCcuL2NvbnRyb2xsZXJzJyk7XG5cbmJjaHoudmFsdWUoJ2RiJywgZGIpO1xuYmNoei5jb250cm9sbGVyKCdIb21lQ3RybCcsIGNvbnRyb2xsZXJzLmhvbWUpO1xuYmNoei5jb250cm9sbGVyKCdQbGF5ZXJDdHJsJywgY29udHJvbGxlcnMucGxheWVyKTtcblxuZnVuY3Rpb24gaW5pdGlhbGl6ZShlcnIsIGJvb2spIHtcbiAgaWYgKGVycikge1xuICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICByZXR1cm47XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gYW5ndWxhci5tb2R1bGUoJ2JjaHonLCBbJ25nUm91dGUnXSlcbiAgLmNvbmZpZyhbJyRyb3V0ZVByb3ZpZGVyJywgJyRsb2NhdGlvblByb3ZpZGVyJywgZnVuY3Rpb24gKCRyb3V0ZVByb3ZpZGVyLCAkbG9jYXRpb25Qcm92aWRlcikge1xuXG4gICAgJHJvdXRlUHJvdmlkZXJcbiAgICAgIC53aGVuKCcvJywgeyBjb250cm9sbGVyOiAnSG9tZUN0cmwnLCB0ZW1wbGF0ZVVybDogJy92aWV3cy9ob21lLmh0bWwnIH0pXG4gICAgICAud2hlbignL3BsYXllcnMvOm5hbWUnLCB7IGNvbnRyb2xsZXI6ICdQbGF5ZXJDdHJsJywgdGVtcGxhdGVVcmw6ICcvdmlld3MvcGxheWVyLmh0bWwnIH0pXG4gICAgICAud2hlbignLzQwNCcsIHsgdGVtcGxhdGVVcmw6ICcvc2l0ZS80MDQuaHRtbCcgfSlcbiAgICAgIC5vdGhlcndpc2UoeyB0ZW1wbGF0ZVVybDogJy9zaXRlLzQwNC5odG1sJyB9KTtcbiAgfV0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIGJjaHo6IHJlcXVpcmUoJy4vYmNoei5qcycpXG59O1xuIl19
