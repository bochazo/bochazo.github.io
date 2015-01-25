'use strict';

var _ = require('very-array');

module.exports = players;

function players(source) {
  return _(source)
    .selectMany(function (match) {
      return match.players;
    }).groupBy(function (player) {
      return player.name;
    }).select(function (player) {
      return {
        name: player.key,
        goals: _(player).sum(function (item) { return item.total; }),
        common: _(player).sum(function (item) { return item.goal; }),
        headed: _(player).sum(function (item) { return item.headed; }),
        freeKick: _(player).sum(function (item) { return item.freeKick; }),
        penalty: _(player).sum(function (item) { return item.penalty; }),
        own: _(player).sum(function (item) { return item.own; }),
        matches: player.where(function (item) { return !item.substitute; }).select(function (item) { return item.match; }),
        assists: _(player).sum(function (item) { return item.assists; }),
        average: _(player).sum(function (item) { return item.total; }) / player.where(function (item) { return !item.substitute; }).length,
        detail: player
      };
    });
}
