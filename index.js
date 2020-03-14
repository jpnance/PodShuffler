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

const commands = ['add', 'backfill', 'clean', 'diagnostic', 'edit', 'help', 'list', 'mark', 'pull', 'push', 'refresh', 'remove', 'stage'];

const GREEN_CHECKMARK = '\x1b[32m\u2713\x1b[0m';
const GREEN_PLUS = '\x1b[32m+\x1b[0m';
const RED_DASH = '\x1b[31m-\x1b[0m';

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
	addCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json', 'dry-run': false, 'playlist-priority': 0, 'episode-order': 'newest-first' } }));
}
else if (command == 'backfill') {
	backfillCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'clean') {
	cleanCommand(getopts(cliOptions._.slice(1)));
}
else if (command == 'diagnostic') {
	diagnosticCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'edit') {
	editCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
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
else if (command == 'remove') {
	removeCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json' } }));
}
else if (command == 'stage') {
	stageCommand(getopts(cliOptions._.slice(1), { default: { db: 'podcasts.json', 'dry-run': false } }));
}

function addCommand(cliOptions) {
	if (!verifyAddCommandOptions(cliOptions)) {
		console.error('usage: podshuffler add [options] <feed URL>');
		process.exit(1);
	}

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	let newPodcast = {
		name: undefined,
		shortName: cliOptions['short-name'],
		feedUrl: cliOptions._[0],
		playlistPriority: cliOptions['playlist-priority'],
		episodeOrder: cliOptions['episode-order'],

		episodes: []
	};

	refreshPodcast(newPodcast).then(function() {
		addPodcast(podcastDatabase, newPodcast);

		if (!cliOptions['dry-run']) {
			savePodcastDatabase(dbFilename, podcastDatabase);
		}

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

function backfillCommand(cliOptions) {
	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	podcastDatabase.forEach(function(podcast) {
		if (podcast.type == 'daily') {
			podcast.playlistPriority = 1;
			podcast.episodeOrder = 'newest-only';
		}
		else if (podcast.type == 'timely') {
			podcast.playlistPriority = 2;
			podcast.episodeOrder = 'oldest-first';
		}
		else if (podcast.type == 'serial') {
			podcast.playlistPriority = 3;
			podcast.episodeOrder = 'oldest-first';
		}
		else if (podcast.type == 'randomizable') {
			podcast.playlistPriority = 3;
			podcast.episodeOrder = 'random';
		}
		else if (podcast.type == 'evergreen') {
			podcast.playlistPriority = 4;
			podcast.episodeOrder = 'random';
		}

		delete podcast.type;
	});

	savePodcastDatabase(dbFilename, podcastDatabase);

	process.exit();
}

function cleanCommand(cliOptions) {
	if (!verifyCleanCommandOptions(cliOptions)) {
		console.error('usage: podshuffler clean [options]');
		process.exit(1);
	}

	let source = cliOptions['source'];

	let shuffleDatabaseFile = fs.readFileSync(path.resolve(source, 'iTunesSD'));
	let shuffleStatsFile = fs.readFileSync(path.resolve(source, 'iTunesStats'));
	let shufflePlayerStateFile = fs.readFileSync(path.resolve(source, 'iTunesPState'));

	let shuffleDatabase = new ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile);

	let stagedFilenames = fs.readdirSync(path.resolve(source));

	let savedSpace = 0;

	stagedFilenames.forEach(function(stagedFilename) {
		if (!stagedFilename.endsWith('.mp3')) {
			return;
		}

		let requiredEpisode = shuffleDatabase.episodes.find(function(episode) { return episode.filename == '/' + stagedFilename; });

		if (!requiredEpisode) {
			let fileStats = fs.statSync(path.resolve(source, stagedFilename));
			let fileSize = Math.round(fileStats.size / (1024 * 1024));

			console.log(RED_DASH, stagedFilename, '(' + fileSize + 'M)');
			savedSpace += fileSize;

			if (!cliOptions['dry-run']) {
				fs.unlinkSync(path.resolve(source, stagedFilename));
			}
		}
	});

	console.log('Total cleanuppable disk space:', savedSpace + 'M');

	process.exit();
};

function diagnosticCommand(cliOptions) {
	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

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

function editCommand(cliOptions) {
	if (!verifyEditCommandOptions(cliOptions)) {
		console.error('usage: podshuffler edit [options] <podcast short name>');
		process.exit(1);
	}

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	podcastDatabase.forEach(function(podcast) {
		if (podcast.shortName != cliOptions._[0]) {
			return;
		}

		if (cliOptions['feed-url']) {
			podcast.feedUrl = cliOptions['feed-url'];
		}

		if (cliOptions['playlist-priority']) {
			podcast.playlistPriority = cliOptions['playlist-priority'];
		}

		if (cliOptions['episode-order']) {
			podcast.episodeOrder = cliOptions['episode-order'];
		}
	});

	savePodcastDatabase(dbFilename, podcastDatabase);

	process.exit();
}

function helpCommand(cliOptions, exitCode) {
	if (!cliOptions || !cliOptions._ || cliOptions._.length == 0) {
		console.log('usage: podshuffler <command> [<options>]');
		console.log();
		console.log('Commands:');
		console.log('  add      Add a new podcast');
		console.log('  clean    Remove unneeded podcast files from the staging area');
		console.log('  edit     Modify the settings of an existing podcast');
		console.log('  help     Show more information about a command');
		console.log('  list     Show high-level podcast information');
		console.log('  mark     Mark episodes as listened or unlistened');
		console.log('  pull     Fetch and merge play data from the iPod Shuffle');
		console.log('  push     Copy podcasts and control files to the iPod Shuffle');
		console.log('  refresh  Fetch new episode information');
		console.log('  remove   Remove an existing podcast');
		console.log('  stage    Select and download episodes');
	}
	else if (cliOptions._[0] == 'add') {
		//           80 characters looks like this
		//           --------------------------------------------------------------------------------
		console.log('podshuffler add [--db <filename>] [--short-name <short name>]');
		console.log('                [--playlist-priority <number>]');
		console.log('                [--episode-order <episode order>] [--dry-run] <feed URL>');
		console.log();
		console.log('This command adds a new podcast to your database. The only required field is a');
		console.log('URL to that podcast\'s RSS feed, starting with either "http://" or "https://".');
		console.log();
		console.log('--db <filename>');
		console.log('    Use a specific file to keep track of all of your podcast data. If not');
		console.log('    specified, the default will be podcasts.json in the current directory.');
		console.log();
		console.log('--short-name <short name>');
		console.log('    A short name that will be used both for filenames and so you can more');
		console.log('    quickly refer to this podcast from the command line. It\'s recommended that');
		console.log('    you use only lowercase letters and dashes (instead of spaces), for example:');
		console.log('    "lowe-post", "off-the-hook". If not specified, the default will be set to');
		console.log('    a lowercase version of the feed URL\'s <title> tag, with spaces converted to');
		console.log('    dashes. For example, "This Week in Chiptune" becomes');
		console.log('    "this-week-in-chiptune".');
		console.log();
		console.log('--playlist-priority <number>');
		console.log('    A number dictating where in your playlist this podcast\'s episode should');
		console.log('    appear. Lower numbers will correspond to higher priorities, meaning those');
		console.log('    episodes will show up first. You can use any number here including integers');
		console.log('    and floats. If not specified, the default priority will be 0. As such, it\'s');
		console.log('    not recommended to specify a priority of 0 or lower but those values should');
		console.log('    still function as expected.');
		console.log();
		console.log('--episode-order <episode order>');
		console.log('    A string representing the order in which you\'d like to listen through the');
		console.log('    the episodes of this podcast. This can be either "newest-only",');
		console.log('    "newest-first", "oldest-first", or "random". If not specified, the default');
		console.log('    episode order will be "newest-first".');
		console.log('        * "newest-only" means that only the most recent episode is eligible for');
		console.log('           selection, even if there are other unlistened episodes. This is good');
		console.log('           for podcasts that you consider to be timely and don\'t mind missing');
		console.log('           an episode of: headlines, song of the day, etc.');
		console.log('        * "newest-first" means that the most recent unlistened episode will be');
		console.log('          selected. This is good for podcasts that you consider to be timely');
		console.log('          but still want to listen to every episode of: sports, tech news, etc.');
		console.log('        * "oldest-first" means that the least recent unlistened episode will be');
		console.log('          selected. This is good for podcasts that you want to listen to in');
		console.log('          chronological order: history, serials, etc.');
		console.log('        * "random" means that a random unlistened episode will be selected. This');
		console.log('          is good for podcasts that you don\'t consider to be either timely or');
		console.log('          serialized: music, etc.');
		console.log();
		console.log('--dry-run');
		console.log('    This will execute the add command as specified but not save anything to');
		console.log('    your database.');
	}

	process.exit(exitCode || 0);
}

function listCommand(cliOptions) {
	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

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
		console.log('Playlist priority:', podcast.playlistPriority);
		console.log('Episode order:', podcast.episodeOrder);
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

function loadPodcastDatabase(dbFilename) {
	let podcastsFile;

	dbFilename = dbFilename || 'podcasts.json';

	try {
		fs.accessSync(path.resolve(dbFilename), fs.constants.R_OK);
	} catch (error) {
		fs.writeFileSync(path.resolve(dbFilename), JSON.stringify([]));
	}

	podcastsFile = fs.readFileSync(path.resolve(dbFilename));

	return JSON.parse(podcastsFile);
}

function markCommand(cliOptions) {
	if (!verifyMarkCommandOptions(cliOptions)) {
		console.error('usage: podshuffler mark [options]');
		process.exit(1);
	}

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

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

	savePodcastDatabase(dbFilename, podcastDatabase);

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

				// if we haven't listened to more than 65.536 seconds of a podcast, let's just say we haven't listened to any of it
				episode.bookmarkTime = (shuffleEpisode.bookmarkTime > 0x100) ? shuffleEpisode.bookmarkTime : 0xffffff;

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

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	let source = cliOptions['source'] || '.';

	let shuffleDatabaseFile = fs.readFileSync(path.resolve(source, 'iPod_Control/', 'iTunes/', 'iTunesSD'));
	let shuffleStatsFile = fs.readFileSync(path.resolve(source, 'iPod_Control/', 'iTunes/', 'iTunesStats'));
	let shufflePlayerStateFile = fs.readFileSync(path.resolve(source, 'iPod_Control/', 'iTunes/', 'iTunesPState'));

	let shuffleDatabase = new ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile);

	mergeShuffleDatabase(shuffleDatabase, podcastDatabase);
	savePodcastDatabase(dbFilename, podcastDatabase);

	process.exit();
}

function pushCommand(cliOptions) {
	if (!verifyPushCommandOptions(cliOptions)) {
		console.error('usage: podshuffler push [options]');
		process.exit(1);
	}

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

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
	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	let refreshPodcastPromises = [];

	podcastDatabase.forEach(function(podcast) {
		refreshPodcastPromises.push(refreshPodcast(podcast));
	});

	Promise.all(refreshPodcastPromises).then(function() {
		if (!cliOptions['dry-run']) {
			savePodcastDatabase(dbFilename, podcastDatabase);
		}

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
				let newEpisode = {
					guid: item.guid,
					md5: crypto.createHash('md5').update(item.guid).digest('hex'),
					date: item.pubDate,
					title: item.title,
					url: item.enclosure.url,
					bookmarkTime: 0,
					listened: false,
					queuedUp: false
				};

				podcast.episodes.push(newEpisode);

				console.log(GREEN_PLUS + ' ' + newEpisode.md5.substring(0, 8) + '  ' + (new Date(newEpisode.date)).toDateString() + '  ' + podcast.name + ': ' + newEpisode.title);
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

function removeCommand(cliOptions) {
	if (!verifyRemoveCommandOptions(cliOptions)) {
		console.error('usage: podshuffler remove [options] <podcast short name>');
		process.exit(1);
	}

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);
	let newPodcastDatabase = [];

	Object.freeze(podcastDatabase);

	podcastDatabase.forEach(function(podcast) {
		if (podcast.shortName != cliOptions._[0]) {
			newPodcastDatabase.push(podcast);
		}
	});

	savePodcastDatabase(dbFilename, newPodcastDatabase);

	process.exit(0);
}

function savePodcastDatabase(dbFilename, podcastDatabase) {
	fs.writeFileSync(path.resolve(dbFilename), JSON.stringify(podcastDatabase));
}

function stageCommand(cliOptions) {
	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

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
			if (podcast.episodeOrder == 'newest-only') {
				episode = podcast.episodes[0];

				if (episode.listened) {
					return;
				}
			}
			else if (podcast.episodeOrder == 'newest-first') {
				for (let i = 0; i < podcast.episodes.length; i++) {
					if (!podcast.episodes[i].listened) {
						episode = podcast.episodes[i];
						break;
					}
				}
			}
			else if (podcast.episodeOrder == 'oldest-first') {
				for (let i = podcast.episodes.length - 1; i >= 0; i--) {
					if (!podcast.episodes[i].listened) {
						episode = podcast.episodes[i];
						break;
					}
				}
			}
			else if (podcast.episodeOrder == 'random') {
				let unlistenedEpisodes = podcast.episodes.filter(function(element) { return !element.listened; });

				episode = unlistenedEpisodes[Math.floor(Math.random() * unlistenedEpisodes.length)];
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

			shuffleDatabase.addEpisode(new ShuffleDatabaseEpisode('/' + episodeFilename, episode.bookmarkTime || 0xffffff, (episode.bookmarkTime != undefined && episode.bookmarkTime != 0 && episode.bookmarkTime != 0xffffff) ? 1.5 : podcast.playlistPriority));
			console.log(GREEN_PLUS + ' ' + episode.md5.substring(0, 8) + '  ' + (new Date(episode.date)).toDateString() + '  ' + podcast.name + ': ' + episode.title);
		}));
	});

	Promise.all(downloadPromises).then(function() {
		shuffleDatabase.sortEpisodes();

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

		savePodcastDatabase(dbFilename, podcastDatabase);

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

function verifyCleanCommandOptions(cliOptions) {
	if (!cliOptions['source']) {
		console.error('You must specify --source, which is the directory in which you stage pushes.');
		console.error('--source will likely be something like "./sync".');
		return false;
	}

	return true;
}

function verifyEditCommandOptions(cliOptions) {
	if (cliOptions._.length == 0) {
		console.error('No podcast short name specified.');
		return false;
	}

	if (!cliOptions['feed-url'] && !cliOptions['playlist-priority'] && !cliOptions['episode-order']) {
		console.error('You must specify at least one of --feed-url, --playlist-priority, or --episode-order.');
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

function verifyRemoveCommandOptions(cliOptions) {
	if (cliOptions._.length == 0) {
		console.error('No podcast short name specified.');
		return false;
	}

	return true;
}
