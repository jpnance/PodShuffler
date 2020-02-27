function ShuffleDatabase(shuffleDatabaseFile, shuffleStatsFile, shufflePlayerStateFile) {
	this.episodes = [];

	if (shuffleDatabaseFile && shuffleStatsFile && shufflePlayerStateFile) {
		let numberOfEpisodesFromDatabase = 0;
		let numberOfEpisodesFromStats = 0;

		numberOfEpisodesFromDatabase += (shuffleDatabaseFile[0] << 16);
		numberOfEpisodesFromDatabase += (shuffleDatabaseFile[1] << 8);
		numberOfEpisodesFromDatabase += shuffleDatabaseFile[2];

		numberOfEpisodesFromStats += shuffleStatsFile[0];
		numberOfEpisodesFromStats += (shuffleStatsFile[1] << 8);
		numberOfEpisodesFromStats += (shuffleStatsFile[2] << 16);

		if (numberOfEpisodesFromDatabase != numberOfEpisodesFromStats) {
			console.error('no clue how we got here');
			process.exit(1);
		}

		for (let i = 0; i < numberOfEpisodesFromDatabase; i++) {
			let filename = '';

			for (let j = 0; j < 522; j++) {
				let character = String.fromCharCode(shuffleDatabaseFile[18 + (i * 558) + 33 + j]);

				if (character != '\x00') {
					filename += character;
				}
			}

			let bookmarkTime = 0;

			bookmarkTime += shuffleStatsFile[6 + (i * 18) + 3];
			bookmarkTime += (shuffleStatsFile[6 + (i * 18) + 4] << 8);
			bookmarkTime += (shuffleStatsFile[6 + (i * 18) + 5] << 16);

			let playCount = 0;

			playCount += shuffleStatsFile[6 + (i * 18) + 12];
			playCount += (shuffleStatsFile[6 + (i * 18) + 13] << 8);
			playCount += (shuffleStatsFile[6 + (i * 18) + 14] << 16);

			let skipCount = 0;

			skipCount += shuffleStatsFile[6 + (i * 18) + 15];
			skipCount += (shuffleStatsFile[6 + (i * 18) + 16] << 8);
			skipCount += (shuffleStatsFile[6 + (i * 18) + 17] << 16);

			this.episodes.push({
				filename: filename,
				bookmarkTime: bookmarkTime,
				playCount: playCount,
				skipCount: skipCount,
				priority: 0xdeadbeef
			});
		}

		let playbackTrackNumber = 0;

		playbackTrackNumber += shufflePlayerStateFile[4];
		playbackTrackNumber += (shufflePlayerStateFile[5] << 8);
		playbackTrackNumber += (shufflePlayerStateFile[6] << 16);
		playbackTrackNumber += (shufflePlayerStateFile[7] << 24);
		playbackTrackNumber += (shufflePlayerStateFile[8] << 32);
		playbackTrackNumber += (shufflePlayerStateFile[9] << 40);
		playbackTrackNumber += (shufflePlayerStateFile[10] << 48);
		playbackTrackNumber += (shufflePlayerStateFile[11] << 56);

		let playbackTrackPosition = 0;

		playbackTrackPosition += shufflePlayerStateFile[12];
		playbackTrackPosition += (shufflePlayerStateFile[13] << 8);
		playbackTrackPosition += (shufflePlayerStateFile[14] << 16);
	}
}

