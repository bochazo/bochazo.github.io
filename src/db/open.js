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
