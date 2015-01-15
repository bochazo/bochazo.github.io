var _ = require('very-array');

module.exports = transform;

function transform(results) {
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
          match.fetch(function (err, data) {
            var teams;

            if (err) {
              callbacks.forEach(function (callback) {
                callback(err);
              });
              return;
            }

            self.players = data.map(function (player, ix) {
              return {
                name: player.jugador,
                assists: +player.asistencias,
                goal: +player.jugada,
                headed: +player.cabeza,
                freeKick: +player.tirolibre,
                penalty: +player.penal,
                total: +player.jugada + +player.cabeza + +player.tirolibre + +player.penal,
                own: +player.encontra,
                team: player.equipo,
                substitute: ix >= 22
              };
            });

            self.starters = self.players.filter(function (player) { return !player.substitute; });
            self.substitutes = self.players.filter(function (player) { return player.substitute; });
            self.teams = _(self.starters).groupBy(function (player) { return player.team; }).map(function (team) {
              return {
                name: team.key,
                players: team,
                goals: {
                  count: team.map(function (player) {
                      return player.total;
                    }).reduce(function (a, b) { return a + b; }, 0) +
                    self.starters.filter(function (player) {
                      return player.team != team.key && player.own;
                    }).map(function (player) {
                      return player.own;
                    }).reduce(function (a, b) { return a + b; }, 0),
                  detail: team.filter(function (player) {
                      return player.total;
                    }).concat(self.starters.filter(function (player) { return player.team != team.key && player.own; }))
                },
                assists: team.filter(function (player) { return player.assists; })
              };
            });

            if (self.teams.length === 1) {
              self.teams = [];
            }

            callbacks.forEach(function (callback) {
              callback(null, self);
            });
            return;
          });
        }
      };
    });
}
