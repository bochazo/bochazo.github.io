'use strict';

var table = require('gsx');
var contra = require('contra');
var matches = require('./matches.js');

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

    done(null, matches(results));
  });
}
