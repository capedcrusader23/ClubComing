const express = require('express');
const hbs = require('hbs');
const mongoose = require('mongoose');
var bodyParser = require('body-parser');
var _ = require('lodash');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
var cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

var {Candidates} = require('./models/candidates');
var {Club} = require('./models/club');
var {authenticate} = require('./middleware/authenticate');
var {fetchClubInfo} = require('./middleware/fetchClubInfo');

mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost:27017/ClubComing', {useNewUrlParser: true, useCreateIndex: true})

var app = express();
app.set('view engine', 'hbs');
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());
app.use(express.static(__dirname+'/views'));
app.use(cookieParser());

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/signedout', (req, res) => {
  var token = req.cookies['x-auth'];
  Club.findByToken(token).then((club) => {
    if(!club) {
      return Promise.reject();
    }

    Club.findOneAndUpdate({
      '_id': club._id
    },
    {$pull: {
      tokens: {token}
    }}).then((club) => {
      return res.send(200);
    }).catch((e) => {
      console.log(`Error`);
      res.sendStatus(400);
    })
  })
});

app.post('/login', authenticate, (req, res) => {
    res.cookie('x-auth', req.token, { maxAge: 900000, httpOnly: true });
    res.render('dashboard', {
      clubName: req.user.name
    });
});

app.get('/dashboard', fetchClubInfo, (req, res) => {
  res.render('dashboard', {
    clubName: req.user.name
  });
});

app.get('/candidate/:clubname/:roll', fetchClubInfo, (req, res) => {
  var clubName = req.params.clubname;
  var roll = req.params.roll;
  var candidate;
  Candidates.findOne({
    club: clubName,
    rollNumber: roll
  }).then((cand) => {
    console.log(cand);
    res.render('candidateProfile', cand);
  });
});

app.post('/postcandidate', (req, res) => {
  var body = _.pick(req.body, ["name", "rollNumber"]);
  var clubName = req.body.clubName.toLowerCase().replace(/\s/g, "");
  body.clubName = clubName;

  var candidates = new Candidates(body);
  candidates.save().then((cand) => {
    res.send(cand);
  }).catch((e) => {
    res.sendStatus(400).send(e);
  });
});

app.get('/fetchcandidates', fetchClubInfo, (req, res) => {
  Candidates.find({
    club: req.query.name
  }).then((candidates) => {
    res.send(candidates)
  }).catch((e) => {
    res.send(`Sorry, our servers are having a problem`);
  });
});

app.post('/statusChange', fetchClubInfo, (req, res) => {
  //Query to update status Change
  Candidates.findOneAndUpdate({
    rollNumber: req.body.rollNumber,
    club: req.body.club
  },
  { $set: {candidateStatus: req.body.candidateStatus, interviewStatus: 'Interviewed'}},
  {new: true}).then((user) => {
    res.send(user);
  });
});

app.post('/scoreChange', fetchClubInfo, (req, res) => {
  console.log(req.body);
  Candidates.findOneAndUpdate({
    rollNumber: req.body.rollNumber,
    club: req.body.club
  },
  { $set: {rating: req.body.rating, comments: req.body.comments, interviewStatus: 'Interviewed'}},
  {new: true}).then((user) => {
    res.send(user);
  });
})

// LaTeX code by Kartikey
app.get('/api/getpdf/:club/:id', (req, res) => {
  var club = req.params.club;
  var id = req.params.id;
  var base_filename = path.join(__dirname, '/generated_pdfs', club+id)
  var pdf_filename = base_filename+'.pdf';
  fs.stat(pdf_filename, function(err, stat) {
    if(err == null) {
        console.log('File exists');
        res.sendFile(pdf_filename);
    } else if(err.code == 'ENOENT') {
        // file does not exist
        makepdf(club,id,res);
    } else {
        console.log('Some other error: ', err.code);
    }
  });
});

app.listen('3000', () => {
  console.log(`Up`);
});

//LaTex TEMPLATING
function makepdf(club, id, res){
  var ref = firebase.database().ref();
  var base_filename = path.join(__dirname, '/generated_pdfs', club+id)
  var pdf_filename = base_filename+'.pdf';
  ref.on("value", (snapshot, e)=>{
    var fs = require('fs');
    var json_obj = snapshot.val()[club][id];
    json_obj['rollno'] = id;
    fs.writeFile(base_filename+'.json', JSON.stringify(json_obj), function(err) {});
    var prc = spawn('python', ["makepdf.py", base_filename+'.json']);

    //noinspection JSUnresolvedFunction
    prc.stdout.setEncoding('utf8');
    prc.stdout.on('data', function (data) {
        var str = data.toString()
        var lines = str.split(/(\r?\n)/g);
        console.log(lines.join(""));
    });
    prc.stderr.setEncoding('utf8');
    prc.stderr.on('data', function (data) {
        var str = data.toString()
        var lines = str.split(/(\r?\n)/g);
        console.log(lines.join(""));
    });

    prc.on('close', function (code) {
        res.sendFile(pdf_filename);
        console.log('process exit code ' + code);
    });
  });
}
