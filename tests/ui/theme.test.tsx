import './dom';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HeaderThemeChooser, ThemeProvider } from '../../src/ui/Theme';

Object.assign(globalThis, { localStorage: window.localStorage });

afterEach(() => {
    cleanup();
    localStorage.clear();
});

// Open customization directly from the header dropdown.
function openCustomTheme() {
    const view = render(<ThemeProvider><HeaderThemeChooser /></ThemeProvider>);
    fireEvent.change(screen.getByRole('combobox', { name: 'Choose theme' }), { target: { value: 'customize' } });
    return view;
}

test('custom theme preserves existing colors and saves changes across remounts', () => {
    localStorage.setItem('streamer-color', '#123456');
    localStorage.setItem('streamer-text-color', '#abcdef');
    const view = openCustomTheme();
    assert.equal((screen.getByLabelText('Background') as HTMLInputElement).value, '#123456');
    assert.equal((screen.getByLabelText('Text') as HTMLInputElement).value, '#abcdef');

    fireEvent.change(screen.getByLabelText('Panels'), { target: { value: '#223344' } });
    fireEvent.change(screen.getByLabelText('Corners'), { target: { value: '12' } });
    assert.equal(localStorage.getItem('streamer-panel-color'), '#223344');
    assert.equal(localStorage.getItem('streamer-radius'), '12');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    assert.ok(!screen.queryByRole('dialog'));

    view.unmount();
    openCustomTheme();
    assert.equal((screen.getByLabelText('Panels') as HTMLInputElement).value, '#223344');
    assert.equal((screen.getByLabelText('Corners') as HTMLSelectElement).value, '12');
});

test('accent text stays readable and reset restores the palette and corners', () => {
    const view = openCustomTheme();
    const shell = view.container.querySelector<HTMLElement>('.app-shell')!;

    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#ffffff' } });
    assert.equal(shell.style.getPropertyValue('--streamer-accent-text'), '#000000');
    fireEvent.change(screen.getByLabelText('Accent'), { target: { value: '#000000' } });
    assert.equal(shell.style.getPropertyValue('--streamer-accent-text'), '#ffffff');
    fireEvent.change(screen.getByLabelText('Corners'), { target: { value: '0' } });
    assert.equal(shell.style.getPropertyValue('--streamer-radius'), '0px');

    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }));
    assert.equal(localStorage.getItem('streamer-accent-color'), '#65349b');
    assert.equal(localStorage.getItem('streamer-radius'), '6');
    assert.equal(shell.style.getPropertyValue('--streamer-radius'), '6px');
});

test('invalid saved settings fall back safely and other themes omit custom overrides', () => {
    localStorage.setItem('streamer-color', 'invalid');
    localStorage.setItem('streamer-radius', '999');
    const view = openCustomTheme();
    assert.equal((screen.getByLabelText('Background') as HTMLInputElement).value, '#ffffff');
    assert.equal((screen.getByLabelText('Corners') as HTMLSelectElement).value, '6');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Choose theme' }), { target: { value: 'light' } });
    assert.equal(view.container.querySelector<HTMLElement>('.app-shell')!.style.getPropertyValue('--streamer-color'), '');
});


test('the header dropdown saves themes and can reopen customization without changing the selection', () => {
    render(<ThemeProvider><HeaderThemeChooser /></ThemeProvider>);
    const chooser = screen.getByRole('combobox', { name: 'Choose theme' }) as HTMLSelectElement;
    fireEvent.change(chooser, { target: { value: 'light' } });
    assert.equal(localStorage.getItem('theme'), 'light');
    assert.ok(!screen.queryByRole('dialog'));

    fireEvent.change(chooser, { target: { value: 'customize' } });
    assert.ok(screen.getByRole('dialog', { name: 'Custom theme' }));
    assert.equal(localStorage.getItem('theme'), 'streamer');
    assert.equal(chooser.value, 'streamer');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    fireEvent.change(chooser, { target: { value: 'customize' } });
    assert.ok(screen.getByRole('dialog', { name: 'Custom theme' }));
    assert.equal(chooser.value, 'streamer');
});
