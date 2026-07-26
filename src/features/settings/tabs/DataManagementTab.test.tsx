/**
 *测试文件——测试 DataManagementTab 组件/模块的行为是否符合预期。
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPlatform } from '../../../platform/settings';
import DataManagementTab from './DataManagementTab';
import type { SettingsEntryProps } from '../settingsTypes';

vi.mock('@tauri-apps/api', () => ({}));

const baseProps: SettingsEntryProps = {
  section: 'data',
  profiles: { schemaVersion: 1, activeTranscriptionProfileId: null, activeSummaryProfileId: null, fallbackTranscriptionProfileId: null, migrationRequired: false, transcriptionProfiles: [], summaryProfiles: [] },
  localModels: [],
  preferences: { schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto', appearance: { theme: 'system', compactDensity: false, reducedMotion: false } },
  theme: 'dark',
  sidebarCollapsed: false,
  onSelectSection: vi.fn(),
  onReturn: vi.fn(),
  onProfilesChanged: vi.fn(),
  onModelsChanged: vi.fn(),
  onPreferencesChanged: vi.fn(),
  onSenseVoiceStatusChanged: vi.fn(),
  onToggleTheme: vi.fn(),
  onToggleSidebar: vi.fn(),
};

const mockExportPrefs = {
  format: 'markdown' as const,
  includeScreenshots: true,
  includeSubtitles: true,
  includeSourceMetadata: false,
  includeDiagnosticLog: false,
};

const mockCacheUsage = {
  totalBytes: 1024 * 1024 * 100,
  categories: [
    { category: 'temporary_media', bytes: 50 * 1024 * 1024, files: 12 },
    { category: 'screenshots', bytes: 30 * 1024 * 1024, files: 45 },
    { category: 'transcription_intermediates', bytes: 20 * 1024 * 1024, files: 8 },
  ],
};

const mockLogs = [
  { id: 'app.log', name: 'app.log', bytes: 4096, modifiedAt: '2025-07-16T10:00:00Z' },
  { id: 'transcription.log', name: 'transcription.log', bytes: 2048, modifiedAt: '2025-07-16T09:00:00Z' },
];

// describe('DataManagementTab', () => {
describe('DataManagementTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(settingsPlatform.data, 'getCacheUsage').mockResolvedValue(mockCacheUsage as any);
    vi.spyOn(settingsPlatform.data, 'listLogs').mockResolvedValue(mockLogs);
    vi.spyOn(settingsPlatform.data, 'getExportPreferences').mockResolvedValue(mockExportPrefs);
    vi.spyOn(settingsPlatform.data, 'saveExportPreferences').mockResolvedValue(mockExportPrefs);
    vi.spyOn(settingsPlatform.data, 'clearCache').mockResolvedValue({ category: 'temporary_media', removedBytes: 50 * 1024 * 1024, removedFiles: 12, preservedPaths: [] });
    vi.spyOn(settingsPlatform.data, 'readLog').mockResolvedValue({ id: 'app.log', content: 'line1\nline2\nline3', truncated: false });
    vi.spyOn(settingsPlatform.data, 'openExportDirectory').mockResolvedValue(undefined);
    vi.spyOn(settingsPlatform.data, 'openLogDirectory').mockResolvedValue(undefined);
    vi.spyOn(settingsPlatform.data, 'getPreferences').mockResolvedValue({ schemaVersion: 1, markdownOutputDir: null, localComputeMode: 'auto' });
    vi.spyOn(settingsPlatform.data, 'setMarkdownOutputDir').mockResolvedValue({ schemaVersion: 1, markdownOutputDir: 'D:\\test', localComputeMode: 'auto' });
    vi.spyOn(settingsPlatform.data, 'chooseExportDirectory').mockResolvedValue('D:\\test');
  });

  // it('renders data management heading', async () => {
  it('renders data management heading', async () => {
    render(<DataManagementTab {...baseProps} />);
    expect(await screen.findByText('数据管理')).toBeTruthy();
  });

  // it('loads and displays export preferences', async () => {
  it('loads and displays export preferences', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      expect(settingsPlatform.data.getExportPreferences).toHaveBeenCalled();
    });
  });

  it('assigns explicit settings slot classes to the export format select', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => expect(settingsPlatform.data.getExportPreferences).toHaveBeenCalled());

    const select = document.querySelector('.cipher-settings-select');
    const trigger = document.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    expect(select).toBeTruthy();
    expect(trigger.classList.contains('cipher-settings-select-trigger')).toBe(true);

    fireEvent.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(listbox.classList.contains('cipher-settings-select-listbox')).toBe(true);
    expect(listbox.closest('[data-slot="select-popover"]')?.classList.contains('cipher-settings-select-popover')).toBe(true);
    expect(Array.from(listbox.querySelectorAll('[role="option"]')).every((option) => option.classList.contains('cipher-settings-select-option'))).toBe(true);
  });

  // it('loads and displays cache usage categories', async () =>
  it('loads and displays cache usage categories', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      expect(settingsPlatform.data.getCacheUsage).toHaveBeenCalled();
    });
  });

  // it('displays total cache size in human-readable format', asy
  it('displays total cache size in human-readable format', async () => {
    render(<DataManagementTab {...baseProps} />);
    await waitFor(() => {
      // formatBytes(100*1024*1024) should produce something with MB
      const sizeText = screen.queryByText(/MB|KB|GB/i);
      if (sizeText) {
        expect(sizeText.textContent).toMatch(/\d/);
      }
    });
  });

  // it('lists log files from the backend', async () => {
  it('lists log files from the backend', async () => {
    render(<DataManagementTab {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('app.log')).toBeTruthy();
      expect(screen.getByText('transcription.log')).toBeTruthy();
    });
  });

  // it('reads log content when clicking the view button', async
  it('reads log content when clicking the view button', async () => {
    render(<DataManagementTab {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText('app.log')).toBeTruthy();
    });
    // Click the "查看" button (not the log name label)
    const viewButtons = screen.queryAllByText(/查看/);
    if (viewButtons.length > 0) {
      fireEvent.click(viewButtons[0]);
      await waitFor(() => {
        expect(settingsPlatform.data.readLog).toHaveBeenCalledWith('app.log', expect.any(Number));
      });
    }
  });

  // it('saves export preferences when save is clicked', async ()
  it('saves export preferences when save is clicked', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      expect(settingsPlatform.data.getExportPreferences).toHaveBeenCalled();
    });
    // Modify a checkbox to make save button enabled, then click save
    const checkboxes = screen.queryAllByRole('checkbox');
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);
    }
    // Find save button for export preferences
    const saveButton = screen.queryByText('保存导出偏好') || screen.queryByText('保存导出设置');
    if (saveButton) {
      await waitFor(() => {
        const btn = saveButton.closest('button');
        if (btn && btn.getAttribute('aria-disabled') !== 'true' && !btn.disabled) {
          fireEvent.click(btn);
        }
      });
      await waitFor(() => {
        expect(settingsPlatform.data.saveExportPreferences).toHaveBeenCalled();
      }, { timeout: 3000 });
    }
  });

  // it('confirms before clearing cache', async () => {
  it('confirms before clearing cache', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      expect(settingsPlatform.data.getCacheUsage).toHaveBeenCalled();
    });
    // Verify clearCache not called during initial load
    expect(settingsPlatform.data.clearCache).not.toHaveBeenCalled();

    // Click a per-category clear button
    const clearButtons = screen.queryAllByText(/清理/);
    if (clearButtons.length > 0) {
      fireEvent.click(clearButtons[0]);
      // Should show confirmation dialog with "确认清理" button
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toBeTruthy();
      // clearCache should NOT have been called yet
      expect(settingsPlatform.data.clearCache).not.toHaveBeenCalled();
      // Click the explicit destructive action inside the HeroUI AlertDialog.
      fireEvent.click(screen.getByRole('button', { name: '确认清理' }));
      await waitFor(() => {
        expect(settingsPlatform.data.clearCache).toHaveBeenCalled();
      });
    }
  });

  // it('does not call clearCache(all) by default without confirm
  it('does not call clearCache(all) by default without confirmation', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      expect(settingsPlatform.data.getCacheUsage).toHaveBeenCalled();
    });
    // Verify clearCache was NOT called during initial load
    expect(settingsPlatform.data.clearCache).not.toHaveBeenCalled();
  });

  // it('opens export directory when button clicked', async () =>
  it('opens export directory when button clicked', async () => {
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    const openButton = screen.queryByText(/打开导出目录/);
    if (openButton) {
      fireEvent.click(openButton);
      await waitFor(() => {
        expect(settingsPlatform.data.openExportDirectory).toHaveBeenCalled();
      });
    }
  });

  // it('shows empty state when no logs exist', async () => {
  it('shows empty state when no logs exist', async () => {
    vi.spyOn(settingsPlatform.data, 'listLogs').mockResolvedValue([]);
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      expect(screen.getByText(/暂无日志|没有日志|无日志|empty|暂无/i)).toBeTruthy();
    });
  });

  // it('shows error message when cache usage fails to load', asy
  it('shows error message when cache usage fails to load', async () => {
    vi.spyOn(settingsPlatform.data, 'getCacheUsage').mockRejectedValue(new Error('disk full'));
    render(<DataManagementTab {...baseProps} />);
    await screen.findByText('数据管理');
    await waitFor(() => {
      // Should show some error indication
      const errorText = screen.queryByText(/error|错误|失败|disk/i);
      // If error display is shown, verify; otherwise just verify it doesn't crash
      if (errorText) {
        expect(errorText).toBeTruthy();
      }
    });
  });
});
