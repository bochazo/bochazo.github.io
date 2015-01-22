var _ = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', player];

function player($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  $scope.name = $routeParams.name;

  db.fetchAll(function (err, schema) {
    var info;

    if (err) {
      console.error(err);
      return;
    }

    info = _(schema.players).filter(function (player) {
      return player.name === $routeParams.name;
    })[0] || {};

    $scope.matches = info.matches;
    $scope.assists = info.assists;
    $scope.goals = info.goals;
    $scope.average = info.average && info.average.toFixed(2);
    $scope.$apply();
  });
}
