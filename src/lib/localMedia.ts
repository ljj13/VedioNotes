import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';

export type LocalMediaKind = 'video' | 'audio';

export interface LocalMediaSelection {
  path: string;
  name: string;
  kind: LocalMediaKind;
}

export type NativeDropState =
  | { type: 'over' }
  | { type: 'leave' }
  | { type: 'selected'; media: LocalMediaSelection }
  | { type: 'error'; message: string };

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg', 'opus']);
const ALL_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

export function classifyLocalMedia(path: string): LocalMediaSelection | null {
  const name = path.split(/[\\/]/).pop() ?? path;
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  const kind = VIDEO_EXTENSIONS.has(extension)
    ? 'video'
    : AUDIO_EXTENSIONS.has(extension)
      ? 'audio'
      : null;

  return kind ? { path, name, kind } : null;
}

export async function openLocalMedia(): Promise<LocalMediaSelection | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: '选择视频或音频文件',
    filters: [{ name: '视频和音频', extensions: ALL_EXTENSIONS }],
  });

  return typeof selected === 'string' ? classifyLocalMedia(selected) : null;
}

export async function subscribeToMediaDrop(
  callback: (state: NativeDropState) => void,
): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'over' || event.payload.type === 'enter') {
      callback({ type: 'over' });
      return;
    }
    if (event.payload.type === 'leave') {
      callback({ type: 'leave' });
      return;
    }
    if (event.payload.type !== 'drop') return;

    const media = event.payload.paths
      .map(classifyLocalMedia)
      .find((candidate): candidate is LocalMediaSelection => candidate !== null);
    if (media) {
      callback({ type: 'selected', media });
    } else {
      callback({ type: 'error', message: '不支持该文件格式，请选择视频或音频文件。' });
    }
  });
}
