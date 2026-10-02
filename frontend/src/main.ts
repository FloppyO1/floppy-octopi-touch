import { mount } from 'svelte';
import App from './App.svelte';
import { fitToWindow } from './lib/ui/fit';
import { enableKiosk, kioskRequested } from './lib/ui/kiosk';
import { applyAccent, DEFAULT_ACCENT } from './lib/ui/theme';
import './app.css';

// The saved accent is applied when the settings load (settings store).
applyAccent(DEFAULT_ACCENT);
if (kioskRequested()) enableKiosk();

const target = document.getElementById('app')!;
fitToWindow(target);
const app = mount(App, { target });

export default app;
