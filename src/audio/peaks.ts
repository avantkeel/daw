export interface Peaks {
  /**
   * Max absolute amplitude per block of `blockSize` samples, one array per displayed channel:
   * one for mono audio, two (left, right) for stereo. Audio with more than 2 channels shows the first two.
   */
  channels: Float32Array[];
  blockSize: number;
  sampleRate: number;
}

export function computePeaks(buffer: AudioBuffer, blockSize = 256): Peaks {
  const blocks = Math.ceil(buffer.length / blockSize);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < Math.min(buffer.numberOfChannels, 2); ch++) {
    const samples = buffer.getChannelData(ch);
    const data = new Float32Array(blocks);
    for (let b = 0; b < blocks; b++) {
      const s = b * blockSize;
      const e = Math.min(s + blockSize, samples.length);
      let m = 0;
      for (let i = s; i < e; i++) {
        const v = Math.abs(samples[i]);
        if (v > m) m = v;
      }
      data[b] = m;
    }
    channels.push(data);
  }
  return { channels, blockSize, sampleRate: buffer.sampleRate };
}
