'use strict';

var _ = require('very-array');

module.exports = players;

function players(source) {
  _(source)
    .selectMany(function (match) {
      return match.players;
    }).groupBy(function (player) {
      return player.name;
    }).select(function (player) {
      return {
        name: player.key,
        goals: _(player).sum(function (item) { return item.total; }),
        matches: player.where(function (item) { return !item.substitute; }).length,
        assists: _(player).sum(function (item) { return item.assists; }),
        average: _(player).sum(function (item) { return item.total; }) / player.where(function (item) { return !item.substitute; }).length,
        detail: player
      };
    });
}
