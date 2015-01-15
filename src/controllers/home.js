module.exports = ['$scope', '$rootScope', '$location', '$window', 'db', home];

function home($scope, $rootScope, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, matches) {
    if (err) {
      console.error(err);
      return;
    }

    $scope.matches = matches;
    $scope.$apply();
  });
}
