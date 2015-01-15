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
            if (err) {
              cb(err);
              return;
            }

            self.players = data.map(function (player) {
              return {
                name: player.jugador,
                assists: +player.asistencias,
                goal: +player.jugada,
                headed: +player.cabeza,
                own: +player.encontra,
                freeKick: +player.tirolibre,
                penalty: +player.penal,
                team: player.equipo
              };
            });

            cb(null, self.list);
          });
        }
      };
    });
}
