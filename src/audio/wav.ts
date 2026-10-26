/** Encode an AudioBuffer as 24-bit PCM WAV. */
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const bytesPerSample = 3;
  const dataBytes = length * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(out);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };

  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  v.setUint16(32, channels * bytesPerSample, true);
  v.setUint16(34, 24, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);

  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      let sample = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
      if (sample < 0) sample += 0x1000000;
      v.setUint8(o, sample & 0xff);
      v.setUint8(o + 1, (sample >>> 8) & 0xff);
      v.setUint8(o + 2, (sample >>> 16) & 0xff);
      o += bytesPerSample;
    }
  }
  return out;
}
