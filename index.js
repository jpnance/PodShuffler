const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;

const ShuffleDatabase = require('./models/ShuffleDatabase');
const ShuffleDatabaseEpisode = require('./models/ShuffleDatabaseEpisode');

const getopts = require('getopts');

const RssParser = require('rss-parser');
const rssParser = new RssParser();

const commands = ['add', 'diagnostic', 'help', 'list', 'mark', 'pull', 'push', 'refresh', 'stage'];

const GREEN_CHECKMARK = '\x1b[32m\u2713\x1b[0m';
const GREEN_PLUS = '\x1b[32m+\x1b[0m';

let cliOptions = getopts(process.argv.slice(2), { stopEarly: true });
let command = cliOptions._[0];

if (cliOptions['help']) {
	helpCommand(getopts(cliOptions._.slice(1)));
}
else if (cliOptions['version']) {
	console.log('podshuffler version 1');
	process.exit();
}
else if (!command) {
	helpCommand({}, 1);
	process.exit(1);
}
else if (!commands.includes(command)) {
	console.error('podshuffler: \'' + command + '\' is not a podshuffler command. Try `podshuffler help`.');
	process.exit(1);
}

if (command == 'add') {
	addCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'diagnostic') {
	diagnosticCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'help') {
	helpCommand(getopts(cliOptions._.slice(1)));
}
else if (command == 'list') {
	listCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'mark') {
	markCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'pull') {
	pullCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'push') {
	pushCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'refresh') {
	refreshCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'stage') {
	stageCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json', 'dry-run': false } }));
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

function diagnosticCommand(cliOptions) {
	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	Object.freeze(podcastDatabase);

	let existingEpisodeHashes = [];

	podcastDatabase.forEach(function(podcast) {
		podcast.episodes.forEach(function(episode) {
			let shortMd5 = episode.md5.substring(0, 8);

			if (existingEpisodeHashes.includes(shortMd5)) {
				console.error('oh wow collision bad');
				process.exit(1);
			}

			existingEpisodeHashes.push(shortMd5);
		});
	});

	console.log('hey seems fine');
	process.exit();
}

function helpCommand(cliOptions, exitCode) {
	if (!cliOptions || !cliOptions._ || cliOptions._.length == 0) {
		console.log('usage: podshuffler <command> [<options>]');
		console.log();
		console.log('Commands:');
		console.log('  add      Add a new podcast');
		console.log('  help     Show more information about a command');
		console.log('  list     Show high-level podcast information');
		console.log('  mark     Mark episodes as listened or unlistened');
		console.log('  pull     Fetch and merge play data from the iPod Shuffle');
		console.log('  push     Copy podcasts and control files to the iPod Shuffle');
		console.log('  refresh  Fetch new episode information');
		console.log('  stage    Select and download episodes');
	}

	process.exit(exitCode || 0);
}

function listCommand(cliOptions) {
	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	Object.freeze(podcastDatabase);

	podcastDatabase.forEach(function(podcast) {
		if (cliOptions['podcast'] && cliOptions['podcast'] != podcast.shortName) {
			return;
		}

		let knownEpisodes = podcast.episodes.length;
		let unlistenedEpisodes = podcast.episodes.filter(function(episode) { return !episode.listened; }).length;

		console.log(podcast.name, '(' + podcast.shortName + ')');
		console.log(podcast.feedUrl);
		console.log(knownEpisodes + ' known episodes, ' + unlistenedEpisodes + ' unlistened');
		console.log(podcast.type);
		console.log();

		if (cliOptions['podcast']) {
			let episodes = podcast.episodes;

			if (cliOptions['reverse']) {
				episodes.reverse();
			}

			podcast.episodes.forEach(function(episode) {
				let symbol = ' ';
				let shortMd5 = episode.md5.substring(0, 8);
				let date = new Date(episode.date).toDateString();
				let title = episode.title;

				if (episode.listened) {
					symbol = GREEN_CHECKMARK;
				}

				console.log(symbol, shortMd5, '', date, '', title);
			});
		}
	});

	process.exit();
}

function loadPodcastDatabase(filename) {
	let podcastsFile;

	filename = filename || 'podcasts.json';

	try {
		fs.accessSync(path.resolve(filename), fs.constants.R_OK);
	} catch (error) {
		fs.writeFileSync(path.resolve(filename), JSON.stringify([]));
	}

	podcastsFile = fs.readFileSync(path.resolve(filename));

	return JSON.parse(podcastsFile);
}

function markCommand(cliOptions) {
	if (!verifyMarkCommandOptions(cliOptions)) {
		console.error('usage: podshuffler mark [options]');
		process.exit(1);
	}

	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	podcastDatabase.forEach(function(podcast) {
		if (cliOptions['podcast'] && cliOptions['podcast'] != podcast.shortName) {
			return;
		}

		podcast.episodes.forEach(function(episode) {
				if (cliOptions['episode'] && !episode.md5.startsWith(cliOptions['episode'])) {
					return;
				}

				if (cliOptions['listened']) {
					episode.listened = true;
				}
				else if (cliOptions['unlistened']) {
					episode.listened = false;
				}

				if (cliOptions['unqueued']) {
					episode.queuedUp = false;
				}
				else if (cliOptions['queued']) {
					episode.queuedUp = true;
				}
		})
	});

	savePodcastDatabase(filename, podcastDatabase);

	process.exit(0);
}

function mergeShuffleDatabase(shuffleDatabase, podcastDatabase) {
	shuffleDatabase.episodes.forEach(function(shuffleEpisode) {
		let episodeRegexp = /\/(.*?)-([0123456789abcdef]{8})\.(...)/;
		let [filename, feedShortName, episodeShortMd5, episodeFileType] = shuffleEpisode.filename.match(episodeRegexp);

		podcastDatabase.forEach(function(podcast) {
			if (podcast.shortName != feedShortName) {
				return;
			}

			podcast.episodes.forEach(function(episode) {
				if (!episode.md5.startsWith(episodeShortMd5)) {
					return;
				}

				episode.bookmarkTime = shuffleEpisode.bookmarkTime;

				if (shuffleEpisode.playCount > 0) {
					episode.listened = true;
					episode.queuedUp = false;
				}
				else {
					episode.queuedUp = true;
				}
			});
		});
	});
}

function pullCommand(cliOptions) {
	if (!verifyPullCommandOptions(cliOptions)) {
		console.error('usage: podshuffler pull --source <ipod directory> [options]');
		process.exit(1);
	}

	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	let source = cliOptions['source'] || '.';

	let shuffleDatabaseFile = fs.readFileSync(path.resolve(source, 'iPod_Control/', 'iTunes/', 'iTunesSD'));
	let shuffleStatsFile = fs.readFileSync(path.resolve(source, 'iPod_Control/', 'iTunes/', 'iTunesStats'));
	let shufflePlayerStateFile = fs.readFileSync(path.resolve(source, 'iPod_Control/', 'iTunes/', 'iTunesPState'));

	let shuffleDatabase = new ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile);

	mergeShuffleDatabase(shuffleDatabase, podcastDatabase);
	savePodcastDatabase(filename, podcastDatabase);

	process.exit();
}

