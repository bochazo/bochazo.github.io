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

},{}],14:[function(require,module,exports){
module.exports = {
  home: require('./home.js')  
};
},{"./home.js":13}],15:[function(require,module,exports){
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

},{"./open.js":16}],16:[function(require,module,exports){
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

},{"./transform.js":17,"contra":3,"gsx":5}],17:[function(require,module,exports){
var _ = require('very-array');

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
            var teams;

            if (err) {
              cb(err);
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
                      return player.goal + player.headed + player.freeKick + player.penalty - player.own;
                    }).reduce(function (a, b) { return a + b; }),
                  detail: team.filter(function (player) {
                      return player.goal || player.headed || player.freeKick || player.penalty || player.own;
                    })
                },
                assists: team.filter(function (player) { return player.assists; })
              };
            });

            if (self.teams.length === 1) {
              self.teams = [];
            }

            cb(null, self.list);
          });
        }
      };
    });
}

},{"very-array":12}],18:[function(require,module,exports){
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

},{"../docs.json":1,"./controllers":14,"./db":15,"./modules":20}],19:[function(require,module,exports){
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

},{}],20:[function(require,module,exports){
module.exports = {
  bchz: require('./bchz.js')
};

},{"./bchz.js":19}]},{},[18])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiZG9jcy5qc29uIiwibm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXHByb2Nlc3NcXGJyb3dzZXIuanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGNvbnRyYVxcc3JjXFxjb250cmEuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcaW5kZXguanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxib29rLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcZW5kcG9pbnQuanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxnZXRKU09OLmpzIiwibm9kZV9tb2R1bGVzXFxnc3hcXHNyY1xcbGlzdC5qcyIsIm5vZGVfbW9kdWxlc1xcZ3N4XFxzcmNcXG1haW4uanMiLCJub2RlX21vZHVsZXNcXGdzeFxcc3JjXFxzaGVldC5qcyIsIm5vZGVfbW9kdWxlc1xcdmVyeS1hcnJheVxcc3JjXFx2ZXJ5LWFycmF5LmpzIiwic3JjXFxjb250cm9sbGVyc1xcaG9tZS5qcyIsInNyY1xcY29udHJvbGxlcnNcXGluZGV4LmpzIiwic3JjXFxkYlxcaW5kZXguanMiLCJzcmNcXGRiXFxvcGVuLmpzIiwic3JjXFxkYlxcdHJhbnNmb3JtLmpzIiwic3JjXFxpbmRleC5qcyIsInNyY1xcbW9kdWxlc1xcYmNoei5qcyIsInNyY1xcbW9kdWxlc1xcaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6REE7QUFDQTs7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUM3T0E7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xlQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEJBO0FBQ0E7QUFDQTs7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cz1bXCJodHRwczovL2RvY3MuZ29vZ2xlLmNvbS9zcHJlYWRzaGVldHMvZC8xTGtWa2IzVkZqeEJmNkpwdlRPZ2tsemN3cjlPZ1VfOG44ZkJweXFoVlM0VS9wdWJodG1sXCJdIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuICAgIHZhciBjdXJyZW50UXVldWU7XG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHZhciBpID0gLTE7XG4gICAgICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtpXSgpO1xuICAgICAgICB9XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbn1cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgcXVldWUucHVzaChmdW4pO1xuICAgIGlmICghZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9zcmMvY29udHJhLmpzJyk7XG4iLCIoZnVuY3Rpb24gKE9iamVjdCwgcm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgdmFyIFNFUklBTCA9IDE7XG4gIHZhciBDT05DVVJSRU5UID0gSW5maW5pdHk7XG5cbiAgZnVuY3Rpb24gbm9vcCAoKSB7fVxuICBmdW5jdGlvbiBhIChvKSB7IHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykgPT09ICdbb2JqZWN0IEFycmF5XSc7IH1cbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG4gIGZ1bmN0aW9uIG9uY2UgKGZuKSB7XG4gICAgdmFyIGRpc3Bvc2VkO1xuICAgIGZ1bmN0aW9uIGRpc3Bvc2FibGUgKCkge1xuICAgICAgaWYgKGRpc3Bvc2VkKSB7IHJldHVybjsgfVxuICAgICAgZGlzcG9zZWQgPSB0cnVlO1xuICAgICAgKGZuIHx8IG5vb3ApLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgfVxuICAgIGRpc3Bvc2FibGUuZGlzY2FyZCA9IGZ1bmN0aW9uICgpIHsgZGlzcG9zZWQgPSB0cnVlOyB9O1xuICAgIHJldHVybiBkaXNwb3NhYmxlO1xuICB9XG4gIGZ1bmN0aW9uIGhhbmRsZSAoYXJncywgZG9uZSwgZGlzcG9zYWJsZSkge1xuICAgIHZhciBlcnIgPSBhcmdzLnNoaWZ0KCk7XG4gICAgaWYgKGVycikgeyBpZiAoZGlzcG9zYWJsZSkgeyBkaXNwb3NhYmxlLmRpc2NhcmQoKTsgfSBkZWJvdW5jZShkb25lLCBbZXJyXSk7IHJldHVybiB0cnVlOyB9XG4gIH1cblxuICAvLyBjcm9zcy1wbGF0Zm9ybSB0aWNrZXJcbiAgdmFyIHNpID0gdHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJywgdGljaztcbiAgaWYgKHNpKSB7XG4gICAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRJbW1lZGlhdGUoZm4pOyB9O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBwcm9jZXNzICE9PSB1bmRlZiAmJiBwcm9jZXNzLm5leHRUaWNrKSB7XG4gICAgdGljayA9IHByb2Nlc3MubmV4dFRpY2s7XG4gIH0gZWxzZSB7XG4gICAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRUaW1lb3V0KGZuLCAwKTsgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9jdXJyeSAoKSB7XG4gICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgdmFyIG1ldGhvZCA9IGFyZ3Muc2hpZnQoKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gY3VycmllZCAoKSB7XG4gICAgICB2YXIgbW9yZSA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIG1ldGhvZC5hcHBseShtZXRob2QsIGFyZ3MuY29uY2F0KG1vcmUpKTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gX3dhdGVyZmFsbCAoc3RlcHMsIGRvbmUpIHtcbiAgICB2YXIgZCA9IG9uY2UoZG9uZSk7XG4gICAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciBzdGVwID0gc3RlcHMuc2hpZnQoKTtcbiAgICAgIGlmIChzdGVwKSB7XG4gICAgICAgIGlmIChoYW5kbGUoYXJncywgZCkpIHsgcmV0dXJuOyB9XG4gICAgICAgIGFyZ3MucHVzaChvbmNlKG5leHQpKTtcbiAgICAgICAgZGVib3VuY2Uoc3RlcCwgYXJncyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJvdW5jZShkLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH1cbiAgICBuZXh0KCk7XG4gIH1cblxuICBmdW5jdGlvbiBfY29uY3VycmVudCAodGFza3MsIGNvbmN1cnJlbmN5LCBkb25lKSB7XG4gICAgaWYgKHR5cGVvZiBjb25jdXJyZW5jeSA9PT0gJ2Z1bmN0aW9uJykgeyBkb25lID0gY29uY3VycmVuY3k7IGNvbmN1cnJlbmN5ID0gQ09OQ1VSUkVOVDsgfVxuICAgIHZhciBkID0gb25jZShkb25lKTtcbiAgICB2YXIgcSA9IF9xdWV1ZSh3b3JrZXIsIGNvbmN1cnJlbmN5KTtcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHRhc2tzKTtcbiAgICB2YXIgcmVzdWx0cyA9IGEodGFza3MpID8gW10gOiB7fTtcbiAgICBxLnVuc2hpZnQoa2V5cyk7XG4gICAgcS5vbignZHJhaW4nLCBmdW5jdGlvbiBjb21wbGV0ZWQgKCkgeyBkKG51bGwsIHJlc3VsdHMpOyB9KTtcbiAgICBmdW5jdGlvbiB3b3JrZXIgKGtleSwgbmV4dCkge1xuICAgICAgZGVib3VuY2UodGFza3Nba2V5XSwgW3Byb2NlZWRdKTtcbiAgICAgIGZ1bmN0aW9uIHByb2NlZWQgKCkge1xuICAgICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgICAgaWYgKGhhbmRsZShhcmdzLCBkKSkgeyByZXR1cm47IH1cbiAgICAgICAgcmVzdWx0c1trZXldID0gYXJncy5zaGlmdCgpO1xuICAgICAgICBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gX3NlcmllcyAodGFza3MsIGRvbmUpIHtcbiAgICBfY29uY3VycmVudCh0YXNrcywgU0VSSUFMLCBkb25lKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIF9tYXAgKGNhcCwgdGhlbiwgYXR0YWNoZWQpIHtcbiAgICB2YXIgbWFwID0gZnVuY3Rpb24gKGNvbGxlY3Rpb24sIGNvbmN1cnJlbmN5LCBpdGVyYXRvciwgZG9uZSkge1xuICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBpZiAoYXJncy5sZW5ndGggPT09IDIpIHsgaXRlcmF0b3IgPSBjb25jdXJyZW5jeTsgY29uY3VycmVuY3kgPSBDT05DVVJSRU5UOyB9XG4gICAgICBpZiAoYXJncy5sZW5ndGggPT09IDMgJiYgdHlwZW9mIGNvbmN1cnJlbmN5ICE9PSAnbnVtYmVyJykgeyBkb25lID0gaXRlcmF0b3I7IGl0ZXJhdG9yID0gY29uY3VycmVuY3k7IGNvbmN1cnJlbmN5ID0gQ09OQ1VSUkVOVDsgfVxuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhjb2xsZWN0aW9uKTtcbiAgICAgIHZhciB0YXNrcyA9IGEoY29sbGVjdGlvbikgPyBbXSA6IHt9O1xuICAgICAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uIGluc2VydCAoa2V5KSB7XG4gICAgICAgIHRhc2tzW2tleV0gPSBmdW5jdGlvbiBpdGVyYXRlIChjYikge1xuICAgICAgICAgIGlmIChpdGVyYXRvci5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGNvbGxlY3Rpb25ba2V5XSwga2V5LCBjYik7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yKGNvbGxlY3Rpb25ba2V5XSwgY2IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgX2NvbmN1cnJlbnQodGFza3MsIGNhcCB8fCBjb25jdXJyZW5jeSwgdGhlbiA/IHRoZW4oY29sbGVjdGlvbiwgb25jZShkb25lKSkgOiBkb25lKTtcbiAgICB9O1xuICAgIGlmICghYXR0YWNoZWQpIHsgbWFwLnNlcmllcyA9IF9tYXAoU0VSSUFMLCB0aGVuLCB0cnVlKTsgfVxuICAgIHJldHVybiBtYXA7XG4gIH1cblxuICBmdW5jdGlvbiBfZWFjaCAoY29uY3VycmVuY3kpIHtcbiAgICByZXR1cm4gX21hcChjb25jdXJyZW5jeSwgdGhlbik7XG4gICAgZnVuY3Rpb24gdGhlbiAoY29sbGVjdGlvbiwgZG9uZSkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIG1hc2sgKGVycikge1xuICAgICAgICBkb25lKGVycik7IC8vIG9ubHkgcmV0dXJuIHRoZSBlcnJvciwgbm8gbW9yZSBhcmd1bWVudHNcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gX2ZpbHRlciAoY29uY3VycmVuY3kpIHtcbiAgICByZXR1cm4gX21hcChjb25jdXJyZW5jeSwgdGhlbik7XG4gICAgZnVuY3Rpb24gdGhlbiAoY29sbGVjdGlvbiwgZG9uZSkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIGZpbHRlciAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIGZ1bmN0aW9uIGV4aXN0cyAoaXRlbSwga2V5KSB7XG4gICAgICAgICAgcmV0dXJuICEhcmVzdWx0c1trZXldO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIG9maWx0ZXIgKCkge1xuICAgICAgICAgIHZhciBmaWx0ZXJlZCA9IHt9O1xuICAgICAgICAgIE9iamVjdC5rZXlzKGNvbGxlY3Rpb24pLmZvckVhY2goZnVuY3Rpb24gb21hcHBlciAoa2V5KSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RzKG51bGwsIGtleSkpIHsgZmlsdGVyZWRba2V5XSA9IGNvbGxlY3Rpb25ba2V5XTsgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybiBmaWx0ZXJlZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXJyKSB7IGRvbmUoZXJyKTsgcmV0dXJuOyB9XG4gICAgICAgIGRvbmUobnVsbCwgYShyZXN1bHRzKSA/IGNvbGxlY3Rpb24uZmlsdGVyKGV4aXN0cykgOiBvZmlsdGVyKCkpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiB0aGluZy5lbWl0dGVyU25hcHNob3QoYXJncy5zaGlmdCgpKS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9O1xuICAgIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdCA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgICB2YXIgZXQgPSAoZXZ0W3R5cGVdIHx8IFtdKS5zbGljZSgwKTtcbiAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgICB2YXIgY3R4ID0gdGhpcyB8fCB0aGluZztcbiAgICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldC5sZW5ndGgpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCBjdHgpOyB9IGVsc2UgeyBsaXN0ZW4uYXBwbHkoY3R4LCBhcmdzKTsgfVxuICAgICAgICAgIHJldHVybiAhbGlzdGVuLl9vbmNlO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaW5nO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gX3F1ZXVlICh3b3JrZXIsIGNvbmN1cnJlbmN5KSB7XG4gICAgdmFyIHEgPSBbXSwgbG9hZCA9IDAsIG1heCA9IGNvbmN1cnJlbmN5IHx8IDEsIHBhdXNlZDtcbiAgICB2YXIgcXEgPSBfZW1pdHRlcih7XG4gICAgICBwdXNoOiBtYW5pcHVsYXRlLmJpbmQobnVsbCwgJ3B1c2gnKSxcbiAgICAgIHVuc2hpZnQ6IG1hbmlwdWxhdGUuYmluZChudWxsLCAndW5zaGlmdCcpLFxuICAgICAgcGF1c2U6IGZ1bmN0aW9uICgpIHsgcGF1c2VkID0gdHJ1ZTsgfSxcbiAgICAgIHJlc3VtZTogZnVuY3Rpb24gKCkgeyBwYXVzZWQgPSBmYWxzZTsgZGVib3VuY2UobGFib3IpOyB9LFxuICAgICAgcGVuZGluZzogcVxuICAgIH0pO1xuICAgIGlmIChPYmplY3QuZGVmaW5lUHJvcGVydHkgJiYgIU9iamVjdC5kZWZpbmVQcm9wZXJ0eVBhcnRpYWwpIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShxcSwgJ2xlbmd0aCcsIHsgZ2V0OiBmdW5jdGlvbiAoKSB7IHJldHVybiBxLmxlbmd0aDsgfSB9KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gbWFuaXB1bGF0ZSAoaG93LCB0YXNrLCBkb25lKSB7XG4gICAgICB2YXIgdGFza3MgPSBhKHRhc2spID8gdGFzayA6IFt0YXNrXTtcbiAgICAgIHRhc2tzLmZvckVhY2goZnVuY3Rpb24gaW5zZXJ0ICh0KSB7IHFbaG93XSh7IHQ6IHQsIGRvbmU6IGRvbmUgfSk7IH0pO1xuICAgICAgZGVib3VuY2UobGFib3IpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBsYWJvciAoKSB7XG4gICAgICBpZiAocGF1c2VkIHx8IGxvYWQgPj0gbWF4KSB7IHJldHVybjsgfVxuICAgICAgaWYgKCFxLmxlbmd0aCkgeyBpZiAobG9hZCA9PT0gMCkgeyBxcS5lbWl0KCdkcmFpbicpOyB9IHJldHVybjsgfVxuICAgICAgbG9hZCsrO1xuICAgICAgdmFyIGpvYiA9IHEucG9wKCk7XG4gICAgICB3b3JrZXIoam9iLnQsIG9uY2UoY29tcGxldGUuYmluZChudWxsLCBqb2IpKSk7XG4gICAgICBkZWJvdW5jZShsYWJvcik7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNvbXBsZXRlIChqb2IpIHtcbiAgICAgIGxvYWQtLTtcbiAgICAgIGRlYm91bmNlKGpvYi5kb25lLCBhdG9hKGFyZ3VtZW50cywgMSkpO1xuICAgICAgZGVib3VuY2UobGFib3IpO1xuICAgIH1cbiAgICByZXR1cm4gcXE7XG4gIH1cblxuICB2YXIgY29udHJhID0ge1xuICAgIGN1cnJ5OiBfY3VycnksXG4gICAgY29uY3VycmVudDogX2NvbmN1cnJlbnQsXG4gICAgc2VyaWVzOiBfc2VyaWVzLFxuICAgIHdhdGVyZmFsbDogX3dhdGVyZmFsbCxcbiAgICBlYWNoOiBfZWFjaCgpLFxuICAgIG1hcDogX21hcCgpLFxuICAgIGZpbHRlcjogX2ZpbHRlcigpLFxuICAgIHF1ZXVlOiBfcXVldWUsXG4gICAgZW1pdHRlcjogX2VtaXR0ZXJcbiAgfTtcblxuICAvLyBjcm9zcy1wbGF0Zm9ybSBleHBvcnRcbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09IHVuZGVmICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBjb250cmE7XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5jb250cmEgPSBjb250cmE7XG4gIH1cbn0pKE9iamVjdCwgdGhpcyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vc3JjL21haW4uanMnKTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFNoZWV0ID0gcmVxdWlyZSgnLi9zaGVldC5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJvb2s7XG5cbmZ1bmN0aW9uIEJvb2soc291cmNlLCBrZXkpIHtcbiAgdGhpcy5zaGVldHMgPSBzb3VyY2UuZmVlZC5lbnRyeS5tYXAoZnVuY3Rpb24gKHNoZWV0KSB7XG4gICAgcmV0dXJuIG5ldyBTaGVldChzaGVldCwga2V5KTtcbiAgfSk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gJ2h0dHBzOi8vc3ByZWFkc2hlZXRzLmdvb2dsZS5jb20nO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGdldEpTT047XG5cbmZ1bmN0aW9uIGdldEpTT04ocGF0aCwgY2IpIHtcbiAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICB2YXIganNvbjtcblxuICB4aHIub3BlbignR0VUJywgcGF0aCk7XG4gIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoeGhyLnJlYWR5U3RhdGUgIT09IDQgfHwgeGhyLnN0YXR1cyAhPT0gMjAwKSB7XG4gICAgICBjYih4aHIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBqc29uID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBjYih4aHIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNiKG51bGwsIGpzb24pO1xuICB9O1xuICB4aHIuc2VuZCgpO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxpc3Q7XG5cbmZ1bmN0aW9uIGxpc3Qoc291cmNlKSB7XG4gIHJldHVybiBzb3VyY2UuZmVlZC5lbnRyeS5tYXAoZnVuY3Rpb24gKGVudHJ5KSB7XG4gICAgdmFyIG9iaiA9IHt9O1xuXG4gICAgT2JqZWN0LmtleXMoZW50cnkpLmZpbHRlcihmdW5jdGlvbiAoa2V5KSB7XG4gICAgICByZXR1cm4gL2dzeFxcJC8udGVzdChrZXkpO1xuICAgIH0pLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgb2JqW2tleS5zdWJzdHJpbmcoNCldID0gZW50cnlba2V5XS4kdDtcbiAgICB9KTtcblxuICAgIHJldHVybiBvYmo7XG4gIH0pO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZmV0Y2ggPSByZXF1aXJlKCcuL2dldEpTT04uanMnKTtcbnZhciBCb29rID0gcmVxdWlyZSgnLi9ib29rLmpzJyk7XG52YXIgZW5kcG9pbnQgPSByZXF1aXJlKCcuL2VuZHBvaW50LmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gaW5pdDtcblxuZnVuY3Rpb24gaW5pdChrZXksIGNiKSB7XG4gIGlmKC9rZXk9Ly50ZXN0KGtleSkpIHtcbiAgICBrZXkgPSBrZXkubWF0Y2goJ2tleT0oLio/KSgmfCN8JCknKVsxXTtcbiAgfVxuXG4gIGlmKC9wdWJodG1sLy50ZXN0KGtleSkpIHtcbiAgICBrZXkgPSBrZXkubWF0Y2goJ2RcXFxcLyguKj8pXFxcXC9wdWJodG1sJylbMV07XG4gIH1cblxuICBmZXRjaChlbmRwb2ludCArICcvZmVlZHMvd29ya3NoZWV0cy8nICsga2V5ICsgJy9wdWJsaWMvYmFzaWM/YWx0PWpzb24nLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgY2IoZXJyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjYihudWxsLCBuZXcgQm9vayhkYXRhLCBrZXkpKTtcbiAgfSk7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBsaXN0ID0gcmVxdWlyZSgnLi9saXN0LmpzJyk7XG52YXIgZW5kcG9pbnQgPSByZXF1aXJlKCcuL2VuZHBvaW50LmpzJyk7XG52YXIgZmV0Y2ggPSByZXF1aXJlKCcuL2dldEpTT04uanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTaGVldDtcblxuZnVuY3Rpb24gU2hlZXQoc291cmNlLCBrZXkpIHtcbiAgdmFyIGNvbnRlbnQsIHBhdGg7XG4gIHZhciAkdGhpcyA9IHRoaXM7XG5cbiAgdGhpcy5uYW1lID0gc291cmNlLmNvbnRlbnQuJHQ7XG4gIHRoaXMuaWQgPSBzb3VyY2UubGlua1tzb3VyY2UubGluay5sZW5ndGggLSAxXS5ocmVmLnNwbGl0KCcvJykucG9wKCk7XG4gIHRoaXMuZmV0Y2ggPSBmdW5jdGlvbiAoY2IpIHtcbiAgICBpZiAoY29udGVudCkge1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZmV0Y2goZW5kcG9pbnQgKyAnL2ZlZWRzL2xpc3QvJyArIGtleSArICcvJyArICR0aGlzLmlkICsgJy9wdWJsaWMvdmFsdWVzP2FsdD1qc29uJywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjYihlcnIpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnRlbnQgPSBsaXN0KGRhdGEpO1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgfSk7XG4gIH07XG59XG4iLCIoZnVuY3Rpb24gKHJvb3QsIHVuZGVmaW5lZCkge1xyXG4gICd1c2Ugc3RyaWN0JztcclxuICBcclxuICB2YXIgcTtcclxuICB2YXIgZnVuY3Rpb25zID0gWydza2lwJywgJ3Rha2UnLCAnc3VtJywgJ3NlbGVjdCcsICdzZWxlY3RNYW55JywgJ2NvbnRhaW5zJywgJ2FsbCcsICdhbnknLCAnd2hlcmUnLCAnZmlyc3QnLCAnbGFzdCcsICdkaXN0aW5jdCcsICdncm91cEJ5JywgJ29yZGVyQnknLCAnb3JkZXJCeURlc2NlbmRpbmcnLCAnZm9yRWFjaCddO1xyXG5cclxuICBmdW5jdGlvbiBRdWVyeSgpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuXHJcbiAgICAvLyB3aGF0ZXZlciBhcnJheSBvciBjb21tYS1zZXBhcmF0ZWQgaXMgb2tcclxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGlmIChhcmd1bWVudHNbaV0gaW5zdGFuY2VvZiBBcnJheSkge1xyXG4gICAgICAgIHNlbGYucHVzaC5hcHBseShzZWxmLCBhcmd1bWVudHNbaV0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHNlbGYucHVzaChhcmd1bWVudHNbaV0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gYXNzaWduIGZ1bmN0aW9ucztcclxuICAgIHNlbGYuc2tpcCA9IF9za2lwO1xyXG4gICAgc2VsZi50YWtlID0gX3Rha2U7XHJcbiAgICBzZWxmLnN1bSA9IF9zdW07XHJcbiAgICBzZWxmLnNlbGVjdCA9IF9zZWxlY3Q7XHJcbiAgICBzZWxmLnNlbGVjdE1hbnkgPSBfc2VsZWN0TWFueTtcclxuICAgIHNlbGYuY29udGFpbnMgPSBfY29udGFpbnM7XHJcbiAgICBzZWxmLmFsbCA9IF9hbGw7XHJcbiAgICBzZWxmLmFueSA9IF9hbnk7XHJcbiAgICBzZWxmLndoZXJlID0gX3doZXJlO1xyXG4gICAgc2VsZi5maXJzdCA9IF9maXJzdDtcclxuICAgIHNlbGYubGFzdCA9IF9sYXN0O1xyXG4gICAgc2VsZi5kaXN0aW5jdCA9IF9kaXN0aW5jdDtcclxuICAgIHNlbGYuZ3JvdXBCeSA9IF9ncm91cEJ5O1xyXG4gICAgc2VsZi5vcmRlckJ5ID0gX29yZGVyQnk7XHJcbiAgICBzZWxmLm9yZGVyQnlEZXNjZW5kaW5nID0gX29yZGVyQnlEZXNjZW5kaW5nO1xyXG4gICAgc2VsZi5mb3JFYWNoID0gX2ZvckVhY2g7XHJcbiAgICBzZWxmLnRvQXJyYXkgPSBfdG9BcnJheTtcclxuICAgIHNlbGYudG9KU09OID0gX3RvSlNPTjtcclxuXHJcbiAgICBmdW5jdGlvbiBfcXVlcnkodHlwZSwgcmVzdWx0KSB7XHJcbiAgICAgIHJldHVybiB0eXBlIGluc3RhbmNlb2YgUXVlcnkgPyBuZXcgUXVlcnkocmVzdWx0KSA6IHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfc2tpcChjb3VudCkge1xyXG4gICAgICB2YXIgYXJyYXkgPSBbXTtcclxuICAgICAgXHJcbiAgICAgIGlmIChjb3VudCA8IDApIHtcclxuICAgICAgICBjb3VudCA9IDA7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAodmFyIGkgPSBjb3VudDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoaSA8IHNlbGYubGVuZ3RoKSB7XHJcbiAgICAgICAgICBhcnJheS5wdXNoKHNlbGZbaV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIF9xdWVyeSh0aGlzLCBhcnJheSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3Rha2UoY291bnQpIHtcclxuICAgICAgdmFyIGFycmF5ID0gW107XHJcbiAgICAgIFxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcclxuICAgICAgICBpZiAoaSA8IHNlbGYubGVuZ3RoKSB7XHJcbiAgICAgICAgICBhcnJheS5wdXNoKHNlbGZbaV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIF9xdWVyeSh0aGlzLCBhcnJheSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3N1bShzZWxlY3Rvcikge1xyXG4gICAgICB2YXIgc3VtID0gMDtcclxuXHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmIChzZWxlY3Rvcikge1xyXG4gICAgICAgICAgc3VtICs9IHNlbGVjdG9yKHNlbGZbaV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIHN1bSArPSBzZWxmW2ldO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHN1bTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfc2VsZWN0KHNlbGVjdG9yKSB7XHJcbiAgICAgIHZhciBhcnJheSA9IFtdO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgYXJyYXkucHVzaChzZWxlY3RvcihzZWxmW2ldKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBfcXVlcnkodGhpcywgYXJyYXkpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9zZWxlY3RNYW55KHNlbGVjdG9yKSB7XHJcbiAgICAgIHZhciBhcnJheSA9IFtdO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGlubmVyQXJyYXkgPSBzZWxlY3RvcihzZWxmW2ldKTtcclxuICAgICAgICBpZiAoaW5uZXJBcnJheS5sZW5ndGgpIHtcclxuICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaW5uZXJBcnJheS5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICBhcnJheS5wdXNoKGlubmVyQXJyYXlbal0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIF9xdWVyeSh0aGlzLCBhcnJheSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX2NvbnRhaW5zKGl0ZW0pIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHNlbGZbaV0gPT09IGl0ZW0pIHtcclxuICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgICBmdW5jdGlvbiBfYWxsKGV4cHJlc3Npb24pIHtcclxuICAgICAgdmFyIHN1Y2Nlc3MgPSB0cnVlO1xyXG5cclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgc3VjY2VzcyA9IHN1Y2Nlc3MgJiYgZXhwcmVzc2lvbihzZWxmW2ldKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHN1Y2Nlc3M7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX2FueShleHByZXNzaW9uKSB7XHJcbiAgICAgIGlmIChleHByZXNzaW9uID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICByZXR1cm4gc2VsZi5sZW5ndGggPiAwO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoZXhwcmVzc2lvbihzZWxmW2ldKSkge1xyXG4gICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3doZXJlKGV4cHJlc3Npb24pIHtcclxuICAgICAgdmFyIGFycmF5ID0gW107XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBpZiAoZXhwcmVzc2lvbihzZWxmW2ldKSkge1xyXG4gICAgICAgICAgYXJyYXkucHVzaChzZWxmW2ldKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBfcXVlcnkodGhpcywgYXJyYXkpO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9maXJzdChleHByZXNzaW9uKSB7XHJcbiAgICAgIGlmIChleHByZXNzaW9uID09PSBudWxsIHx8IGV4cHJlc3Npb24gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybiBzZWxmLmxlbmd0aCA+IDAgPyBzZWxmWzBdIDogbnVsbDtcclxuICAgICAgfVxyXG5cclxuICAgICAgdmFyIHJlc3VsdCA9IHNlbGYud2hlcmUoZXhwcmVzc2lvbik7XHJcblxyXG4gICAgICByZXR1cm4gcmVzdWx0Lmxlbmd0aCA+IDAgPyByZXN1bHRbMF0gOiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9sYXN0KGV4cHJlc3Npb24pIHtcclxuICAgICAgaWYgKGV4cHJlc3Npb24gPT09IG51bGwgfHwgZXhwcmVzc2lvbiA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIHNlbGYubGVuZ3RoID4gMCA/IHNlbGZbc2VsZi5sZW5ndGggLSAxXSA6IG51bGw7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHZhciByZXN1bHQgPSBzZWxmLndoZXJlKGV4cHJlc3Npb24pO1xyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdC5sZW5ndGggPiAwID8gcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSA6IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX2Rpc3RpbmN0KCkge1xyXG4gICAgICB2YXIgcXVlcnkgPSBuZXcgUXVlcnkoW10pO1xyXG5cclxuICAgICAgaWYgKHNlbGYuYW55KCkgJiYgc2VsZi5hbGwoZnVuY3Rpb24gKGkpIHsgcmV0dXJuIGkgPT09IG51bGwgfHwgaSA9PT0gdW5kZWZpbmVkOyB9KSkge1xyXG4gICAgICAgIHJldHVybiBbbnVsbF07XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsZi5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIHZhciBpdGVtID0gcXVlcnkuZmlyc3QoY29tcGFyZUl0ZW0oaSkpO1xyXG5cclxuICAgICAgICBpZiAoaXRlbSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgcXVlcnkucHVzaChzZWxmW2ldKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB0aGlzIGluc3RhbmNlb2YgUXVlcnkgPyBxdWVyeSA6IHF1ZXJ5LnRvQXJyYXkoKTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIGNvbXBhcmVJdGVtKGkpIHsgXHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKG4pIHsgcmV0dXJuIF9lcXVhbChuLCBzZWxmW2ldKTsgfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9ncm91cEJ5KHNlbGVjdG9yKSB7XHJcbiAgICAgIHZhciBxdWVyeSA9IG5ldyBRdWVyeShbXSk7XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgaXRlbSA9IHF1ZXJ5LmZpcnN0KGNvbXBhcmVJdGVtKGkpKTtcclxuXHJcbiAgICAgICAgaWYgKGl0ZW0gPT09IG51bGwpIHtcclxuICAgICAgICAgIGl0ZW0gPSBuZXcgUXVlcnkoW10pO1xyXG4gICAgICAgICAgaXRlbS5rZXkgPSBzZWxlY3RvcihzZWxmW2ldKTtcclxuICAgICAgICAgIHF1ZXJ5LnB1c2goaXRlbSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpdGVtLnB1c2goc2VsZltpXSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB0aGlzIGluc3RhbmNlb2YgUXVlcnkgPyBxdWVyeSA6IHF1ZXJ5LnRvQXJyYXkoKTtcclxuXHJcbiAgICAgIGZ1bmN0aW9uIGNvbXBhcmVJdGVtKGkpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKG4pIHsgcmV0dXJuIF9lcXVhbChuLmtleSwgc2VsZWN0b3Ioc2VsZltpXSkpOyB9O1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX2dldFR5cGUoc2VsZWN0b3IpIHtcclxuICAgICAgaWYgKHNlbGYubGVuZ3RoID09PSAwKSByZXR1cm4gJ3VuZGVmaW5lZCc7XHJcblxyXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbGYubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgdHlwZSA9IHR5cGVvZiBzZWxlY3RvcihzZWxmW2ldKTtcclxuICAgICAgICBpZiAodHlwZSA9PSAnbnVtYmVyJykgcmV0dXJuICdudW1iZXInO1xyXG4gICAgICAgIGlmICh0eXBlID09ICdzdHJpbmcnKSByZXR1cm4gJ3N0cmluZyc7XHJcbiAgICAgICAgaWYgKHR5cGUgPT0gJ2Jvb2xlYW4nKSByZXR1cm4gJ2Jvb2xlYW4nO1xyXG4gICAgICAgIGlmIChzZWxlY3RvcihzZWxmW2ldKSBpbnN0YW5jZW9mIERhdGUpIHJldHVybiAnRGF0ZSc7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiAndW5kZWZpbmVkJztcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfb3JkZXJCeShzZWxlY3Rvcikge1xyXG4gICAgICBpZiAoc2VsZi5sZW5ndGggPT09IDApIHJldHVybiBfcXVlcnkodGhpcywgW10pO1xyXG5cclxuICAgICAgdmFyIHR5cGUgPSBfZ2V0VHlwZShzZWxlY3Rvcik7XHJcbiAgICAgIHZhciByZXN1bHQ7XHJcblxyXG4gICAgICBpZiAodHlwZSA9PSAnbnVtYmVyJykge1xyXG4gICAgICAgIHJlc3VsdCA9IHNlbGYuc29ydChmdW5jdGlvbiAoYSwgYikgeyBcclxuICAgICAgICAgIGlmIChzZWxlY3RvcihhKSA9PT0gc2VsZWN0b3IoYikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHNlbGVjdG9yKGEpID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAtMTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoc2VsZWN0b3IoYikgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDE7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcmV0dXJuIHNlbGVjdG9yKGEpIC0gc2VsZWN0b3IoYik7IFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gJ3N0cmluZycpIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHtcclxuICAgICAgICAgIHZhciB4ID0gc2VsZWN0b3IoYSkgfHwgJyc7XHJcbiAgICAgICAgICB2YXIgeSA9IHNlbGVjdG9yKGIpIHx8ICcnO1xyXG5cclxuICAgICAgICAgIHJldHVybiB4IDwgeSA/IC0xIDogKHggPiB5ID8gMSA6IDApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gc2VsZi5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7IHJldHVybiBzZWxlY3RvcihhKSA9PSBzZWxlY3RvcihiKSA/IDEgOiAtMTsgfSk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAodHlwZSA9PSAnRGF0ZScpIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHsgcmV0dXJuIChzZWxlY3RvcihhKSB8fCBuZXcgRGF0ZSgwKSkuZ2V0VGltZSgpIC0gKHNlbGVjdG9yKGIpIHx8IG5ldyBEYXRlKDApKS5nZXRUaW1lKCk7IH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHJlc3VsdCA9IHNlbGY7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIHdlbGwsIEkgd2FudCBpdCBbdW5kZWZpbmVkLCBudWxsLCAtSW5maW5pdHksIC0xIC4uLl1cclxuICAgICAgaWYgKHJlc3VsdC5hbnkoZnVuY3Rpb24gKGkpIHsgcmV0dXJuIHNlbGVjdG9yKGkpID09PSB1bmRlZmluZWQ7IH0pKSB7XHJcbiAgICAgICAgdmFyIGRlZmluZWQgPSByZXN1bHQud2hlcmUoZnVuY3Rpb24gKGkpIHsgcmV0dXJuIHNlbGVjdG9yKGkpICE9PSB1bmRlZmluZWQ7IH0pO1xyXG4gICAgICAgIHZhciBlbXB0eSA9IHJlc3VsdC53aGVyZShmdW5jdGlvbiAoaSkgeyByZXR1cm4gc2VsZWN0b3IoaSkgPT09IHVuZGVmaW5lZDsgfSk7XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZW1wdHkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIGRlZmluZWQudW5zaGlmdChlbXB0eVtpXSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXN1bHQgPSBkZWZpbmVkO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIF9vcmRlckJ5RGVzY2VuZGluZyhzZWxlY3Rvcikge1xyXG4gICAgICBpZiAoc2VsZi5sZW5ndGggPT09IDApIHJldHVybiBfcXVlcnkodGhpcywgW10pO1xyXG5cclxuICAgICAgdmFyIHR5cGUgPSBfZ2V0VHlwZShzZWxlY3Rvcik7XHJcbiAgICAgIHZhciByZXN1bHQ7XHJcblxyXG4gICAgICBpZiAodHlwZSA9PSAnbnVtYmVyJykge1xyXG4gICAgICAgIHJlc3VsdCA9IHNlbGYuc29ydChmdW5jdGlvbiAoYSwgYikgeyBcclxuICAgICAgICAgIGlmIChzZWxlY3RvcihhKSA9PT0gc2VsZWN0b3IoYikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHNlbGVjdG9yKGEpID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAxO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChzZWxlY3RvcihiKSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gLTE7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcmV0dXJuIHNlbGVjdG9yKGIpIC0gc2VsZWN0b3IoYSk7IFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gJ3N0cmluZycpIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmLnNvcnQoZnVuY3Rpb24gKGIsIGEpIHtcclxuICAgICAgICAgIHZhciB4ID0gc2VsZWN0b3IoYSkgfHwgJyc7XHJcbiAgICAgICAgICB2YXIgeSA9IHNlbGVjdG9yKGIpIHx8ICcnO1xyXG5cclxuICAgICAgICAgIHJldHVybiB4IDwgeSA/IC0xIDogKHggPiB5ID8gMSA6IDApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2UgaWYgKHR5cGUgPT0gJ2Jvb2xlYW4nKSB7XHJcbiAgICAgICAgcmVzdWx0ID0gc2VsZi5zb3J0KGZ1bmN0aW9uIChiLCBhKSB7IHJldHVybiBzZWxlY3RvcihhKSA9PSBzZWxlY3RvcihiKSA/IC0xIDogMTsgfSk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSBpZiAodHlwZSA9PSAnRGF0ZScpIHtcclxuICAgICAgICByZXN1bHQgPSBzZWxmLnNvcnQoZnVuY3Rpb24gKGIsIGEpIHsgcmV0dXJuIChzZWxlY3RvcihhKSB8fCBuZXcgRGF0ZSgwKSkuZ2V0VGltZSgpIC0gKHNlbGVjdG9yKGIpIHx8IG5ldyBEYXRlKDApKS5nZXRUaW1lKCk7IH0pO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHJlc3VsdCA9IHNlbGY7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChyZXN1bHQuYW55KGZ1bmN0aW9uIChpKSB7IHJldHVybiBzZWxlY3RvcihpKSA9PT0gdW5kZWZpbmVkOyB9KSkge1xyXG4gICAgICAgIHZhciBkZWZpbmVkID0gcmVzdWx0LndoZXJlKGZ1bmN0aW9uIChpKSB7IHJldHVybiBzZWxlY3RvcihpKSAhPT0gdW5kZWZpbmVkOyB9KTtcclxuICAgICAgICB2YXIgZW1wdHkgPSByZXN1bHQud2hlcmUoZnVuY3Rpb24gKGkpIHsgcmV0dXJuIHNlbGVjdG9yKGkpID09PSB1bmRlZmluZWQ7IH0pO1xyXG5cclxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVtcHR5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBkZWZpbmVkLnB1c2goZW1wdHlbaV0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVzdWx0ID0gZGVmaW5lZDtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfZm9yRWFjaChhY3Rpb24pIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWxmLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgYWN0aW9uLmJpbmQoc2VsZltpXSwgc2VsZltpXSwgaSkoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHNlbGY7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gX3RvQXJyYXkoKSB7XHJcbiAgICAgIHJldHVybiBjb252ZXJ5QXJyYXkoc2VsZik7XHJcblxyXG4gICAgICBmdW5jdGlvbiBjb252ZXJ5QXJyYXkoYXJyYXkpIHtcclxuICAgICAgICB2YXIgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIGlmIChhcnJheVtpXSBpbnN0YW5jZW9mIFF1ZXJ5KSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNvbnZlcnlBcnJheShhcnJheVtpXSkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGFycmF5W2ldKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfdG9KU09OKCkge1xyXG4gICAgICByZXR1cm4gY29udmVydEpTT04oc2VsZik7XHJcblxyXG4gICAgICBmdW5jdGlvbiBjb252ZXJ0SlNPTihhcnJheSkge1xyXG4gICAgICAgIHZhciByZXN1bHQgPSB7fTtcclxuICAgICAgICByZXN1bHQubGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhcnJheS5rZXkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgcmVzdWx0LmtleSA9IGFycmF5LmtleTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgIGlmIChhcnJheVtpXSBpbnN0YW5jZW9mIFF1ZXJ5KSB7XHJcbiAgICAgICAgICAgIHJlc3VsdFtpXSA9IGNvbnZlcnRKU09OKGFycmF5W2ldKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXN1bHRbaV0gPSBhcnJheVtpXTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBfZXF1YWwgKGMsIHgpIHtcclxuICAgICAgLy8gZGF0ZSBjb21wYXJlXHJcbiAgICAgIGlmIChjIGluc3RhbmNlb2YgRGF0ZSAmJiB4IGluc3RhbmNlb2YgRGF0ZSkge1xyXG4gICAgICAgIHJldHVybiBjLmdldFRpbWUoKSA9PSB4LmdldFRpbWUoKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKGMgaW5zdGFuY2VvZiBEYXRlICE9IHggaW5zdGFuY2VvZiBEYXRlKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyB0eXBlIGNvbXBhcmVcclxuICAgICAgaWYgKHR5cGVvZiBjICE9PSB0eXBlb2YgeCkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gbnVtYmVyIG9yIHN0cmluZyBjb21wYXJlXHJcbiAgICAgIGlmICh0eXBlb2YgYyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIGMgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgcmV0dXJuIGMgPT09IHg7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGJvdGggdW5kZWZpbmVkXHJcbiAgICAgIGlmICh0eXBlb2YgYyA9PT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gb2JqZWN0IHByb3BlcnRpZXMgY29tcGFyZVxyXG4gICAgICBmb3IgKHZhciBrZXkxIGluIGMpIHtcclxuICAgICAgICBpZiAoY1trZXkxXSAhPT0geFtrZXkxXSkge1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gY2hlY2sgdGhlIG90aGVyIG9iamVjdCB0b29cclxuICAgICAgZm9yICh2YXIga2V5MiBpbiB4KSB7XHJcbiAgICAgICAgaWYgKGNba2V5Ml0gIT09IHhba2V5Ml0pIHtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIGFsbCBzZWVtcyB0byBiZSByaWdodFxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGFycmF5IGluaGVyaXRhbmNlXHJcbiAgUXVlcnkucHJvdG90eXBlID0gY2xvbmUoQXJyYXkucHJvdG90eXBlKTtcclxuICBxID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gY29uc3RydWN0KFF1ZXJ5LCBhcmd1bWVudHMpOyB9O1xyXG5cclxuICAvLyBwcm90b3R5cGUgZXh0ZW5zaW9uIHNvIHlvdSBjYW4gdmEuZXh0ZW5kcyhBcnJheSkgb3Igd2hhdGV2ZXJcclxuICBxLmV4dGVuZHMgPSBleHRlbmQ7XHJcblxyXG4gIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBxO1xyXG4gIH1cclxuICBlbHNlIHtcclxuICAgIHJvb3QudmEgPSBxO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZXh0ZW5kKG9iaikge1xyXG4gICAgcShmdW5jdGlvbnMpLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgICAgb2JqLnByb3RvdHlwZVtuYW1lXSA9IG9iai5wcm90b3R5cGVbbmFtZV0gfHwgZnVuY3Rpb24gKCkgeyBcclxuICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZVxyXG4gICAgICAgICAgLmNhbGwoYXJndW1lbnRzKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHEodGhpcylbbmFtZV0uYXBwbHkodGhpcywgYXJncyk7IFxyXG4gICAgICB9O1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBjbG9uZShvYmopIHtcclxuICAgIGZ1bmN0aW9uIEYoKSB7IH1cclxuICAgIEYucHJvdG90eXBlID0gb2JqO1xyXG4gICAgXHJcbiAgICByZXR1cm4gbmV3IEYoKTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGNvbnN0cnVjdChjb25zdHJ1Y3RvciwgYXJncykge1xyXG4gICAgZnVuY3Rpb24gRigpIHtcclxuICAgICAgcmV0dXJuIGNvbnN0cnVjdG9yLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgfVxyXG5cclxuICAgIEYucHJvdG90eXBlID0gY29uc3RydWN0b3IucHJvdG90eXBlO1xyXG5cclxuICAgIHJldHVybiBuZXcgRigpO1xyXG4gIH1cclxufSkodGhpcyk7IiwibW9kdWxlLmV4cG9ydHMgPSBbJyRzY29wZScsICckcm9vdFNjb3BlJywgJyRsb2NhdGlvbicsICckd2luZG93JywgJ2RiJywgaG9tZV07XG5cbmZ1bmN0aW9uIGhvbWUoJHNjb3BlLCAkcm9vdFNjb3BlLCAkbG9jYXRpb24sICR3aW5kb3csIGRiKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICBkYi5mZXRjaChmdW5jdGlvbiAoZXJyLCBtYXRjaGVzKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcihlcnIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgICRzY29wZS5tYXRjaGVzID0gbWF0Y2hlcztcbiAgICAkc2NvcGUuJGFwcGx5KCk7XG4gICAgJHNjb3BlLm1hdGNoZXMuZm9yRWFjaChmdW5jdGlvbiAobWF0Y2gpIHtcbiAgICAgIG1hdGNoLmZldGNoKGZ1bmN0aW9uIChlcnIsIGRhdGEpIHtcbiAgICAgICAgJHNjb3BlLiRhcHBseSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIGhvbWU6IHJlcXVpcmUoJy4vaG9tZS5qcycpICBcbn07IiwidmFyIG9wZW4gPSByZXF1aXJlKCcuL29wZW4uanMnKTtcbnZhciBjb250ZW50O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChkb2NzKSB7XG4gIHJldHVybiB7XG4gICAgZmV0Y2g6IGZldGNoXG4gIH07XG5cbiAgZnVuY3Rpb24gZmV0Y2goY2IpIHtcbiAgICBpZiAoY29udGVudCkge1xuICAgICAgY2IobnVsbCwgY29udGVudCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgb3Blbihkb2NzLCBmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGNiKGVycik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29udGVudCA9IGRhdGE7XG4gICAgICBjYihudWxsLCBkYXRhKTtcbiAgICB9KTtcbiAgfVxufTtcbiIsInZhciB0YWJsZSA9IHJlcXVpcmUoJ2dzeCcpO1xudmFyIGNvbnRyYSA9IHJlcXVpcmUoJ2NvbnRyYScpO1xudmFyIHRyYW5zZm9ybSA9IHJlcXVpcmUoJy4vdHJhbnNmb3JtLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gb3BlbjtcblxuZnVuY3Rpb24gb3Blbihkb2NzLCBkb25lKSB7XG4gIHZhciB0YXNrcyA9IGRvY3MubWFwKGZ1bmN0aW9uIChkb2MpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oY2IpIHtcbiAgICAgIHRhYmxlKGRvYywgZnVuY3Rpb24gKGVyciwgZGF0YSkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjYihudWxsLCBkYXRhLnNoZWV0cyk7XG4gICAgICB9KTtcbiAgICB9O1xuICB9KTtcblxuICBjb250cmEuY29uY3VycmVudCh0YXNrcywgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIGRvbmUoZXJyKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkb25lKG51bGwsIHRyYW5zZm9ybShyZXN1bHRzKSk7XG4gIH0pO1xufVxuIiwidmFyIF8gPSByZXF1aXJlKCd2ZXJ5LWFycmF5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gdHJhbnNmb3JtO1xuXG5mdW5jdGlvbiB0cmFuc2Zvcm0ocmVzdWx0cykge1xuICByZXR1cm4gcmVzdWx0c1xuICAgIC5yZWR1Y2UoZnVuY3Rpb24gKHgsIHkpIHsgcmV0dXJuIHguY29uY2F0KHkpOyB9LCBbXSlcbiAgICAubWFwKGZ1bmN0aW9uIChtYXRjaCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IG1hdGNoLmlkLFxuICAgICAgICBuYW1lOiBtYXRjaC5uYW1lLFxuICAgICAgICBmZXRjaDogZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICAgaWYgKHNlbGYubGlzdCkge1xuICAgICAgICAgICAgY2IobnVsbCwgc2VsZi5saXN0KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBtYXRjaC5mZXRjaChmdW5jdGlvbiAoZXJyLCBkYXRhKSB7XG4gICAgICAgICAgICB2YXIgdGVhbXM7XG5cbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgY2IoZXJyKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzZWxmLnBsYXllcnMgPSBkYXRhLm1hcChmdW5jdGlvbiAocGxheWVyLCBpeCkge1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHBsYXllci5qdWdhZG9yLFxuICAgICAgICAgICAgICAgIGFzc2lzdHM6ICtwbGF5ZXIuYXNpc3RlbmNpYXMsXG4gICAgICAgICAgICAgICAgZ29hbDogK3BsYXllci5qdWdhZGEsXG4gICAgICAgICAgICAgICAgaGVhZGVkOiArcGxheWVyLmNhYmV6YSxcbiAgICAgICAgICAgICAgICBmcmVlS2ljazogK3BsYXllci50aXJvbGlicmUsXG4gICAgICAgICAgICAgICAgcGVuYWx0eTogK3BsYXllci5wZW5hbCxcbiAgICAgICAgICAgICAgICB0b3RhbDogK3BsYXllci5qdWdhZGEgKyArcGxheWVyLmNhYmV6YSArICtwbGF5ZXIudGlyb2xpYnJlICsgK3BsYXllci5wZW5hbCxcbiAgICAgICAgICAgICAgICBvd246ICtwbGF5ZXIuZW5jb250cmEsXG4gICAgICAgICAgICAgICAgdGVhbTogcGxheWVyLmVxdWlwbyxcbiAgICAgICAgICAgICAgICBzdWJzdGl0dXRlOiBpeCA+PSAyMlxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHNlbGYuc3RhcnRlcnMgPSBzZWxmLnBsYXllcnMuZmlsdGVyKGZ1bmN0aW9uIChwbGF5ZXIpIHsgcmV0dXJuICFwbGF5ZXIuc3Vic3RpdHV0ZTsgfSk7XG4gICAgICAgICAgICBzZWxmLnN1YnN0aXR1dGVzID0gc2VsZi5wbGF5ZXJzLmZpbHRlcihmdW5jdGlvbiAocGxheWVyKSB7IHJldHVybiBwbGF5ZXIuc3Vic3RpdHV0ZTsgfSk7XG4gICAgICAgICAgICBzZWxmLnRlYW1zID0gXyhzZWxmLnN0YXJ0ZXJzKS5ncm91cEJ5KGZ1bmN0aW9uIChwbGF5ZXIpIHsgcmV0dXJuIHBsYXllci50ZWFtOyB9KS5tYXAoZnVuY3Rpb24gKHRlYW0pIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB0ZWFtLmtleSxcbiAgICAgICAgICAgICAgICBwbGF5ZXJzOiB0ZWFtLFxuICAgICAgICAgICAgICAgIGdvYWxzOiB7XG4gICAgICAgICAgICAgICAgICBjb3VudDogdGVhbS5tYXAoZnVuY3Rpb24gKHBsYXllcikge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwbGF5ZXIuZ29hbCArIHBsYXllci5oZWFkZWQgKyBwbGF5ZXIuZnJlZUtpY2sgKyBwbGF5ZXIucGVuYWx0eSAtIHBsYXllci5vd247XG4gICAgICAgICAgICAgICAgICAgIH0pLnJlZHVjZShmdW5jdGlvbiAoYSwgYikgeyByZXR1cm4gYSArIGI7IH0pLFxuICAgICAgICAgICAgICAgICAgZGV0YWlsOiB0ZWFtLmZpbHRlcihmdW5jdGlvbiAocGxheWVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBsYXllci5nb2FsIHx8IHBsYXllci5oZWFkZWQgfHwgcGxheWVyLmZyZWVLaWNrIHx8IHBsYXllci5wZW5hbHR5IHx8IHBsYXllci5vd247XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBhc3Npc3RzOiB0ZWFtLmZpbHRlcihmdW5jdGlvbiAocGxheWVyKSB7IHJldHVybiBwbGF5ZXIuYXNzaXN0czsgfSlcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoc2VsZi50ZWFtcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgc2VsZi50ZWFtcyA9IFtdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjYihudWxsLCBzZWxmLmxpc3QpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0pO1xufVxuIiwidmFyIGRvY3MgPSByZXF1aXJlKCcuLi9kb2NzLmpzb24nKTtcbnZhciBkYiA9IHJlcXVpcmUoJy4vZGInKShkb2NzKTtcbnZhciBiY2h6ID0gcmVxdWlyZSgnLi9tb2R1bGVzJykuYmNoejtcbnZhciBjb250cm9sbGVycyA9IHJlcXVpcmUoJy4vY29udHJvbGxlcnMnKTtcblxuYmNoei52YWx1ZSgnZGInLCBkYik7XG5iY2h6LmNvbnRyb2xsZXIoJ0hvbWVDdHJsJywgY29udHJvbGxlcnMuaG9tZSk7XG5cbmZ1bmN0aW9uIGluaXRpYWxpemUoZXJyLCBib29rKSB7XG4gIGlmIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgcmV0dXJuO1xuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGFuZ3VsYXIubW9kdWxlKCdiY2h6JywgWyduZ1JvdXRlJ10pXG4gIC5jb25maWcoWyckcm91dGVQcm92aWRlcicsICckbG9jYXRpb25Qcm92aWRlcicsIGZ1bmN0aW9uICgkcm91dGVQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcblxuICAgICRyb3V0ZVByb3ZpZGVyXG4gICAgICAud2hlbignLycsIHsgY29udHJvbGxlcjogJ0hvbWVDdHJsJywgdGVtcGxhdGVVcmw6ICcvdmlld3MvaG9tZS5odG1sJyB9KVxuICAgICAgLndoZW4oJy9idXNxdWVkYScsIHsgY29udHJvbGxlcjogJ1BsYWNlU2VhcmNoQ3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL3NlYXJjaC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9saXN0YWRvJywgeyBjb250cm9sbGVyOiAnUGxhY2VMaXN0Q3RybCcsIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2xpc3QuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvbWFwYScsIHsgY29udHJvbGxlcjogJ01hcEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9zaXRlL21hcC5odG1sJyB9KVxuICAgICAgLndoZW4oJy9jYW5jaGFzL2FncmVnYXInLCB7IGNvbnRyb2xsZXI6ICdQbGFjZUFkZEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9hZGQuaHRtbCcgfSlcbiAgICAgIC53aGVuKCcvY2FuY2hhcy9saXN0YWRvLzpzcG9ydCcsIHsgY29udHJvbGxlcjogJ1BsYWNlTGlzdEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9saXN0Lmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvbGlzdGFkbycsIHsgY29udHJvbGxlcjogJ1BsYWNlTGlzdEN0cmwnLCB0ZW1wbGF0ZVVybDogJy9wbGFjZS9saXN0Lmh0bWwnIH0pXG4gICAgICAud2hlbignL2NhbmNoYXMvOmlkJywgeyBjb250cm9sbGVyOiAnUGxhY2VEZXRhaWxDdHJsJywgcmVzb2x2ZToge1xuICAgICAgICBwbGFjZTogWyckcm91dGUnLCAnUGxhY2UnLCBmdW5jdGlvbiAoJHJvdXRlLCBQbGFjZSkge1xuICAgICAgICAgIHJldHVybiBQbGFjZS5nZXQoJHJvdXRlLmN1cnJlbnQucGFyYW1zKS4kcHJvbWlzZTtcbiAgICAgICAgfV1cbiAgICAgIH0sIHRlbXBsYXRlVXJsOiAnL3BsYWNlL2RldGFpbC5odG1sJyB9KVxuICAgICAgLndoZW4oJy80MDQnLCB7IHRlbXBsYXRlVXJsOiAnL3NpdGUvNDA0Lmh0bWwnIH0pXG4gICAgICAub3RoZXJ3aXNlKHsgdGVtcGxhdGVVcmw6ICcvc2l0ZS80MDQuaHRtbCcgfSk7XG4gIH1dKTtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBiY2h6OiByZXF1aXJlKCcuL2JjaHouanMnKVxufTtcbiJdfQ==
