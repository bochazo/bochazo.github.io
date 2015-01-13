(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Tabletop = require('tableme');
var url = 'https://docs.google.com/spreadsheets/d/1LkVkb3VFjxBf6JpvTOgklzcwr9OgU_8n8fBpyqhVS4U/pubhtml';

Tabletop.init({
  key: url,
  callback: function(data, tabletop) {
    console.log(data)
  },
  simpleSheet: false
});

},{"tableme":2}],2:[function(require,module,exports){
(function(global) {
  "use strict";

  var supportsCORS = false;
  var inLegacyIE = false;
  try {
    var testXHR = new XMLHttpRequest();
    if (typeof testXHR.withCredentials !== 'undefined') {
      supportsCORS = true;
    } else {
      if ("XDomainRequest" in window) {
        supportsCORS = true;
        inLegacyIE = true;
      }
    }
  } catch (e) { }

  // Create a simple indexOf function for support
  // of older browsers.  Uses native indexOf if
  // available.  Code similar to underscores.
  // By making a separate function, instead of adding
  // to the prototype, we will not break bad for loops
  // in older browsers
  var indexOfProto = Array.prototype.indexOf;
  var ttIndexOf = function(array, item) {
    var i = 0, l = array.length;

    if (indexOfProto && array.indexOf === indexOfProto) return array.indexOf(item);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  /*
    Initialize with Tabletop.init( { key: '0AjAPaAU9MeLFdHUxTlJiVVRYNGRJQnRmSnQwTlpoUXc' } )
      OR!
    Initialize with Tabletop.init( { key: 'https://docs.google.com/spreadsheet/pub?hl=en_US&hl=en_US&key=0AjAPaAU9MeLFdHUxTlJiVVRYNGRJQnRmSnQwTlpoUXc&output=html&widget=true' } )
      OR!
    Initialize with Tabletop.init('0AjAPaAU9MeLFdHUxTlJiVVRYNGRJQnRmSnQwTlpoUXc')
  */

  var Tabletop = function(options) {
    // Make sure Tabletop is being used as a constructor no matter what.
    if(!this || !(this instanceof Tabletop)) {
      return new Tabletop(options);
    }

    if(typeof(options) === 'string') {
      options = { key : options };
    }

    this.callback = options.callback;
    this.wanted = options.wanted || [];
    this.key = options.key;
    this.simpleSheet = !!options.simpleSheet;
    this.parseNumbers = !!options.parseNumbers;
    this.wait = !!options.wait;
    this.reverse = !!options.reverse;
    this.postProcess = options.postProcess;
    this.debug = !!options.debug;
    this.query = options.query || '';
    this.orderby = options.orderby;
    this.endpoint = options.endpoint || "https://spreadsheets.google.com";
    this.singleton = !!options.singleton;
    this.simple_url = !!options.simple_url;
    this.callbackContext = options.callbackContext;
    this.prettyColumnNames = typeof(options.prettyColumnNames) == 'undefined' ? true : options.prettyColumnNames

    if(typeof(options.proxy) !== 'undefined') {
      // Remove trailing slash, it will break the app
      this.endpoint = options.proxy.replace(/\/$/,'');
      this.simple_url = true;
      this.singleton = true;
      // Let's only use CORS (straight JSON request) when
      // fetching straight from Google
      supportsCORS = false
    }

    this.parameterize = options.parameterize || false;

    if(this.singleton) {
      if(typeof(Tabletop.singleton) !== 'undefined') {
        this.log("WARNING! Tabletop singleton already defined");
      }
      Tabletop.singleton = this;
    }

    /* Be friendly about what you accept */
    if(/key=/.test(this.key)) {
      this.log("You passed an old Google Docs url as the key! Attempting to parse.");
      this.key = this.key.match("key=(.*?)(&|#|$)")[1];
    }

    if(/pubhtml/.test(this.key)) {
      this.log("You passed a new Google Spreadsheets url as the key! Attempting to parse.");
      this.key = this.key.match("d\\/(.*?)\\/pubhtml")[1];
    }

    if(!this.key) {
      this.log("You need to pass Tabletop a key!");
      return;
    }

    this.log("Initializing with key " + this.key);

    this.models = {};
    this.model_names = [];

    this.base_json_path = "/feeds/worksheets/" + this.key + "/public/basic?alt=";

    if (supportsCORS) {
      this.base_json_path += 'json';
    } else {
      this.base_json_path += 'json-in-script';
    }

    if(!this.wait) {
      this.fetch();
    }
  };

  // A global storage for callbacks.
  Tabletop.callbacks = {};

  // Backwards compatibility.
  Tabletop.init = function(options) {
    return new Tabletop(options);
  };

  Tabletop.sheets = function() {
    this.log("Times have changed! You'll want to use var tabletop = Tabletop.init(...); tabletop.sheets(...); instead of Tabletop.sheets(...)");
  };

  Tabletop.prototype = {

    fetch: function(callback) {
      if(typeof(callback) !== "undefined") {
        this.callback = callback;
      }
      this.requestData(this.base_json_path, this.loadSheets);
    },

    /*
      This will call the environment appropriate request method.

      In browser it will use JSON-P, in node it will use request()
    */
    requestData: function(path, callback) {
      //CORS only works in IE8/9 across the same protocol
      //You must have your server on HTTPS to talk to Google, or it'll fall back on injection
      var protocol = this.endpoint.split("//").shift() || "http";
      if (supportsCORS && (!inLegacyIE || protocol === location.protocol)) {
        this.xhrFetch(path, callback);
      } else {
        this.injectScript(path, callback);
      }
    },

    /*
      Use Cross-Origin XMLHttpRequest to get the data in browsers that support it.
    */
    xhrFetch: function(path, callback) {
      //support IE8's separate cross-domain object
      var xhr = inLegacyIE ? new XDomainRequest() : new XMLHttpRequest();
      xhr.open("GET", this.endpoint + path);
      var self = this;
      xhr.onload = function() {
        try {
          var json = JSON.parse(xhr.responseText);
        } catch (e) {
          console.error(e);
        }
        callback.call(self, json);
      };
      xhr.send();
    },

    /*
      Insert the URL into the page as a script tag. Once it's loaded the spreadsheet data
      it triggers the callback. This helps you avoid cross-domain errors
      http://code.google.com/apis/gdata/samples/spreadsheet_sample.html

      Let's be plain-Jane and not use jQuery or anything.
    */
    injectScript: function(path, callback) {
      var script = document.createElement('script');
      var callbackName;

      if(this.singleton) {
        if(callback === this.loadSheets) {
          callbackName = 'Tabletop.singleton.loadSheets';
        } else if (callback === this.loadSheet) {
          callbackName = 'Tabletop.singleton.loadSheet';
        }
      } else {
        var self = this;
        callbackName = 'tt' + (+new Date()) + (Math.floor(Math.random()*100000));
        // Create a temp callback which will get removed once it has executed,
        // this allows multiple instances of Tabletop to coexist.
        Tabletop.callbacks[ callbackName ] = function () {
          var args = Array.prototype.slice.call( arguments, 0 );
          callback.apply(self, args);
          script.parentNode.removeChild(script);
          delete Tabletop.callbacks[callbackName];
        };
        callbackName = 'Tabletop.callbacks.' + callbackName;
      }

      var url = path + "&callback=" + callbackName;

      if(this.simple_url) {
        // We've gone down a rabbit hole of passing injectScript the path, so let's
        // just pull the sheet_id out of the path like the least efficient worker bees
        if(path.indexOf("/list/") !== -1) {
          script.src = this.endpoint + "/" + this.key + "-" + path.split("/")[4];
        } else {
          script.src = this.endpoint + "/" + this.key;
        }
      } else {
        script.src = this.endpoint + url;
      }

      if (this.parameterize) {
        script.src = this.parameterize + encodeURIComponent(script.src);
      }

      document.getElementsByTagName('script')[0].parentNode.appendChild(script);
    },

    /*
      This will only run if tabletop is being run in node.js
    */
    serverSideFetch: function(path, callback) {
      var self = this
      request({url: this.endpoint + path, json: true}, function(err, resp, body) {
        if (err) {
          return console.error(err);
        }
        callback.call(self, body);
      });
    },

    /*
      Is this a sheet you want to pull?
      If { wanted: ["Sheet1"] } has been specified, only Sheet1 is imported
      Pulls all sheets if none are specified
    */
    isWanted: function(sheetName) {
      if(this.wanted.length === 0) {
        return true;
      } else {
        return (ttIndexOf(this.wanted, sheetName) !== -1);
      }
    },

    /*
      What gets send to the callback
      if simpleSheet === true, then don't return an array of Tabletop.this.models,
      only return the first one's elements
    */
    data: function() {
      // If the instance is being queried before the data's been fetched
      // then return undefined.
      if(this.model_names.length === 0) {
        return undefined;
      }
      if(this.simpleSheet) {
        if(this.model_names.length > 1 && this.debug) {
          this.log("WARNING You have more than one sheet but are using simple sheet mode! Don't blame me when something goes wrong.");
        }
        return this.models[ this.model_names[0] ].all();
      } else {
        return this.models;
      }
    },

    /*
      Add another sheet to the wanted list
    */
    addWanted: function(sheet) {
      if(ttIndexOf(this.wanted, sheet) === -1) {
        this.wanted.push(sheet);
      }
    },

    /*
      Load all worksheets of the spreadsheet, turning each into a Tabletop Model.
      Need to use injectScript because the worksheet view that you're working from
      doesn't actually include the data. The list-based feed (/feeds/list/key..) does, though.
      Calls back to loadSheet in order to get the real work done.

      Used as a callback for the worksheet-based JSON
    */
    loadSheets: function(data) {
      var i, ilen;
      var toLoad = [];
      this.foundSheetNames = [];

      for(i = 0, ilen = data.feed.entry.length; i < ilen ; i++) {
        this.foundSheetNames.push(data.feed.entry[i].title.$t);
        // Only pull in desired sheets to reduce loading
        if( this.isWanted(data.feed.entry[i].content.$t) ) {
          var linkIdx = data.feed.entry[i].link.length-1;
          var sheet_id = data.feed.entry[i].link[linkIdx].href.split('/').pop();
          var json_path = "/feeds/list/" + this.key + "/" + sheet_id + "/public/values?alt="
          if (supportsCORS) {
            json_path += 'json';
          } else {
            json_path += 'json-in-script';
          }
          if(this.query) {
            json_path += "&sq=" + this.query;
          }
          if(this.orderby) {
            json_path += "&orderby=column:" + this.orderby.toLowerCase();
          }
          if(this.reverse) {
            json_path += "&reverse=true";
          }
          toLoad.push(json_path);
        }
      }

      this.sheetsToLoad = toLoad.length;
      for(i = 0, ilen = toLoad.length; i < ilen; i++) {
        this.requestData(toLoad[i], this.loadSheet);
      }
    },

    /*
      Access layer for the this.models
      .sheets() gets you all of the sheets
      .sheets('Sheet1') gets you the sheet named Sheet1
    */
    sheets: function(sheetName) {
      if(typeof sheetName === "undefined") {
        return this.models;
      } else {
        if(typeof(this.models[ sheetName ]) === "undefined") {
          // alert( "Can't find " + sheetName );
          return;
        } else {
          return this.models[ sheetName ];
        }
      }
    },

    sheetReady: function(model) {
      this.models[ model.name ] = model;
      if(ttIndexOf(this.model_names, model.name) === -1) {
        this.model_names.push(model.name);
      }

      this.sheetsToLoad--;
      if(this.sheetsToLoad === 0)
        this.doCallback();
    },

    /*
      Parse a single list-based worksheet, turning it into a Tabletop Model

      Used as a callback for the list-based JSON
    */
    loadSheet: function(data) {
      var that = this;
      var model = new Tabletop.Model( { data: data,
                                        parseNumbers: this.parseNumbers,
                                        postProcess: this.postProcess,
                                        tabletop: this,
                                        prettyColumnNames: this.prettyColumnNames,
                                        onReady: function() {
                                          that.sheetReady(this);
                                        } } );
    },

    /*
      Execute the callback upon loading! Rely on this.data() because you might
        only request certain pieces of data (i.e. simpleSheet mode)
      Tests this.sheetsToLoad just in case a race condition happens to show up
    */
    doCallback: function() {
      if(this.sheetsToLoad === 0) {
        this.callback.apply(this.callbackContext || this, [this.data(), this]);
      }
    },

    log: function(msg) {
      if(this.debug) {
        if(typeof console !== "undefined" && typeof console.log !== "undefined") {
          Function.prototype.apply.apply(console.log, [console, arguments]);
        }
      }
    }

  };

  /*
    Tabletop.Model stores the attribute names and parses the worksheet data
      to turn it into something worthwhile

    Options should be in the format { data: XXX }, with XXX being the list-based worksheet
  */
  Tabletop.Model = function(options) {
    var i, j, ilen, jlen;
    this.column_names = [];
    this.name = options.data.feed.title.$t;
    this.tabletop = options.tabletop;
    this.elements = [];
    this.onReady = options.onReady;
    this.raw = options.data; // A copy of the sheet's raw data, for accessing minutiae

    if(typeof(options.data.feed.entry) === 'undefined') {
      options.tabletop.log("Missing data for " + this.name + ", make sure you didn't forget column headers");
      this.elements = [];
      return;
    }

    for(var key in options.data.feed.entry[0]){
      if(/^gsx/.test(key))
        this.column_names.push( key.replace("gsx$","") );
    }

    this.original_columns = this.column_names;

    for(i = 0, ilen =  options.data.feed.entry.length ; i < ilen; i++) {
      var source = options.data.feed.entry[i];
      var element = {};
      for(var j = 0, jlen = this.column_names.length; j < jlen ; j++) {
        var cell = source[ "gsx$" + this.column_names[j] ];
        if (typeof(cell) !== 'undefined') {
          if(options.parseNumbers && cell.$t !== '' && !isNaN(cell.$t))
            element[ this.column_names[j] ] = +cell.$t;
          else
            element[ this.column_names[j] ] = cell.$t;
        } else {
            element[ this.column_names[j] ] = '';
        }
      }
      if(element.rowNumber === undefined)
        element.rowNumber = i + 1;
      if( options.postProcess )
        options.postProcess(element);
      this.elements.push(element);
    }

    if(options.prettyColumnNames)
      this.fetchPrettyColumns();
    else
      this.onReady.call(this);
  };

  Tabletop.Model.prototype = {
    /*
      Returns all of the elements (rows) of the worksheet as objects
    */
    all: function() {
      return this.elements;
    },

    fetchPrettyColumns: function() {
      if(!this.raw.feed.link[3])
        return this.ready();
      var cellurl = this.raw.feed.link[3].href.replace('/feeds/list/', '/feeds/cells/').replace('https://spreadsheets.google.com', '');
      var that = this;
      this.tabletop.requestData(cellurl, function(data) {
        that.loadPrettyColumns(data)
      });
    },

    ready: function() {
      this.onReady.call(this);
    },

    /*
     * Store column names as an object
     * with keys of Google-formatted "columnName"
     * and values of human-readable "Column name"
     */
    loadPrettyColumns: function(data) {
      var pretty_columns = {};

      var column_names = this.column_names;

      var i = 0;
      var l = column_names.length;

      for (; i < l; i++) {
        if (typeof data.feed.entry[i].content.$t !== 'undefined') {
          pretty_columns[column_names[i]] = data.feed.entry[i].content.$t;
        } else {
          pretty_columns[column_names[i]] = column_names[i];
        }
      }

      this.pretty_columns = pretty_columns;

      this.prettifyElements();
      this.ready();
    },

    /*
     * Go through each row, substitutiting
     * Google-formatted "columnName"
     * with human-readable "Column name"
     */
    prettifyElements: function() {
      var pretty_elements = [],
          ordered_pretty_names = [],
          i, j, ilen, jlen;

      var ordered_pretty_names;
      for(j = 0, jlen = this.column_names.length; j < jlen ; j++) {
        ordered_pretty_names.push(this.pretty_columns[this.column_names[j]]);
      }

      for(i = 0, ilen = this.elements.length; i < ilen; i++) {
        var new_element = {};
        for(j = 0, jlen = this.column_names.length; j < jlen ; j++) {
          var new_column_name = this.pretty_columns[this.column_names[j]];
          new_element[new_column_name] = this.elements[i][this.column_names[j]];
        }
        pretty_elements.push(new_element);
      }
      this.elements = pretty_elements;
      this.column_names = ordered_pretty_names;
    },

    /*
      Return the elements as an array of arrays, instead of an array of objects
    */
    toArray: function() {
      var array = [],
          i, j, ilen, jlen;
      for(i = 0, ilen = this.elements.length; i < ilen; i++) {
        var row = [];
        for(j = 0, jlen = this.column_names.length; j < jlen ; j++) {
          row.push( this.elements[i][ this.column_names[j] ] );
        }
        array.push(row);
      }
      return array;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Tabletop;
  } else {
    global.Tabletop = Tabletop;
  }
})(this);

},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwibWFpbi5qcyIsIm5vZGVfbW9kdWxlc1xcdGFibGVtZVxcaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBUYWJsZXRvcCA9IHJlcXVpcmUoJ3RhYmxlbWUnKTtcbnZhciB1cmwgPSAnaHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMUxrVmtiM1ZGanhCZjZKcHZUT2drbHpjd3I5T2dVXzhuOGZCcHlxaFZTNFUvcHViaHRtbCc7XG5cblRhYmxldG9wLmluaXQoe1xuICBrZXk6IHVybCxcbiAgY2FsbGJhY2s6IGZ1bmN0aW9uKGRhdGEsIHRhYmxldG9wKSB7XG4gICAgY29uc29sZS5sb2coZGF0YSlcbiAgfSxcbiAgc2ltcGxlU2hlZXQ6IGZhbHNlXG59KTtcbiIsIihmdW5jdGlvbihnbG9iYWwpIHtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgdmFyIHN1cHBvcnRzQ09SUyA9IGZhbHNlO1xuICB2YXIgaW5MZWdhY3lJRSA9IGZhbHNlO1xuICB0cnkge1xuICAgIHZhciB0ZXN0WEhSID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgaWYgKHR5cGVvZiB0ZXN0WEhSLndpdGhDcmVkZW50aWFscyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHN1cHBvcnRzQ09SUyA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChcIlhEb21haW5SZXF1ZXN0XCIgaW4gd2luZG93KSB7XG4gICAgICAgIHN1cHBvcnRzQ09SUyA9IHRydWU7XG4gICAgICAgIGluTGVnYWN5SUUgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCAoZSkgeyB9XG5cbiAgLy8gQ3JlYXRlIGEgc2ltcGxlIGluZGV4T2YgZnVuY3Rpb24gZm9yIHN1cHBvcnRcbiAgLy8gb2Ygb2xkZXIgYnJvd3NlcnMuICBVc2VzIG5hdGl2ZSBpbmRleE9mIGlmXG4gIC8vIGF2YWlsYWJsZS4gIENvZGUgc2ltaWxhciB0byB1bmRlcnNjb3Jlcy5cbiAgLy8gQnkgbWFraW5nIGEgc2VwYXJhdGUgZnVuY3Rpb24sIGluc3RlYWQgb2YgYWRkaW5nXG4gIC8vIHRvIHRoZSBwcm90b3R5cGUsIHdlIHdpbGwgbm90IGJyZWFrIGJhZCBmb3IgbG9vcHNcbiAgLy8gaW4gb2xkZXIgYnJvd3NlcnNcbiAgdmFyIGluZGV4T2ZQcm90byA9IEFycmF5LnByb3RvdHlwZS5pbmRleE9mO1xuICB2YXIgdHRJbmRleE9mID0gZnVuY3Rpb24oYXJyYXksIGl0ZW0pIHtcbiAgICB2YXIgaSA9IDAsIGwgPSBhcnJheS5sZW5ndGg7XG5cbiAgICBpZiAoaW5kZXhPZlByb3RvICYmIGFycmF5LmluZGV4T2YgPT09IGluZGV4T2ZQcm90bykgcmV0dXJuIGFycmF5LmluZGV4T2YoaXRlbSk7XG4gICAgZm9yICg7IGkgPCBsOyBpKyspIGlmIChhcnJheVtpXSA9PT0gaXRlbSkgcmV0dXJuIGk7XG4gICAgcmV0dXJuIC0xO1xuICB9O1xuXG4gIC8qXG4gICAgSW5pdGlhbGl6ZSB3aXRoIFRhYmxldG9wLmluaXQoIHsga2V5OiAnMEFqQVBhQVU5TWVMRmRIVXhUbEppVlZSWU5HUkpRblJtU25Rd1RscG9VWGMnIH0gKVxuICAgICAgT1IhXG4gICAgSW5pdGlhbGl6ZSB3aXRoIFRhYmxldG9wLmluaXQoIHsga2V5OiAnaHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXQvcHViP2hsPWVuX1VTJmhsPWVuX1VTJmtleT0wQWpBUGFBVTlNZUxGZEhVeFRsSmlWVlJZTkdSSlFuUm1TblF3VGxwb1VYYyZvdXRwdXQ9aHRtbCZ3aWRnZXQ9dHJ1ZScgfSApXG4gICAgICBPUiFcbiAgICBJbml0aWFsaXplIHdpdGggVGFibGV0b3AuaW5pdCgnMEFqQVBhQVU5TWVMRmRIVXhUbEppVlZSWU5HUkpRblJtU25Rd1RscG9VWGMnKVxuICAqL1xuXG4gIHZhciBUYWJsZXRvcCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAvLyBNYWtlIHN1cmUgVGFibGV0b3AgaXMgYmVpbmcgdXNlZCBhcyBhIGNvbnN0cnVjdG9yIG5vIG1hdHRlciB3aGF0LlxuICAgIGlmKCF0aGlzIHx8ICEodGhpcyBpbnN0YW5jZW9mIFRhYmxldG9wKSkge1xuICAgICAgcmV0dXJuIG5ldyBUYWJsZXRvcChvcHRpb25zKTtcbiAgICB9XG5cbiAgICBpZih0eXBlb2Yob3B0aW9ucykgPT09ICdzdHJpbmcnKSB7XG4gICAgICBvcHRpb25zID0geyBrZXkgOiBvcHRpb25zIH07XG4gICAgfVxuXG4gICAgdGhpcy5jYWxsYmFjayA9IG9wdGlvbnMuY2FsbGJhY2s7XG4gICAgdGhpcy53YW50ZWQgPSBvcHRpb25zLndhbnRlZCB8fCBbXTtcbiAgICB0aGlzLmtleSA9IG9wdGlvbnMua2V5O1xuICAgIHRoaXMuc2ltcGxlU2hlZXQgPSAhIW9wdGlvbnMuc2ltcGxlU2hlZXQ7XG4gICAgdGhpcy5wYXJzZU51bWJlcnMgPSAhIW9wdGlvbnMucGFyc2VOdW1iZXJzO1xuICAgIHRoaXMud2FpdCA9ICEhb3B0aW9ucy53YWl0O1xuICAgIHRoaXMucmV2ZXJzZSA9ICEhb3B0aW9ucy5yZXZlcnNlO1xuICAgIHRoaXMucG9zdFByb2Nlc3MgPSBvcHRpb25zLnBvc3RQcm9jZXNzO1xuICAgIHRoaXMuZGVidWcgPSAhIW9wdGlvbnMuZGVidWc7XG4gICAgdGhpcy5xdWVyeSA9IG9wdGlvbnMucXVlcnkgfHwgJyc7XG4gICAgdGhpcy5vcmRlcmJ5ID0gb3B0aW9ucy5vcmRlcmJ5O1xuICAgIHRoaXMuZW5kcG9pbnQgPSBvcHRpb25zLmVuZHBvaW50IHx8IFwiaHR0cHM6Ly9zcHJlYWRzaGVldHMuZ29vZ2xlLmNvbVwiO1xuICAgIHRoaXMuc2luZ2xldG9uID0gISFvcHRpb25zLnNpbmdsZXRvbjtcbiAgICB0aGlzLnNpbXBsZV91cmwgPSAhIW9wdGlvbnMuc2ltcGxlX3VybDtcbiAgICB0aGlzLmNhbGxiYWNrQ29udGV4dCA9IG9wdGlvbnMuY2FsbGJhY2tDb250ZXh0O1xuICAgIHRoaXMucHJldHR5Q29sdW1uTmFtZXMgPSB0eXBlb2Yob3B0aW9ucy5wcmV0dHlDb2x1bW5OYW1lcykgPT0gJ3VuZGVmaW5lZCcgPyB0cnVlIDogb3B0aW9ucy5wcmV0dHlDb2x1bW5OYW1lc1xuXG4gICAgaWYodHlwZW9mKG9wdGlvbnMucHJveHkpICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoLCBpdCB3aWxsIGJyZWFrIHRoZSBhcHBcbiAgICAgIHRoaXMuZW5kcG9pbnQgPSBvcHRpb25zLnByb3h5LnJlcGxhY2UoL1xcLyQvLCcnKTtcbiAgICAgIHRoaXMuc2ltcGxlX3VybCA9IHRydWU7XG4gICAgICB0aGlzLnNpbmdsZXRvbiA9IHRydWU7XG4gICAgICAvLyBMZXQncyBvbmx5IHVzZSBDT1JTIChzdHJhaWdodCBKU09OIHJlcXVlc3QpIHdoZW5cbiAgICAgIC8vIGZldGNoaW5nIHN0cmFpZ2h0IGZyb20gR29vZ2xlXG4gICAgICBzdXBwb3J0c0NPUlMgPSBmYWxzZVxuICAgIH1cblxuICAgIHRoaXMucGFyYW1ldGVyaXplID0gb3B0aW9ucy5wYXJhbWV0ZXJpemUgfHwgZmFsc2U7XG5cbiAgICBpZih0aGlzLnNpbmdsZXRvbikge1xuICAgICAgaWYodHlwZW9mKFRhYmxldG9wLnNpbmdsZXRvbikgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHRoaXMubG9nKFwiV0FSTklORyEgVGFibGV0b3Agc2luZ2xldG9uIGFscmVhZHkgZGVmaW5lZFwiKTtcbiAgICAgIH1cbiAgICAgIFRhYmxldG9wLnNpbmdsZXRvbiA9IHRoaXM7XG4gICAgfVxuXG4gICAgLyogQmUgZnJpZW5kbHkgYWJvdXQgd2hhdCB5b3UgYWNjZXB0ICovXG4gICAgaWYoL2tleT0vLnRlc3QodGhpcy5rZXkpKSB7XG4gICAgICB0aGlzLmxvZyhcIllvdSBwYXNzZWQgYW4gb2xkIEdvb2dsZSBEb2NzIHVybCBhcyB0aGUga2V5ISBBdHRlbXB0aW5nIHRvIHBhcnNlLlwiKTtcbiAgICAgIHRoaXMua2V5ID0gdGhpcy5rZXkubWF0Y2goXCJrZXk9KC4qPykoJnwjfCQpXCIpWzFdO1xuICAgIH1cblxuICAgIGlmKC9wdWJodG1sLy50ZXN0KHRoaXMua2V5KSkge1xuICAgICAgdGhpcy5sb2coXCJZb3UgcGFzc2VkIGEgbmV3IEdvb2dsZSBTcHJlYWRzaGVldHMgdXJsIGFzIHRoZSBrZXkhIEF0dGVtcHRpbmcgdG8gcGFyc2UuXCIpO1xuICAgICAgdGhpcy5rZXkgPSB0aGlzLmtleS5tYXRjaChcImRcXFxcLyguKj8pXFxcXC9wdWJodG1sXCIpWzFdO1xuICAgIH1cblxuICAgIGlmKCF0aGlzLmtleSkge1xuICAgICAgdGhpcy5sb2coXCJZb3UgbmVlZCB0byBwYXNzIFRhYmxldG9wIGEga2V5IVwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmxvZyhcIkluaXRpYWxpemluZyB3aXRoIGtleSBcIiArIHRoaXMua2V5KTtcblxuICAgIHRoaXMubW9kZWxzID0ge307XG4gICAgdGhpcy5tb2RlbF9uYW1lcyA9IFtdO1xuXG4gICAgdGhpcy5iYXNlX2pzb25fcGF0aCA9IFwiL2ZlZWRzL3dvcmtzaGVldHMvXCIgKyB0aGlzLmtleSArIFwiL3B1YmxpYy9iYXNpYz9hbHQ9XCI7XG5cbiAgICBpZiAoc3VwcG9ydHNDT1JTKSB7XG4gICAgICB0aGlzLmJhc2VfanNvbl9wYXRoICs9ICdqc29uJztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5iYXNlX2pzb25fcGF0aCArPSAnanNvbi1pbi1zY3JpcHQnO1xuICAgIH1cblxuICAgIGlmKCF0aGlzLndhaXQpIHtcbiAgICAgIHRoaXMuZmV0Y2goKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gQSBnbG9iYWwgc3RvcmFnZSBmb3IgY2FsbGJhY2tzLlxuICBUYWJsZXRvcC5jYWxsYmFja3MgPSB7fTtcblxuICAvLyBCYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgVGFibGV0b3AuaW5pdCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IFRhYmxldG9wKG9wdGlvbnMpO1xuICB9O1xuXG4gIFRhYmxldG9wLnNoZWV0cyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubG9nKFwiVGltZXMgaGF2ZSBjaGFuZ2VkISBZb3UnbGwgd2FudCB0byB1c2UgdmFyIHRhYmxldG9wID0gVGFibGV0b3AuaW5pdCguLi4pOyB0YWJsZXRvcC5zaGVldHMoLi4uKTsgaW5zdGVhZCBvZiBUYWJsZXRvcC5zaGVldHMoLi4uKVwiKTtcbiAgfTtcblxuICBUYWJsZXRvcC5wcm90b3R5cGUgPSB7XG5cbiAgICBmZXRjaDogZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgIGlmKHR5cGVvZihjYWxsYmFjaykgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXF1ZXN0RGF0YSh0aGlzLmJhc2VfanNvbl9wYXRoLCB0aGlzLmxvYWRTaGVldHMpO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAgVGhpcyB3aWxsIGNhbGwgdGhlIGVudmlyb25tZW50IGFwcHJvcHJpYXRlIHJlcXVlc3QgbWV0aG9kLlxuXG4gICAgICBJbiBicm93c2VyIGl0IHdpbGwgdXNlIEpTT04tUCwgaW4gbm9kZSBpdCB3aWxsIHVzZSByZXF1ZXN0KClcbiAgICAqL1xuICAgIHJlcXVlc3REYXRhOiBmdW5jdGlvbihwYXRoLCBjYWxsYmFjaykge1xuICAgICAgLy9DT1JTIG9ubHkgd29ya3MgaW4gSUU4LzkgYWNyb3NzIHRoZSBzYW1lIHByb3RvY29sXG4gICAgICAvL1lvdSBtdXN0IGhhdmUgeW91ciBzZXJ2ZXIgb24gSFRUUFMgdG8gdGFsayB0byBHb29nbGUsIG9yIGl0J2xsIGZhbGwgYmFjayBvbiBpbmplY3Rpb25cbiAgICAgIHZhciBwcm90b2NvbCA9IHRoaXMuZW5kcG9pbnQuc3BsaXQoXCIvL1wiKS5zaGlmdCgpIHx8IFwiaHR0cFwiO1xuICAgICAgaWYgKHN1cHBvcnRzQ09SUyAmJiAoIWluTGVnYWN5SUUgfHwgcHJvdG9jb2wgPT09IGxvY2F0aW9uLnByb3RvY29sKSkge1xuICAgICAgICB0aGlzLnhockZldGNoKHBhdGgsIGNhbGxiYWNrKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuaW5qZWN0U2NyaXB0KHBhdGgsIGNhbGxiYWNrKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLypcbiAgICAgIFVzZSBDcm9zcy1PcmlnaW4gWE1MSHR0cFJlcXVlc3QgdG8gZ2V0IHRoZSBkYXRhIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBpdC5cbiAgICAqL1xuICAgIHhockZldGNoOiBmdW5jdGlvbihwYXRoLCBjYWxsYmFjaykge1xuICAgICAgLy9zdXBwb3J0IElFOCdzIHNlcGFyYXRlIGNyb3NzLWRvbWFpbiBvYmplY3RcbiAgICAgIHZhciB4aHIgPSBpbkxlZ2FjeUlFID8gbmV3IFhEb21haW5SZXF1ZXN0KCkgOiBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgIHhoci5vcGVuKFwiR0VUXCIsIHRoaXMuZW5kcG9pbnQgKyBwYXRoKTtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICB2YXIganNvbiA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGUpO1xuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrLmNhbGwoc2VsZiwganNvbik7XG4gICAgICB9O1xuICAgICAgeGhyLnNlbmQoKTtcbiAgICB9LFxuXG4gICAgLypcbiAgICAgIEluc2VydCB0aGUgVVJMIGludG8gdGhlIHBhZ2UgYXMgYSBzY3JpcHQgdGFnLiBPbmNlIGl0J3MgbG9hZGVkIHRoZSBzcHJlYWRzaGVldCBkYXRhXG4gICAgICBpdCB0cmlnZ2VycyB0aGUgY2FsbGJhY2suIFRoaXMgaGVscHMgeW91IGF2b2lkIGNyb3NzLWRvbWFpbiBlcnJvcnNcbiAgICAgIGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vYXBpcy9nZGF0YS9zYW1wbGVzL3NwcmVhZHNoZWV0X3NhbXBsZS5odG1sXG5cbiAgICAgIExldCdzIGJlIHBsYWluLUphbmUgYW5kIG5vdCB1c2UgalF1ZXJ5IG9yIGFueXRoaW5nLlxuICAgICovXG4gICAgaW5qZWN0U2NyaXB0OiBmdW5jdGlvbihwYXRoLCBjYWxsYmFjaykge1xuICAgICAgdmFyIHNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuICAgICAgdmFyIGNhbGxiYWNrTmFtZTtcblxuICAgICAgaWYodGhpcy5zaW5nbGV0b24pIHtcbiAgICAgICAgaWYoY2FsbGJhY2sgPT09IHRoaXMubG9hZFNoZWV0cykge1xuICAgICAgICAgIGNhbGxiYWNrTmFtZSA9ICdUYWJsZXRvcC5zaW5nbGV0b24ubG9hZFNoZWV0cyc7XG4gICAgICAgIH0gZWxzZSBpZiAoY2FsbGJhY2sgPT09IHRoaXMubG9hZFNoZWV0KSB7XG4gICAgICAgICAgY2FsbGJhY2tOYW1lID0gJ1RhYmxldG9wLnNpbmdsZXRvbi5sb2FkU2hlZXQnO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGNhbGxiYWNrTmFtZSA9ICd0dCcgKyAoK25ldyBEYXRlKCkpICsgKE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMDApKTtcbiAgICAgICAgLy8gQ3JlYXRlIGEgdGVtcCBjYWxsYmFjayB3aGljaCB3aWxsIGdldCByZW1vdmVkIG9uY2UgaXQgaGFzIGV4ZWN1dGVkLFxuICAgICAgICAvLyB0aGlzIGFsbG93cyBtdWx0aXBsZSBpbnN0YW5jZXMgb2YgVGFibGV0b3AgdG8gY29leGlzdC5cbiAgICAgICAgVGFibGV0b3AuY2FsbGJhY2tzWyBjYWxsYmFja05hbWUgXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKCBhcmd1bWVudHMsIDAgKTtcbiAgICAgICAgICBjYWxsYmFjay5hcHBseShzZWxmLCBhcmdzKTtcbiAgICAgICAgICBzY3JpcHQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChzY3JpcHQpO1xuICAgICAgICAgIGRlbGV0ZSBUYWJsZXRvcC5jYWxsYmFja3NbY2FsbGJhY2tOYW1lXTtcbiAgICAgICAgfTtcbiAgICAgICAgY2FsbGJhY2tOYW1lID0gJ1RhYmxldG9wLmNhbGxiYWNrcy4nICsgY2FsbGJhY2tOYW1lO1xuICAgICAgfVxuXG4gICAgICB2YXIgdXJsID0gcGF0aCArIFwiJmNhbGxiYWNrPVwiICsgY2FsbGJhY2tOYW1lO1xuXG4gICAgICBpZih0aGlzLnNpbXBsZV91cmwpIHtcbiAgICAgICAgLy8gV2UndmUgZ29uZSBkb3duIGEgcmFiYml0IGhvbGUgb2YgcGFzc2luZyBpbmplY3RTY3JpcHQgdGhlIHBhdGgsIHNvIGxldCdzXG4gICAgICAgIC8vIGp1c3QgcHVsbCB0aGUgc2hlZXRfaWQgb3V0IG9mIHRoZSBwYXRoIGxpa2UgdGhlIGxlYXN0IGVmZmljaWVudCB3b3JrZXIgYmVlc1xuICAgICAgICBpZihwYXRoLmluZGV4T2YoXCIvbGlzdC9cIikgIT09IC0xKSB7XG4gICAgICAgICAgc2NyaXB0LnNyYyA9IHRoaXMuZW5kcG9pbnQgKyBcIi9cIiArIHRoaXMua2V5ICsgXCItXCIgKyBwYXRoLnNwbGl0KFwiL1wiKVs0XTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzY3JpcHQuc3JjID0gdGhpcy5lbmRwb2ludCArIFwiL1wiICsgdGhpcy5rZXk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjcmlwdC5zcmMgPSB0aGlzLmVuZHBvaW50ICsgdXJsO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5wYXJhbWV0ZXJpemUpIHtcbiAgICAgICAgc2NyaXB0LnNyYyA9IHRoaXMucGFyYW1ldGVyaXplICsgZW5jb2RlVVJJQ29tcG9uZW50KHNjcmlwdC5zcmMpO1xuICAgICAgfVxuXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnc2NyaXB0JylbMF0ucGFyZW50Tm9kZS5hcHBlbmRDaGlsZChzY3JpcHQpO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAgVGhpcyB3aWxsIG9ubHkgcnVuIGlmIHRhYmxldG9wIGlzIGJlaW5nIHJ1biBpbiBub2RlLmpzXG4gICAgKi9cbiAgICBzZXJ2ZXJTaWRlRmV0Y2g6IGZ1bmN0aW9uKHBhdGgsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICAgIHJlcXVlc3Qoe3VybDogdGhpcy5lbmRwb2ludCArIHBhdGgsIGpzb246IHRydWV9LCBmdW5jdGlvbihlcnIsIHJlc3AsIGJvZHkpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJldHVybiBjb25zb2xlLmVycm9yKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgY2FsbGJhY2suY2FsbChzZWxmLCBib2R5KTtcbiAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAgSXMgdGhpcyBhIHNoZWV0IHlvdSB3YW50IHRvIHB1bGw/XG4gICAgICBJZiB7IHdhbnRlZDogW1wiU2hlZXQxXCJdIH0gaGFzIGJlZW4gc3BlY2lmaWVkLCBvbmx5IFNoZWV0MSBpcyBpbXBvcnRlZFxuICAgICAgUHVsbHMgYWxsIHNoZWV0cyBpZiBub25lIGFyZSBzcGVjaWZpZWRcbiAgICAqL1xuICAgIGlzV2FudGVkOiBmdW5jdGlvbihzaGVldE5hbWUpIHtcbiAgICAgIGlmKHRoaXMud2FudGVkLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiAodHRJbmRleE9mKHRoaXMud2FudGVkLCBzaGVldE5hbWUpICE9PSAtMSk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8qXG4gICAgICBXaGF0IGdldHMgc2VuZCB0byB0aGUgY2FsbGJhY2tcbiAgICAgIGlmIHNpbXBsZVNoZWV0ID09PSB0cnVlLCB0aGVuIGRvbid0IHJldHVybiBhbiBhcnJheSBvZiBUYWJsZXRvcC50aGlzLm1vZGVscyxcbiAgICAgIG9ubHkgcmV0dXJuIHRoZSBmaXJzdCBvbmUncyBlbGVtZW50c1xuICAgICovXG4gICAgZGF0YTogZnVuY3Rpb24oKSB7XG4gICAgICAvLyBJZiB0aGUgaW5zdGFuY2UgaXMgYmVpbmcgcXVlcmllZCBiZWZvcmUgdGhlIGRhdGEncyBiZWVuIGZldGNoZWRcbiAgICAgIC8vIHRoZW4gcmV0dXJuIHVuZGVmaW5lZC5cbiAgICAgIGlmKHRoaXMubW9kZWxfbmFtZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICBpZih0aGlzLnNpbXBsZVNoZWV0KSB7XG4gICAgICAgIGlmKHRoaXMubW9kZWxfbmFtZXMubGVuZ3RoID4gMSAmJiB0aGlzLmRlYnVnKSB7XG4gICAgICAgICAgdGhpcy5sb2coXCJXQVJOSU5HIFlvdSBoYXZlIG1vcmUgdGhhbiBvbmUgc2hlZXQgYnV0IGFyZSB1c2luZyBzaW1wbGUgc2hlZXQgbW9kZSEgRG9uJ3QgYmxhbWUgbWUgd2hlbiBzb21ldGhpbmcgZ29lcyB3cm9uZy5cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMubW9kZWxzWyB0aGlzLm1vZGVsX25hbWVzWzBdIF0uYWxsKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5tb2RlbHM7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8qXG4gICAgICBBZGQgYW5vdGhlciBzaGVldCB0byB0aGUgd2FudGVkIGxpc3RcbiAgICAqL1xuICAgIGFkZFdhbnRlZDogZnVuY3Rpb24oc2hlZXQpIHtcbiAgICAgIGlmKHR0SW5kZXhPZih0aGlzLndhbnRlZCwgc2hlZXQpID09PSAtMSkge1xuICAgICAgICB0aGlzLndhbnRlZC5wdXNoKHNoZWV0KTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLypcbiAgICAgIExvYWQgYWxsIHdvcmtzaGVldHMgb2YgdGhlIHNwcmVhZHNoZWV0LCB0dXJuaW5nIGVhY2ggaW50byBhIFRhYmxldG9wIE1vZGVsLlxuICAgICAgTmVlZCB0byB1c2UgaW5qZWN0U2NyaXB0IGJlY2F1c2UgdGhlIHdvcmtzaGVldCB2aWV3IHRoYXQgeW91J3JlIHdvcmtpbmcgZnJvbVxuICAgICAgZG9lc24ndCBhY3R1YWxseSBpbmNsdWRlIHRoZSBkYXRhLiBUaGUgbGlzdC1iYXNlZCBmZWVkICgvZmVlZHMvbGlzdC9rZXkuLikgZG9lcywgdGhvdWdoLlxuICAgICAgQ2FsbHMgYmFjayB0byBsb2FkU2hlZXQgaW4gb3JkZXIgdG8gZ2V0IHRoZSByZWFsIHdvcmsgZG9uZS5cblxuICAgICAgVXNlZCBhcyBhIGNhbGxiYWNrIGZvciB0aGUgd29ya3NoZWV0LWJhc2VkIEpTT05cbiAgICAqL1xuICAgIGxvYWRTaGVldHM6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHZhciBpLCBpbGVuO1xuICAgICAgdmFyIHRvTG9hZCA9IFtdO1xuICAgICAgdGhpcy5mb3VuZFNoZWV0TmFtZXMgPSBbXTtcblxuICAgICAgZm9yKGkgPSAwLCBpbGVuID0gZGF0YS5mZWVkLmVudHJ5Lmxlbmd0aDsgaSA8IGlsZW4gOyBpKyspIHtcbiAgICAgICAgdGhpcy5mb3VuZFNoZWV0TmFtZXMucHVzaChkYXRhLmZlZWQuZW50cnlbaV0udGl0bGUuJHQpO1xuICAgICAgICAvLyBPbmx5IHB1bGwgaW4gZGVzaXJlZCBzaGVldHMgdG8gcmVkdWNlIGxvYWRpbmdcbiAgICAgICAgaWYoIHRoaXMuaXNXYW50ZWQoZGF0YS5mZWVkLmVudHJ5W2ldLmNvbnRlbnQuJHQpICkge1xuICAgICAgICAgIHZhciBsaW5rSWR4ID0gZGF0YS5mZWVkLmVudHJ5W2ldLmxpbmsubGVuZ3RoLTE7XG4gICAgICAgICAgdmFyIHNoZWV0X2lkID0gZGF0YS5mZWVkLmVudHJ5W2ldLmxpbmtbbGlua0lkeF0uaHJlZi5zcGxpdCgnLycpLnBvcCgpO1xuICAgICAgICAgIHZhciBqc29uX3BhdGggPSBcIi9mZWVkcy9saXN0L1wiICsgdGhpcy5rZXkgKyBcIi9cIiArIHNoZWV0X2lkICsgXCIvcHVibGljL3ZhbHVlcz9hbHQ9XCJcbiAgICAgICAgICBpZiAoc3VwcG9ydHNDT1JTKSB7XG4gICAgICAgICAgICBqc29uX3BhdGggKz0gJ2pzb24nO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBqc29uX3BhdGggKz0gJ2pzb24taW4tc2NyaXB0JztcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYodGhpcy5xdWVyeSkge1xuICAgICAgICAgICAganNvbl9wYXRoICs9IFwiJnNxPVwiICsgdGhpcy5xdWVyeTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYodGhpcy5vcmRlcmJ5KSB7XG4gICAgICAgICAgICBqc29uX3BhdGggKz0gXCImb3JkZXJieT1jb2x1bW46XCIgKyB0aGlzLm9yZGVyYnkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYodGhpcy5yZXZlcnNlKSB7XG4gICAgICAgICAgICBqc29uX3BhdGggKz0gXCImcmV2ZXJzZT10cnVlXCI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRvTG9hZC5wdXNoKGpzb25fcGF0aCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5zaGVldHNUb0xvYWQgPSB0b0xvYWQubGVuZ3RoO1xuICAgICAgZm9yKGkgPSAwLCBpbGVuID0gdG9Mb2FkLmxlbmd0aDsgaSA8IGlsZW47IGkrKykge1xuICAgICAgICB0aGlzLnJlcXVlc3REYXRhKHRvTG9hZFtpXSwgdGhpcy5sb2FkU2hlZXQpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICAvKlxuICAgICAgQWNjZXNzIGxheWVyIGZvciB0aGUgdGhpcy5tb2RlbHNcbiAgICAgIC5zaGVldHMoKSBnZXRzIHlvdSBhbGwgb2YgdGhlIHNoZWV0c1xuICAgICAgLnNoZWV0cygnU2hlZXQxJykgZ2V0cyB5b3UgdGhlIHNoZWV0IG5hbWVkIFNoZWV0MVxuICAgICovXG4gICAgc2hlZXRzOiBmdW5jdGlvbihzaGVldE5hbWUpIHtcbiAgICAgIGlmKHR5cGVvZiBzaGVldE5hbWUgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubW9kZWxzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYodHlwZW9mKHRoaXMubW9kZWxzWyBzaGVldE5hbWUgXSkgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAvLyBhbGVydCggXCJDYW4ndCBmaW5kIFwiICsgc2hlZXROYW1lICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB0aGlzLm1vZGVsc1sgc2hlZXROYW1lIF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgc2hlZXRSZWFkeTogZnVuY3Rpb24obW9kZWwpIHtcbiAgICAgIHRoaXMubW9kZWxzWyBtb2RlbC5uYW1lIF0gPSBtb2RlbDtcbiAgICAgIGlmKHR0SW5kZXhPZih0aGlzLm1vZGVsX25hbWVzLCBtb2RlbC5uYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgdGhpcy5tb2RlbF9uYW1lcy5wdXNoKG1vZGVsLm5hbWUpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLnNoZWV0c1RvTG9hZC0tO1xuICAgICAgaWYodGhpcy5zaGVldHNUb0xvYWQgPT09IDApXG4gICAgICAgIHRoaXMuZG9DYWxsYmFjaygpO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAgUGFyc2UgYSBzaW5nbGUgbGlzdC1iYXNlZCB3b3Jrc2hlZXQsIHR1cm5pbmcgaXQgaW50byBhIFRhYmxldG9wIE1vZGVsXG5cbiAgICAgIFVzZWQgYXMgYSBjYWxsYmFjayBmb3IgdGhlIGxpc3QtYmFzZWQgSlNPTlxuICAgICovXG4gICAgbG9hZFNoZWV0OiBmdW5jdGlvbihkYXRhKSB7XG4gICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICB2YXIgbW9kZWwgPSBuZXcgVGFibGV0b3AuTW9kZWwoIHsgZGF0YTogZGF0YSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJzZU51bWJlcnM6IHRoaXMucGFyc2VOdW1iZXJzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvc3RQcm9jZXNzOiB0aGlzLnBvc3RQcm9jZXNzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxldG9wOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXR0eUNvbHVtbk5hbWVzOiB0aGlzLnByZXR0eUNvbHVtbk5hbWVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uUmVhZHk6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhhdC5zaGVldFJlYWR5KHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gfSApO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAgRXhlY3V0ZSB0aGUgY2FsbGJhY2sgdXBvbiBsb2FkaW5nISBSZWx5IG9uIHRoaXMuZGF0YSgpIGJlY2F1c2UgeW91IG1pZ2h0XG4gICAgICAgIG9ubHkgcmVxdWVzdCBjZXJ0YWluIHBpZWNlcyBvZiBkYXRhIChpLmUuIHNpbXBsZVNoZWV0IG1vZGUpXG4gICAgICBUZXN0cyB0aGlzLnNoZWV0c1RvTG9hZCBqdXN0IGluIGNhc2UgYSByYWNlIGNvbmRpdGlvbiBoYXBwZW5zIHRvIHNob3cgdXBcbiAgICAqL1xuICAgIGRvQ2FsbGJhY2s6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYodGhpcy5zaGVldHNUb0xvYWQgPT09IDApIHtcbiAgICAgICAgdGhpcy5jYWxsYmFjay5hcHBseSh0aGlzLmNhbGxiYWNrQ29udGV4dCB8fCB0aGlzLCBbdGhpcy5kYXRhKCksIHRoaXNdKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgbG9nOiBmdW5jdGlvbihtc2cpIHtcbiAgICAgIGlmKHRoaXMuZGVidWcpIHtcbiAgICAgICAgaWYodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIGNvbnNvbGUubG9nICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmFwcGx5KGNvbnNvbGUubG9nLCBbY29uc29sZSwgYXJndW1lbnRzXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgfTtcblxuICAvKlxuICAgIFRhYmxldG9wLk1vZGVsIHN0b3JlcyB0aGUgYXR0cmlidXRlIG5hbWVzIGFuZCBwYXJzZXMgdGhlIHdvcmtzaGVldCBkYXRhXG4gICAgICB0byB0dXJuIGl0IGludG8gc29tZXRoaW5nIHdvcnRod2hpbGVcblxuICAgIE9wdGlvbnMgc2hvdWxkIGJlIGluIHRoZSBmb3JtYXQgeyBkYXRhOiBYWFggfSwgd2l0aCBYWFggYmVpbmcgdGhlIGxpc3QtYmFzZWQgd29ya3NoZWV0XG4gICovXG4gIFRhYmxldG9wLk1vZGVsID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIHZhciBpLCBqLCBpbGVuLCBqbGVuO1xuICAgIHRoaXMuY29sdW1uX25hbWVzID0gW107XG4gICAgdGhpcy5uYW1lID0gb3B0aW9ucy5kYXRhLmZlZWQudGl0bGUuJHQ7XG4gICAgdGhpcy50YWJsZXRvcCA9IG9wdGlvbnMudGFibGV0b3A7XG4gICAgdGhpcy5lbGVtZW50cyA9IFtdO1xuICAgIHRoaXMub25SZWFkeSA9IG9wdGlvbnMub25SZWFkeTtcbiAgICB0aGlzLnJhdyA9IG9wdGlvbnMuZGF0YTsgLy8gQSBjb3B5IG9mIHRoZSBzaGVldCdzIHJhdyBkYXRhLCBmb3IgYWNjZXNzaW5nIG1pbnV0aWFlXG5cbiAgICBpZih0eXBlb2Yob3B0aW9ucy5kYXRhLmZlZWQuZW50cnkpID09PSAndW5kZWZpbmVkJykge1xuICAgICAgb3B0aW9ucy50YWJsZXRvcC5sb2coXCJNaXNzaW5nIGRhdGEgZm9yIFwiICsgdGhpcy5uYW1lICsgXCIsIG1ha2Ugc3VyZSB5b3UgZGlkbid0IGZvcmdldCBjb2x1bW4gaGVhZGVyc1wiKTtcbiAgICAgIHRoaXMuZWxlbWVudHMgPSBbXTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IodmFyIGtleSBpbiBvcHRpb25zLmRhdGEuZmVlZC5lbnRyeVswXSl7XG4gICAgICBpZigvXmdzeC8udGVzdChrZXkpKVxuICAgICAgICB0aGlzLmNvbHVtbl9uYW1lcy5wdXNoKCBrZXkucmVwbGFjZShcImdzeCRcIixcIlwiKSApO1xuICAgIH1cblxuICAgIHRoaXMub3JpZ2luYWxfY29sdW1ucyA9IHRoaXMuY29sdW1uX25hbWVzO1xuXG4gICAgZm9yKGkgPSAwLCBpbGVuID0gIG9wdGlvbnMuZGF0YS5mZWVkLmVudHJ5Lmxlbmd0aCA7IGkgPCBpbGVuOyBpKyspIHtcbiAgICAgIHZhciBzb3VyY2UgPSBvcHRpb25zLmRhdGEuZmVlZC5lbnRyeVtpXTtcbiAgICAgIHZhciBlbGVtZW50ID0ge307XG4gICAgICBmb3IodmFyIGogPSAwLCBqbGVuID0gdGhpcy5jb2x1bW5fbmFtZXMubGVuZ3RoOyBqIDwgamxlbiA7IGorKykge1xuICAgICAgICB2YXIgY2VsbCA9IHNvdXJjZVsgXCJnc3gkXCIgKyB0aGlzLmNvbHVtbl9uYW1lc1tqXSBdO1xuICAgICAgICBpZiAodHlwZW9mKGNlbGwpICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGlmKG9wdGlvbnMucGFyc2VOdW1iZXJzICYmIGNlbGwuJHQgIT09ICcnICYmICFpc05hTihjZWxsLiR0KSlcbiAgICAgICAgICAgIGVsZW1lbnRbIHRoaXMuY29sdW1uX25hbWVzW2pdIF0gPSArY2VsbC4kdDtcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICBlbGVtZW50WyB0aGlzLmNvbHVtbl9uYW1lc1tqXSBdID0gY2VsbC4kdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnRbIHRoaXMuY29sdW1uX25hbWVzW2pdIF0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYoZWxlbWVudC5yb3dOdW1iZXIgPT09IHVuZGVmaW5lZClcbiAgICAgICAgZWxlbWVudC5yb3dOdW1iZXIgPSBpICsgMTtcbiAgICAgIGlmKCBvcHRpb25zLnBvc3RQcm9jZXNzIClcbiAgICAgICAgb3B0aW9ucy5wb3N0UHJvY2VzcyhlbGVtZW50KTtcbiAgICAgIHRoaXMuZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICB9XG5cbiAgICBpZihvcHRpb25zLnByZXR0eUNvbHVtbk5hbWVzKVxuICAgICAgdGhpcy5mZXRjaFByZXR0eUNvbHVtbnMoKTtcbiAgICBlbHNlXG4gICAgICB0aGlzLm9uUmVhZHkuY2FsbCh0aGlzKTtcbiAgfTtcblxuICBUYWJsZXRvcC5Nb2RlbC5wcm90b3R5cGUgPSB7XG4gICAgLypcbiAgICAgIFJldHVybnMgYWxsIG9mIHRoZSBlbGVtZW50cyAocm93cykgb2YgdGhlIHdvcmtzaGVldCBhcyBvYmplY3RzXG4gICAgKi9cbiAgICBhbGw6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuZWxlbWVudHM7XG4gICAgfSxcblxuICAgIGZldGNoUHJldHR5Q29sdW1uczogZnVuY3Rpb24oKSB7XG4gICAgICBpZighdGhpcy5yYXcuZmVlZC5saW5rWzNdKVxuICAgICAgICByZXR1cm4gdGhpcy5yZWFkeSgpO1xuICAgICAgdmFyIGNlbGx1cmwgPSB0aGlzLnJhdy5mZWVkLmxpbmtbM10uaHJlZi5yZXBsYWNlKCcvZmVlZHMvbGlzdC8nLCAnL2ZlZWRzL2NlbGxzLycpLnJlcGxhY2UoJ2h0dHBzOi8vc3ByZWFkc2hlZXRzLmdvb2dsZS5jb20nLCAnJyk7XG4gICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICB0aGlzLnRhYmxldG9wLnJlcXVlc3REYXRhKGNlbGx1cmwsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgdGhhdC5sb2FkUHJldHR5Q29sdW1ucyhkYXRhKVxuICAgICAgfSk7XG4gICAgfSxcblxuICAgIHJlYWR5OiBmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMub25SZWFkeS5jYWxsKHRoaXMpO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAqIFN0b3JlIGNvbHVtbiBuYW1lcyBhcyBhbiBvYmplY3RcbiAgICAgKiB3aXRoIGtleXMgb2YgR29vZ2xlLWZvcm1hdHRlZCBcImNvbHVtbk5hbWVcIlxuICAgICAqIGFuZCB2YWx1ZXMgb2YgaHVtYW4tcmVhZGFibGUgXCJDb2x1bW4gbmFtZVwiXG4gICAgICovXG4gICAgbG9hZFByZXR0eUNvbHVtbnM6IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHZhciBwcmV0dHlfY29sdW1ucyA9IHt9O1xuXG4gICAgICB2YXIgY29sdW1uX25hbWVzID0gdGhpcy5jb2x1bW5fbmFtZXM7XG5cbiAgICAgIHZhciBpID0gMDtcbiAgICAgIHZhciBsID0gY29sdW1uX25hbWVzLmxlbmd0aDtcblxuICAgICAgZm9yICg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYgKHR5cGVvZiBkYXRhLmZlZWQuZW50cnlbaV0uY29udGVudC4kdCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBwcmV0dHlfY29sdW1uc1tjb2x1bW5fbmFtZXNbaV1dID0gZGF0YS5mZWVkLmVudHJ5W2ldLmNvbnRlbnQuJHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcHJldHR5X2NvbHVtbnNbY29sdW1uX25hbWVzW2ldXSA9IGNvbHVtbl9uYW1lc1tpXTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLnByZXR0eV9jb2x1bW5zID0gcHJldHR5X2NvbHVtbnM7XG5cbiAgICAgIHRoaXMucHJldHRpZnlFbGVtZW50cygpO1xuICAgICAgdGhpcy5yZWFkeSgpO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAqIEdvIHRocm91Z2ggZWFjaCByb3csIHN1YnN0aXR1dGl0aW5nXG4gICAgICogR29vZ2xlLWZvcm1hdHRlZCBcImNvbHVtbk5hbWVcIlxuICAgICAqIHdpdGggaHVtYW4tcmVhZGFibGUgXCJDb2x1bW4gbmFtZVwiXG4gICAgICovXG4gICAgcHJldHRpZnlFbGVtZW50czogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcHJldHR5X2VsZW1lbnRzID0gW10sXG4gICAgICAgICAgb3JkZXJlZF9wcmV0dHlfbmFtZXMgPSBbXSxcbiAgICAgICAgICBpLCBqLCBpbGVuLCBqbGVuO1xuXG4gICAgICB2YXIgb3JkZXJlZF9wcmV0dHlfbmFtZXM7XG4gICAgICBmb3IoaiA9IDAsIGpsZW4gPSB0aGlzLmNvbHVtbl9uYW1lcy5sZW5ndGg7IGogPCBqbGVuIDsgaisrKSB7XG4gICAgICAgIG9yZGVyZWRfcHJldHR5X25hbWVzLnB1c2godGhpcy5wcmV0dHlfY29sdW1uc1t0aGlzLmNvbHVtbl9uYW1lc1tqXV0pO1xuICAgICAgfVxuXG4gICAgICBmb3IoaSA9IDAsIGlsZW4gPSB0aGlzLmVsZW1lbnRzLmxlbmd0aDsgaSA8IGlsZW47IGkrKykge1xuICAgICAgICB2YXIgbmV3X2VsZW1lbnQgPSB7fTtcbiAgICAgICAgZm9yKGogPSAwLCBqbGVuID0gdGhpcy5jb2x1bW5fbmFtZXMubGVuZ3RoOyBqIDwgamxlbiA7IGorKykge1xuICAgICAgICAgIHZhciBuZXdfY29sdW1uX25hbWUgPSB0aGlzLnByZXR0eV9jb2x1bW5zW3RoaXMuY29sdW1uX25hbWVzW2pdXTtcbiAgICAgICAgICBuZXdfZWxlbWVudFtuZXdfY29sdW1uX25hbWVdID0gdGhpcy5lbGVtZW50c1tpXVt0aGlzLmNvbHVtbl9uYW1lc1tqXV07XG4gICAgICAgIH1cbiAgICAgICAgcHJldHR5X2VsZW1lbnRzLnB1c2gobmV3X2VsZW1lbnQpO1xuICAgICAgfVxuICAgICAgdGhpcy5lbGVtZW50cyA9IHByZXR0eV9lbGVtZW50cztcbiAgICAgIHRoaXMuY29sdW1uX25hbWVzID0gb3JkZXJlZF9wcmV0dHlfbmFtZXM7XG4gICAgfSxcblxuICAgIC8qXG4gICAgICBSZXR1cm4gdGhlIGVsZW1lbnRzIGFzIGFuIGFycmF5IG9mIGFycmF5cywgaW5zdGVhZCBvZiBhbiBhcnJheSBvZiBvYmplY3RzXG4gICAgKi9cbiAgICB0b0FycmF5OiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBhcnJheSA9IFtdLFxuICAgICAgICAgIGksIGosIGlsZW4sIGpsZW47XG4gICAgICBmb3IoaSA9IDAsIGlsZW4gPSB0aGlzLmVsZW1lbnRzLmxlbmd0aDsgaSA8IGlsZW47IGkrKykge1xuICAgICAgICB2YXIgcm93ID0gW107XG4gICAgICAgIGZvcihqID0gMCwgamxlbiA9IHRoaXMuY29sdW1uX25hbWVzLmxlbmd0aDsgaiA8IGpsZW4gOyBqKyspIHtcbiAgICAgICAgICByb3cucHVzaCggdGhpcy5lbGVtZW50c1tpXVsgdGhpcy5jb2x1bW5fbmFtZXNbal0gXSApO1xuICAgICAgICB9XG4gICAgICAgIGFycmF5LnB1c2gocm93KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhcnJheTtcbiAgICB9XG4gIH07XG5cbiAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBUYWJsZXRvcDtcbiAgfSBlbHNlIHtcbiAgICBnbG9iYWwuVGFibGV0b3AgPSBUYWJsZXRvcDtcbiAgfVxufSkodGhpcyk7XG4iXX0=