function pushCommand(cliOptions) {
	if (!verifyPushCommandOptions(cliOptions)) {
		console.error('usage: podshuffler push [options]');
		process.exit(1);
	}

	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	Object.freeze(podcastDatabase);

	let source = cliOptions['source'];
	let destination = cliOptions['destination'];

	if (cliOptions['dry-run']) {
		source = './sync';
		destination = './ipod';

		fs.mkdirSync(path.resolve(destination, 'iPod_Control'));
		fs.mkdirSync(path.resolve(destination, 'iPod_Control', 'iTunes'));
	}

	let shuffleDatabaseFile = fs.readFileSync(path.resolve(source, 'iTunesSD'));
	let shuffleStatsFile = fs.readFileSync(path.resolve(source, 'iTunesStats'));
	let shufflePlayerStateFile = fs.readFileSync(path.resolve(source, 'iTunesPState'));

	let shuffleDatabase = new ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile);

	let ipodFilenames = fs.readdirSync(path.resolve(destination));

	ipodFilenames.forEach(function(ipodFilename) {
		if (ipodFilename.endsWith('.mp3')) {
			if (!shuffleDatabase.episodes.find(function(episode) { return episode.filename == '/' + ipodFilename; })) {
				fs.unlinkSync(path.resolve(destination, ipodFilename));
				console.log(ipodFilename, 'no longer needed');
			}
		}
	});

	shuffleDatabase.episodes.forEach(function(episode) {
		if (ipodFilenames.includes(episode.filename.substring(1))) {
			return;
		}
		else {
			fs.copyFileSync(path.resolve(source, episode.filename.substring(1)), path.resolve(destination, episode.filename.substring(1)));
		}
	});

	fs.copyFileSync(path.resolve(source, 'iTunesSD'), path.resolve(destination, 'iPod_Control/iTunes/iTunesSD'));
	fs.copyFileSync(path.resolve(source, 'iTunesStats'), path.resolve(destination, 'iPod_Control/iTunes/iTunesStats'));
	fs.copyFileSync(path.resolve(source, 'iTunesPState'), path.resolve(destination, 'iPod_Control/iTunes/iTunesPState'));

	process.exit();
}

