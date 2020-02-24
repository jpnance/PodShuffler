const fs = require('fs');

const ShuffleDatabase = require('./models/ShuffleDatabase');
const ShuffleDatabaseEpisode = require('./models/ShuffleDatabaseEpisode');

let iTunesSD = new ShuffleDatabase();

iTunesSD.addEpisode(new ShuffleDatabaseEpisode('lol/whathaveyou/aoeu.mp3', 'mp3'));
iTunesSD.addEpisode(new ShuffleDatabaseEpisode('and/then/howbout/a/nother.wav', 'wav'));
iTunesSD.addEpisode(new ShuffleDatabaseEpisode('okaybutthenjustonemore.aac', 'aac'));

fs.writeFileSync('iTunesSD', iTunesSD.toBinary(), { encoding: 'utf8' });
