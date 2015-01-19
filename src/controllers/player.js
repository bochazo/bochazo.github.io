var va = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', player];

function player($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  $scope.name = $routeParams.name;

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

    $scope.matches = info;
    $scope.assists = va(info).sum(function (item) { return item.assists; });
    $scope.goals = va(info).sum(function (item) { return item.total; });
    $scope.average = ($scope.goals / $scope.matches.length).toFixed(2);
    $scope.$apply();
  });
}
