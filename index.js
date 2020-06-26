#!/usr/bin/env node

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

const commands = ['add', 'backfill', 'clean', 'diagnostic', 'edit', 'help', 'init', 'list', 'mark', 'pull', 'push', 'refresh', 'remove', 'stage'];

const GREEN_CHECKMARK = '\x1b[32m\u2713\x1b[0m';
const GREEN_PLUS = '\x1b[32m+\x1b[0m';
const RED_DASH = '\x1b[31m-\x1b[0m';

const DEFAULTS = {
	dbFilename: path.resolve(process.env.HOME, '.local/share/podshuffler/podcasts.json'),
	stagePath: path.resolve(process.env.HOME, '.cache/podshuffler')
}

let cliOptions = getopts(process.argv.slice(2), { stopEarly: true });
let command = cliOptions._[0];

if (cliOptions['help']) {
	if (cliOptions['help'] !== true) {
		helpCommand({ _: [ cliOptions['help'] ] });
	}
	else {
		helpCommand(getopts(cliOptions._.slice(1)));
	}
}
else if (cliOptions._.includes('--help')) {
	helpCommand({ _: [ command ] });
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
else if (command == 'add') {
	addCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename, 'dry-run': false, 'playlist-priority': 0, 'episode-order': 'newest-first' } }));
}
else if (command == 'backfill') {
	backfillCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'clean') {
	cleanCommand(getopts(cliOptions._.slice(1), { default: { stage: DEFAULTS.stagePath } }));
}
else if (command == 'diagnostic') {
	diagnosticCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'edit') {
	editCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'help') {
	helpCommand(getopts(cliOptions._.slice(1)));
}
else if (command == 'init') {
	initCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename, stage: DEFAULTS.stagePath } }));
}
else if (command == 'list') {
	listCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'mark') {
	markCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'pull') {
	pullCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'push') {
	pushCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename, stage: DEFAULTS.stagePath } }));
}
else if (command == 'refresh') {
	refreshCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'remove') {
	removeCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename } }));
}
else if (command == 'stage') {
	stageCommand(getopts(cliOptions._.slice(1), { default: { db: DEFAULTS.dbFilename, 'dry-run': false, stage: DEFAULTS.stagePath } }));
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
	let stage = cliOptions['stage'];

	let shuffleDatabaseFile = fs.readFileSync(path.resolve(stage, 'iTunesSD'));
	let shuffleStatsFile = fs.readFileSync(path.resolve(stage, 'iTunesStats'));
	let shufflePlayerStateFile = fs.readFileSync(path.resolve(stage, 'iTunesPState'));

	let shuffleDatabase = new ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile);

	let stagedFilenames = fs.readdirSync(path.resolve(stage));

	let savedSpace = 0;

	stagedFilenames.forEach(function(stagedFilename) {
		if (!stagedFilename.endsWith('.mp3')) {
			return;
		}

		let requiredEpisode = shuffleDatabase.episodes.find(function(episode) { return episode.filename == '/' + stagedFilename; });

		if (!requiredEpisode) {
			let fileStats = fs.statSync(path.resolve(stage, stagedFilename));
			let fileSize = Math.round(fileStats.size / (1024 * 1024));

			console.log(RED_DASH, stagedFilename, '(' + fileSize + 'M)');
			savedSpace += fileSize;

			if (!cliOptions['dry-run']) {
				fs.unlinkSync(path.resolve(stage, stagedFilename));
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

function formatDuration(duration) {
	if (!duration) {
		return '??:??';
	}

	let hours = Math.floor(duration / 3600);
	let minutes = Math.floor((duration - (3600 * hours)) / 60);
	let seconds = duration % 60;

	let formattedDuration = '';

	if (hours > 0) {
		formattedDuration += hours + ':';

		if (minutes < 10) {
			formattedDuration += '0';
		}
	}

	formattedDuration += minutes + ':';

	if (seconds < 10) {
		formattedDuration += '0';
	}

	formattedDuration += seconds;

	return formattedDuration;
};

function helpCommand(cliOptions) {
	const spawn = require('child_process').spawn;

	if (!cliOptions || !cliOptions._ || cliOptions._.length == 0) {
		console.log('usage: podshuffler <command> [<options>]');
		console.log();
		console.log('Commands:');
		console.log('  add      Add a new podcast');
		console.log('  clean    Remove unneeded podcast files from the staging area');
		console.log('  edit     Modify the settings of an existing podcast');
		console.log('  help     Show more information about a command');
		console.log('  init     Initialize your podcast database');
		console.log('  list     Show high-level podcast information');
		console.log('  mark     Mark episodes as listened or unlistened');
		console.log('  pull     Fetch and merge play data from the iPod Shuffle');
		console.log('  push     Copy podcasts and control files to the iPod Shuffle');
		console.log('  refresh  Fetch new episode information');
		console.log('  remove   Remove an existing podcast');
		console.log('  stage    Select and download episodes');
	}
	else if (commands.includes(cliOptions._[0])) {
		spawn('man', [ path.resolve(process.env._, '../../lib/node_modules/podshuffler/doc/man/podshuffler-' + cliOptions._[0] + '.1') ], { stdio: 'inherit' });
	}
	else {
		console.error('podshuffler: \'' + cliOptions._[0] + '\' is not a podshuffler command. Try `podshuffler help`.');
	}
}

function initCommand() {
	let dbPath = path.resolve(process.env.HOME, '.local/share/podshuffler');
	let dbFilename = path.resolve(dbPath, 'podcasts.json');

	let stagePath = path.resolve(process.env.HOME, '.cache/podshuffler');

	try {
		fs.accessSync(dbPath, fs.constants.R_OK);
	} catch (error) {
		fs.mkdirSync(dbPath, 0o700);
	}

	try {
		fs.accessSync(dbFilename, fs.constants.R_OK);
	} catch (error) {
		fs.writeFileSync(dbFilename, JSON.stringify([]), { mode: 0o600 });
	}

	try {
		fs.accessSync(stagePath, fs.constants.R_OK);
	} catch (error) {
		fs.mkdirSync(stagePath, 0o700);
	}
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
				let duration = episode.duration;

				if (episode.listened) {
					symbol = GREEN_CHECKMARK;
				}

				console.log(symbol, shortMd5, '', date, '', title, '(' + formatDuration(duration) + ')');
			});
		}
	});

	process.exit();
}

