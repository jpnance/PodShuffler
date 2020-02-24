function ShuffleDatabase() {
	this.episodes = [];
}

ShuffleDatabase.prototype.addEpisode = function(episode) {
	this.episodes.push(episode);
};

ShuffleDatabase.prototype.toBinary = function() {
	let data = new Uint8Array(18 + (this.episodes.length * 558));

	let numberOfEpisodes = this.episodes.length;

	// number of episodes
	data[0] = (numberOfEpisodes & 0xff0000) >> 16;
	data[1] = (numberOfEpisodes & 0x00ff00) >> 8;
	data[2] = (numberOfEpisodes & 0x0000ff);

	// unknown1
	data[3] = 0x00;
	data[4] = 0x00;
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

	for (let i = 0; i < this.episodes.length; i++) {
		let episodeData = this.episodes[i].toBinary();

		for (let j = 0; j < 558; j++) {
			data[(558 * i) + j + 18] = episodeData[j];
		}
	}

	return data;
};

module.exports = ShuffleDatabase;
