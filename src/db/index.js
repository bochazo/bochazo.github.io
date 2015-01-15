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
