module.exports = ['$scope', '$rootScope', '$location', '$window', 'db', home];

function home($scope, $rootScope, $location, $window, db) {
  'use strict';

  db.fetch(function (err, matches) {
    if (err) {
      console.error(err);
      return;
    }

    $scope.matches = matches;
    $scope.$apply();
    $scope.matches.forEach(function (match) {
      match.fetch(function (err, data) {
        $scope.$apply();
      });
    });
  });
}
