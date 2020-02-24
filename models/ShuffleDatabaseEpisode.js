function ShuffleDatabaseEpisode(filename, fileType) {
	this.filename = filename;
	this.fileType = fileType;

	for (let i = 0; i < filename.length; i++) {
		this.filename[(i * 2) + 1] = filename.charCodeAt(i);
	}

	if (fileType == 'mp3') {
		this.fileType[2] = 0x01;
	}
	else if (fileType == 'aac') {
		this.fileType[2] = 0x02;
	}
	else if (fileType == 'wav') {
		this.fileType[2] = 0x04;
	}
}

ShuffleDatabaseEpisode.prototype.toBinary = function() {
	let data = new Uint8Array(558);

	// entry size (always 0x0022e)
	data[0] = 0x00;
	data[1] = 0x02;
	data[2] = 0x2e;

	// unknown1
	data[3] = 0x00;
	data[4] = 0x00;
	data[5] = 0x00;

	// start time (0x000000 until we want to get much more advanced)
	data[6] = 0x00;
	data[7] = 0x00;
	data[8] = 0x00;

	// unknown2
	data[9] = 0x00;
	data[10] = 0x00;
	data[11] = 0x00;

	// unknown3
	data[12] = 0x00;
	data[13] = 0x00;
	data[14] = 0x00;

	// stop time (0x000000 until we want to get much more advanced)
	data[15] = 0x00;
	data[16] = 0x00;
	data[17] = 0x00;

	// unknown4
	data[18] = 0x00;
	data[19] = 0x00;
	data[20] = 0x00;

	// unknown5
	data[21] = 0x00;
	data[22] = 0x00;
	data[23] = 0x00;

	// volume (0x000000 to 0x0000c8 ranges from -100% to 100%)
	data[24] = 0x00;
	data[25] = 0x00;
	data[26] = 0x64;

	// file type
	data[27] = 0x00;
	data[28] = 0x00;

	if (this.fileType == 'mp3') {
		data[29] = 0x01;
	}
	else if (this.fileType == 'aac') {
		data[29] = 0x02;
	}
	else if (this.fileType == 'wav') {
		data[29] = 0x04;
	}

	// unknown6
	data[30] = 0x00;
	data[31] = 0x00;
	data[32] = 0x00;

	// filename
	for (let i = 0; i < 522; i++) {
		data[(i * 2) + 1 + 33] = this.filename.charCodeAt(i);
	}

	// shuffleable (0 until we want to get much more advanced)
	data[555] = 0x00;

	// bookmarkable (1 until we want to get much more advanced)
	data[556] = 0x01;

	// unknown7
	data[557] = 0x00;

	return data;
};

module.exports = ShuffleDatabaseEpisode;
