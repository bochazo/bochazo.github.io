'use strict';

var contra = require('contra');
var load = require('./open.js');
var players = require('./players.js');
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

    load(docs, function (err, data) {
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

        cb(null, {
          matches: results,
          players: players(results)
        });
      });
    });
  }
};