function refreshCommand(cliOptions) {
	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	let refreshPodcastPromises = [];

	podcastDatabase.forEach(function(podcast) {
		refreshPodcastPromises.push(refreshPodcast(podcast));
	});

	Promise.all(refreshPodcastPromises).then(function() {
		savePodcastDatabase(filename, podcastDatabase);
		process.exit();
	}).catch(function(error) {
		console.error(error);
		process.exit(1);
	});
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
					date: item.pubDate,
					title: item.title,
					url: item.enclosure.url,
					bookmarkTime: 0,
					listened: false,
					queuedUp: false
				});
			}
			else {
				existingEpisode.date = item.pubDate;
			}
		});

		podcast.episodes.sort(function(a, b) {
			let aDate = new Date(a.date);
			let bDate = new Date(b.date);

			return (aDate < bDate) ? 1 : ((aDate > bDate) ? -1 : 0);
		});
	});
}

function savePodcastDatabase(filename, podcastDatabase) {
	fs.writeFileSync(path.resolve(filename), JSON.stringify(podcastDatabase));
}

function stageCommand(cliOptions) {
	let filename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(filename);

	let downloadPromises = [];
	let shuffleDatabase = new ShuffleDatabase();

	podcastDatabase.forEach(function(podcast) {
		let protocol;
		let episode;
		let queuedUpEpisode;

		queuedUpEpisode = podcast.episodes.find(function(episode) { return episode.queuedUp; });

		if (queuedUpEpisode) {
			episode = queuedUpEpisode;
		}
		else {
			if (podcast.type == 'daily') {
				episode = podcast.episodes[0];

				if (episode.listened) {
					return;
				}
			}
			else if (podcast.type == 'serial') {
				for (let i = podcast.episodes.length - 1; i >= 0; i--) {
					if (!podcast.episodes[i].listened) {
						episode = podcast.episodes[i];
						break;
					}
				}
			}
			else if (podcast.type == 'randomizable') {
				let unlistenedEpisodes = podcast.episodes.filter(function(element) { return !element.listened; });

				episode = unlistenedEpisodes[Math.floor(Math.random() * unlistenedEpisodes.length)];
			}
			else if (podcast.type == 'evergreen') {
				episode = podcast.episodes[Math.floor(Math.random() * podcast.episodes.length)];
			}
		}

		if (!episode) {
			return;
		}

		let episodeFilename = podcast.shortName + '-' + episode.md5.substring(0, 8) + '.mp3';

		if (episode.url.startsWith('https')) {
			protocol = https;
		}
		else {
			protocol = http;
		}

		downloadPromises.push(new Promise(function(resolve, reject) {
			let resolutionData = { podcast: podcast, episode: episode };

			if (cliOptions['dry-run']) {
				resolve(resolutionData);
				return;
			}

			try {
				fs.accessSync(path.resolve('./sync/', episodeFilename));
				resolve(resolutionData);
				return;
			} catch (error) { }

			let episodeFile = fs.createWriteStream('./sync/' + episodeFilename);

			protocol.get(episode.url, function(response) {
				response.on('data', function(data) {
					episodeFile.write(data);
				}).on('end', function() {
					episodeFile.end();

					resolve(resolutionData);
				});
			});
		}).then(function(fulfilledData) {
			let { podcast, episode } = fulfilledData;

			shuffleDatabase.addEpisode(new ShuffleDatabaseEpisode('/' + episodeFilename, episode.bookmarkTime || 0xffffff, podcast.type));
			console.log(GREEN_PLUS + ' ' + episode.md5.substring(0, 8) + '  ' + (new Date(episode.date)).toDateString() + '  ' + podcast.name + ': ' + episode.title);
		}));
	});

	Promise.all(downloadPromises).then(function() {
		if (cliOptions['dry-run']) {
			process.exit();
		}

		let iTunesSDFile;
		let iTunesStatsFile;

		try {
			fs.accessSync(path.resolve('./sync/', 'iTunesSD'), fs.constants.R_OK);
		} catch (error) {
			fs.writeFileSync(path.resolve('./sync/', 'iTunesSD'));
		}

		iTunesSDFile = fs.readFileSync(path.resolve('./sync/', 'iTunesSD'));

		try {
			fs.accessSync(path.resolve('./sync/', 'iTunesStats'), fs.constants.R_OK);
		} catch (error) {
			fs.writeFileSync(path.resolve('./sync/', 'iTunesStats'));
		}

		iTunesStatsFile = fs.readFileSync(path.resolve('./sync/', 'iTunesStats'));

		fs.writeFileSync(path.resolve('./sync/', 'iTunesSD'), shuffleDatabase.toItunesSd(), { encoding: 'utf8' });
		fs.writeFileSync(path.resolve('./sync/', 'iTunesStats'), shuffleDatabase.toItunesStats(), { encoding: 'utf8' });
		fs.writeFileSync(path.resolve('./sync/', 'iTunesPState'), shuffleDatabase.toItunesPState(), { encoding: 'utf8' });

		savePodcastDatabase(filename, podcastDatabase);

		process.exit();
	});
}