function loadPodcastDatabase(dbFilename) {
	let podcastsFile;

	dbFilename = dbFilename;

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
		console.error('usage: podshuffler pull [options] <iPod path>');
		process.exit(1);
	}

	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	let source = cliOptions._[0];

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
		console.error('usage: podshuffler pull [options] <iPod path>');
		process.exit(1);
	}

	let stage = cliOptions['stage'];
	let ipod = cliOptions._[0];

	let shuffleDatabaseFile = fs.readFileSync(path.resolve(stage, 'iTunesSD'));
	let shuffleStatsFile = fs.readFileSync(path.resolve(stage, 'iTunesStats'));
	let shufflePlayerStateFile = fs.readFileSync(path.resolve(stage, 'iTunesPState'));

	let shuffleDatabase = new ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile);

	let ipodFilenames = fs.readdirSync(path.resolve(ipod));

	ipodFilenames.forEach(function(ipodFilename) {
		if (ipodFilename.endsWith('.mp3')) {
			if (!shuffleDatabase.episodes.find(function(episode) { return episode.filename == '/' + ipodFilename; })) {
				fs.unlinkSync(path.resolve(ipod, ipodFilename));
				console.log(ipodFilename, 'no longer needed');
			}
		}
	});

	shuffleDatabase.episodes.forEach(function(episode) {
		if (ipodFilenames.includes(episode.filename.substring(1))) {
			return;
		}
		else {
			fs.copyFileSync(path.resolve(stage, episode.filename.substring(1)), path.resolve(ipod, episode.filename.substring(1)));
		}
	});

	fs.copyFileSync(path.resolve(stage, 'iTunesSD'), path.resolve(ipod, 'iPod_Control/iTunes/iTunesSD'));
	fs.copyFileSync(path.resolve(stage, 'iTunesStats'), path.resolve(ipod, 'iPod_Control/iTunes/iTunesStats'));
	fs.copyFileSync(path.resolve(stage, 'iTunesPState'), path.resolve(ipod, 'iPod_Control/iTunes/iTunesPState'));

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

			let duration = sanitizeDuration(item.itunes.duration);

			if (!existingEpisode) {
				let newEpisode = {
					guid: item.guid,
					md5: crypto.createHash('md5').update(item.guid).digest('hex'),
					date: item.pubDate,
					title: item.title,
					url: item.enclosure.url,
					duration: duration,
					bookmarkTime: 0,
					listened: false,
					queuedUp: false
				};

				podcast.episodes.push(newEpisode);

				console.log(GREEN_PLUS + ' ' + newEpisode.md5.substring(0, 8) + '  ' + (new Date(newEpisode.date)).toDateString() + '  ' + podcast.name + ': ' + newEpisode.title + ' (' + formatDuration(duration) + ')');
			}
			else {
				existingEpisode.duration = duration;
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

function sanitizeDuration(unsanitizedDuration) {
	let sanitizedDuration = 0;

	if (parseInt(unsanitizedDuration) != unsanitizedDuration) {
		let digits = unsanitizedDuration.split(/:/).reverse();

		digits.forEach(function(digit, i) {
			if (i == 0) {
				sanitizedDuration += parseInt(digit);
			}
			else if (i == 1) {
				sanitizedDuration += 60 * parseInt(digit);
			}
			else if (i == 2) {
				sanitizedDuration += 60 * 60 * parseInt(digit);
			}
		});
	}
	else {
		sanitizedDuration = parseInt(unsanitizedDuration);
	}

	return sanitizedDuration;
}

function savePodcastDatabase(dbFilename, podcastDatabase) {
	fs.writeFileSync(path.resolve(dbFilename), JSON.stringify(podcastDatabase));
}

function stageCommand(cliOptions) {
	let dbFilename = cliOptions['db'];
	let podcastDatabase = loadPodcastDatabase(dbFilename);

	let stage = cliOptions['stage'];

	let downloadPromises = [];
	let shuffleDatabase = new ShuffleDatabase();

	podcastDatabase.forEach(function(podcast) {
		let protocol;
		let episode;
		let queuedUpEpisode;

		queuedUpEpisode = podcast.episodes.find(function(episode) { return episode.queuedUp; });

		if (queuedUpEpisode) {
			episode = queuedUpEpisode;

			if (podcast.episodeOrder == 'newest-only') {
				if (queuedUpEpisode != podcast.episodes[0]) {
					queuedUpEpisode.queuedUp = false;
					episode = podcast.episodes[0];
				}

				if (episode.listened) {
					return;
				}
			}
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
		else {
			episode.queuedUp = true;
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
				fs.accessSync(path.resolve(stage, episodeFilename));
				resolve(resolutionData);
				return;
			} catch (error) { }

			let episodeFile = fs.createWriteStream(path.resolve(stage, episodeFilename));

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
			console.log(GREEN_PLUS + ' ' + episode.md5.substring(0, 8) + '  ' + (new Date(episode.date)).toDateString() + '  ' + podcast.name + ': ' + episode.title + ' (' + formatDuration(episode.duration) + ')');
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
			fs.accessSync(path.resolve(stage, 'iTunesSD'), fs.constants.R_OK);
		} catch (error) {
			fs.writeFileSync(path.resolve(stage, 'iTunesSD'));
		}

		iTunesSDFile = fs.readFileSync(path.resolve(stage, 'iTunesSD'));

		try {
			fs.accessSync(path.resolve(stage, 'iTunesStats'), fs.constants.R_OK);
		} catch (error) {
			fs.writeFileSync(path.resolve(stage, 'iTunesStats'));
		}

		iTunesStatsFile = fs.readFileSync(path.resolve(stage, 'iTunesStats'));

		fs.writeFileSync(path.resolve(stage, 'iTunesSD'), shuffleDatabase.toItunesSd(), { encoding: 'utf8' });
		fs.writeFileSync(path.resolve(stage, 'iTunesStats'), shuffleDatabase.toItunesStats(), { encoding: 'utf8' });
		fs.writeFileSync(path.resolve(stage, 'iTunesPState'), shuffleDatabase.toItunesPState(), { encoding: 'utf8' });

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
	if (cliOptions._.length == 0) {
		console.error('You must specify a path to the root-level directory of your iPod Shuffle. This is probably something like "/media/username/IPODSHUFFLE".');

		return false;
	}

	return true;
}

function verifyPushCommandOptions(cliOptions) {
	if (cliOptions._.length == 0) {
		console.error('No iPod path specified. This will probably be something like "/media/username/IPODSHUFFLE".');

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
