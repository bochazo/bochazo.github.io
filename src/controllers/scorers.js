var _ = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', scorers];

function scorers($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, schema) {
    var info;

    if (err) {
      console.error(err);
      return;
    }

    $scope.players = _(schema.players).where(function (player) {
      return player.goals;
    }).orderByDescending(function (player) {
      return player.goals;
    });
    $scope.$apply();
  });
}
