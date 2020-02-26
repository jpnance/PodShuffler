function ShuffleDatabase() {
	this.episodes = [];
}

ShuffleDatabase.prototype.addEpisode = function(episode) {
	this.episodes.push(episode);
};

ShuffleDatabase.prototype.toItunesPState = function() {
	// little endian for iTunesPState
	let data = new Uint8Array(21);

	// volume
	data[0] = 0x1d;
	data[1] = 0x00;
	data[2] = 0x00;

	// shuffle position
	data[3] = 0x00;
	data[4] = 0x00;
	data[5] = 0x00;

	// track number
	data[6] = 0x00;
	data[7] = 0x00;
	data[8] = 0x00;

	// shuffle flag
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
