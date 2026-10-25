const AUDIO_EXTENSIONS = /\.(wav|wave|mp3|ogg|oga|opus|flac|aac|m4a|aif|aiff|wma|webm|mp4)$/i;

/** "kick.wav" -> "kick". Only known audio extensions are removed, so "take 2.5" stays as it is. */
export const stripAudioExtension = (name: string): string => name.replace(AUDIO_EXTENSIONS, '') || name;
