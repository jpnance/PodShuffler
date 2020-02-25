const fs = require('fs');
const crypto = require('crypto');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;

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
	let downloadPromises = [];
	let shuffleDatabase = new ShuffleDatabase();

	podcasts.forEach(function(podcast) {
		let protocol;
		let episode;

		if (podcast.type == 'daily') {
			episode = podcast.episodes[0];
		}
		else if (podcast.type == 'randomizable') {
			episode = podcast.episodes[Math.floor(Math.random() * podcast.episodes.length)];
		}

		let episodeFile = fs.createWriteStream('./sync/' + episode.md5.substring(0, 8) + '.mp3');

		if (episode.url.startsWith('https')) {
			protocol = https;
		}
		else {
			protocol = http;
		}

		downloadPromises.push(new Promise(function(resolve, reject) {
			protocol.get(episode.url, function(response) {
				response.on('data', function(data) {
					episodeFile.write(data);
				}).on('end', function() {
					episodeFile.end();
					resolve();
				});
			});
		}));

		shuffleDatabase.addEpisode(new ShuffleDatabaseEpisode('/' + episode.md5.substring(0, 8) + '.mp3', 'mp3'));
	});

	//fs.writeFileSync('podcasts.json', JSON.stringify(podcasts, null, "\t"));
	//fs.writeFileSync('podcasts.json', JSON.stringify(podcasts));

	Promise.all(downloadPromises).then(function() {
		let iTunesSDFile;
		let iTunesStatsFile;

		try {
			fs.accessSync('./sync/iTunesSD', fs.constants.R_OK);
		} catch (error) {
			fs.writeFileSync('./sync/iTunesSD');
		}

		iTunesSDFile = fs.readFileSync('./sync/iTunesSD');

		try {
			fs.accessSync('./sync/iTunesStats', fs.constants.R_OK);
		} catch (error) {
			fs.writeFileSync('./sync/iTunesStats');
		}

		iTunesStatsFile = fs.readFileSync('./sync/iTunesStats');

		fs.writeFileSync('./sync/iTunesSD', shuffleDatabase.toItunesSd(), { encoding: 'utf8' });
		fs.writeFileSync('./sync/iTunesStats', shuffleDatabase.toItunesStats(), { encoding: 'utf8' });
	});
});
