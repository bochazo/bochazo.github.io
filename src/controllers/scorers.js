var va = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', scorers];

function scorers($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, matches) {
    var info;

    if (err) {
      console.error(err);
      return;
    }

    $scope.players = va(matches).selectMany(function (match) {
      return match.players;
    }).groupBy(function (player) {
      return player.name;
    }).map(function (player) {
      return {
        name: player.key,
        goals: va(player).sum(function (item) { return item.total; }),
        matches: player.length,
        assists: va(player).sum(function (item) { return item.assists; }),
        average: (va(player).sum(function (item) { return item.total; }) / player.length).toFixed(2),
        detail: player
      };
    });
    $scope.$apply();
  });
}
