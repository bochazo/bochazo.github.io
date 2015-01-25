var _ = require('very-array');

module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', player];

function player($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  $scope.name = $routeParams.name;

  db.fetchAll(function (err, schema) {
    if (err) {
      console.error(err);
      return;
    }

    var info = _(schema.players).filter(function (player) {
      return player.name === $routeParams.name;
    })[0] || {};

    $scope.matches = info.matches;
    $scope.assists = info.assists;
    $scope.goals = info.goals;
    $scope.own = info.own;
    $scope.average = info.average && info.average.toFixed(2);
    $scope.detail = (function () {
      var arr = [];

      addDetail(info.common, 'de jugada');
      addDetail(info.headed, 'de cabeza');
      addDetail(info.freeKick, 'de tiro libre');
      addDetail(info.penalty, 'de penal');
      addDetail(info.own, 'en contra');

      return getDetail();

      function getDetail() {
        if (arr.length === 1 && arr[0].detail !== 'en contra') {
          return (arr[0].count === 1 ? '' : 'todos ') + arr[0].detail;
        }
        else {
          return arr.map(function (item) { return item.count + ' ' + item.detail; }).join(', ');
        }
      }

      function addDetail(count, info) {
        if (count) {
          arr.push({
            count: count,
            detail: info
          });
        }
      }
    })();
    $scope.$apply();
  });
}
