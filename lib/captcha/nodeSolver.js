import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 200;
const HEIGHT = 40;
const NUM_CHARACTERS = 6;
const LABELS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const bitmapsSource = fs.readFileSync(path.join(__dirname, 'bitmaps.js'), 'utf8');
const bitmaps = vm.runInNewContext(`${bitmapsSource}; bitmaps;`, {});
const weights = bitmaps.weights;
const biases = bitmaps.biases;

const runDjpeg = (jpegBuffer) =>
	new Promise((resolve, reject) => {
		const proc = spawn('djpeg', ['-pnm']);
		const stdout = [];
		const stderr = [];
		proc.stdout.on('data', (chunk) => stdout.push(chunk));
		proc.stderr.on('data', (chunk) => stderr.push(chunk));
		proc.on('error', reject);
		proc.on('close', (code) => {
			if (code === 0) {
				resolve(Buffer.concat(stdout));
			} else {
				reject(
					new Error(
						`djpeg exited with code ${code}: ${Buffer.concat(stderr).toString()}`,
					),
				);
			}
		});
		proc.stdin.end(jpegBuffer);
	});

const readToken = (buffer, cursor) => {
	while (cursor.index < buffer.length && buffer[cursor.index] <= 32) {
		cursor.index += 1;
	}
	if (buffer[cursor.index] === 35) {
		while (cursor.index < buffer.length && buffer[cursor.index] !== 10) {
			cursor.index += 1;
		}
		return readToken(buffer, cursor);
	}
	let start = cursor.index;
	while (cursor.index < buffer.length && buffer[cursor.index] > 32) {
		cursor.index += 1;
	}
	return buffer.toString('ascii', start, cursor.index);
};

const parsePPM = (buffer) => {
	const cursor = { index: 0 };
	const magic = readToken(buffer, cursor);
	if (magic !== 'P6') {
		throw new Error(`Unexpected PNM magic number: ${magic}`);
	}
	const width = parseInt(readToken(buffer, cursor), 10);
	const height = parseInt(readToken(buffer, cursor), 10);
	const maxVal = parseInt(readToken(buffer, cursor), 10);
	if (Number.isNaN(width) || Number.isNaN(height) || Number.isNaN(maxVal)) {
		throw new Error('Failed to parse PPM header');
	}
	if (maxVal !== 255) {
		throw new Error(`Unsupported max value in PPM: ${maxVal}`);
	}
	while (cursor.index < buffer.length && buffer[cursor.index] <= 32) {
		cursor.index += 1;
	}
	const pixelBuffer = buffer.subarray(cursor.index);
	if (pixelBuffer.length < width * height * 3) {
		throw new Error('PPM pixel buffer too small');
	}
	const data = new Uint8Array(width * height * 4);
	let src = 0;
	for (let dst = 0; dst < data.length; dst += 4) {
		data[dst] = pixelBuffer[src];
		data[dst + 1] = pixelBuffer[src + 1];
		data[dst + 2] = pixelBuffer[src + 2];
		data[dst + 3] = 255;
		src += 3;
	}
	return { width, height, data };
};

const saturation = (data) => {
	const saturate = new Array(data.length / 4);
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const min = Math.min(r, g, b);
		const max = Math.max(r, g, b);
		const value = max === 0 ? 0 : Math.round(((max - min) * 255) / max);
		saturate[i / 4] = Number.isFinite(value) ? value : 0;
	}
	const img = new Array(HEIGHT);
	for (let row = 0; row < HEIGHT; row += 1) {
		img[row] = new Array(WIDTH);
		for (let col = 0; col < WIDTH; col += 1) {
			img[row][col] = saturate[row * WIDTH + col] ?? 0;
		}
	}
	const blocks = new Array(NUM_CHARACTERS);
	for (let i = 0; i < NUM_CHARACTERS; i += 1) {
		const x1 = (i + 1) * 25 + 2;
		const y1 = 7 + 5 * (i % 2) + 1;
		const x2 = (i + 2) * 25 + 1;
		const y2 = 35 - 5 * ((i + 1) % 2);
		blocks[i] = img.slice(y1, y2).map((row) => row.slice(x1, x2));
	}
	return blocks;
};

const preImg = (img) => {
	let avg = 0;
	for (let i = 0; i < img.length; i += 1) {
		for (let j = 0; j < img[0].length; j += 1) {
			avg += img[i][j];
		}
	}
	avg /= img.length * img[0].length;
	const bits = new Array(img.length);
	for (let i = 0; i < img.length; i += 1) {
		bits[i] = new Array(img[0].length);
		for (let j = 0; j < img[0].length; j += 1) {
			bits[i][j] = img[i][j] > avg ? 1 : 0;
		}
	}
	return bits;
};

const flatten = (arr) => {
	const bits = new Array(arr.length * arr[0].length);
	for (let i = 0; i < arr.length; i += 1) {
		for (let j = 0; j < arr[0].length; j += 1) {
			bits[i * arr[0].length + j] = arr[i][j];
		}
	}
	return bits;
};

const matMul = (a, b) => {
	const x = a.length;
	const z = a[0].length;
	const y = b[0].length;
	const product = Array.from({ length: x }, () => new Array(y).fill(0));
	for (let i = 0; i < x; i += 1) {
		for (let j = 0; j < y; j += 1) {
			let sum = 0;
			for (let k = 0; k < z; k += 1) {
				sum += a[i][k] * b[k][j];
			}
			product[i][j] = sum;
		}
	}
	return product;
};

const matAdd = (a, b) => {
	const c = new Array(a.length);
	for (let i = 0; i < a.length; i += 1) {
		c[i] = a[i] + b[i];
	}
	return c;
};

const maxSoft = (a) => {
	const n = [...a];
	let sum = 0;
	for (let i = 0; i < n.length; i += 1) {
		sum += Math.exp(n[i]);
	}
	for (let i = 0; i < n.length; i += 1) {
		n[i] = Math.exp(a[i]) / sum;
	}
	return n;
};

const solveBlocks = (blocks) => {
	let output = '';
	for (let i = 0; i < blocks.length; i += 1) {
		let block = preImg(blocks[i]);
		block = [flatten(block)];
		block = matMul(block, weights);
		block = matAdd(...block, biases);
		block = maxSoft(block);
		const index = block.indexOf(Math.max(...block));
		output += LABELS[index] || '?';
	}
	return output;
};

const solveCaptchaFromBase64 = async (dataUri) => {
	const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
	const jpegBuffer = Buffer.from(base64, 'base64');
	const ppmBuffer = await runDjpeg(jpegBuffer);
	const { width, height, data } = parsePPM(ppmBuffer);
	if (width !== WIDTH || height !== HEIGHT) {
		throw new Error(`Unexpected captcha dimensions ${width}x${height}`);
	}
	const blocks = saturation(data);
	return solveBlocks(blocks);
};

export { solveCaptchaFromBase64 };
