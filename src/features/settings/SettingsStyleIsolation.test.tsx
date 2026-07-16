import { render, screen } from '@testing-library/react';
import { Button, Tabs } from '@heroui/react';
import { Palette } from '@gravity-ui/icons';
import { describe, expect, it } from 'vitest';

describe('Cipher Settings dependency isolation', () => {
  it('renders retained HeroUI and icon primitives only inside the settings root', () => {
    render(
      <div>
        <main data-testid="outside">outside</main>
        <section className="cipher-settings-root" data-testid="settings-root" data-theme="dark">
          <Tabs aria-label="设置导航">
            <Tabs.List aria-label="设置导航">
              <Tabs.Tab id="appearance"><Palette width={16} />外观</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel id="appearance"><Button>保存</Button></Tabs.Panel>
          </Tabs>
        </section>
      </div>,
    );
    expect(screen.getByTestId('settings-root').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('outside').className).toBe('');
  });
});
