var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var request = require('request');
//var routes = require('./routes/index');

var util = require('./lib/utility');
var app = express();

//app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

var id = undefined;
var routes = {};
var resettime = undefined;
var lastpingtime = undefined;
var lasterrcount = 0;

var host = process.env.HOST;
var port = process.env.PORT;
var extport = process.env.EXTPORT; // don't use the randomly allocated port in heroku, use the externally exposed port (80 or 443)
app.set('host', host);
app.set('port', port);

console.log("HOST=" + process.env.HOST);
console.log("PORT=" + process.env.PORT);
console.log("EXTPORT=" + process.env.EXTPORT);
console.log("SPNAME=" + process.env.SPNAME);
console.log("RCHOST=" + process.env.RCHOST);
console.log("RCPORT=" + process.env.RCPORT);
console.log("MAXFAILEDPINGTORESET=" + process.env.MAXFAILEDPINGTORESET);

var maxFailedPingToReset = process.env.MAXFAILEDPINGTORESET;

var connectTest = function() {
  if (!id) {
    console.log('Connecting to http://' + process.env.RCHOST + ':' + process.env.RCPORT + '/ ...');
    request({
      method: 'POST',
      uri: 'http://' + process.env.RCHOST + ':' + process.env.RCPORT + '/providers',
      json: true,
      body: {
        name: process.env.SPNAME,
        uri: 'http://' + host + ':' + extport + "/"
      }
    }, function (err, res, body) {
      if (!err && res.statusCode == 200) {
        id = res.body.id;
        lastpingtime = new Date();
        lasterrcount = 0;
        console.log("Connected as ID " + id);
      } else {
        if (err) {
          console.log("Connection Failed: Err " + err.number);
        } else {
          console.log("Connection Failed: HTTP " + res.statusCode);
        }
      }
      setTimeout(connectTest, 1000);
    });
  } else {
    request({
      method: 'PUT',
      uri: 'http://' + process.env.RCHOST + ':' + process.env.RCPORT + '/providers/' + id + '/ping'
    }, function (err, res, body) {
      if (!err && res.statusCode == 200) {
        lastpingtime = new Date();
        lasterrcount = 0;
      } else {
        lasterrcount++;
        console.log("Ping error #" + lasterrcount);

        if (lasterrcount > maxFailedPingToReset) {
          id = undefined;
        }
      }
      setTimeout(connectTest, 1000);
    });
  }
};

setTimeout(connectTest, 1000);

app.route('/').get(function(req, res, next) {
  res.send({
    "id": id,
    "resettime": resettime,
    "lastpingtime": lastpingtime,
    "lasterrcount": lasterrcount
  });
});

app.route('/add/:num').post(function(req, res, next) {
  var newroutes = util.queueList(req.params.num, id, routes);
  console.log("Adding routes: " + Object.keys(newroutes).join(","));
  res.send(newroutes);
  for (var r in newroutes) {
    routes[r] = newroutes[r];
  }
  console.log("New route list: " + Object.keys(routes).join(","));
});

app.route('/reset').post(function(req, res, next) {
  console.log("Reset route list");
  routes = util.queueList(req.query.n, id, null);
  resettime = new Date();
  res.send(routes);
});

app.route('/routes').get(function(req, res, next) {
  res.send(routes);
});

app.route('/routes/:id').get(function(req, res, next) {
  res.send(routes[req.params.id.toUpperCase()]);
});

app.route('/try/:route').put(function(req, res, next) {
  var route = routes[req.params.route.toUpperCase()];
  if (!route.reservationId) {
    route.reservationId = req.body.id;
    route.reservationConfirmed = false;
    console.log("[TRY] Reservation " + req.body.id + ", Route " + req.params.route.toUpperCase() + ": Success");
  } else {
    res.statusCode = 409;
  }
  res.send({
    id: req.body.id,
    route: req.params.route.toUpperCase()
  });
});

app.route('/cancel/:route').put(function(req, res, next) {
  var route = routes[req.params.route.toUpperCase()];
  if (route.reservationId && route.reservationConfirmed) {
    if (route.reservationId == req.body.id) {
      delete route.reservationId;
      delete route.reservationConfirmed;
      console.log("[CANCEL] Reservation " + req.body.id + ", Route " + req.params.route.toUpperCase() + ": Success");
    } else {
      res.statusCode = 409;
    }
  } else {
    res.statusCode = 409;
  }
  res.send({
    id: req.body.id,
    route: req.params.route.toUpperCase()
  });
});

app.route('/confirm/:route').put(function(req, res, next) {
  var route = routes[req.params.route.toUpperCase()];
  if (route.reservationId == req.body.id) {
    route.reservationConfirmed = true;
    console.log("[CONFIRM] Reservation " + req.body.id + ", Route " + req.params.route.toUpperCase() + ": Success");
  } else {
    res.statusCode = 409;
  }
  res.send({
    id: req.body.id,
    route: req.params.route.toUpperCase()
  });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send({"error": {
    message: err.message,
    error: err
  }});
});

module.exports = app;