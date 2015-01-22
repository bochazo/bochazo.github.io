'use strict';

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
