const fs = require('fs');
const crypto = require('crypto');

const ShuffleDatabase = require('./models/ShuffleDatabase');
const ShuffleDatabaseEpisode = require('./models/ShuffleDatabaseEpisode');

const RssParser = require('rss-parser');
const rssParser = new RssParser();

let podcastsFile;

try {
	fs.accessSync('podcasts.json', fs.constants.R_OK);
} catch (error) {
	fs.writeFileSync('podcasts.json', JSON.stringify([]));
}

podcastsFile = fs.readFileSync('podcasts.json');

let podcasts = JSON.parse(podcastsFile);
let rssPromises = [];

podcasts.forEach(function(podcast) {
	if (!podcast.episodes) {
		podcast.episodes = [];
	}

	rssPromises.push(rssParser.parseURL(podcast.feedUrl).then(function(feed) {
		feed.items.forEach(function(item) {
			let existingEpisode = podcast.episodes.find(function(episode) {
				return episode.guid == item.guid;
			});

			if (!existingEpisode) {
				podcast.episodes.push({
					guid: item.guid,
					md5: crypto.createHash('md5').update(item.guid).digest('hex'),
					title: item.title,
					url: item.enclosure.url,
					playCount: 0,
					skipCount: 0,
					listened: false
				});
			}
		});
	}));
});

Promise.all(rssPromises).then(function() {
	fs.writeFileSync('podcasts.json', JSON.stringify(podcasts, null, "\t"));
});

/*
let iTunesSDFile;
let iTunesStatsFile;

try {
	fs.accessSync('iTunesSD', fs.constants.R_OK);
} catch (error) {
	fs.writeFileSync('iTunesSD');
}

iTunesSDFile = fs.readFileSync('iTunesSD');

try {
	fs.accessSync('iTunesStats', fs.constants.R_OK);
} catch (error) {
	fs.writeFileSync('iTunesStats');
}

iTunesStatsFile = fs.readFileSync('iTunesStats');

let shuffleDatabase = new ShuffleDatabase();

shuffleDatabase.addEpisode(new ShuffleDatabaseEpisode('lol/whathaveyou/aoeu.mp3', 'mp3'));
shuffleDatabase.addEpisode(new ShuffleDatabaseEpisode('and/then/howbout/a/nother.wav', 'wav'));
shuffleDatabase.addEpisode(new ShuffleDatabaseEpisode('okaybutthenjustonemore.aac', 'aac'));

fs.writeFileSync('iTunesSD', shuffleDatabase.toBinary(), { encoding: 'utf8' });
*/
