export interface Peaks {
  /** Max absolute amplitude per block of `blockSize` samples (all channels). */
  data: Float32Array;
  blockSize: number;
  sampleRate: number;
}

export function computePeaks(buffer: AudioBuffer, blockSize = 256): Peaks {
  const blocks = Math.ceil(buffer.length / blockSize);
  const data = new Float32Array(blocks);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const samples = buffer.getChannelData(ch);
    for (let b = 0; b < blocks; b++) {
      const s = b * blockSize;
      const e = Math.min(s + blockSize, samples.length);
      let m = data[b];
      for (let i = s; i < e; i++) {
        const v = Math.abs(samples[i]);
        if (v > m) m = v;
      }
      data[b] = m;
    }
  }
  return { data, blockSize, sampleRate: buffer.sampleRate };
}
