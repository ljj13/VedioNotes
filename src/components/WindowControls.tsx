/**
 *窗口控制按钮——最小化、最大化、关闭。只在 Tauri 桌面环境下显示。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** tryGetWindow */
function tryGetWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/** WindowControls */
export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [win] = useState<ReturnType<typeof getCurrentWindow> | null>(() => tryGetWindow());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const syncMaximized = useCallback(() => {
    if (!win) return;
    void win.isMaximized().then((v) => {
      if (mountedRef.current) setIsMaximized(v);
    }).catch(() => {});
  }, [win]);

  useEffect(() => {
    if (!win) return;
    syncMaximized();
    const unlistenPromise = win.onResized(() => {
      syncMaximized();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [syncMaximized, win]);

  if (!win) return null;
  const handleMinimize = () => { void win.minimize().catch(() => {}); };
  const handleToggleMaximize = () => { void win.toggleMaximize().then(() => syncMaximized()).catch(() => {}); };
  const handleClose = () => { void win.close().catch(() => {}); };

  return (
    <div className="window-controls" aria-label="窗口控制">
      <button
        type="button"
        className="window-control-btn window-minimize"
        aria-label="最小化"
        onClick={handleMinimize}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control-btn window-maximize"
        aria-label={isMaximized ? '还原' : '最大化'}
        onClick={handleToggleMaximize}
      >
        {isMaximized ? (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M8 8h5v5H8zM11 11h5v5h-5z" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 5h14v14H5z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="window-control-btn window-close"
        aria-label="关闭"
        onClick={handleClose}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
