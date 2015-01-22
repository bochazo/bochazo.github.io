module.exports = ['$scope', '$rootScope', '$location', '$window', 'db', home];

function home($scope, $rootScope, $location, $window, db) {
  'use strict';

  db.fetchAll(function (err, schema) {
    if (err) {
      console.error(err);
      return;
    }

    $scope.matches = schema.matches;
    $scope.$apply();
  });
}
