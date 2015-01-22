'use strict';

module.exports = angular.module('bchz', ['ngRoute'])
  .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {

    $routeProvider
      .when('/', { controller: 'HomeCtrl', templateUrl: '/views/home.html' })
      .when('/players/:name', { controller: 'PlayerCtrl', templateUrl: '/views/player.html' })
      .when('/match/:id', { controller: 'MatchCtrl', templateUrl: '/views/match.html' })
      .when('/scorers', { controller: 'ScorersCtrl', templateUrl: '/views/scorers.html' })
      .when('/404', { templateUrl: '/site/404.html' })
      .otherwise({ templateUrl: '/site/404.html' });
  }]);
