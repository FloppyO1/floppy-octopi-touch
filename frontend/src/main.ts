import { mount } from 'svelte';
import App from './App.svelte';
import { enableKiosk, kioskRequested } from './lib/ui/kiosk';
import { applyAccent, DEFAULT_ACCENT } from './lib/ui/theme';
import './app.css';

// The saved accent is applied when the settings load (settings store).
applyAccent(DEFAULT_ACCENT);
if (kioskRequested()) enableKiosk();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
