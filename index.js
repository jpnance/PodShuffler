const fs = require('fs');
const crypto = require('crypto');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;

const ShuffleDatabase = require('./models/ShuffleDatabase');
const ShuffleDatabaseEpisode = require('./models/ShuffleDatabaseEpisode');

const getopts = require('getopts');

const RssParser = require('rss-parser');
const rssParser = new RssParser();

const commands = ['add'];

let cliOptions = getopts(process.argv.slice(2), { stopEarly: true });
let command = cliOptions._[0];

if (!command || !commands.includes(command)) {
	console.error('usage: podshuffler <command> [<options>]');
	console.error();
	console.error('Commands:');
	console.error('  add    Add a podcast feed to your database');

	process.exit(1);
}

if (command == 'add') {
	addCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}

function addCommand(cliOptions) {
	if (!verifyAddCommandOptions(cliOptions)) {
		console.error('usage: podshuffler add [options] <feed URL>');
		process.exit(1);
	}

	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	let newPodcast = {
		name: undefined,
		shortName: cliOptions['short-name'],
		feedUrl: cliOptions._[0],
		type: cliOptions['type'] || 'daily',

		episodes: []
	};

	refreshPodcast(newPodcast).then(function() {
		addPodcast(podcastDatabase, newPodcast);
		savePodcastDatabase(filename, podcastDatabase);

		newPodcast.episodes = newPodcast.episodes.length + ' episodes';
		console.log(newPodcast);

		process.exit();
	}).catch(function(error) {
		console.error(error);
		process.exit(1);
	});
}

function addPodcast(podcastDatabase, podcast) {
	let existingPodcastFeedUrl = podcastDatabase.find(function(existingPodcast) { return existingPodcast.feedUrl == podcast.feedUrl; });
	let existingPodcastShortName = podcastDatabase.find(function(existingPodcast) { return existingPodcast.shortName == podcast.shortName; });

	if (existingPodcastFeedUrl) {
		console.error('A podcast with that feed URL already exists.')
		process.exit(1);
	}

	if (existingPodcastShortName) {
		console.error('A podcast with that short name already exists.')
		process.exit(1);
	}

	podcastDatabase.push(podcast);
}

function loadPodcastDatabase(filename) {
	let podcastsFile;

	filename = filename || 'podcasts.json';

	try {
		fs.accessSync(filename, fs.constants.R_OK);
	} catch (error) {
		fs.writeFileSync(filename, JSON.stringify([]));
	}

	podcastsFile = fs.readFileSync(filename);

	return JSON.parse(podcastsFile);
}

function refreshPodcast(podcast) {
	return rssParser.parseURL(podcast.feedUrl).then(function(feed) {
		if (!podcast.shortName) {
			podcast.shortName = feed.title.replace(/ /g, '-').toLowerCase();
		}

		podcast.name = feed.title;

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
	});
}

function savePodcastDatabase(filename, podcastDatabase) {
	fs.writeFileSync(filename, JSON.stringify(podcastDatabase));
}

function verifyAddCommandOptions(cliOptions) {
	if (cliOptions._.length == 0) {
		console.error('No feed URL specified.');
		return false;
	}

	return true;
}

/*
let rssPromises = [];

podcasts.forEach(function(podcast) {
	if (!podcast.episodes) {
		podcast.episodes = [];
	}

	rssPromises.push();
});

Promise.all(rssPromises).then(function() {
	process.exit();

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
*/