ShuffleDatabase.prototype.addEpisode = function(episode) {
	this.episodes.push(episode);

	this.episodes.sort(function(a, b) {
		if (a.priority == 0xdeadbeef && b.priority == 0xdeadbeef) {
			return 0;
		}
		else if (a.priority == 'daily' && b.priority != 'daily') {
			return -1;
		}
		else if (a.priority != 'daily' && b.priority == 'daily') {
			return 1;
		}
		else if (a.priority == 'serial' && b.priority != 'serial') {
			return -1;
		}
		else if (a.priority != 'serial' && b.priority == 'serial') {
			return 1;
		}
		else if (a.priority == 'randomizable' && b.priority != 'randomizable') {
			return -1;
		}
		else if (a.priority != 'randomizable' && b.priority == 'randomizable') {
			return 1;
		}
		else if (a.priority == 'evergreen' && b.priority != 'evergreen') {
			return -1;
		}
		else if (a.priority != 'evergreen' && b.priority == 'evergreen') {
			return 1;
		}
		else if (a.bookmarkTime != 0xffffff && (a.bookmarkTime > b.bookmarkTime || b.bookmarkTime == 0xffffff)) {
			return -1;
		}
		else if (b.bookmarkTime != 0xffffff && (b.bookmarkTime > a.bookmarkTime || a.bookmarkTime == 0xffffff)) {
			return 1;
		}
		else {
			return (Math.random() > 0.5) ? -1 : 1;
		}
	});
};

ShuffleDatabase.prototype.toItunesPState = function() {
	// the iTunesPState spec is definitely wrong

	// little endian for iTunesPState
	let data = new Uint8Array(21);

	// volume
	data[0] = 0x1d;
	data[1] = 0x00;

	// ???
	data[2] = 0x00;
	data[3] = 0x00;

	// track number
	data[4] = 0x00;
	data[5] = 0x00;
	data[6] = 0x00;
	data[7] = 0x00;
	data[8] = 0x00;
	data[9] = 0x00;
	data[10] = 0x00;
	data[11] = 0x00;

	// track position
	data[12] = 0x00;
	data[13] = 0x00;
	data[14] = 0x00;

	// unknown1
	data[15] = 0x00;
	data[16] = 0x00;
	data[17] = 0x00;

	// unknown2 (always 0x010000)
	data[18] = 0x01;
	data[19] = 0x00;
	data[20] = 0x00;

	return data;
};

ShuffleDatabase.prototype.toItunesSd = function() {
	// big endian for iTunesSD
	let data = new Uint8Array(18 + (this.episodes.length * 558));
	let numberOfEpisodes = this.episodes.length;

	// number of episodes
	data[0] = (numberOfEpisodes & 0xff0000) >> 16;
	data[1] = (numberOfEpisodes & 0x00ff00) >> 8;
	data[2] = (numberOfEpisodes & 0x0000ff);

	// unknown1 (always 0x010800)
	data[3] = 0x01;
	data[4] = 0x08;
	data[5] = 0x00;

	// header size (always 0x000012)
	data[6] = 0x00;
	data[7] = 0x00;
	data[8] = 0x12;

	// unknown2
	data[9] = 0x00;
	data[10] = 0x00;
	data[11] = 0x00;
	data[12] = 0x00;
	data[13] = 0x00;
	data[14] = 0x00;
	data[15] = 0x00;
	data[16] = 0x00;
	data[17] = 0x00;

	for (let i = 0; i < numberOfEpisodes; i++) {
		let episodeData = this.episodes[i].toItunesSd();

		for (let j = 0; j < 558; j++) {
			data[18 + (558 * i) + j] = episodeData[j];
		}
	}

	return data;
};

ShuffleDatabase.prototype.toItunesStats = function() {
	// little endian for iTunesStats
	let data = new Uint8Array(6 + (this.episodes.length * 18));
	let numberOfEpisodes = this.episodes.length;

	// number of episodes
	data[0] = (numberOfEpisodes & 0x0000ff);
	data[1] = (numberOfEpisodes & 0x00ff00) >> 8;
	data[2] = (numberOfEpisodes & 0xff0000) >> 16;

	// unknown1
	data[3] = 0x00;
	data[4] = 0x00;
	data[5] = 0x00;

	for (let i = 0; i < numberOfEpisodes; i++) {
		let episodeData = this.episodes[i].toItunesStats();

		for (let j = 0; j < 18; j++) {
			data[6 + (18 * i) + j] = episodeData[j];
		}
	}

	return data;
};

module.exports = ShuffleDatabase;
