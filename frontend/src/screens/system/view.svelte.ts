/** State of the System screen, kept across navigation (tab and settings section). */

export type SystemTab = 'overview' | 'settings' | 'about';

export const SETTINGS_SECTIONS = [
  'general',
  'datetime',
  'display',
  'temperature',
  'motion',
  'firmware',
  'power',
  'connection',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

class SystemView {
  tab = $state<SystemTab>('overview');
  section = $state<SettingsSection>('general');
}

export const view = new SystemView();
