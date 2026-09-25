import { mount } from 'svelte';
import App from './App.svelte';
import { enableKiosk, kioskRequested } from './lib/ui/kiosk';
import { applyAccent, DEFAULT_ACCENT, isAccent } from './lib/ui/theme';
import './app.css';

// `?accent=amber|teal|indigo` previews another accent colour.
const accent = new URLSearchParams(location.search).get('accent');
applyAccent(isAccent(accent) ? accent : DEFAULT_ACCENT);
if (kioskRequested()) enableKiosk();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
