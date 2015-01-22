module.exports = ['$scope', '$rootScope', '$routeParams', '$location', '$window', 'db', match];

function match($scope, $rootScope, $routeParams, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, schema) {
    if (err) {
      console.error(err);
      return;
    }

    var match = schema.matches.filter(function (match) { return match.id === $routeParams.id; })[0] || {};

    $scope.name = match.name;
    $scope.teams = match.teams;
    $scope.$apply();
  });
}
