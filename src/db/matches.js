'use strict';

var _ = require('very-array');

module.exports = matches;

function matches(results) {
  return results
    .reduce(function (x, y) { return x.concat(y); }, [])
    .map(function (match) {
      var isFetching;
      var callbacks = [];

      return {
        id: match.id,
        name: match.name,
        fetch: function (cb) {
          var self = this;

          if (self.players) {
            cb(null, self);
            return;
          }

          callbacks.push(cb);

          if (isFetching) {
            return;
          }

          isFetching = true;
          match.fetch(function (err, data) { getMatches.call(self, err, data); });
        }
      };

      function getMatches(err, data) {
        var self = this;
        var teams;

        if (err) {
          callbacks.forEach(function (callback) {
            callback(err);
          });
          return;
        }

        self.players = data.map(function (player, ix) { return getPlayer(player, ix, match); });
        self.starters = self.players.filter(function (player) { return !player.substitute; });
        self.substitutes = self.players.filter(function (player) { return player.substitute; });
        self.teams = getTeams(self.starters);

        if (self.teams.length === 1) {
          self.teams = [];
        }

        callbacks.forEach(function (callback) {
          callback(null, self);
        });

        return;
      }
    });

  function getTeams(starters) {
    return _(starters)
      .groupBy(function (player) { return player.team; })
      .map(function (team) {
        return {
          name: team.key,
          players: team,
          goals: {
            count: sumGoals(team, starters),
            detail: getGoalsDetail(team, starters)
          },
          assists: team.filter(function (player) { return player.assists; })
        };
      });
  }

  function getGoalsDetail(team, starters) {
    return team
      .filter(function (player) {
        return player.total;
      }).concat(starters.filter(function (player) { return player.team !== team.key && player.own; }));
  }

  function sumGoals(team, starters) {
    return team
      .map(function (player) {
        return player.total;
      }).reduce(function (a, b) { return a + b; }, 0) +
      starters.filter(function (player) {
        return player.team !== team.key && player.own;
      }).map(function (player) {
        return player.own;
      }).reduce(function (a, b) { return a + b; }, 0);
  }

  function getPlayer (player, ix, match) {
    return {
      name: player.jugador,
      assists: (+player.asistencias),
      goal: (+player.jugada),
      headed: (+player.cabeza),
      freeKick: (+player.tirolibre),
      penalty: (+player.penal),
      total: (+player.jugada + (+player.cabeza) + (+player.tirolibre) + (+player.penal)),
      own: (+player.encontra),
      team: player.equipo,
      substitute: ix >= 22,
      match: match
    };
  }
}