function verifyAddCommandOptions(cliOptions) {
	if (cliOptions._.length == 0) {
		console.error('No feed URL specified.');
		return false;
	}

	return true;
}

function verifyMarkCommandOptions(cliOptions) {
	if (!cliOptions['podcast'] && !cliOptions['episode'] && !cliOptions['all']) {
		console.error('Either specify a specific podcast or episode using --podcast or --episode or use --all to mark everything.');
		return false;
	}

	if (!cliOptions['listened'] && !cliOptions['unlistened'] && !cliOptions['queued'] && !cliOptions['unqueued']) {
		console.error('You must specify at least one of --listened, --unlistened, --queued, and --unqueued.');
		return false;
	}

	return true;
}

function verifyPullCommandOptions(cliOptions) {
	if (!cliOptions['source']) {
		console.error('You must specify --source, which is the root-level directory of your iPod Shuffle.');
		console.error('--source will likely be something like "/media/jpnance/PODOLITH2".');

		return false;
	}

	return true;
}

function verifyPushCommandOptions(cliOptions) {
	if (cliOptions['dry-run'] && (!cliOptions['source'] || !cliOptions['destination'])) {
		console.error('Just a heads up that this isn\'t really a "dry" run. Files will be copied from --source to --destination. If you still want to do this use:');
		console.error('podshuffler push --source=./sync --destination=./ipod --dry-run');
		return false;
	}

	if (!cliOptions['source'] || !cliOptions['destination']) {
		console.error('Both a --source and a --destination must be specified.');
		console.error('--source will likely be something like "./sync".');
		console.error('--destination will likely be something like "/media/jpnance/PODOLITH\ II".');

		return false;
	}

	return true;
}
