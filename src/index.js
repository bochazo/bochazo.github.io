var db = require('./db');
var docs = require('../docs.json');

db.open(docs, function (err, data) {
  console.log(data);
});

angular.module('ocampo', ['ngRoute'])
  .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {

    $routeProvider
      .when('/', { controller: 'HomeCtrl', templateUrl: '/views/home.html' })
      .when('/busqueda', { controller: 'PlaceSearchCtrl', templateUrl: '/place/search.html' })
      .when('/listado', { controller: 'PlaceListCtrl', templateUrl: '/place/list.html' })
      .when('/mapa', { controller: 'MapCtrl', templateUrl: '/site/map.html' })
      .when('/canchas/agregar', { controller: 'PlaceAddCtrl', templateUrl: '/place/add.html' })
      .when('/canchas/listado/:sport', { controller: 'PlaceListCtrl', templateUrl: '/place/list.html' })
      .when('/canchas/listado', { controller: 'PlaceListCtrl', templateUrl: '/place/list.html' })
      .when('/canchas/:id', { controller: 'PlaceDetailCtrl', resolve: {
        place: ['$route', 'Place', function ($route, Place) {
          return Place.get($route.current.params).$promise;
        }]
      }, templateUrl: '/place/detail.html' })
      .when('/404', { templateUrl: '/site/404.html' })
      .otherwise({ templateUrl: '/site/404.html' });
  }]);

angular.module('ocampo').controller(
  'HomeCtrl',
  ['$scope', '$rootScope', '$location', '$window',
  function ($scope, $rootScope, $location, $window) {
    'use strict';
  }]);

