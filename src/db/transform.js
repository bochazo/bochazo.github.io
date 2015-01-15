var _ = require('very-array');

module.exports = transform;

function transform(results) {
  return results
    .reduce(function (x, y) { return x.concat(y); }, [])
    .map(function (match) {
      return {
        id: match.id,
        name: match.name,
        fetch: function (cb) {
          var self = this;

          if (self.list) {
            cb(null, self.list);
            return;
          }

          match.fetch(function (err, data) {
            var teams;

            if (err) {
              cb(err);
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
                      return player.goal + player.headed + player.freeKick + player.penalty - player.own;
                    }).reduce(function (a, b) { return a + b; }),
                  detail: team.filter(function (player) {
                      return player.goal || player.headed || player.freeKick || player.penalty || player.own;
                    })
                },
                assists: team.filter(function (player) { return player.assists; })
              };
            });

            if (self.teams.length === 1) {
              self.teams = [];
            }

            cb(null, self.list);
          });
        }
      };
    });
}
